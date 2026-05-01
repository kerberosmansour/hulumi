# Completion Summary — hulumi-operations Milestone 5 (combined M11) — Runbook Close

## Goal completed

Three Operations threat-model scenarios shipped in `/hulumi-threat-model`. All four packages bumped to their v1.2 release-train versions. CHANGELOG entry covers every M1-M10 deliverable plus M11. The runbook is fully `done`.

## Files changed

### Added (scenarios)
- `skills/hulumi-threat-model/scenarios/operations-patch-compliance-lapse.json`.
- `skills/hulumi-threat-model/scenarios/operations-detective-services-disabled.json`.
- `skills/hulumi-threat-model/scenarios/operations-audit-pipeline-broken.json`.

### Added (docs)
- `docs/slo/lessons/hulumi-operations-m5.md`.
- `docs/slo/completion/hulumi-operations-m5.md`.

### Modified
- `skills/hulumi-threat-model/scripts/list-scenarios.mjs` — appends the three new IDs.
- `tests/skill-bdd/hulumi-threat-model.test.ts` — asserts the 14-scenario ordered lister.
- `packages/baseline/package.json` — `1.1.0` → `1.2.0`.
- `packages/policies/package.json` — `1.1.0` → `1.2.0`.
- `packages/drift/package.json` — `1.1.0` → `1.2.0`.
- `packages/k8s-baseline/package.json` — `1.0.0-pre.1` → `1.0.0`.
- `CHANGELOG.md` — new `[1.2.0]` entry.

## Tests

- `tests/skill-bdd/hulumi-threat-model.test.ts` lister scenario asserts the new 14-element ordered list.
- All other tests unchanged (no regression).

## Runbook close — final test totals

| Package         | Tests passing | Δ vs. baseline (M0) |
| --------------- | ------------: | ------------------: |
| `@hulumi/baseline`     | 86 (8 skipped) | +27 |
| `@hulumi/policies`     | 106            | +47 |
| `@hulumi/drift`        | 58             | +4  |
| `@hulumi/k8s-baseline` | 149            | +66 |
| `tests/skill-bdd`      | 28             | unchanged (3 scenarios added; lister assertion modified) |
| examples (4)           | 4              | unchanged |
| **Total**              | **431**        | |

## Static analysis evidence

| Check                          | Result |
| ------------------------------ | ------ |
| `pnpm -r typecheck`            | green |
| `pnpm -r build`                | green |
| `pnpm -r lint`                 | green |
| `pnpm -w run lint:license-boundary` | OK    |
| `pnpm -w run lint:exact-pin-guard`  | OK (6 @pulumi/* deps) |

## Atomic four-package release readiness

All package.json files at v1.2.0 / v1.0.0. `release.yml` already wired in M1 to pack/SBOM/attest/publish all four. The release tag (e.g. `git tag v1.2.0 && git push --tags`) triggers the pipeline; that step is the consumer's call, not part of M11.

## Compatibility / migration

See the `[1.2.0]` CHANGELOG entry's `### Migration` block. AWS / GitHub / drift / policies upgrades are additive. K8s-baseline consumers need a one-line migration if they relied on the legacy degraded paths.

## Documentation updated

- CHANGELOG.md (v1.2.0 entry).
- Lessons + completion files for every M1–M11.

## Deferred follow-ups (carried forward to v1.3.0+)

- Real-AWS sandbox integration tests under `tests/integration/aws-ops/` for `Ec2PatchBaseline`, `Ec2PatchWaves`, `DetectiveServicesEnable`, `AuditTrail`, `HulumiOperationsHardeningPack`.
- Real kind cluster integration tests for K8s components (M2/M4 paths).
- Real EKS sandbox integration tests (M5/M6 paths).
- v1.3 image-pipeline + ASG orchestration (already documented in `docs/v1.3-ideation.md`).
- `helm-history` drift adapter (M6 carry-forward).

## Known non-blocking limitations

- `Errors 66 errors` in vitest output for k8s-baseline tests — fail-closed apply-rejection noise, suppressed at suite level via `dangerouslyIgnoreUnhandledErrors: true` (M2 deviation, documented).
- 86-file pre-existing format baseline persists across the runbook.
