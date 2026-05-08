# Integration testing — Hulumi M3 weekly workflow

Hulumi's per-PR test suite runs entirely on Pulumi mocks. Real-AWS
integration is reserved for the dedicated weekly/manual workflow, not
PRs, and runs in a sandbox AWS account via GitHub Actions OIDC. This
document spells out the workflow, the auth path, the cost contract, and
the open-source threat model.

## Workflow

[`.github/workflows/weekly-integration.yml`](../.github/workflows/weekly-integration.yml)

- **Trigger**: cron `0 4 * * 0` (Sundays 04:00 UTC) + `workflow_dispatch`
  for ad-hoc runs.
- **Matrix**: `tier ∈ {sandbox, startup-hardened}` — serialized with
  `max-parallel: 1` because AccountFoundation touches account-wide AWS
  services.
- **Job timeout**: 30 minutes total (15-min Pulumi up + 10 min destroy +
  5 min slop, per the M3 contract's eventual-consistency window).
- **Auth**: OIDC `AssumeRoleWithWebIdentity` against
  `AWS_SANDBOX_OIDC_ROLE_ARN`. No long-lived AWS credentials.
- **State backend**: prefer a self-managed S3 backend via the
  `PULUMI_BACKEND_URL` repository secret. Pulumi Cloud via
  `PULUMI_ACCESS_TOKEN` remains supported for maintainers who opt in,
  but the workflow refuses to run with both configured. When neither is
  set, the workflow runs **CONTRACT-ONLY mode** (mock unit + integration
  tests, no actual `pulumi up`).

## Required repo configuration

| Type     | Name                        | Source                                              | Required?               |
| -------- | --------------------------- | --------------------------------------------------- | ----------------------- |
| Secret   | `AWS_SANDBOX_ACCOUNT_ID`    | account ID of the sandbox AWS account               | yes                     |
| Secret   | `AWS_SANDBOX_OIDC_ROLE_ARN` | ARN of the IaC role with `hulumi:iac-role=true` tag | yes                     |
| Variable | `AWS_SANDBOX_REGION`        | AWS region (default `us-east-1`)                    | yes                     |
| Secret   | `PULUMI_BACKEND_URL`        | private S3 backend URL                              | preferred real-AWS path |
| Secret   | `PULUMI_ACCESS_TOKEN`       | Pulumi Cloud personal access token                  | optional alternative    |

The first three are set during sandbox bootstrap (see
[deployment/sandbox-account.md](deployment/sandbox-account.md)).
`PULUMI_BACKEND_URL` should point at a private, versioned,
SSE-encrypted S3 bucket in the same sandbox account. The workflow
creates or hardens that bucket idempotently, blocks public access, and
refuses non-S3 backends in CI.

The S3 backend bucket is deliberately out-of-band from the Pulumi stacks
under test. Routine `pulumi destroy` calls delete resources recorded in
the stack being destroyed; they do not delete the backend bucket or its
versioned state objects unless a Pulumi program explicitly manages that
bucket as a resource. The weekly workflow may create or harden the
backend bucket, but it never deletes it.

## Open-Source Threat Model

The repository is public, so CI must assume hostile pull requests and
curious readers:

- Real AWS credentials are OIDC-only. No static AWS keys, Pulumi Cloud
  tokens, passphrases, kubeconfigs, app private keys, sandbox account
  IDs, role ARNs, or backend bucket URLs are committed or stored as
  public Actions variables.
- The OIDC trust policy is branch-scoped to
  `repo:kerberosmansour/hulumi:ref:refs/heads/main`; forked PRs and
  feature branches cannot assume the sandbox role.
- The Pulumi state backend is not public. S3 state must use Block Public
  Access, versioning, and server-side encryption. The workflow refuses
  `file://` or ambient local state in CI.
- The sandbox account is isolated from production and shared workloads.
  Use the constrained role policy in
  [weekly-integration-iam-policy.json](deployment/weekly-integration-iam-policy.json)
  instead of attaching account-wide administrator access.
- The integration path does not create internet-facing compute, load
  balancers, public security groups, public repositories, or public S3
  buckets. AccountFoundation exercises account-level controls only:
  CloudTrail, Config, GuardDuty, Security Hub, IAM password policy, KMS,
  and private log/state buckets.
- Logs must not print secrets, sandbox account IDs, backend bucket URLs,
  or full state exports. Failure artifacts are limited to Pulumi working
  metadata and should be deleted once the failure is understood.

## Failed-run cleanup

If a real-AWS run fails during teardown, use the maintainer-only
[`e2e-cleanup`](../.github/workflows/e2e-cleanup.yml) workflow instead
of ad hoc console deletion. Pass the 10-character suffix from the failed
stack name (`sandbox-<suffix>`). The cleanup script selects that Pulumi
stack from the private backend, drains only S3 buckets whose physical
name starts with `af-e2e-<suffix>-`, then runs `pulumi destroy` and
`removeStack`.

The cleanup path is intentionally Pulumi-state driven. `@hulumi/drift`
is useful for classifying drift, but it is not a deletion engine and its
real-AWS cleanup scenarios are still roadmap work; the cleanup workflow
builds the drift package only as a dependency check and keeps the actual
destructive action scoped to Pulumi-owned e2e state.

The first reconciler-backed S3 proof lives in
`packages/drift/tests/integration/reconciler-s3.integration.test.ts`.
It is double-gated by `HULUMI_INTEGRATION=1` and
`HULUMI_RECONCILER_AWS_INTEGRATION=1`; without both flags it only emits
a visible skip notice. When enabled in the sandbox account, it creates
one scoped versioned S3 bucket, proves plan mode is non-mutating,
executes the S3 sweeper, and verifies no in-scope bucket remains. The
test intentionally uses the AWS SDK directly for this first proof; the
workflow and Pulumi-stack fixture follow in #97 / later integration
work.

The maintainer workflow
[`drift-reconciler-cleanup`](../.github/workflows/drift-reconciler-cleanup.yml)
keeps plan and execute permissions separate. Plan mode assumes
`AWS_RECONCILER_PLAN_ROLE_ARN`, writes only a redacted plan-intent
artifact, and does not set the live execute flag. Execute mode assumes
`AWS_RECONCILER_EXECUTE_ROLE_ARN`, requires the protected
`aws-reconciler-execute` GitHub environment, and runs only the gated S3
proof. Use separate IAM policies:
[reconciler-plan-iam-policy.json](deployment/reconciler-plan-iam-policy.json)
for read-only planning and
[reconciler-s3-execute-iam-policy.json](deployment/reconciler-s3-execute-iam-policy.json)
for the narrow S3 execute proof.

The guarded state-transition model for future broad execute-mode work
lives in [HulumiReconciler.tla](TLAdocs/hulumi/HulumiReconciler.tla) with
the checked invariant summary in
[HulumiReconciler-verified.md](TLAdocs/hulumi/HulumiReconciler-verified.md).
Any broader execute-mode feature must update or link to that model before
it is enabled.

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
#   - HULUMI_INTEGRATION=1 to flip the integration gate
#   - a self-managed S3 Pulumi backend OR Pulumi Cloud token
#   - AWS credentials (SSO into the sandbox account or aws-vault)
HULUMI_INTEGRATION=1 \
PULUMI_BACKEND_URL='s3://hulumi-pulumi-state-<sandbox-account-id>?region=us-east-1' \
AWS_REGION=us-east-1 \
pnpm --filter @hulumi/baseline test -- tests/integration/
```

Current status: the weekly workflow is wired for a real backend and the
AccountFoundation sandbox lane has a real Pulumi Automation API
up/assert/destroy smoke test. The Startup-Hardened AccountFoundation
lane, AWS API polling assertions, failure-injection cleanup test, and
drift real-AWS scenarios remain explicit `it.todo()` / skipped roadmap
work tracked in
[integration-testing-roadmap.md](integration-testing-roadmap.md). That is
intentional: the project must not pretend that a smoke pass is full e2e
coverage.

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

For the currently implemented sandbox smoke lane, a green weekly
integration run means:

- `pulumi up` for `AccountFoundation(tier: "sandbox")` completes via
  Pulumi Automation API using OIDC and the configured backend.
- The stack returns real provider outputs for CloudTrail, Config,
  GuardDuty, Security Hub, and the four KMS keys.
- `pulumi destroy` and `removeStack` run in `afterAll`, and the local
  Pulumi work directory is removed.
- A manual dispatch with `tier=sandbox` only runs the sandbox matrix lane.
- The Startup-Hardened and drift-classify real-AWS lanes remain explicitly
  gated until their account-wide assertions are implemented.

The stronger M3 target still remains on the roadmap: poll AWS APIs until
each sub-resource is `ACTIVE` / `ENABLED`, verify tag propagation on
every taggable child, and run an orphan-resource sweep by stack-name
prefix after teardown.

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
