# Lessons Learned — hulumi-k8s-security Milestone 5

## What changed

Two new components in `@hulumi/k8s-baseline`:

- **`EksRuntimeDetectionFoundation`** — GuardDuty `EKS_AUDIT_LOGS` + `EKS_RUNTIME_MONITORING` features, plus CloudWatch metric filter + alarm pairs for secret-read (`get`/`list`/`watch` on `secrets`) and `pods/exec` audit events. Routes alarm actions to a consumer SNS topic.
- **`EksBackupFoundation`** — AWS Backup vault (KMS-encrypted), plan with bounded lifecycle rules, selection of resource ARNs, and an opt-in immutable vault lock with an operator-confirmation output flag.

Bounds: 32 alarm rules; 8 backup lifecycle rules; 32 backup selections.

## Design decisions and why

- **Fargate runtime-monitoring caveat as a typed output (`runtimeMonitoringUnsupported: Output<boolean>`)** — operators reading the stack outputs see the limitation explicitly. Plus a `pulumi.log.warn` when the consumer set `enableRuntimeMonitoring: true` on a fargate-only cluster.
- **KMS key ARN is a required arg** — explicitly NO default to AWS-managed keys. Forces the consumer to make the at-rest-encryption choice. Mirrors M2's `KubernetesSecretFromAwsSecretsManager` pattern.
- **Vault lock not auto-finalized** — AWS Backup's vault lock is irreversible. The component emits `aws.backup.VaultLockConfiguration` with the standard 3-day `changeableForDays` window and exposes `immutableVaultLockManualStepRequired: Output<true>`. Production runbook should treat that flag as a "confirm before the 72h window closes" prompt.
- **Cold-storage gate** — AWS Backup requires `coldStorageAfter ≤ retentionDays - 90`. The component validates this at construction so consumers don't get a deploy-time error from AWS.
- **Metric filter pattern uses CloudWatch Logs filter syntax** (e.g. `{ ($.objectRef.resource = "secrets") && ... }`). Tested against the documented audit-log JSON shape; not against a live cluster.

## Mistakes made / typecheck friction

- Test `rules` array literal needed an explicit type annotation (`Array<{...}>`) — TypeScript's `noImplicitAny` flagged the empty `const rules = []`.
- `EksBackupFoundation` initially exposed the `annotations` map only via `registerOutputs` — but `registerOutputs` doesn't surface them as Pulumi outputs, only as metadata. Exposed `immutableVaultLockManualStepRequired` as a typed output instead.

## Invariants/assertions added

- `retentionDays > 0` per rule.
- `coldStorageAfterDays ≤ retentionDays - 90`.
- `enableImmutableVaultLock` requires `vaultLockMinRetentionDays > 0`.
- `rules.length ≤ 8`, `resourceArns.length ≤ 32`.
- `clusterCompute === "fargate-only"` skips runtime monitoring AND emits `runtimeMonitoringUnsupported: true`.

## Resource bounds

- `MAX_RUNTIME_ALARM_RULES = 32`.
- `MAX_BACKUP_LIFECYCLE_RULES = 8`.
- `MAX_BACKUP_SELECTIONS = 32`.

## Test patterns

- Reused mock-runtime helpers from `tests/setup.ts`.
- Helpers per resource type: `detectorFeatures()`, `alarms()`, `metricFilters()`, `vaults()`, `plans()`, `selections()`, `vaultLocks()`.

## Carry-forward to M6

- The `clusterCompute: "ec2-managed" | "fargate-only" | "mixed"` discriminated union shape generalizes to the M6 EKS support-status union (`standard | extended | unsupported | unknown`).
- The CloudWatch metric-filter pattern (`{ ($.objectRef.resource = "...") }`) can be extended for additional audit-derived alarms — but each new alarm bumps the runtime-alarm count toward the 32 cap.
- AWS Backup's vault-lock workflow is a prototype for any other "irreversible action with operator-confirmation gate" (e.g. M11's release publish — already gated by the four-package atomic step).
