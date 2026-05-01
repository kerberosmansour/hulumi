# Threat model — Hulumi for Operations

> Consolidated threat-model artifact for the Operations surface. Produced 2026-05-01 as part of `/slo-architect`'s Step 3.5 (STRIDE sweep) for the [`hulumi-for-operations`](./hulumi-for-operations.md) design doc. Mirrors the [`hulumi-github-threat-model.md`](./hulumi-github-threat-model.md) precedent — single document, STRIDE per component, abuse-case row IDs (`tm-hulumi-ops-abuse-N`) that downstream `/slo-plan` milestones cite in their BDD scenarios.
>
> The project-wide `SECURITY.md` at the repo root is unchanged by this runbook; this doc is the per-feature threat model that complements it.

## Trust boundaries

```
                  ┌─────────────────────────────────────────────┐
                  │ User Environment (laptop / CI runner)        │
                  │                                              │
                  │   Engineer ─→ Claude Code ─→ Pulumi program  │
                  │                                              │
                  │   Imports @hulumi/baseline.aws.{Ec2PatchBase, │
                  │            DetectiveServicesEnable,           │
                  │            AuditTrail}                        │
                  │   Imports @hulumi/policies.HulumiOperations.. │
                  └─────────────────┬───────────────────────────┘
                                    │ (trust boundary 1)
                                    │   IaC role tagged hulumi:iac-role=true
                                    │   STS short-lived credentials
                                    ▼
                  ┌─────────────────────────────────────────────┐
                  │ AWS Account (account-level managed services)  │
                  │                                              │
                  │   SSM Patch Manager / Inspector v2 /          │
                  │   GuardDuty / IAM Access Analyzer /           │
                  │   Cost Anomaly Detection / CloudTrail         │
                  └─────────────────┬───────────────────────────┘
                                    │ (trust boundary 2)
                                    │   Service-to-service IAM service roles
                                    │   (one per managed service)
                                    ▼
                  ┌─────────────────────────────────────────────┐
                  │ EventBridge + CloudWatch Logs                 │
                  │                                              │
                  │   Findings → EventBridge rules                │
                  │   Audit events → CW Logs group (KMS-encrypted)│
                  └─────────────────┬───────────────────────────┘
                                    │ (trust boundary 3 — pre-existing)
                                    │   MonitoringFoundation SNS topics
                                    │   (M5 / #46 — outputs supplied by consumer)
                                    ▼
                  ┌─────────────────────────────────────────────┐
                  │ Consumer subscriptions                        │
                  │   (email / PagerDuty / Slack — out of scope) │
                  └─────────────────────────────────────────────┘
```

**Boundary 1 (User → AWS Account).** Crossed by Pulumi API calls authenticated via the IaC role. Identical to the existing `AccountFoundation` trust boundary; the Operations surface adds five new IAM permissions to the role's allowed action set (`ssm:CreatePatchBaseline`, `ssm:CreateMaintenanceWindow`, `inspector2:Enable`, `guardduty:CreateDetector`, `cloudtrail:CreateTrail` and their lifecycle siblings) but introduces no new trust boundary.

**Boundary 2 (Managed services → CW Logs / EventBridge).** Crossed inside the AWS account by service-linked roles or service principals (`ssm.amazonaws.com`, `inspector2.amazonaws.com`, `guardduty.amazonaws.com`, `cloudtrail.amazonaws.com`). The trust shape of these is AWS-managed; Hulumi's responsibility is to **not over-grant** the per-resource policies that hop across this boundary (e.g., the CloudTrail-to-S3 bucket policy, the MaintenanceWindowTask service role).

**Boundary 3 (EventBridge → MonitoringFoundation SNS topics).** Pre-existing boundary owned by `MonitoringFoundation`. The Operations surface only **subscribes** new EventBridge rules to consumer-supplied SNS topic ARNs; it does not modify the topics or alter their access policy. SNS topics are `aws.sns.Topic` resources whose access policies are owned by `MonitoringFoundation`.

## In-scope vs out-of-scope (Rule 0 — pinned from design doc)

The design doc's Rule 0 governs scope. Restated for cross-reference:

**In scope** (time-based hardening, declarative IaC):

- SSM Patch Manager (Patch Baseline + Maintenance Window + targets + tasks + Resource Data Sync + service role)
- Inspector v2 enablement (account-level, EC2 + ECR + Lambda)
- GuardDuty enablement
- IAM Access Analyzer
- AWS Cost Anomaly Detection
- CloudTrail multi-region trail with CW Logs delivery + S3 lifecycle + KMS encryption
- EventBridge rules + targets routing findings to consumer-supplied SNS topic ARNs
- CrossGuard policy rules (`O_PATCH_*`, `O_DETECT_*`, `O_AUDIT_*`, `O_INSPECTOR_*`)
- `/hulumi-threat-model` scenarios for ops failure modes

**Out of scope** (workflow plane / runtime triage, per the design doc Rule 0):

- Authoring custom Lambda code that ships in Hulumi tarballs
- Authoring CVE triage logic (which findings to ignore, which to escalate)
- Authoring rebuild-orchestration code (`repository_dispatch` to consumer CI from Hulumi-shipped infrastructure)
- Anything requiring reading the consumer's repo or runtime state to function
- VPN-and-CI-access defaults (separate runbook)
- Net-new SNS topics, alerting tools, or paging integrations

## STRIDE — per-component surface analysis

Each component lands in a milestone (M1–M4). The fifth column ("M5") covers release-pipeline / supply-chain risks.

### `Ec2PatchBaseline` + `Ec2PatchWaves` (M1)

> Updated 2026-05-01: M1 ships both `Ec2PatchBaseline` and the wave-composer `Ec2PatchWaves`. STRIDE rows below cover both surfaces. Two new abuse cases (`tm-hulumi-ops-abuse-tag-outside-enum`, `tm-hulumi-ops-abuse-skip-wave-gate`) reflect the wave model.

| STRIDE                           | Threat                                                                                                                                          | Eliminated / mitigated / residual                                                                                                                                                                                                                      | Abuse-case row                                  |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| **S** Spoofing                   | A non-IaC principal calls `ssm:CreatePatchBaseline` and replaces the Hulumi baseline                                                            | Mitigated by IAM least-privilege on the IaC role (`hulumi:iac-role=true` tag-condition) + CloudTrail capture of `ssm:*` Create/Update events; class V2 / V6                                                                                            | `tm-hulumi-ops-abuse-baseline-tamper`           |
| **T** Tampering                  | Consumer declares `tier: Sandbox` AND `rebootOption: NoReboot` — the silent un-patching trap                                                    | Mitigated by mandatory `// HULUMI_DECISION:` comment requirement + tier-aware default (`RebootIfNeeded`) — the breach risk lever from the idea doc; class V14 hardened defaults                                                                        | `tm-hulumi-ops-abuse-noreboot-without-decision` |
| **T** Tampering                  | Consumer leaves `staggering.bucketCount` unset on `StartupHardened` — synchronized-reboot outage                                                | Eliminated by **fail-loud** discipline — `Ec2PatchBaseline` refuses construction at `tier=StartupHardened` with no `staggering` arg; class V11 race / V14                                                                                              | `tm-hulumi-ops-abuse-stagger-fail-loud`         |
| **R** Repudiation                | Patch-compliance metric filter goes silent when CW Logs delivery breaks                                                                         | Mitigated by a CW Logs delivery-failure alarm (separate `aws.cloudwatch.MetricAlarm` on `LogDelivery.Errors`); class V7 missing audit trail                                                                                                            | `tm-hulumi-ops-abuse-cw-log-delivery-alarm`     |
| **I** Information Disclosure     | Maintenance Window task script (`AWS-RunPatchBaseline` document) parameter values leak via SSM Run Command history                              | Eliminated by using AWS-managed documents only (no Hulumi-authored Run Command documents that could embed sensitive values); class V6 sensitive data exposure                                                                                          | `tm-hulumi-ops-abuse-no-runcmd-secrets`         |
| **D** Denial of Service          | Maintenance Window cron set to `cron(*/1 * * * ? *)` (every minute) — runaway scheduling                                                        | Mitigated by a CrossGuard rule (`O_PATCH_3`, advisory in v1.2) that flags windows scheduled more frequently than every 24h; class V11 race                                                                                                             | `tm-hulumi-ops-abuse-runaway-window`            |
| **E** Elevation of Privilege     | Maintenance Window service role over-granted (e.g., `*:*` for SSM convenience)                                                                  | Eliminated by Hulumi-authored least-privilege service role policy template (`ssm:SendCommand` + `ssm:GetCommandInvocation` + `ec2:DescribeInstances` only); class V14                                                                                  | `tm-hulumi-ops-abuse-service-role-least-priv`   |
| **T** Tampering                  | Consumer tags an EC2 with `Patch:Group=experiment` (free-form value outside the wave enum) — instance silently slips out of any wave's selector | Eliminated by `O_PATCH_1` (M4) tightening from "any value" to enum check `Patch:Group ∈ {dev, staging, production}`; class V14 hardened defaults                                                                                                       | `tm-hulumi-ops-abuse-tag-outside-enum`          |
| **D** Denial of Service / safety | Consumer manually flips a wave's `MaintenanceWindow.enabled: true` to bypass a fired health gate, mid-incident                                  | Mitigated by CloudTrail capture of `ssm:UpdateMaintenanceWindow` events routed through `MonitoringFoundation.high` (existing path); residual: this is a deliberate human override and Hulumi does not block it (consumer ops decision); class V11 race | `tm-hulumi-ops-abuse-skip-wave-gate`            |

### `DetectiveServicesEnable` (M2)

> Updated 2026-05-01: design revised after Inspector v2 KEV-native research. `findingsKevRoutingSnsArn` is a new arg; the dual-route default (firehose at HIGH, KEV-only at high-priority) replaces the single-route prior shape. STRIDE rows below cover the dual-route surface.

| STRIDE                       | Threat                                                                                                       | Eliminated / mitigated / residual                                                                                                                                                                                                    | Abuse-case row                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| **S** Spoofing               | Privileged insider disables GuardDuty mid-incident                                                           | Mitigated by CloudTrail capture of `guardduty:DeleteDetector` + `guardduty:UpdateDetector` events routed through `MonitoringFoundation.high`; class V6 / V7                                                                          | `tm-hulumi-ops-abuse-detector-tamper`              |
| **T** Tampering              | Consumer declares `findingsRoutingSnsArn: undefined` on `StartupHardened` tier                               | Eliminated at construction: type discriminator forces `findingsRoutingSnsArn` required when `tier=StartupHardened`; class V14                                                                                                        | `tm-hulumi-ops-abuse-routing-required-hardened`    |
| **R** Repudiation            | EventBridge rule silently fails to match a finding because severity field is `null`                          | Mitigated by `findingsSeverityFloor` defaulting to `HIGH` AND an explicit `severity NOT EXISTS` clause in the rule pattern that routes those findings to a dead-letter SNS subscription; class V11                                   | `tm-hulumi-ops-abuse-severity-null-routing`        |
| **I** Information Disclosure | Cost Anomaly Detection findings route to a SNS topic with public access policy                               | Eliminated by relying on `MonitoringFoundation`'s SNS topic — its access policy is hardened; class V6                                                                                                                                | `tm-hulumi-ops-abuse-sns-public-access`            |
| **D** Denial of Service      | Inspector v2 fanout scans saturate the consumer's CW Logs ingestion budget                                   | Residual risk — Hulumi cannot bound AWS-side scanning rate. Mitigation surfaced in component reference docs: `findingsSeverityFloor` filters routing, but ingestion is on Inspector's side.                                          | `tm-hulumi-ops-abuse-inspector-fanout-residual`    |
| **E** Elevation of Privilege | A consumer who can call `pulumi up` can disable detective services across the account                        | Mitigated by `O_DETECT_1` policy rule (mandatory at StartupHardened) that rejects a stack diff that removes a `DetectiveServicesEnable` declaration; class V14                                                                       | `tm-hulumi-ops-abuse-detect-removal-rejected`      |
| **T** Tampering              | EventBridge rule pattern uses a wildcard `{}` and routes ALL Inspector findings to high-priority SNS         | Eliminated by mandatory pattern shape: KEV route requires `$.detail.findingDetails.kev.dateAdded` exists; firehose route requires `$.detail.severity ∈ ["HIGH", "CRITICAL"]`; assertion in mock-runtime test verifies the JSON shape | `tm-hulumi-ops-abuse-eventbridge-pattern-wildcard` |
| **I** Information Disclosure | KEV route bypassed because EventBridge matches on `kev.dateAdded` field that doesn't exist when KEV is empty | Mitigated by null-safe pattern `{"detail.findingDetails.kev.dateAdded": [{"exists": true}]}`; the firehose route still fires on severity floor regardless, so high-severity non-KEV findings still page                              | `tm-hulumi-ops-abuse-kev-pattern-null-bypass`      |

### `AuditTrail` (M3)

| STRIDE                       | Threat                                                                                              | Eliminated / mitigated / residual                                                                                                                                                                                         | Abuse-case row                                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **S** Spoofing               | An attacker with `cloudtrail:UpdateTrail` permission disables log-file validation                   | Mitigated by CloudTrail-of-CloudTrail (`audit-trail-tamper-trail` pattern — separate trail capturing `cloudtrail:Update*`, `cloudtrail:Stop*`, `cloudtrail:Delete*`) routed through `MonitoringFoundation.high`; class V7 | `tm-hulumi-ops-abuse-trail-tamper`             |
| **T** Tampering              | S3 bucket policy added by a non-Hulumi mechanism after `pulumi up`, allowing public read            | Eliminated by reusing `SecureBucket` (which enforces public-access-block — the policy add is rejected by the BPB at-runtime); class V14                                                                                   | `tm-hulumi-ops-abuse-bucket-publicread-bpb`    |
| **R** Repudiation            | CW Logs group retention silently lapses to 1 day default                                            | Mitigated by Hulumi default of 90 days (Sandbox) / 365 days (StartupHardened) and `O_AUDIT_1` policy rule that flags retention < 90 days; class V14                                                                       | `tm-hulumi-ops-abuse-retention-default`        |
| **I** Information Disclosure | CloudTrail log file contains sensitive request bodies (e.g., `secretsmanager:PutSecretValue`)       | Mitigated by CloudTrail's AWS-side filtering of sensitive parameters + CW Logs KMS encryption; residual risk: management-event request parameters can include user-supplied strings. Documented in component reference.   | `tm-hulumi-ops-abuse-sensitive-request-params` |
| **D** Denial of Service      | S3 lifecycle archive-then-expire kicks in at 7 days, evicting recent audit data                     | Eliminated by tier-aware minimum: Sandbox: 90/365; StartupHardened: 365/2555; `O_AUDIT_1` rejects shorter values; class V14                                                                                               | `tm-hulumi-ops-abuse-lifecycle-too-aggressive` |
| **E** Elevation of Privilege | The bucket-policy-vs-trail-arn ordering is mishandled — bucket policy grants `Principal: *` briefly | Eliminated by Pulumi `Output<>` chaining (the policy is created with the trail ARN already known); class V11 race                                                                                                         | `tm-hulumi-ops-abuse-bucket-policy-ordering`   |

### `HulumiOperationsHardeningPack` (M4) + meta-tests

| STRIDE                       | Threat                                                                                               | Eliminated / mitigated / residual                                                                                                                                                               | Abuse-case row                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **T** Tampering              | Consumer declares raw `aws.ec2.Instance` bypassing `Ec2PatchBaseline` association                    | Eliminated by `O_PATCH_1` (mandatory at StartupHardened): instance without `Patch:Group=*` tag is rejected at preview; class V14                                                                | `tm-hulumi-ops-abuse-raw-ec2-rejected`            |
| **T** Tampering              | Consumer declares `aws.ecr.Repository` with `scanOnPush: false`                                      | Eliminated by `O_INSPECTOR_1` (mandatory in both tiers); class V14                                                                                                                              | `tm-hulumi-ops-abuse-scanonpush-false-rejected`   |
| **R** Repudiation            | Tier monotonicity regression — Sandbox emits more controls than StartupHardened                      | Eliminated by tier-monotonicity meta-test (existing pattern, H4-shape, extended to `O_*` rule pack); class V11                                                                                  | `tm-hulumi-ops-abuse-tier-monotonicity-violation` |
| **I** Information Disclosure | Verbatim CIS / NIST / PCI-DSS control text shipped in policy comments                                | Eliminated by `license-boundary-lint` extension covering the `O_*` pack; class V10 supply-chain (license)                                                                                       | `tm-hulumi-ops-abuse-license-boundary`            |
| **E** Elevation of Privilege | A `Suppression` for `O_DETECT_1` is added with no explanation, silently disabling detective controls | Mitigated by the existing `Suppression` API requirement that every suppression carry a `reason` field + a `compliance-justified-suppressions` meta-test that fails on missing reasons; class V7 | `tm-hulumi-ops-abuse-suppression-without-reason`  |

### Release / supply chain (M5)

| STRIDE                       | Threat                                                                                                          | Eliminated / mitigated / residual                                                                                                                                                          | Abuse-case row                                      |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| **T** Tampering              | An npm tarball for `@hulumi/baseline@1.2.0` is replaced post-publish                                            | Eliminated by SLSA Build L3 attestation on every published tarball (existing v1.0.0 pipeline, no change); class V10                                                                        | covered by existing `tm-hulumi-supply-chain-attest` |
| **T** Tampering              | A `@pulumi/aws` minor bump introduces a renamed field (`scanOnPush` → `scanFrequency`)                          | Mitigated by the existing 72h/24h cooling-off CI gate + the existing exact-pin guard; renamed-field drift surfaces in `@hulumi/drift` as `provider-rename` not `console-tamper`; class V14 | covered by existing `tm-hulumi-pulumi-cooling-off`  |
| **D** Denial of Service      | A v1.2.0 release leaves `O_PATCH_*` rules behind a feature flag → consumers think they have coverage they don't | Eliminated by integration test that loads the rule pack and exercises every `O_*` rule against a synthetic stack at every release-tag commit; class V11                                    | `tm-hulumi-ops-abuse-rule-pack-feature-flag`        |
| **E** Elevation of Privilege | The `/hulumi-threat-model` skill scenarios for ops fabricate framework citations                                | Eliminated by the existing scenario-schema test that validates framework + ID + URL combinations against the fixture corpus; class V10                                                     | covered by existing `tm-hulumi-skill-citation-fab`  |

## Abuse cases (per-component, three-or-more per surface — `/slo-plan` cites these in M-level BDD)

The full per-row STRIDE table above produces `tm-hulumi-ops-abuse-N` IDs. The minimum three-per-surface bar from `/slo-architect` Step 3.5 is satisfied by:

- **`Ec2PatchBaseline` + `Ec2PatchWaves`**: `noreboot-without-decision`, `stagger-fail-loud`, `service-role-least-priv`, `tag-outside-enum`, `skip-wave-gate` (5+ more in table).
- **`DetectiveServicesEnable`**: `routing-required-hardened`, `severity-null-routing`, `detect-removal-rejected`, `eventbridge-pattern-wildcard`, `kev-pattern-null-bypass` (5+ more in table).
- **`AuditTrail`**: `trail-tamper`, `bucket-publicread-bpb`, `bucket-policy-ordering` (3+ more in table).
- **`HulumiOperationsHardeningPack`**: `raw-ec2-rejected`, `scanonpush-false-rejected`, `tier-monotonicity-violation`, `suppression-without-reason` (4 — meta-tests count).

## Compliance mapping

The Operations surface contributes to the following framework controls. **IDs only** — no verbatim control text, per Hulumi's licence-boundary discipline.

| Component                       | SOC 2                            | PCI-DSS v4.0.1        | NIST 800-53 r5          | ISO 27001 A.12     |
| ------------------------------- | -------------------------------- | --------------------- | ----------------------- | ------------------ |
| `Ec2PatchBaseline`              | CC7.1, CC7.2 (system monitoring) | 6.3.3, 11.3.1         | SI-2(2), SI-2(3)        | A.12.6.1, A.14.2.4 |
| `DetectiveServicesEnable`       | CC7.2, CC7.3                     | 10.4, 11.5.1, 12.10.7 | AU-12, SI-4(2), SI-4(4) | A.12.4.1, A.16.1.4 |
| `AuditTrail`                    | CC7.2, CC4.1                     | 10.2.1, 10.2.2, 10.5  | AU-2, AU-3, AU-9, AU-11 | A.12.4.1, A.12.4.3 |
| `HulumiOperationsHardeningPack` | CC8.1 (change management)        | 6.4.5                 | CM-2, CM-3              | A.12.1.2           |

The mapping table follows the [`docs/mappings/`](../mappings/) house style. CIS AWS Foundations Benchmark v5.0.0 IDs are pending the open question raised in [`hulumi-for-operations.md` § Open questions](./hulumi-for-operations.md#open-questions) (v5 historically lacks patch-management section; v8 has it; we will cite whichever is honest).

## Top risks (carried forward from idea doc, with architecture mitigations)

The three named risks from [`hulumi-for-operations.md` § Top risks](../idea/hulumi-for-operations.md#top-risks) and how the architecture above addresses each. User-supplied strings from the idea doc are wrapped in `~~~text` fences per the `/slo-architect` Step 3.5 metacharacter-injection rule.

### Breach — silent un-patching at default tier

User-supplied risk text from idea doc:

```text
A Hulumi consumer adopts Ec2PatchBaseline with the default tier: Sandbox (report-only mode, RebootOption: NoReboot to avoid surprising tenants in a shared dev account). They run a public-facing service on the instance. Sixty days pass. CVE-2025-XXXXX (kernel privilege escalation, exploited in the wild) lands. SSM compliance reports "patch downloaded" but the kernel never reboots, so the running kernel is still vulnerable.
```

**Architecture mitigation**: the `Ec2PatchBaseline` design (see [Decision: `RebootOption` default](./hulumi-for-operations.md#decision-rebootoption-default-per-tier)) reverses the `NoReboot` default. Both tiers default to `RebootIfNeeded`. `NoReboot` requires explicit `// HULUMI_DECISION:` comment. Surfaced in abuse case `tm-hulumi-ops-abuse-noreboot-without-decision`.

### Compliance fine — PCI-DSS Req 6.3.3 / FCA SYSC

User-supplied risk text from idea doc:

```text
A UK fintech adopts Hulumi for an FCA-regulated card-acquiring product. They use Ec2PatchBaseline Sandbox tier in dev and prod by accident (tier-drift — the runbook does not enforce that prod must be StartupHardened). Their auditor pulls the SSM Patch Compliance report and finds 47 instances with critical patches deferred >30 days.
```

**Architecture mitigation**: `O_PATCH_1` (mandatory at StartupHardened) requires every `aws.ec2.Instance` to have a `Patch:Group=*` tag, and the existing `HulumiHardeningPack` H4 tier-coherence pattern (extended to the `O_*` pack) refuses to apply `Sandbox` tier to a stack tagged `hulumi:tier=StartupHardened` at the account level. PCI-DSS Req 6.3.3 mapping is captured in the table above. Surfaced in abuse case `tm-hulumi-ops-abuse-tier-monotonicity-violation`.

### Prolonged outage — synchronized-reboot defection

User-supplied risk text from idea doc:

```text
Ec2PatchBaseline ships with a default MaintenanceWindow schedule (e.g., cron(0 02 ? * WED *)). A consumer adopts the default, has 50 EC2s tagged Patch:Group=production, and on the first Wednesday all 50 reboot at 02:00 UTC.
```

**Architecture mitigation**: see [Decision: synchronized-reboot mitigation](./hulumi-for-operations.md#decision-synchronized-reboot-mitigation-staggering). StartupHardened tier ships **no schedule default** — fail-loud. Sandbox tier defaults to a low-collision Sunday 04:00 UTC window with `bucketCount: 1`. The `staggering.bucketCount` arg + CRC32-based hash-bucket targeting splits a fleet across N windows. Surfaced in abuse case `tm-hulumi-ops-abuse-stagger-fail-loud`.

## Notes for `/slo-plan`

- M1's BDD must include scenarios for `noreboot-without-decision`, `stagger-fail-loud`, `service-role-least-priv` (≥ 3 abuse cases).
- M2's BDD must include `routing-required-hardened`, `severity-null-routing`, `detect-removal-rejected`.
- M3's BDD must include `trail-tamper`, `bucket-publicread-bpb`, `bucket-policy-ordering`.
- M4's BDD must include `raw-ec2-rejected`, `scanonpush-false-rejected`, `tier-monotonicity-violation`, `suppression-without-reason`.
- M5's BDD covers `rule-pack-feature-flag` plus the existing supply-chain abuse cases (no net-new ones — release pipeline is unchanged).

The full abuse-case row count for this runbook is **21 net-new + 4 inherited = 25 total** (after the 2026-05-01 diff added `tag-outside-enum`, `skip-wave-gate`, `eventbridge-pattern-wildcard`, `kev-pattern-null-bypass`), sized appropriately for a five-milestone runbook (the `hulumi-github` runbook had 19 abuse-case rows over five milestones for comparison).
