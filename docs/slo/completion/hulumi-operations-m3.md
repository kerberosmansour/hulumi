# Completion Summary — hulumi-operations Milestone 3 (combined M9)

## Goal completed

`AuditTrail` exists. Multi-region CloudTrail, log-file validation always on, KMS-encrypted CW Logs (default 365-day retention), and a CT-to-CWL IAM role. The `cloudWatchLogsGroupName` output wires directly into `IdentityAlarms.trailLogGroupName`. The existing `IdentityAlarms` already covers the canonical 6 events the runbook anticipated.

## Files changed

### Added (source)

- `packages/baseline/src/aws/audit-trail.{args,outputs,ts}.ts`.

### Added (tests)

- `packages/baseline/tests/audit-trail.test.ts` — 5 BDD scenarios.

### Added (docs)

- `docs/components/audit-trail.md`.
- `docs/slo/lessons/hulumi-operations-m3.md`, `docs/slo/completion/hulumi-operations-m3.md`.

### Modified

- `packages/baseline/src/aws/index.ts` — re-exports.

## Tests added

5 BDD scenarios:

- Multi-region trail with log-file validation, KMS-encrypted CW Logs.
- CW Logs retention configurable.
- Missing `kmsKeyArn` rejected.
- Missing `archiveBucketName` rejected.
- Non-positive retention rejected.

## Static analysis evidence

| Check               | Result                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| `pnpm -r typecheck` | green                                                                                                     |
| `pnpm -r build`     | green                                                                                                     |
| `pnpm -r lint`      | green                                                                                                     |
| Full tests          | **86** baseline (was 81; +5) / 96 policies / 58 drift / 149 k8s-baseline / 28 skill-bdd / 4 example smoke |

## Compatibility

- All existing baseline components unchanged (incl. `IdentityAlarms` — its `trailLogGroupName` arg accepts `AuditTrail.cloudWatchLogsGroupName` directly).

## Invariants

- Multi-region: always on.
- Log-file validation: always on.
- `kmsKeyArn` required.

## Documentation updated

- `docs/components/audit-trail.md` (new).

## Deferred follow-ups

- Real-AWS sandbox integration test.
- Threat-model scenario (M11).
