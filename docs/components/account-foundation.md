# `hulumi.baseline.aws.AccountFoundation`

Hardened AWS account baseline — composes CloudTrail, AWS Config,
GuardDuty, Security Hub, IAM password policy + Access Analyzer, and a
KMS key ring into one tiered Pulumi `ComponentResource`. All
sub-resources are children of the
`hulumi:baseline:aws:AccountFoundation` component; every taggable child
carries the `hulumi:component`, `hulumi:tier`, and `hulumi:controls`
tag triple.

**Stability**: `stable` from v0.3 per
[interfaces.md §1](../slo/design/hulumi/interfaces.md).
**Ships**: M3.
**Paired policies**: `HulumiHardeningPack` H1–H4 (M2),
`CisV5Pack` sections 1–3 (M3).

## Quick-start

### Sandbox tier

```ts
import { AccountFoundation } from "@hulumi/baseline/aws";

const sandbox = new AccountFoundation("baseline", {
  tier: "sandbox",
  iacRoleArn: "arn:aws:iam::111122223333:role/hulumi-sandbox-iac-role",
});

export const detectorId = sandbox.guardDutyDetectorId;
```

Emits: 4 KMS CMKs (logs / data / secrets / config) with rotation,
account password policy, single-region CloudTrail, AWS Config recorder

- delivery channel, GuardDuty basic detector, Security Hub + CIS v5.0.

### Startup-Hardened tier

```ts
import { AccountFoundation } from "@hulumi/baseline/aws";

const baseline = new AccountFoundation("baseline", {
  tier: "startup-hardened",
  iacRoleArn: "arn:aws:iam::111122223333:role/hulumi-prod-iac-role",
  cisVersion: "v5.0.0",
  region: "us-east-1",
  orgAccountIds: ["111111111111", "222222222222"],
});

export const detectorId = baseline.guardDutyDetectorId;
export const trailArn = baseline.cloudTrailArn;
export const trailLogGroupName = baseline.cloudTrailLogGroupName;
```

Emits everything in the Sandbox tier PLUS:

- Multi-region CloudTrail with log-file validation + S3 data events on
  the log bucket.
- AWS Config aggregator pulling from `orgAccountIds`.
- GuardDuty 5 extended features (S3 data events, EKS audit logs, EBS
  malware protection, RDS login events, runtime monitoring).
- Security Hub NIST 800-53 Rev 5 standard subscribed alongside CIS v5.0.
- IAM Access Analyzer at account scope.
- KMS deny-without-tag policy on every CMK (requires
  `aws:PrincipalTag/hulumi:iac-role=true` to perform encrypt/decrypt
  actions; default `auto` mode applies only when `orgAccountIds` is
  supplied).
- CloudWatch Logs group for CloudTrail integration (CIS §3.4).

The full tier matrix lives in
[../tiers.md § AccountFoundation — tier matrix](../tiers.md#accountfoundation--tier-matrix).

## Audit storage and upgrades

Startup-Hardened uses a separate KMS-encrypted CloudTrail archive with Object Lock COMPLIANCE retention for 365 days. AWS Config keeps the existing delivery bucket without default Object Lock retention, as required by [AWS Config](https://docs.aws.amazon.com/config/latest/developerguide/manage-delivery-channel.html). Both buckets send server-access logs to a real private SSE-S3 destination. S3 server-access-log destinations cannot use Object Lock or SSE-KMS; see [AWS logging requirements](https://docs.aws.amazon.com/AmazonS3/latest/userguide/troubleshooting-server-access-logging.html).

The upgrade creates the archive and access-log destination and changes CloudTrail's destination. Existing records stay in the original bucket; they do not acquire retrospective Object Lock retention. Review `pulumi preview` before deploying. COMPLIANCE-retained object versions cannot be deleted before expiry, including by an account administrator. Hardened component names must use 1–24 lowercase letters, digits, or hyphens so log delivery can be restricted to the component's physical bucket-name prefixes. Hardened audit storage accepts only omitted or literal `false` force-destroy inputs.

The archive omits the additional CloudTrail Lake S3 data-event store because its COMPLIANCE retention already protects the delivered files. The existing delivery bucket retains its seven-day S3 activity store. That activity store is not a retained copy of the CloudTrail log files.

Config delivery uses the existing account-scoped `config.amazonaws.com` grants in the bucket and KMS key policies. AWS documents this [service-principal retry](https://docs.aws.amazon.com/config/latest/developerguide/s3-kms-key-policy.html) when the recorder role lacks delivery access. New deployments need no Config recorder inline policy. An upgrade that removes an existing `*-config-delivery-policy` needs a deployment operator with permission to delete that existing policy once; the restricted weekly role remains unable to write arbitrary inline policies. These changes have mocked resource and policy regression coverage; live AWS deployment must be validated separately.

## Args

| Arg                             | Type                              | Required?                  | Default                                                                      |
| ------------------------------- | --------------------------------- | -------------------------- | ---------------------------------------------------------------------------- |
| `tier`                          | `"sandbox" \| "startup-hardened"` | yes                        | —                                                                            |
| `iacRoleArn`                    | `Input<string>`                   | yes                        | — (must be non-empty; should carry `hulumi:iac-role=true`)                   |
| `cisVersion`                    | `"v5.0.0" \| "v7.0.0"`            | no                         | `v5.0.0` (v7.0.0 accepted with a warning — AWS Security Hub maxes at v5.0.0) |
| `region`                        | `Input<string>`                   | no                         | Pulumi provider's region                                                     |
| `logBucketForceDestroy`         | `Input<boolean>`                  | no                         | `false`; intended only for ephemeral test stacks                             |
| `existingGuardDutyDetectorId`   | `Input<string>`                   | no                         | —; references an existing regional detector instead of creating one          |
| `useExistingSecurityHubAccount` | `boolean`                         | no                         | `false`; references an already-enabled regional Security Hub account         |
| `orgAccountIds`                 | `readonly string[]`               | no (Startup-Hardened only) | —                                                                            |
| `kmsDenyWithoutTag`             | `"auto" \| "force" \| "off"`      | no (Startup-Hardened only) | `auto`; preserve the org-account gated deny policy                           |

## KMS deny-without-tag modes

`kmsDenyWithoutTag` controls the Startup-Hardened KMS key-policy
statement that denies encrypt/decrypt/data-key/re-encrypt operations
unless the calling principal carries `hulumi:iac-role=true`.

| Mode    | Behavior                                                                                      |
| ------- | --------------------------------------------------------------------------------------------- |
| `auto`  | Default. Applies the deny statement only when `orgAccountIds` is supplied.                    |
| `force` | Applies the deny statement in Startup-Hardened single-account stacks, scoped to this account. |
| `off`   | Suppresses the deny statement even when `orgAccountIds` is supplied.                          |

For single-account stacks, use a two-phase opt-in:

1. Apply `AccountFoundation` with the default `auto` mode and no
   `orgAccountIds`, or explicitly set `kmsDenyWithoutTag: "off"`.
2. Confirm the Pulumi execution role is tagged
   `hulumi:iac-role=true`.
3. Change to `kmsDenyWithoutTag: "force"` and apply again.

If the rollout locks out the expected principal, use a break-glass
administrator or root-account path to remove the
`DenyKmsActionsWithoutHulumiIacRoleTag` statement from the four CMK
policies, restore `kmsDenyWithoutTag: "off"`, and re-apply. Do not
retry `force` until the IaC role tag is visible on the principal used by
Pulumi.

## Outputs

| Output                   | Type                             | Description                                                          |
| ------------------------ | -------------------------------- | -------------------------------------------------------------------- |
| `cloudTrailArn`          | `Output<string>`                 | Multi-region (Startup-Hardened) or single-region trail ARN.          |
| `cloudTrailLogGroupName` | `Output<string \| undefined>`    | CloudTrail CloudWatch Logs group name when emitted by the tier.      |
| `configRecorderArn`      | `Output<string>`                 | Config recorder ARN.                                                 |
| `guardDutyDetectorId`    | `Output<string>`                 | GuardDuty detector ID.                                               |
| `securityHubHubArn`      | `Output<string>`                 | Security Hub hub ARN.                                                |
| `kmsKeyArns`             | `Output<Record<string, string>>` | KMS CMK ARNs keyed by service: `logs`, `data`, `secrets`, `config`.  |
| `iamBaselinePolicyArns`  | `Output<string[]>`               | Account password policy ID + (Startup-Hardened) Access Analyzer ARN. |

Use `cloudTrailLogGroupName` as the canonical input for
`IdentityAlarms.trailLogGroupName` when wiring CloudTrail metric filters
from a Startup-Hardened AccountFoundation stack:

```ts
const trailLogGroupName = baseline.cloudTrailLogGroupName.apply((name) => {
  if (name === undefined) {
    throw new Error("AccountFoundation did not emit a CloudTrail log group for this tier");
  }
  return name;
});

new IdentityAlarms("identity-alarms", {
  tier: "startup-hardened",
  trailLogGroupName,
  criticalTopicArn: monitoring.critical.arn,
  highTopicArn: monitoring.high.arn,
});
```

## Tags emitted

All taggable children carry:

| Tag key            | Example value                   | Purpose                                                                    |
| ------------------ | ------------------------------- | -------------------------------------------------------------------------- |
| `hulumi:component` | `AccountFoundation`             | Attribution.                                                               |
| `hulumi:tier`      | `sandbox` \| `startup-hardened` | Tier metadata; consumed by H4 / H3 + the M4 drift classifier.              |
| `hulumi:controls`  | comma-separated framework IDs   | Which CCM / CIS / NIST IDs this component claims to address (≥18 entries). |

Tag-key schema is `stable` per
[interfaces.md §6](../slo/design/hulumi/interfaces.md).

## Framework IDs cited

AccountFoundation addresses the union of SecureBucket's IDs (since the
log bucket is a SecureBucket child) plus the AccountFoundation-specific
ones:

- **CCM v4.1**: DSP-01, CEK-04, CEK-01, DSP-17, LOG-01, IAM-01, LOG-02.
- **CIS AWS v5.0.0**: 2.1.1, 2.1.2, 2.1.4, 2.1.5, 2.1.6, 1.6, 1.19, 3.1, 3.2, 3.7, 3.8.
- **NIST 800-53 Rev 5**: AC-3, SC-8, SC-12, SC-13, SC-28, AU-2, AU-12, CP-9, CA-7.
- **MITRE ATLAS v5.1**: AML.T0001 (via SecureBucket).

IDs only — prose is intentionally NOT embedded (per the IDs-only
license boundary in [../licensing.md](../licensing.md)).

## Eventual-consistency contract

AWS service enablement is asynchronous. AccountFoundation orders its
sub-resources via Pulumi `dependsOn`:

```mermaid
flowchart LR
  KMS[KMS Ring × 4 CMKs] --> LogBucket[SecureBucket log bucket]
  KMS --> Trail
  LogBucket --> Trail[CloudTrail]
  LogBucket --> Config[Config Recorder + Delivery]
  GD[GuardDuty Detector] --> GDFeatures[5 DetectorFeatures]
  GD --> SH[Security Hub Account]
  GDFeatures --> SH
  SH --> CISSub[StandardsSubscription CIS v5.0]
  SH --> NISTSub[StandardsSubscription NIST 800-53 r5]
```

The original M3 design used a `pulumi.dynamic.Resource` polling probe
between GuardDuty and Security Hub. That conflicts with vitest's
worker pool — Pulumi's closure-serialization needs Node's
`trace_events`. We dropped the probe in favor of direct `dependsOn` on
the Detector + every DetectorFeature; AWS's `CreateDetector` API call
itself blocks until `status === ENABLED`, which gives us equivalent
ordering for real deployments. The escape hatch
(`packages/baseline/src/aws/probes/poll.ts`) is preserved for v1.1+
probes where dependsOn alone is insufficient. See
[M3 lessons](../slo/lessons/hulumi-m3.md) for the full
rationale.

## Input validation

- `tier` outside the union → constructor throws `Invalid Hulumi tier
"..."; expected one of: sandbox, startup-hardened`.
- `iacRoleArn` empty string → constructor throws `iacRoleArn must be a
non-empty string ARN`.
- `kmsDenyWithoutTag` outside `auto | force | off` → constructor throws
  with the accepted mode list.
- `cisVersion: "v7.0.0"` accepted but logs a warning that AWS Security
  Hub currently maxes at v5.0.0; falls through to v5.0.0 behaviour.

## Mock-unit testing

The component instantiates normally under
`pulumi.runtime.setMocks()`. See
[../../packages/baseline/tests/account-foundation.test.ts](../../packages/baseline/tests/account-foundation.test.ts)
for the BDD test suite and
[../../examples/account-foundation-smoke/](../../examples/account-foundation-smoke/)
for a minimal end-to-end example.

Real-AWS integration runs **weekly** via
[`.github/workflows/weekly-integration.yml`](../../.github/workflows/weekly-integration.yml).
See [../integration-testing.md](../integration-testing.md) for the
auth, cost, and teardown contract.

## Planned deltas

- **v0.4 (M4)**: Drift classifier wires the `hulumi:iac-role`
  principal-attribution into its CloudTrail adapter.
- **v1.0 (M5)**: SLSA Build L3 attestation on the published
  `@hulumi/baseline` package; SCP template
  [`docs/deployment/scp.json`](../deployment/) pairs with H3→mandatory.

The default S3 data-event selector covers the existing Config/legacy log delivery bucket, while CloudTrail delivers new files to the separate archive. This prevents CloudTrail's writes from recursively producing more archive writes. Archive access is recorded through its server-access logs; enabling additional CloudTrail data-event coverage of the archive requires a separately configured, supported recursive-delivery suppression setting. Management events remain enabled.
