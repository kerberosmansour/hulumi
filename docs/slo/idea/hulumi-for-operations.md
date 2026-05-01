---
name: hulumi-for-operations
created: 2026-05-01
status: ideation
tla_required: false
---

# Hulumi for Operations — extending hardened defaults from create-time to time-based controls

> **Note on origin**: This doc was synthesized from a single conversation turn driven by a real adopter's pain (`sunlit-guardian`'s `AWS-SETUP-GUIDE.md` and `MAINTENANCE-GUIDE.md`, plus the open issues filed against Hulumi from that adoption — [#47](https://github.com/kerberosmansour/hulumi/issues/47), [#49](https://github.com/kerberosmansour/hulumi/issues/49)) rather than a full `/slo-ideate` interrogation. The seven forcing questions were answered against the two guides (in particular `MAINTENANCE-GUIDE.md` §7 "Upgrade & Patch Cadence") and the resulting wedge is concrete enough that interactive interrogation would have been ceremony. Mirrors the precedent set in [`hulumi-github.md`](./hulumi-github.md). Please red-pen before `/slo-architect` runs.

## The pain

A solo platform engineer (Sherif, on `sunlit-guardian`) sat down on the morning of **2026-04-30** to do the morning dashboard ritual from `MAINTENANCE-GUIDE.md` §1 — `aws sso login`, cost check, AWS Health, VPN log, `kubectl get pods`. All clean. Two minutes later he opened `aws ecr describe-image-scan-findings --repository-name sunlit-api --image-id imageTag=latest` because §3.7 of that same guide says he's supposed to. The output: `{"CRITICAL": 1, "HIGH": 4}`. The CRITICAL had been sitting since the prior Friday because nobody — no alarm, no email, no SNS subscription — pages a single-developer sandbox when ECR posts a finding. The maintenance guide's only patch instruction is "If any `CRITICAL`, rebuild with updated base image." Manual. There is also no row for EC2 in §7's patch-cadence table because sunlit currently has zero EC2 instances. The moment sunlit-guardian (or any Hulumi consumer) adds a bastion host, a self-hosted GitLab runner, or a Graviton mesh-control-plane node group, the patch story is "you do it, manually, monthly, with willpower."

This is a different shape of pain than Hulumi's existing surface. Hulumi v1.1 ships hardened defaults *at the moment infrastructure is created* — `SecureBucket` is hard to misconfigure on day one. But "is the EC2 instance you spun up four months ago patched today?" is not a create-time question. It is a *time-based* control, and Hulumi has no answer for it. The same shape applies to the GuardDuty / IAM Access Analyzer / ECR Enhanced Scanning wiring that [#49](https://github.com/kerberosmansour/hulumi/issues/49) tracks (DetectiveServicesEnable) and the CloudTrail → CW Logs metric-filter pipeline that [#47](https://github.com/kerberosmansour/hulumi/issues/47) tracks (AuditTrail). Each of those is "things you turn on so that *over time* you find out something is wrong." None of them are tracked by Hulumi today.

The pain compounds when an AI agent helps the consumer write the first cut of `index.ts` against `@pulumi/aws` directly — it'll happily generate a plausible-looking EC2 instance with no Patch Manager association, no Inspector enrollment, no compliance metric, no SNS wiring — exactly the gap Hulumi exists to close, but at the wrong layer of the lifecycle.

## Five capabilities the user described without realizing

- Declare an EC2 instance (or a `Patch:Group=production` tag fleet) once and have it patched on a sane Maintenance-Window cadence with reboot policy, compliance reporting, and tag-based targeting wired in — without re-deriving SSM Patch Manager from the AWS docs.
- Get a notification (routed through `MonitoringFoundation`'s existing severity-tiered SNS topics — already shipped in M5 / [#46](https://github.com/kerberosmansour/hulumi/issues/46)) the moment Inspector v2 finds a `CRITICAL` CVE in a pushed ECR image, instead of having to remember to query `describe-image-scan-findings`.
- Turn on the four "you should already have these on" detective services (GuardDuty, IAM Access Analyzer, Cost Anomaly Detection, ECR Enhanced Scanning) as a single one-line component instead of four resources scattered across `infra/`. (This is exactly [#49](https://github.com/kerberosmansour/hulumi/issues/49).)
- Stand up the audit-trail pipeline that turns CloudTrail Event History into CloudWatch metric filters that turn into alarms — the bucket-policy-vs-trail-arn coupling done correctly the first time. (This is exactly [#47](https://github.com/kerberosmansour/hulumi/issues/47).)
- Have the policy pack catch the PR that bypasses the hardened components — same shape as `HulumiHardeningPack` H1–H4, but for the time-based controls (`O_PATCH_1`: every `aws.ec2.Instance` must have a Patch Group tag; `O_DETECT_1`: every account must have a `DetectiveServicesEnable`; `O_AUDIT_1`: every account must have an `AuditTrail`).

## Top risks

- **Breach** (silent un-patching at default tier): A Hulumi consumer adopts `Ec2PatchBaseline` with the default `tier: Sandbox` (report-only mode, `RebootOption: NoReboot` to avoid surprising tenants in a shared dev account). They run a public-facing service on the instance. Sixty days pass. CVE-2025-XXXXX (kernel privilege escalation, exploited in the wild) lands. SSM compliance reports "patch downloaded" but the kernel never reboots, so the running kernel is still vulnerable. **Adversary**: opportunistic ransomware operator scanning for the CVE at scale (Mirai-style worm, not targeted). **Surface**: the un-rebooted kernel. **Data**: customer PII / API keys / OpenAI tokens cached on the instance. **Why it's Hulumi's problem and not the consumer's**: Hulumi's tier defaults set the policy. `Sandbox` defaulting to `NoReboot` is a real product decision and a defensible one (avoid surprising sandbox tenants), but it must surface a *visible* compliance metric ("kernel patched but not active") so the consumer cannot believe they are patched when they are not. If we ship `Sandbox` defaulting to silent `NoReboot` without that visibility, the breach is on us in spirit if not in code.
- **Compliance fine** (PCI-DSS Req 6.3.3 violation, FCA SYSC operational-resilience finding): A UK fintech adopts Hulumi for an FCA-regulated card-acquiring product. They use `Ec2PatchBaseline` Sandbox tier in dev *and* prod by accident (tier-drift — the runbook does not enforce that prod must be `StartupHardened`). Their auditor pulls the SSM Patch Compliance report and finds 47 instances with critical patches deferred >30 days. **Regulation**: PCI-DSS v4.0.1 Requirement 6.3.3 ("install applicable critical security patches within one month of release"). **Data class**: cardholder data on the EC2 fleet that hosts the payment-terminal API. **Scale**: PCI-DSS non-compliance penalties — Visa/Mastercard fines start at £4–10k/month sustained, escalating to acquirer-bank revocation; FCA SYSC 8.1 operational-resilience expectation under PS21/3 means the regulator can trigger a Section 166 skilled-person review (£100k–£500k+ in advisory fees, plus remediation). Hulumi's mitigation: tier ladder + a CrossGuard policy that *refuses* to apply `Sandbox` tier to a stack tagged `hulumi:tier=StartupHardened` at the account level — the same pattern as the existing AWS pack's tier-coherence rules.
- **Prolonged outage** (synchronized maintenance-window reboot, defection within one rotation): `Ec2PatchBaseline` ships with a default `MaintenanceWindow` schedule (e.g., `cron(0 02 ? * WED *)`). A consumer adopts the default, has 50 EC2s tagged `Patch:Group=production`, and on the first Wednesday all 50 reboot at 02:00 UTC. Their region is eu-west-2 so 02:00 UTC = 03:00 BST — middle of the night, single on-call SRE in the UK. Service down 45 minutes while load balancers detect, drain, restart, re-register. **Who notices first**: the on-call SRE at 03:14 BST (status-page check), then the customer Slack channel ten minutes later. **Time to defection**: visible in cancel-survey responses ("you went down too often") within 48 hours. **Hulumi's mitigation**: tier-aware staggering — `Sandbox` tier opts into a single window because cost dominates; `StartupHardened` tier *requires* the consumer to set the schedule explicitly with no Hulumi default (fail-loud), and ships a `MaintenanceWindowStaggered` helper that splits a target by tag-hash modulo across a configurable window count.

## Approach A — conservative (IaC-only patch baselines, no Lambda)

- **Effort**: 2–3 person-weeks
- **Wedge week 1**: ship `@hulumi/baseline.aws.Ec2PatchBaseline` (SSM Patch Baseline + Maintenance Window + Patch Group tag selection + compliance metric) wired to existing `MonitoringFoundation` SNS topics. Plus close [#49](https://github.com/kerberosmansour/hulumi/issues/49) (`DetectiveServicesEnable`) — its `enableEcrEnhancedScanning: true` knob is exactly the container-image-patch leg. Plus close [#47](https://github.com/kerberosmansour/hulumi/issues/47) (`AuditTrail`) because the patch-compliance metric needs the CW Logs target.
- **Approach**: pure AWS-managed-services configured by Pulumi. No Lambdas. No EventBridge → SNS rules that Hulumi authors. No hosted-runtime dependency. Detective findings (Inspector, Cost Anomaly) are *observed* via SNS subscriptions to the existing `MonitoringFoundation` topics; the consumer plugs their alerting tool in.
- **Risks**: under-delivers on the "patch management" framing. SSM Patch Manager *schedules* scans + applies but the compliance reports stay in AWS console unless someone goes look. Mitigation: publish a CW Logs metric filter on `SSM-Compliance-Failed` and wire that to the existing `IdentityAlarms` pattern from [#46](https://github.com/kerberosmansour/hulumi/issues/46) so missed-patch state pages through the same SNS path that VPN-failed-login alerts already use. Second risk: container image patching is *flagged* via Inspector v2 SNS but the actual rebuild requires a CI rebuild — that's repo-specific and out of Hulumi scope. We have to be loud about that boundary in the docs (mirrors the `the I in IaC is Infrastructure` boundary contract from `hulumi-github`).

## Approach B — cloud / SaaS (Lambda-driven auto-rebuild orchestrator)

- **Effort**: 5–6 person-weeks
- **Wedge week 1**: same as A, plus a `ContainerImageAutoRebuild` component that ships an EventBridge rule + Lambda. The Lambda receives `Inspector2 finding` events with `severity >= CRITICAL`, looks up the source repo from a tag on the ECR repository (`hulumi:source-repo=org/repo`), and triggers a GitHub `repository_dispatch` webhook against the consumer's CI. CI rebuilds the image with the updated base image and pushes the new tag. EKS / ECS picks up the new image on next rollout.
- **Approach**: the Lambda lives in the *consumer's* AWS account so the "no hosted-service runtime dependency" principle isn't violated literally. But it does introduce a new pattern in Hulumi: code-bearing components. Hulumi v1.1 ships zero Lambdas that contain Hulumi-authored code; the closest is the GitHub-meta CIDR updater pattern that sunlit ships in *its* repo (not in Hulumi). Adding it would set a precedent.
- **Risks**: scope creep and supply-chain blast radius. A Lambda that Hulumi ships becomes Hulumi's runtime to maintain — every new AWS Lambda runtime EOL becomes a Hulumi release. Inspector v2 finding format changes become Hulumi code changes. The Hulumi philosophy ("we ship hardened-by-default *infrastructure declarations*; the consumer's code is theirs") starts blurring. Also: the Lambda needs a GitHub PAT or App credential to do the `repository_dispatch` call — that pulls Hulumi into the GitHub authentication-mode debate that the `hulumi-github` runbook already had to gate. Drift classifier becomes second-order: who classifies drift on a Lambda Hulumi shipped that the consumer's Pulumi state owns?

## Approach C — local / desktop (policy pack only)

- **Effort**: 0.5–1 person-week
- **Wedge week 1**: don't ship infra components. Add CrossGuard policies to `@hulumi/policies` that *enforce* the time-based controls at create time:
  - `O_PATCH_1`: every `aws.ec2.Instance` must have a `Patch:Group=*` tag.
  - `O_PATCH_2`: every `aws.ssm.PatchBaseline` must have an associated `MaintenanceWindow` and target.
  - `O_DETECT_1`: every account-level stack must declare a `DetectiveServicesEnable` (or a documented `Suppression` if the consumer uses an external SIEM).
  - `O_AUDIT_1`: every account-level stack must declare an `AuditTrail` (or a documented `Suppression`).
  - `O_INSPECTOR_1`: every `aws.ecr.Repository` must have `imageScanningConfiguration.scanOnPush=true`.
- **Approach**: catch creation-time misconfigs only. Do nothing about "is it patched today?" — that's still the consumer's problem.
- **Risks**: under-delivers on the *patch* part of "patch management." Policies are an *adjunct* to A, not a replacement. They prevent regression but don't ship the wedge. The runbook should bundle C inside A's M3 milestone, not pretend C is a standalone option.

## Recommendation

**Approach A**, with Approach C bundled as the policy-pack milestone (not as an alternative). Approach B explicitly deferred to a v1.2+ design conversation because it sets a precedent (Hulumi-authored Lambdas) that needs a separate principles-level decision before any code lands. The wedge:

- **Week 1 deliverable**: `@hulumi/baseline.aws.Ec2PatchBaseline` with `tier: Sandbox | StartupHardened`, sane defaults at each tier, compliance-metric → `MonitoringFoundation` SNS routing, integration test against a kind-style sandbox (or LocalStack for SSM if the kind story doesn't fit), one-screen example in `examples/ec2-patch-baseline-smoke/`.
- **Hard scope contract for the runbook (mirrors `hulumi-github`'s "the I in IaC is Infrastructure")**: **Hulumi codifies *time-based* defaults as IaC. The consumer's *findings triage* is theirs.** In scope: declarable AWS-managed-service configuration that runs on a schedule (Patch Manager, Inspector v2 enablement, GuardDuty, IAM Access Analyzer, Cost Anomaly Detection, CloudTrail → CW Logs, EventBridge rules that route findings to existing SNS topics). Out of scope and explicitly non-goals: authoring custom Lambda code that ships in Hulumi tarballs, authoring CVE triage logic, authoring rebuild-orchestration code, anything that requires reading the consumer's repo or runtime state to function.

The other sunlit-derived component candidates the user mentioned (`AwsClientVpnFederated` — codifying the SAML federation + `memberOf` mapping + ACM cert + duplicate-route-gotcha lessons; `EksGithubActionsAccessBundle` — bundling GitHub OIDC provider + IAM role + `aws.eks.AccessEntry` + `AccessPolicyAssociation` + the GitHub-meta CIDR updater Lambda) are a *different* theme — "VPN + CI access defaults" — and belong in a separate idea doc / runbook, not this one. Mixing them with Operations would dilute both. They are noted in [`docs/issue-candidates.md`](../issue-candidates.md) as v1.2+ follow-ups; this runbook does not adopt them.

The runbook's milestone shape (target 5 milestones, per `/slo-plan`'s cap):

| M  | Surface                                                                                          | Closes              |
| -- | ------------------------------------------------------------------------------------------------ | ------------------- |
| M1 | `Ec2PatchBaseline` (Patch Baseline + Maintenance Window + tier ladder + compliance → SNS)       | (new)               |
| M2 | `DetectiveServicesEnable` (GuardDuty + IAM Access Analyzer + Cost Anomaly Detection + Inspector v2 + ECR Enhanced Scanning) | [#49](https://github.com/kerberosmansour/hulumi/issues/49) |
| M3 | `AuditTrail` (CloudTrail multi-region + S3 + CW Logs + lifecycle) + `IdentityAlarms` extension for patch-compliance metric filter | [#47](https://github.com/kerberosmansour/hulumi/issues/47) |
| M4 | `HulumiOperationsHardeningPack` (the `O_PATCH_*` / `O_DETECT_*` / `O_AUDIT_*` / `O_INSPECTOR_*` CrossGuard rules — Approach C bundled) | (new)               |
| M5 | `/hulumi-threat-model` scenarios for ops (patch-compliance lapse, detective-service-disabled, audit-pipeline-broken) + atomic four-package release alongside existing baseline / policies / drift / k8s-baseline + SLSA-L3 attestation | (new)               |

This shape — features in M1–M3, policy pack in M4, skill scenarios + release in M5 — mirrors exactly the M2–M5 pattern the existing AWS runbook used. No new milestone discipline needed.

## Open questions for /slo-research

These cannot be answered from the codebase or from training. Each must be answered with a 2026-05-01-current source.

### A. SSM Patch Manager + tier-ladder feasibility

1. What is the current 2026 state of SSM Patch Manager defaults — patch baseline classification (e.g., `Security`, `Bugfix`, `Critical`), default approval rules, "approve patches after N days" semantics, supported OS families (AL2023, Ubuntu 24.04, Windows Server 2025)? Does the `@pulumi/aws` provider expose all of `aws.ssm.PatchBaseline` + `PatchGroup` + `MaintenanceWindow` + `MaintenanceWindowTask` + `MaintenanceWindowTarget` + `ResourceDataSync` cleanly, or are any in `awsx`-only / preview?
2. Does AWS Inspector v2 continuous ECR scanning ship a stable `Inspector2 Finding` EventBridge schema in 2026 (the `severity >= CRITICAL` filter pattern depends on the schema being stable)? What is the SLA between push and finding?
3. PCI-DSS v4.0.1 Req 6.3.3 ("critical patches within one month") — is the SSM-Compliance-Failed metric the right primary signal, or do auditors want patch *deployment* time (apply-after-N-days) as the artifact? This gates whether `Ec2PatchBaseline` ships compliance-time-to-deploy as a first-class output.
4. CIS AWS Foundations v5.0.0 — does the v5 benchmark cover patch-management controls explicitly (it does cover detective-controls heavily; patch is historically a v8 control), and which IDs map to `Ec2PatchBaseline`? Same question for NIST 800-53 r5 SI-2 (Flaw Remediation).

### B. The infrastructure-vs-findings-triage boundary

5. Survey: what do existing hardened AWS IaC modules treat as in-scope for ops controls? At minimum: `cloudposse/terraform-aws-ssm-patch-manager`, `aws-samples/aws-config-conformance-pack-cis`, `bridgecrew/checkov` policy packs, `cloudquery` schemas, `Steampipe` queries, `aws-quickstart/quickstart-ssm-patch-manager`, `terraform-aws-modules/terraform-aws-ssm`. For each, list (a) what's in scope (declarative resource creation) and (b) where they explicitly stop (notification routing, triage logic). Pad-list of "let me add three I've never used" is rejected.
6. The "Lambda-shipped-by-Hulumi" precedent — is there a single example in `pulumi/pulumi-eks`, `pulumi/pulumi-awsx`, or `pulumi/pulumi-aws-native` of a Pulumi-authored component that bakes in code? If yes, what guarantees do they make about runtime / version EOL / supply-chain attestation? This question gates whether Approach B can ever be in-scope without a principles-level conversation.

### C. The defaults that drive the breach risk

7. What is the AWS-published guidance for `RebootOption` defaults in SSM Patch Manager? Is `NoReboot` ever an "AWS-recommended" default for *any* tier, or is the "patch downloaded but kernel not active" trap so well-known that AWS docs actively warn against it? This question gates `Ec2PatchBaseline`'s tier matrix:
   - If AWS docs warn against `NoReboot`-as-default: `Sandbox` tier still defaults to `NoReboot` but ships the trap-visibility metric *as a first-class compliance output* (not as a separate optional alarm).
   - If AWS docs recommend `NoReboot` for non-prod: we reuse the AWS framing and the breach risk above is downgraded to "consumer should read the tier docs."
8. What is the actual maintenance-window cadence pattern that hardened-by-default modules ship today (CIS AWS FB v5, AWS Quickstart, Cloud Custodian)? Day-of-week, hour, frequency. Is there a defensible "industry default" that `StartupHardened` tier should adopt verbatim, or do we have to ship "no default — fail loud" because synchronized-reboot outages are the single most common SSM Patch Manager incident pattern?

### D. Open-source consumability — generalizing beyond sunlit's account

9. The two sunlit lessons that drove this runbook (the morning-dashboard ECR scan ritual, the §7 patch-cadence table) are written against a single-developer sandbox. The component must work for a 50-instance fleet, a multi-account Organizations setup, a fleet with mixed AL2023 / Ubuntu / Windows. What are the friction points that a `Patch:Group=*` tag-based selector will hit at fleet sizes >= 50? At >=500? At cross-account targeting (`MaintenanceWindowTarget` with `Targets: [Key=tag:Patch:Group, Values=[production], TargetAccountIds=[...]]`)? This question gates whether `Ec2PatchBaseline`'s args surface a `targetAccounts` knob from M1 or defers cross-account to v1.2.
10. The IaC-execution-role tag (`hulumi:iac-role=true`, mandatory at v1.0) — does Patch Manager respect tag-based session policies for `MaintenanceWindowTask`, or does the maintenance-window service role need broader-than-tag-bound permissions? If the latter, the runbook needs a clear story about why the IaC role tag does not apply to the Patch Manager service role.

---

## Handoff

Recommended next step: **`/slo-architect hulumi-for-operations`**. The four open-question buckets above (SSM defaults, in-scope boundary, default-driven breach risk, OSS consumability) are research-bounded but the recommendation is firm enough that architecture can begin in parallel — `/slo-research` is optional rather than blocking, the same posture the `hulumi-github` doc took before its M1 landed. If `/slo-research` runs first, it needs Question A answered before architecture; B/C/D can be answered during architecture's interface-lock phase.

`/slo-tla` is N/A — no concurrent actors / distributed-state guarantees beyond Pulumi's standard apply ordering, mirroring the `hulumi-k8s-surface` decision in [`docs/slo/design/hulumi-k8s-surface.md`](../design/hulumi-k8s-surface.md).
