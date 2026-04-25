# Integration testing — Hulumi M3 weekly workflow

Hulumi's per-PR test suite runs entirely on Pulumi mocks. Real-AWS
integration runs **weekly**, not per-PR, in a dedicated sandbox account
via GitHub Actions OIDC. This document spells out the workflow, the
auth path, the cost contract, and how to run it locally.

## Workflow

[`.github/workflows/weekly-integration.yml`](../.github/workflows/weekly-integration.yml)

- **Trigger**: cron `0 4 * * 0` (Sundays 04:00 UTC) + `workflow_dispatch`
  for ad-hoc runs.
- **Matrix**: `tier ∈ {sandbox, startup-hardened}` — both run in parallel.
- **Job timeout**: 30 minutes total (15-min Pulumi up + 10 min destroy +
  5 min slop, per the M3 contract's eventual-consistency window).
- **Auth**: OIDC `AssumeRoleWithWebIdentity` against
  `AWS_SANDBOX_OIDC_ROLE_ARN`. No long-lived AWS credentials.
- **State backend**: Pulumi Cloud via `PULUMI_ACCESS_TOKEN` (GitHub
  secret). When the token is unset the workflow runs in
  **CONTRACT-ONLY mode** (mock unit + integration tests, no actual
  `pulumi up`). This is the default until you opt in.

## Required repo configuration

| Type     | Name                        | Source                                              | Required?              |
| -------- | --------------------------- | --------------------------------------------------- | ---------------------- |
| Variable | `AWS_SANDBOX_ACCOUNT_ID`    | account ID of the sandbox AWS account               | yes                    |
| Variable | `AWS_SANDBOX_OIDC_ROLE_ARN` | ARN of the IaC role with `hulumi:iac-role=true` tag | yes                    |
| Variable | `AWS_SANDBOX_REGION`        | AWS region (default `us-east-1`)                    | yes                    |
| Secret   | `PULUMI_ACCESS_TOKEN`       | Pulumi Cloud personal access token                  | only for real-AWS path |

The first three are set during sandbox bootstrap (see
[deployment/sandbox-account.md](deployment/sandbox-account.md)). The
Pulumi access token is opt-in — without it, the weekly workflow still
runs the mocks-only path on the schedule and proves the AWS OIDC path
remains live; with it, the workflow drives a full
`pulumi up` → `pulumi destroy` cycle.

## Cost contract

| Resource                           | Per-run cost             | Notes                                            |
| ---------------------------------- | ------------------------ | ------------------------------------------------ |
| CloudTrail management events       | $0                       | First trail per region is free.                  |
| AWS Config                         | ~$0.01–0.05              | Recorder + items enumerated, torn down each run. |
| GuardDuty (basic)                  | <$0.10                   | Enable + scan + disable in the test window.      |
| GuardDuty (extended features × 5)  | <$0.20                   | Each feature billed per scan.                    |
| Security Hub + 2 standards         | <$0.05                   | Per-check pricing; 2 standards = double cost.    |
| KMS CMK ring (4 keys)              | $0 if torn down each run | $1/month per key if orphaned.                    |
| S3 (log bucket)                    | <$0.01                   | Object count negligible.                         |
| CloudWatch Logs (Startup-Hardened) | <$0.01                   | 365-day retention but tiny ingest.               |

**Expected weekly cost with clean teardown**: under $1/run, typically
$0.20–$0.50. First-ever run might spike to $3–$5 as Config does its
initial full-account enumeration.

**If teardown fails**: GuardDuty + KMS + CloudWatch Logs can drift to
$30–60/month cumulative. The $20/month sandbox-account budget alarm is
the safety net (see deployment/sandbox-account.md).

## Local run

```sh
# Mocks-only — no AWS credentials needed.
pnpm --filter @hulumi/baseline test

# Real-AWS integration — opt-in. Requires:
#   - HULUMI_INTEGRATION=1 to flip it.skip → it
#   - PULUMI_ACCESS_TOKEN for state backend
#   - AWS credentials (SSO into the sandbox account or aws-vault)
HULUMI_INTEGRATION=1 \
PULUMI_BACKEND_URL=https://api.pulumi.com \
PULUMI_ACCESS_TOKEN=pul-... \
AWS_REGION=us-east-1 \
pnpm --filter @hulumi/baseline test -- tests/integration/
```

## Eventual-consistency contract

AWS service enablement is asynchronous. AccountFoundation orders its
sub-resources via Pulumi `dependsOn`:

- `aws.securityhub.Account` depends on `aws.guardduty.Detector` + every
  `aws.guardduty.DetectorFeature`.
- `aws.securityhub.StandardsSubscription` depends on the Hub.
- `aws.cfg.DeliveryChannel` depends on the Recorder.

The original M3 design used a `pulumi.dynamic.Resource` polling probe
that waited for `aws.guardduty.getDetector().status === "ENABLED"` up to
10 minutes. That approach conflicts with vitest's worker pool — Pulumi's
closure-serialization step requires Node's `trace_events` module which
isn't available in the test workers. Direct `dependsOn` provides
equivalent ordering for the real-AWS path because AWS's
`CreateDetector` call resolves only after the detector is `ENABLED`.

The escape hatch (`packages/baseline/src/aws/probes/poll.ts`) is kept
for v1.1+ probe additions where a separate dependsOn isn't sufficient.
The `no-sleep-in-source` AST test asserts every use of `setTimeout` /
`sleep` / `await new Promise` lives inside `probes/`.

## What an "integration green" looks like

Per the M3 contract, a green weekly integration run means:

- `pulumi up` on `examples/account-foundation-smoke/` for the matrix
  tier completes within 15 minutes.
- Each of the 6 sub-resources (CloudTrail trail, Config recorder,
  GuardDuty detector, Security Hub hub, IAM password policy, KMS keys)
  is `ACTIVE` / `ENABLED` per the AWS API.
- Tags `hulumi:component=AccountFoundation`, `hulumi:tier=<tier>`, and
  `hulumi:controls=<csv>` appear on every taggable child.
- `pulumi destroy` cleans up; post-run `aws s3 ls`, `aws kms
list-keys`, `aws guardduty list-detectors` all return empty for the
  test stack name prefix.
- Total run cost (per Cost Explorer query 24h after run) ≤ $5.

## Failure modes + diagnostics

| Symptom                                 | Likely cause                                              | Fix                                                                                                |
| --------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| OIDC `AssumeRoleWithWebIdentity` denied | Trust-policy `sub` filter mismatch                        | Confirm `repo:kerberosmansour/hulumi:ref:refs/heads/main` and that the workflow ran on `main`      |
| Security Hub subscription fails         | GuardDuty Detector still in CREATING state                | The `dependsOn` chain handles this — re-run; if it persists, AWS region anomaly                    |
| `pulumi destroy` leaves orphans         | Race between Config recorder and DeliveryChannel teardown | Re-run `pulumi destroy` manually; M5 will add an orphan-resource sweeper                           |
| Integration job times out at 30 min     | `pulumi up` exceeded 15-min eventual-consistency window   | Check stack export artifact uploaded on failure; investigate which sub-resource didn't reach READY |

## Out of scope

- **Multi-region runs**: M3 ships single-region per matrix tier. Multi-region testing arrives with M5's SLSA release.
- **`AccountFoundation` running across an AWS Organization**: `orgAccountIds` arg wires the Config aggregator + KMS deny-without-tag policy, but Hulumi v1 does not deploy across multiple accounts in one `pulumi up`. M5's SCP template documents the Org-wide story.
- **Drift detection**: M4 ships `@hulumi/drift`; the weekly integration does not classify drift in M3.
