---
name: hulumi-for-operations
created: 2026-05-01
status: proposed
tla_required: false
security_libs_required: false
ai_component: false
compliance: [soc2, pci-dss, nist-800-53, iso-27001]
---

# Design — Hulumi for Operations (decision record)

> Decision record for opening a *time-based* hardening surface in Hulumi. Authored 2026-05-01 in response to the [`hulumi-for-operations`](../idea/hulumi-for-operations.md) idea doc, the two real-world consumer guides ([sunlit-guardian's AWS-SETUP-GUIDE](../../../sunlit-guardian/apps/desktop/docs/Guides/AWS-SETUP-GUIDE.md) and [MAINTENANCE-GUIDE](../../../sunlit-guardian/apps/desktop/docs/Guides/MAINTENANCE-GUIDE.md)) that surfaced the gap, and the two open issues ([#47 AuditTrail](https://github.com/kerberosmansour/hulumi/issues/47) and [#49 DetectiveServicesEnable](https://github.com/kerberosmansour/hulumi/issues/49)) that this runbook closes.
>
> Status: **proposed**. Every "Decision" line below is a commitment-point that survives PR review or gets revised. Open questions live in [§ Open questions](#open-questions). `/slo-architect` was inlined into this design doc — Hulumi-for-Operations is a feature addition to an already-designed workspace, not a new product. Mirrors the [`hulumi-k8s-surface.md`](./hulumi-k8s-surface.md) precedent.

## Why this doc exists (and what it isn't)

Hulumi v1.1 ships hardened defaults *at the moment infrastructure is created*. `SecureBucket`, `AccountFoundation`, `MonitoringFoundation`, `IdentityAlarms`, `SecureRepository`, `OrgFoundation`, the seven `@hulumi/k8s-baseline` components — every single one is a **create-time** control. "Is the EC2 instance you spun up four months ago patched today?" is not a create-time question. It is a *time-based* control, and Hulumi has no answer for it.

A consumer who lands on Hulumi v1.1 with a simple AWS account, a small EC2 fleet, and an ECR repository now has to re-derive five separate patterns by hand:

1. SSM Patch Manager: Patch Baseline + Maintenance Window + Patch Group tag selection + service role + compliance reporting wired to CloudWatch (the [§7 of `MAINTENANCE-GUIDE.md`](../../../sunlit-guardian/apps/desktop/docs/Guides/MAINTENANCE-GUIDE.md#7-upgrade--patch-cadence) gap)
2. Inspector v2 enablement + EventBridge rule routing CRITICAL findings to an SNS topic (the [§3.7 of `MAINTENANCE-GUIDE.md`](../../../sunlit-guardian/apps/desktop/docs/Guides/MAINTENANCE-GUIDE.md#37-ecr-image-vulnerability-scans) gap; partial scope of [#49](https://github.com/kerberosmansour/hulumi/issues/49))
3. The four "always-on" detective services as a bundle: GuardDuty + IAM Access Analyzer + Cost Anomaly Detection + Inspector v2 ([#49](https://github.com/kerberosmansour/hulumi/issues/49) verbatim)
4. CloudTrail multi-region trail with CW Logs delivery + S3 bucket-policy ordering correctly + lifecycle ([#47](https://github.com/kerberosmansour/hulumi/issues/47) verbatim)
5. CrossGuard policies that *enforce* the time-based controls at create time (mirroring the existing `HulumiHardeningPack` H1–H4 pattern)

These are not sunlit-specific patterns. **Anyone running EC2 + ECR on AWS, in any account that produces audit-relevant signal, hits all five.** The [§4.8 of `MAINTENANCE-GUIDE.md`](../../../sunlit-guardian/apps/desktop/docs/Guides/MAINTENANCE-GUIDE.md#48-ecr-scan-finds-critical-cve) instruction "if any `CRITICAL`, rebuild with updated base image" is the smoking gun: a maintenance guide in 2026 telling a single developer to run a query manually because there is no notification path.

This doc is **not** a runbook. The runbook is the v1.x milestone breakdown that lives at `docs/RUNBOOK-hulumi-operations.md` once these decisions are accepted. This doc commits to the shape; the runbook commits to the sequencing.

## Scope of the Operations surface

The line we draw, mirroring the `hulumi-k8s` Rule 0 boundary contract:

> **Hulumi codifies *time-based* defaults as IaC. The consumer's *findings triage* and *runtime orchestration* are theirs.**

**In scope.** Declarable AWS-managed-service configuration that runs on a schedule and produces signal a consumer-supplied SNS topic can subscribe to:

- SSM Patch Manager (Patch Baseline + Maintenance Window + Maintenance Window Target + Maintenance Window Task + Resource Data Sync + Service Role)
- AWS Inspector v2 enablement (account-level subscription, EC2 + ECR + Lambda scan resource types)
- GuardDuty enablement (with publishing frequency)
- IAM Access Analyzer (account-level analyzer)
- AWS Cost Anomaly Detection (one detector + one or more subscriptions)
- CloudTrail multi-region trail with log-file validation, CW Logs delivery, S3 lifecycle, KMS encryption
- EventBridge rules + targets that route findings to existing `MonitoringFoundation` SNS topics — never net-new SNS topics
- CrossGuard policy rules that enforce all of the above at preview-time
- `/hulumi-threat-model` scenarios for the operations failure modes (patch-compliance lapse, detective-service-disabled, audit-pipeline-broken)

**Out of scope and explicitly non-goals.** Anything that requires Hulumi to author or maintain runtime code:

- Authoring custom Lambda code that ships in Hulumi tarballs (sets a precedent the project has not adopted; see Approach B in the idea doc)
- Authoring CVE triage logic (which findings to ignore, which to escalate)
- Authoring rebuild-orchestration code (`repository_dispatch` to consumer CI from a Hulumi-shipped Lambda)
- Anything that requires reading the consumer's repo or runtime state to function
- Operating-system-specific patch content authoring (we configure SSM Patch Manager; we do not ship custom patch baselines beyond AWS-managed-baseline references)
- Net-new SNS topics, alerting tools, or paging integrations (consumers pass `MonitoringFoundation` outputs in)
- VPN-and-CI-access defaults (`AwsClientVpnFederated`, `EksGithubActionsAccessBundle`) — different theme, separate runbook

## Decision: package layout

**Decision.** Land the Operations surface inside the existing `@hulumi/baseline` package, under `@hulumi/baseline.aws.*` — alongside `SecureBucket`, `AccountFoundation`, `MonitoringFoundation`, `IdentityAlarms`. **No new npm package.**

**Why.**

- Peer-deps are identical to the existing AWS surface: `@pulumi/aws` only. The k8s-baseline precedent for a separate package was driven by `@pulumi/kubernetes` adding ~50 MB unpacked + a different upstream cadence. Operations adds neither — Patch Manager, Inspector, GuardDuty, CloudTrail are all in `@pulumi/aws` already.
- Threat-model trust boundaries are the same as `AccountFoundation`'s (Pulumi program → AWS account-level service). No new boundary set.
- Consumers who install `@hulumi/baseline` for `AccountFoundation` get the Operations components for free, no extra `pnpm add` step. This raises the floor of "what an account looks like when Hulumi-hardened" without taxing consumers.
- Tier ladder is already in `@hulumi/baseline` (`Sandbox` | `StartupHardened`). Reuse, don't fork.

**Consequence.** `@hulumi/baseline` v1.2.0 (the release this runbook ships) gains five new exported names. v1.x semver: minor bump because additions are non-breaking. The existing surface is unchanged.

## Decision: `Ec2PatchBaseline` shape (M1 — wedge)

**Decision.** Build a `ComponentResource` `Ec2PatchBaseline` that wraps `aws.ssm.PatchBaseline` + `aws.ssm.PatchGroup` + `aws.ssm.MaintenanceWindow` + `aws.ssm.MaintenanceWindowTarget` + `aws.ssm.MaintenanceWindowTask` + `aws.ssm.ResourceDataSync` + the IAM service role. Tag-based target selection is the only supported targeting mode in v1.

**API shape (proposed).**

```ts
new baseline.aws.Ec2PatchBaseline("prod-linux-patches", {
  tier: Tier.StartupHardened,            // Sandbox | StartupHardened — same enum as the rest of @hulumi/baseline
  patchGroupTagValue: "production",       // enum: "dev" | "staging" | "production" — REVISED 2026-05-01 per Flaw 2; refused otherwise
  operatingSystem: "AMAZON_LINUX_2023",   // also: UBUNTU, WINDOWS, AMAZON_LINUX_2, REDHAT_ENTERPRISE_LINUX
  approvalRules: {
    approveAfterDays: 7,                  // PCI-DSS-aligned (Req 6.3.3 — within 1 month, 7 days = sane buffer)
    severities: ["Critical", "Important", "Medium"],  // tier-aware default
  },
  maintenanceWindow: {
    schedule: "cron(0 02 ? * WED *)",     // explicit — no Hulumi default for StartupHardened
    durationHours: 2,
    cutoffHours: 1,
    rebootOption: "RebootIfNeeded",       // see § Decision: RebootOption default
    timezone: "Etc/UTC",
  },
  staggering: {
    bucketCount: 4,                       // splits target by tag-hash modulo 4 — see § Decision: synchronized-reboot
    bucketWindowOffsetMinutes: 15,
  },
  complianceMetric: {
    snsTopicArn: monitoring.high.arn,     // routes "patch compliance failed" through MonitoringFoundation
    severityThreshold: "Critical",
  },
});
```

**Outputs.** `patchBaselineId`, `patchBaselineArn`, `maintenanceWindowId`, `serviceRoleArn`, `complianceMetricFilterName`, `complianceAlarmArn`. Stable names (`stable` interface level — see [§ Public interfaces](#public-interfaces--stability-levels)).

**Why a single `Ec2PatchBaseline` and not split** (`PatchBaseline`, `MaintenanceWindow`, `MaintenanceWindowTask` as separate components). Splitting would mirror `aws.ssm.*` 1:1 but the value Hulumi adds is *bundling* the six resources with the right inter-dependencies (target selector → window task → patch baseline → service role) so that `pulumi destroy` cleans up cleanly. Five of every six adopters re-derive the same six-resource glue — that is exactly the hand-rolled-boilerplate cost the [§ Why this doc exists](#why-this-doc-exists-and-what-it-isnt) section above is designed to delete.

## Decision: `Ec2PatchWaves` shape (M1 — added 2026-05-01 per Flaw 2)

**Decision.** Build a sibling `ComponentResource` `Ec2PatchWaves` that composes three `Ec2PatchBaseline`s — one per environment wave — with sequenced `MaintenanceWindow` schedules and a CloudWatch composite-alarm health gate between waves. Ships in the same milestone (M1) as `Ec2PatchBaseline` because they share ~90% of the implementation.

**Why.** The original "production-only Patch Group" framing was wrong: dev and staging drift from production fast, regress patch coverage, and provide no canary signal before production patches roll. The wave model — dev → staging → production with health gates between — is how every team running >1 environment actually does this safely. Hulumi's tier ladder maps onto wave count (Sandbox: dev only; StartupHardened: all three).

**API shape (proposed).**

```ts
new baseline.aws.Ec2PatchWaves("fleet-patches", {
  tier: Tier.StartupHardened,
  // Each wave is a full Ec2PatchBaseline arg minus tier (inherited) and patchGroupTagValue (set by the wave key)
  waves: {
    dev: {
      operatingSystem: "AMAZON_LINUX_2023",
      approvalRules: { approveAfterDays: 0, severities: ["Critical", "Important", "Medium"] },
      maintenanceWindow: { schedule: "cron(0 02 ? * SUN *)", durationHours: 2, cutoffHours: 1, rebootOption: { kind: "RebootIfNeeded" } },
      staggering: { bucketCount: 1, bucketWindowOffsetMinutes: 0 },
    },
    staging: {
      operatingSystem: "AMAZON_LINUX_2023",
      approvalRules: { approveAfterDays: 0, severities: ["Critical", "Important", "Medium"] },
      maintenanceWindow: { schedule: "cron(0 02 ? * MON *)", durationHours: 2, cutoffHours: 1, rebootOption: { kind: "RebootIfNeeded" } },
      staggering: { bucketCount: 2, bucketWindowOffsetMinutes: 30 },
    },
    production: {
      operatingSystem: "AMAZON_LINUX_2023",
      approvalRules: { approveAfterDays: 0, severities: ["Critical", "Important", "Medium"] },
      maintenanceWindow: { schedule: "cron(0 02 ? * TUE *)", durationHours: 4, cutoffHours: 2, rebootOption: { kind: "RebootIfNeeded" } },
      staggering: { bucketCount: 4, bucketWindowOffsetMinutes: 15 },
    },
  },
  complianceMetric: { snsTopicArn: monitoring.high.arn, severityThreshold: "Critical" },  // shared across all three waves
  // Wave health gate inputs — composite alarm gates the next wave
  waveHealthGate: {
    appHealthAlarmArns: [albAlarm.arn, apdexAlarm.arn],   // consumer-supplied; combined with prior wave's SSM-Compliance-Failed
    onAlarmFireDisableNextWave: true,                     // default true — fail-loud
  },
});
```

**Outputs.** `waves: { dev: Ec2PatchBaselineOutputs; staging?: ...; production?: ... }`, `compositeAlarmArns: pulumi.Output<{ devToStaging: string; stagingToProduction: string }>`.

**Tier ladder.**
- **Sandbox**: degrades to single-wave (`dev` only). The `waves.staging` / `waves.production` keys may be present but produce no resources. No composite alarm. Sandbox accounts often don't have three environments — refusing to construct would be hostile.
- **StartupHardened**: all three waves required. Refusing construction with a clear error if any wave is missing.

**Health gate mechanism — no Lambda.** The gate is an `aws.cloudwatch.CompositeAlarm` whose `OK` state is wired via Pulumi `Output<bool>` chain into the next wave's `MaintenanceWindow.enabled` field. When the alarm fires (any of: prior-wave SSM-Compliance-Failed, consumer app-health alarm), the next wave's window is `enabled: false` until a human resets the alarm to `OK` and re-runs `pulumi up`. This is rollback-as-IaC, not rollback-as-runtime-code. Rule 0 (no Hulumi-shipped Lambdas) holds.

**Generalization beyond sunlit.** Every team running >1 environment hits this. The wave keys (`dev`, `staging`, `production`) are an industry-standard set; teams with extra environments (e.g., `qa`, `pre-prod`) compose multiple `Ec2PatchWaves` instances or extend in v1.3 if demand surfaces.

## Decision: `RebootOption` default per tier

This is the **breach-risk lever** identified in the idea doc's Top risks. The "patch downloaded but kernel not active" trap is the silent-un-patching failure mode.

**Decision.** Both tiers default to `RebootIfNeeded` (the patch-applies-and-reboots path). The `NoReboot` option is available but requires the consumer to write it explicitly with a `// HULUMI_DECISION:` comment. Sandbox does **not** default to `NoReboot`.

**Why.** The failure mode of a sandbox tenant being surprised by a 2am reboot is *visible and recoverable* (single-developer sandbox: re-launch a container, re-establish a VPN session). The failure mode of a sandbox running on the same kernel for sixty days is *invisible until exploited*. Hulumi's hardened-by-default discipline says we choose the visible-failure default.

**What we ship to make it tolerable.** Sandbox tier defaults `MaintenanceWindow.schedule` to `cron(0 04 ? * SUN *)` (Sunday 04:00 UTC — the lowest-collision window across UK / EU / US time zones for solo developers). StartupHardened tier ships **no schedule default** — the consumer must set it explicitly. Fail-loud is the right discipline for production.

**Documentation requirement.** The `Ec2PatchBaseline` component reference doc must lead with a "Reboot policy and what it means for you" section that names the trade-off in plain English, citing this design decision.

## Decision: synchronized-reboot mitigation (`staggering`)

The idea doc's prolonged-outage risk is "50 EC2s reboot at the same Maintenance Window cron firing → 45 min synchronized outage."

**Decision.** Ship a `staggering: { bucketCount, bucketWindowOffsetMinutes }` arg on `Ec2PatchBaseline`. The component creates `bucketCount` Maintenance Window Tasks, each with a target filter `tag:Patch:Group = production AND hash-bucket = N` (N in 0..bucketCount-1), each offset by `bucketWindowOffsetMinutes` from the prior. Hash-bucket is computed as `crc32(instance-id) mod bucketCount`, deterministic per-instance.

**Sandbox default.** `bucketCount: 1` (single window — cost dominates over availability for sandbox).

**StartupHardened default.** **No default.** Consumer must set explicitly. Fail-loud — the synchronized-reboot incident pattern is too common.

**Why CRC32 and not stable-hash via tag.** Tag-based hashing requires an additional tag (`Patch:HashBucket=N`) which would have to be set at instance-creation time. CRC32 of the instance ID is computed by SSM at run-time without per-instance tagging. The trade-off: when a consumer adds an instance, it lands in a deterministic bucket — predictable.

## Decision: `DetectiveServicesEnable` shape (M2 — closes [#49](https://github.com/kerberosmansour/hulumi/issues/49))

**Decision.** Build a `ComponentResource` `DetectiveServicesEnable` per [#49](https://github.com/kerberosmansour/hulumi/issues/49)'s proposal verbatim, with one revision: the component **always** emits an EventBridge rule routing GuardDuty findings + Inspector v2 findings + Cost Anomaly Detection alerts to an SNS topic ARN supplied by the consumer (typically a `MonitoringFoundation` output). [#49](https://github.com/kerberosmansour/hulumi/issues/49)'s draft made the SNS wiring optional; we make it **required at StartupHardened** and **optional with a default-no at Sandbox**.

**Why required at StartupHardened.** A detective service that emits findings to a console nobody reads is operationally identical to "off." The hardened-by-default discipline says we make the routing the path of least resistance.

**API shape (revised twice — first per [#49](https://github.com/kerberosmansour/hulumi/issues/49), then 2026-05-01 per Flaw 1 research-resolution).**

```ts
new baseline.aws.DetectiveServicesEnable("detective", {
  tier: Tier.StartupHardened,
  enableGuardDuty: true,                  // default true
  enableAccessAnalyzer: true,             // default true
  enableCostAnomalyDetection: true,       // default true
  enableInspectorV2: true,                // default true; covers EC2 + ECR + Lambda scan resource types
  guardDutyPublishingFrequency: "FIFTEEN_MINUTES",
  costAnomalyThresholdUsd: 20,
  inspectorScanResourceTypes: ["EC2", "ECR", "LAMBDA"],
  // Routing is dual at StartupHardened — see § Decision: dual-route default below.
  // - findingsRoutingSnsArn / findingsSeverityFloor route the firehose (HIGH+CRITICAL by default)
  // - findingsKevRoutingSnsArn routes the high-priority subset (KEV catalog membership)
  findingsRoutingSnsArn: monitoring.med.arn,    // medium-priority firehose at hardened
  findingsSeverityFloor: "HIGH",                 // route HIGH+CRITICAL only
  findingsKevRoutingSnsArn: monitoring.high.arn, // high-priority KEV-only route — NEW arg per Flaw 1
});
```

### Decision: KEV is native — no Step Functions, no Lambda (added 2026-05-01)

**Research finding (2026-05-01).** Amazon Inspector v2 has surfaced **CISA KEV catalog membership inline in finding payloads since 2023**. Each Inspector v2 `Inspector2 Finding` event includes:

- `kev.dateAdded` — the date CISA added the CVE to the Known Exploited Vulnerabilities catalog (key existence indicates KEV membership)
- `kev.dateDue` — CISA's federal-agency remediation deadline
- `epss.score` — Exploit Prediction Scoring System score (0.0–1.0)
- `exploitAvailable` — boolean indicating whether public exploit code exists

This collapses the prior speculation about "EventBridge Pipes + Step Functions joining cisa.gov KEV JSON." **No external fetch. No Step Functions. No Lambda.** EventBridge rule patterns can match the KEV fields directly.

**Decision: dual-route default.** At `tier: StartupHardened`, `DetectiveServicesEnable` ships two EventBridge routes:

1. **Firehose route** — `findingsRoutingSnsArn` (typically `MonitoringFoundation.med.arn`) receives every finding at or above `findingsSeverityFloor` (default `HIGH`).
2. **KEV-only route** — `findingsKevRoutingSnsArn` (typically `MonitoringFoundation.high.arn`) receives only findings with `$.detail.findingDetails.kev.dateAdded` present (i.e., the CVE is on CISA's actively-exploited list).

The EventBridge rule patterns are pure JSON — no runtime code. Sandbox tier defaults to KEV route only (cost-conscious, signal-rich).

**Cost (confirmed 2026-05-01).** Inspector v2 EC2 scanning is **$1.258/instance/month** continuous. ECR is **$0.09/image first scan, $0.01/re-scan**. 15-day free trial per new account. For a sub-10-instance fleet with ~50 ECR pushes/month, expect ~$5–15/month total — sub-line-item to a Client VPN. Documented in M5's `detective-services-enable.md` cookbook with a worked example.

**Cost-zero alternative (cookbook only).** Trivy-in-CI runs in the consumer's GitHub Actions, scans ECR images at build time with the same KEV catalog awareness Inspector v2 has, free. Pair with SSM Patch Compliance scanning (free side-effect of `Ec2PatchBaseline`) for EC2-side coverage. Hulumi ships **no** components for this path; M5 cookbook documents the YAML.

**Outputs.** `guardDutyDetectorId`, `accessAnalyzerArn`, `costAnomalyDetectorArn`, `inspectorAccountStatus`, `findingsEventRuleArn`. All `stable`.

## Decision: `AuditTrail` shape (M3 — closes [#47](https://github.com/kerberosmansour/hulumi/issues/47))

**Decision.** Build [#47](https://github.com/kerberosmansour/hulumi/issues/47)'s proposal verbatim, with two revisions:

1. The S3 bucket is created via `@hulumi/baseline.aws.SecureBucket` (not raw `aws.s3.BucketV2`). This eliminates the bucket-policy-vs-trail-arn ordering gotcha mentioned in [#47](https://github.com/kerberosmansour/hulumi/issues/47) — `SecureBucket` already enforces TLS-only, public-access-block, SSE-KMS, versioning. The CloudTrail-write policy is added as a separate `aws.s3.BucketPolicy` with the trail ARN known after construction (Pulumi's standard `Output<>` chaining handles the ordering).
2. CW Logs group is created with KMS encryption using the same KMS alias as `AccountFoundation` (`alias/<account>-logs` if present, else a Hulumi-managed alias `alias/hulumi-audit-trail-<stack>`). This avoids the "audit-trail logs are encrypted with AWS-managed KMS but everything else is customer-managed" smell.

**API shape.**

```ts
new baseline.aws.AuditTrail("audit", {
  tier: Tier.StartupHardened,
  name: "management-events",
  cwLogsRetentionDays: 90,                // tier-aware default; StartupHardened: 365
  s3LifecycleArchiveDays: 90,
  s3LifecycleExpireDays: 365,
  captureS3DataEvents: false,             // off by default (cost)
  captureLambdaDataEvents: false,         // off by default (cost)
  kmsKeyAliasName: foundation.kmsLogsAlias.name,  // optional; falls back to hulumi-managed alias
});
```

**Outputs.** `trailArn`, `logGroupName`, `logGroupArn`, `bucketArn`, `kmsKeyArn`. All `stable`.

## Decision: `HulumiOperationsHardeningPack` shape (M4 — Approach C bundled)

**Decision.** Add a new CrossGuard policy pack `HulumiOperationsHardeningPack` to `@hulumi/policies`, mirroring `HulumiHardeningPack`'s tier-aware `advisory | mandatory` shape. Five rules, all prefix `O_`:

| Rule ID         | Tier-aware level                     | What it catches                                                                              |
| --------------- | ------------------------------------ | -------------------------------------------------------------------------------------------- |
| `O_PATCH_1`     | Sandbox: advisory; Hardened: mandatory | `aws.ec2.Instance` without a `Patch:Group=*` tag                                              |
| `O_PATCH_2`     | both: mandatory                       | `aws.ssm.PatchBaseline` not associated to a `MaintenanceWindow` (orphan baseline)             |
| `O_DETECT_1`    | Sandbox: advisory; Hardened: mandatory | account-level stack with EC2 / ECR resources but no `DetectiveServicesEnable`                 |
| `O_AUDIT_1`     | Sandbox: advisory; Hardened: mandatory | account-level stack without an `AuditTrail` (or documented `Suppression`)                    |
| `O_INSPECTOR_1` | both: mandatory                       | `aws.ecr.Repository` with `imageScanningConfiguration.scanOnPush != true`                     |

`Suppression` API (existing) accepts these rule IDs. Tier monotonicity meta-test (existing pattern, H4-shape) extends to verify Sandbox emits ≤ controls than StartupHardened across this pack — a regression in tier ladder is a CI failure.

**Compliance mappings (IDs only, per Hulumi's licence-boundary discipline).**

| Rule          | CIS AWS FB v5     | NIST 800-53 r5  | PCI-DSS v4.0.1   |
| ------------- | ----------------- | --------------- | ---------------- |
| `O_PATCH_1`   | (no v5 patch ID — see [§ Open question 4](#open-questions)) | SI-2(2)         | 6.3.3            |
| `O_PATCH_2`   | (same)            | SI-2(3)         | 6.3.3            |
| `O_DETECT_1`  | 4.16              | AU-12, SI-4(2)  | 10.1, 11.5.1     |
| `O_AUDIT_1`   | 3.x section       | AU-2, AU-3      | 10.2.1           |
| `O_INSPECTOR_1` | 5.5             | RA-5(2)         | 6.3.2            |

The mapping table follows [`docs/mappings/`](../mappings/) house style — IDs only, framework URLs cited in the rule's metadata, no verbatim control text.

## Decision: skill scenarios (M5)

**Decision.** Add three new `/hulumi-threat-model` scenarios to the existing skill (no new skill, no new package — the skill ships scenarios as data files):

- `aws-patch-compliance-lapse` — un-patched fleet attack-surface
- `aws-detective-service-disabled` — silent-tamper of GuardDuty / Inspector by a privileged insider
- `aws-audit-pipeline-broken` — CloudTrail → CW Logs delivery failure (silent un-logging)

Each follows the existing scenario JSON schema (`skills/hulumi-threat-model/scenarios/*.json`). The `recommendedComponents[].availability` strings are pinned to `"Shipped in M<N>"` per the [#15](https://github.com/kerberosmansour/hulumi/issues/15) sweep convention.

## Architecture diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│ User Environment (laptop or CI)                                           │
│                                                                           │
│   Engineer ─→ Claude Code ─→ Pulumi program                              │
│                                                                           │
│   Imports @hulumi/baseline.aws.{Ec2PatchBaseline, DetectiveServicesEnable,│
│                                  AuditTrail, MonitoringFoundation, …}     │
│   Imports @hulumi/policies.HulumiOperationsHardeningPack                  │
└─────────────────────────────────┬────────────────────────────────────────┘
                                  │ trust boundary 1 — IaC role
                                  │ tagged hulumi:iac-role=true
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ AWS Account                                                               │
│                                                                           │
│   ┌────────────────────────────────────────────────────────────────────┐  │
│   │ Account-level managed services configured by this surface           │  │
│   │                                                                     │  │
│   │  SSM Patch Manager  ───→  EC2 fleet (tag:Patch:Group=*)            │  │
│   │  Inspector v2       ───→  EC2 + ECR + Lambda                       │  │
│   │  GuardDuty          ───→  CloudTrail + VPC Flow + DNS              │  │
│   │  IAM Access Analyzer                                                │  │
│   │  Cost Anomaly Detection                                             │  │
│   │  CloudTrail (multi-region, log-file validation)                     │  │
│   └─────────────────────────────────┬───────────────────────────────────┘  │
│                                     │ trust boundary 2 — service-to-service│
│                                     │   IAM service roles per service       │
│                                     ▼                                       │
│   ┌────────────────────────────────────────────────────────────────────┐  │
│   │ EventBridge + CloudWatch Logs                                       │  │
│   │                                                                     │  │
│   │  EventBridge rules (Inspector2 Finding, GuardDuty Finding, Cost-    │  │
│   │   AnomalyDetection Anomaly, SSM-Compliance metric filter)           │  │
│   │  CW Logs group (CloudTrail log delivery; KMS-encrypted)             │  │
│   └─────────────────────────────────┬───────────────────────────────────┘  │
│                                     │ trust boundary 3 — pre-existing       │
│                                     │   MonitoringFoundation SNS topics     │
│                                     │   (M5/#46) consumer-supplied ARN      │
│                                     ▼                                       │
│   ┌────────────────────────────────────────────────────────────────────┐  │
│   │ MonitoringFoundation severity-tiered SNS topics (existing, M5)      │  │
│   │   high.arn  ──→  consumer's email / PagerDuty / Slack subscription  │  │
│   │   med.arn                                                            │  │
│   │   low.arn                                                            │  │
│   └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘

Solid lines = exists at HEAD (M5 already shipped MonitoringFoundation).
Dashed lines = added by this runbook.
```

## Public interfaces & stability levels

Downstream milestones cannot rename or reshape these without explicit migration. Stability ladder mirrors [`hulumi-k8s-surface.md`](./hulumi-k8s-surface.md).

| Surface                                                              | Stability  | Notes                                                                                |
| -------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------ |
| `@hulumi/baseline.aws.Ec2PatchBaseline` constructor + `Args` shape    | `stable`   | M1 — frozen at v1.2.0. Args additions are non-breaking; existing fields are frozen.  |
| `@hulumi/baseline.aws.DetectiveServicesEnable` constructor + `Args`   | `stable`   | M2. Resolves [#49](https://github.com/kerberosmansour/hulumi/issues/49).             |
| `@hulumi/baseline.aws.AuditTrail` constructor + `Args`                | `stable`   | M3. Resolves [#47](https://github.com/kerberosmansour/hulumi/issues/47).             |
| `@hulumi/policies.HulumiOperationsHardeningPack` rule IDs (`O_*`)     | `stable`   | M4. Renaming a rule ID is a major-version bump.                                      |
| Tag keys: `Patch:Group`, `hulumi:patch-bucket`, `hulumi:operations`   | `stable`   | Cross-component contract.                                                            |
| `Ec2PatchBaseline.staggering.bucketCount` semantics (CRC32 mod)       | `evolving` | Reserves the right to swap hash function in v2 with a documented migration.          |
| Internal: shape of the IAM service role for Maintenance Window Task   | `internal` | Fair game — consumers should not depend on policy ARNs being stable.                 |

## Cross-package contracts

- `@hulumi/baseline.aws.Ec2PatchBaseline` consumes `MonitoringFoundation` outputs as plain `Output<string>` SNS ARNs. **No shared module state.**
- `@hulumi/policies.HulumiOperationsHardeningPack` is a sibling rule pack to `HulumiHardeningPack`; they may both be loaded in the same `policies/` directory, and the `Suppression` API accepts rule IDs from either pack indifferently.
- `@hulumi/baseline.aws.AuditTrail` may consume an `AccountFoundation`'s KMS alias as input. **Optional.** No required dependency between the two — `AuditTrail` ships a Hulumi-managed KMS alias when no foundation is supplied.
- `@hulumi/baseline.aws.DetectiveServicesEnable` does **not** depend on any other `@hulumi/baseline.aws.*` component. It is the one new component that any consumer can drop into a 5-line `index.ts` regardless of what else they have.

## tla_required: false

No concurrent actors / distributed-state guarantees beyond Pulumi's standard apply ordering. The "synchronized-reboot mitigation" decision (CRC32-based staggering) is the only place ordering matters, and the ordering is a stateless function over `instance-id`. Mirrors the [`hulumi-k8s-surface.md`](./hulumi-k8s-surface.md) decision.

## Open questions

These are the four `/slo-research` open-question buckets from the idea doc, reframed against the architecture decisions above. Answering them is **not** blocking for `/slo-plan` to produce M1's contract block — they refine M2–M5.

1. **(was Q1, Q3 from idea doc)** SSM Patch Manager + PCI-DSS Req 6.3.3 — is `complianceMetric` time-to-deploy, time-to-scan, or compliance-state-failed the right primary signal? This shapes M1's `complianceMetric` output.
2. **(was Q2 from idea doc) — RESOLVED 2026-05-01.** AWS Inspector v2 surfaces KEV catalog membership + EPSS scores inline in finding payloads since 2023. The `Inspector2 Finding` event shape is stable. M2 ships dual-route via pure EventBridge JSON patterns; no external fetch or runtime code.
3. **(was Q4 from idea doc)** CIS AWS Foundations Benchmark v5.0.0 patch-management coverage — historically v8 has patch IDs that v5 doesn't. If v5 has no patch ID, the `O_PATCH_*` mappings cite v8 and we surface the version skew in [`docs/mappings/`](../mappings/) docs honestly.
4. **(was Q9 from idea doc)** Cross-account Maintenance Window Targets — does `MaintenanceWindowTarget.Targets[].TargetAccountIds` work cleanly via the Pulumi provider? If yes, M1 surfaces a `targetAccounts` knob; if no, defer to v1.3.

### New questions surfaced 2026-05-01

5. **DHI catalog coverage for sunlit-shaped runtimes** — does Docker Hardened Images carry `rust:1.88`-equivalent, Node, and HashiCorp Vault images? Verification is a 30-min `docker pull` exercise; if gaps exist, document the Chainguard fallback in the M5 hardened-base-images cookbook. Tracked in [`docs/idea/hulumi-for-operations-v1-3.md`](../idea/hulumi-for-operations-v1-3.md) for the v1.3 ECR pull-through-cache work.
6. **Wave gate semantics under partial failure** — when the dev-wave-to-staging-wave composite alarm fires mid-window (e.g., a single dev EC2 fails patch compliance but the rest succeed), should the gate disable the staging wave for the *current* week or permanently until reset? Decision: current week only; the `MaintenanceWindow.enabled: false` is a flop, not a latch. Document in M1 lessons file when implemented.

## Glossary

- **Tier**: The shared `@hulumi/baseline.Tier` enum: `Sandbox` | `StartupHardened`. Reused unchanged.
- **MonitoringFoundation**: Existing component shipped in M5 ([#46](https://github.com/kerberosmansour/hulumi/issues/46)). Provides severity-tiered SNS topics. This runbook depends on its outputs but does not modify it.
- **IaC role**: The IAM role with `hulumi:iac-role=true` tag that Pulumi assumes. The Operations surface adds five new IAM permissions to this role's allowed action set; details in M1's Contract Block.
- **Patch Group**: AWS SSM concept — a tag-keyed group of EC2 instances that share a Patch Baseline. The default tag key in this surface is `Patch:Group` (AWS-conventional).
