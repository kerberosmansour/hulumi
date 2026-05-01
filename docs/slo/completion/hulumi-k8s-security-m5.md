# Completion Summary — hulumi-k8s-security Milestone 5

## Goal completed

`EksRuntimeDetectionFoundation` and `EksBackupFoundation` exist and emit the AWS-side detection + DR posture for EKS clusters. GuardDuty EKS Audit Logs + Runtime Monitoring are wired up with the Fargate caveat surfaced as an output. AWS Backup vault is KMS-encrypted (consumer-supplied key, no AWS-managed default) with an opt-in immutable vault lock that flags the manual confirmation step.

## Files changed

### Added (source)
- `packages/k8s-baseline/src/eks-runtime-detection-foundation.{args,outputs,ts}.ts`.
- `packages/k8s-baseline/src/eks-backup-foundation.{args,outputs,ts}.ts`.

### Added (tests)
- `packages/k8s-baseline/tests/eks-runtime-detection-foundation.test.ts` — 6 BDD scenarios.
- `packages/k8s-baseline/tests/eks-backup-foundation.test.ts` — 9 BDD scenarios.

### Added (docs)
- `docs/components/eks-runtime-detection-foundation.md`.
- `docs/components/eks-backup-foundation.md`.
- `docs/lessons/hulumi-k8s-security-m5.md`.
- `docs/completion/hulumi-k8s-security-m5.md`.

### Modified
- `packages/k8s-baseline/src/index.ts` — re-exports both components + types + bounds.
- `docs/components/README.md` — adds two new component rows.

## Tests added

15 BDD scenarios (134 K8s tests total, was 119; +15):

**Runtime detection** (6):
- GuardDuty audit + runtime monitoring enabled by default for `ec2-managed` clusters.
- Fargate-only mode skips runtime monitoring and emits visible warning + output flag.
- Secret-read alarm emitted (filter pattern targets `secrets` + `get/list/watch`).
- Pod-exec alarm emitted (filter pattern targets `pods` + `exec` subresource).
- Alarm SNS targets propagate.
- Invalid `clusterCompute` rejected.

**Backup** (9):
- Vault encrypted via supplied KMS key.
- Vault lock + air-gap explicit emits `VaultLockConfiguration` with the 3-day `changeableForDays` window.
- `retentionDays <= 0` rejected.
- Selections bounded (33 → reject).
- Lifecycle rules bounded (9 → reject).
- `enableImmutableVaultLock` without `vaultLockMinRetentionDays` rejected.
- `coldStorageAfterDays > retentionDays - 90` rejected.
- Empty `rules` rejected.
- Empty `resourceArns` rejected.

## Static analysis evidence

| Check                  | Result |
| ---------------------- | ------ |
| `pnpm -r typecheck`    | green |
| `pnpm -r build`        | green |
| `pnpm -r lint`         | green |
| license-boundary       | OK    |
| exact-pin-guard        | OK    |
| Full tests             | 67 baseline / 96 policies / 54 drift / **134** k8s-baseline (+15) / 28 skill-bdd / 4 example smoke |

## Compatibility checks

- AccountFoundation outputs unchanged.
- Existing K8s components unaffected.
- New components consume `pulumi.Input<string>` for the cluster-side IDs; can be wired to existing AccountFoundation or AccountFoundation-equivalent outputs.
- No real-AWS dependency in unit tests — mock-runtime registrations only.

## Invariants

- `retentionDays > 0` per backup rule.
- `coldStorageAfterDays ≤ retentionDays - 90`.
- `enableImmutableVaultLock` requires `vaultLockMinRetentionDays > 0`.
- `clusterCompute === "fargate-only"` ⇒ runtime monitoring disabled + output flag set.

## Resource bounds

- `MAX_RUNTIME_ALARM_RULES = 32`.
- `MAX_BACKUP_LIFECYCLE_RULES = 8`.
- `MAX_BACKUP_SELECTIONS = 32`.

## Documentation updated

- `docs/components/eks-runtime-detection-foundation.md` (new).
- `docs/components/eks-backup-foundation.md` (new).
- `docs/components/README.md` (two new rows).

## Deferred follow-ups

- **Real-EKS integration test** for `eks-detection-and-backup.eks.test.ts` — the runbook anticipates it; deferred until EKS sandbox is wired into CI.
- **`docs/cookbooks/eks-disaster-recovery.md`** — anticipated by the runbook; out of M5's tight focus, follow-up PR.
- **Alarm-rule expansion** (e.g. for `nodes/proxy`, `pods/portforward`, `escalate` RBAC verbs) — within the 32-rule bound, easy to add as needed.

## Known non-blocking limitations

- The metric-filter patterns target the documented EKS audit-log JSON shape. Drift in the upstream EKS audit shape would require pattern updates.
- `EksBackupFoundation` does NOT validate that the supplied `iamRoleArn` actually has the AWS-managed `AWSBackupServiceRolePolicyForBackup` policy attached. Operators who supply an underprivileged role will see a deploy-time IAM error from AWS Backup.
