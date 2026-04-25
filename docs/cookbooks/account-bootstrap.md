---
title: Bootstrap a new AWS account with AccountFoundation
description: Stand up a defensible AWS account on day one — CloudTrail, Config, GuardDuty, Security Hub, IAM baseline, KMS ring — with one ComponentResource.
---

# Bootstrap a new AWS account with `AccountFoundation`

## When to use this recipe

You have a fresh AWS account (or one you've inherited) and want a defensible baseline before any workload-specific resources land. `AccountFoundation` composes the seven services you'd otherwise wire up by hand into one tiered Pulumi `ComponentResource`.

If you only need a hardened bucket, see [getting-started.md](../getting-started.md). If you want to bootstrap _and_ run drift detection in CI, follow this recipe first then [Wire drift detection into CI](./drift-detection.md).

## Preconditions

- A target AWS account you can `pulumi up` against. For first runs, prefer a [sandbox account](../deployment/sandbox-account.md).
- An IAM role to use as the IaC role, **tagged `hulumi:iac-role=true`**. The Pulumi-side credentials assume this role.
- Pulumi 3.232.0+, `@hulumi/baseline@1.0.0` installed.
- (Recommended) A budget alarm on the target account. The full Startup-Hardened baseline costs `<$1/run` torn down promptly; orphaned GuardDuty + KMS can drift to $30–60/month. See [integration-testing.md § cost contract](../integration-testing.md#cost-contract).

## Steps

### 1. Pick a tier

| Scenario                               | Use this tier              |
| -------------------------------------- | -------------------------- |
| Sandbox / scratch / weekly integration | `tier: "sandbox"`          |
| Production-facing or regulated account | `tier: "startup-hardened"` |

If you're unsure, default to `sandbox` and migrate before you route real traffic. The migration is a single field change.

### 2. Author the program

```ts
import { AccountFoundation } from "@hulumi/baseline/aws";

export const baseline = new AccountFoundation("baseline", {
  tier: "startup-hardened",
  iacRoleArn: "arn:aws:iam::111122223333:role/your-iac-role",
  region: "us-east-1",
  // Optional: aggregate Config recordings from peer accounts in the same org.
  orgAccountIds: ["111111111111", "222222222222"],
});

export const trailArn = baseline.cloudTrailArn;
export const guardDutyDetectorId = baseline.guardDutyDetectorId;
export const kmsKeyArns = baseline.kmsKeyArns;
```

What this gets you (Startup-Hardened tier):

- 4 KMS CMKs (logs / data / secrets / config) with rotation.
- IAM account password policy (length 14, reuse 24, complexity).
- Multi-region CloudTrail with log-file validation + S3 data events on the log bucket.
- AWS Config recorder + delivery channel + cross-account aggregator.
- GuardDuty detector with five extended features (S3 data events, EKS audit logs, EBS malware protection, RDS login events, runtime monitoring).
- Security Hub subscribed to CIS AWS Foundations v5.0 _and_ NIST 800-53 r5 standards.
- IAM Access Analyzer at account scope.
- CloudWatch Logs group integrated with CloudTrail (CIS §3.4).
- KMS deny-without-tag policy on every CMK (only when `orgAccountIds` is supplied — single-account stacks hit a bootstrap paradox).

### 3. Pair with the policy pack

```bash
pulumi preview --policy-pack ./policies   # see getting-started.md step 4
```

H1 enforces "no raw `aws.s3.Bucket`" — useful even at account scope because the log bucket inside `AccountFoundation` is itself a `SecureBucket`. H3 (advisory pre-v1.0, mandatory at v1.0) enforces the `hulumi:iac-role=true` tag on your IaC role.

### 4. Apply

```bash
pulumi up
```

First `pulumi up` of a Startup-Hardened account typically takes 8–12 minutes — Security Hub standards subscriptions and GuardDuty feature enablement are the slow steps. The component declares explicit `dependsOn` on the GuardDuty detector + every DetectorFeature so Security Hub doesn't try to subscribe before the detector is `ENABLED`. See [account-foundation.md § Eventual-consistency contract](../components/account-foundation.md#eventual-consistency-contract) for why this isn't a polling probe.

### 5. (Optional) Apply the SCP that protects `hulumi:iac-role`

The v1.0 release ships [`docs/deployment/scp.json`](../deployment/) — a Service Control Policy that prevents non-IaC principals from removing the `hulumi:iac-role` tag from your role. Walk through [scp-guide.md](../deployment/scp-guide.md) before applying.

## Verify

- **CloudTrail**: `aws cloudtrail describe-trails --query 'trailList[?Name==`baseline-trail`]'` returns a trail with `IsMultiRegionTrail: true` and `LogFileValidationEnabled: true`.
- **GuardDuty**: `aws guardduty list-detectors` returns one detector ID matching `baseline.guardDutyDetectorId`.
- **Security Hub**: `aws securityhub get-enabled-standards` lists at least the CIS v5.0 standard. Startup-Hardened lists NIST 800-53 r5 too.
- **Tags**: every taggable child carries `hulumi:component=AccountFoundation`, `hulumi:tier=startup-hardened`, and a `hulumi:controls` value with ≥ 18 framework IDs.
- **Policy pack**: `pulumi preview --policy-pack ./policies` reports zero mandatory violations.

## Troubleshooting

**`pulumi up` fails with `Detector not yet ENABLED` on the Security Hub subscription.** AWS's `CreateDetector` returns once `status === ENABLED`, but extreme cold-region cases have surfaced delays. The escape hatch is `packages/baseline/src/aws/probes/poll.ts` — currently unused but preserved for v1.1+ probes. Open an issue if you hit this; we'd want to gate the probe behind a flag rather than reintroduce it for everyone.

**`KMS deny-without-tag` policy fails to apply.** The deny policy only attaches when `orgAccountIds` is supplied — there's a real bootstrap paradox in single-account stacks where the policy itself prevents the principal from updating the policy. Drop the `orgAccountIds` arg if you're running single-account.

**Costs climbed after a CI failure.** Teardown failures leak GuardDuty + KMS + CloudWatch Logs. The $20/month sandbox-account budget alarm is the canonical safety net; see [sandbox-account.md](../deployment/sandbox-account.md). For one-off cleanup: `pulumi destroy --refresh`.

## See also

- [components/account-foundation.md](../components/account-foundation.md) — full args/outputs reference.
- [tiers.md § AccountFoundation](../tiers.md#accountfoundation--tier-matrix) — exact sub-resource delta.
- [integration-testing.md](../integration-testing.md) — how the weekly real-AWS workflow exercises this end-to-end.
- [examples/account-foundation-smoke/](../../examples/account-foundation-smoke/) — minimal end-to-end example.
