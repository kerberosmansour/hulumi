# Completion summary — Hulumi-K8s M1

## Status: `done` (2026-04-26)

## Changed files (new package)

```
packages/k8s-baseline/
├── COMPATIBILITY.md
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── vitest.config.ts
├── src/
│   ├── compatibility.ts
│   ├── eks-subnet-tagger.args.ts
│   ├── eks-subnet-tagger.outputs.ts
│   ├── eks-subnet-tagger.ts
│   ├── hardened-helm-release.args.ts
│   ├── hardened-helm-release.outputs.ts
│   ├── hardened-helm-release.ts
│   └── index.ts
└── tests/
    ├── compatibility.test.ts
    ├── eks-subnet-tagger.test.ts
    ├── hardened-helm-release.test.ts
    └── setup.ts
```

## Modified files

- `scripts/exact-pin-guard.mjs` — added `@pulumi/kubernetes@4.30.0` entry (5 deps now pinned).
- `scripts/cooling-off-diff.mjs` — added `@pulumi/kubernetes` to `PULUMI_PACKAGES`.
- `pnpm-lock.yaml` — `@pulumi/kubernetes@4.30.0` + transitive deps.
- `docs/slo/completed/RUNBOOK-hulumi-k8s.md` — Milestone Tracker M1 → `done`.

## New documentation

- `docs/components/hardened-helm-release.md` (one-line stub).
- `docs/components/eks-subnet-tagger.md` (one-line stub).
- `docs/slo/lessons/hulumi-k8s-m1.md`.
- `docs/slo/completion/hulumi-k8s-m1.md` (this file).

## Tests added

- `packages/k8s-baseline/tests/hardened-helm-release.test.ts` — 15 BDD scenarios covering happy path (5 rows), invalid input refusals (8 rows), warn-not-throw compatibility (1 row), Fargate-affinity injection.
- `packages/k8s-baseline/tests/eks-subnet-tagger.test.ts` — 10 scenarios covering happy paths (6 rows: both lists, private-only, public-only, ownership=owned, tagsApplied output enumeration, component type), invalid input refusals (3 rows), empty-arrays-warn (1 row).
- `packages/k8s-baseline/tests/compatibility.test.ts` — 2 scenarios.

Total: **27 tests passing** in the new package; 0 failures; 0 skipped.

## Repo-wide regression sweep

| Check                            | Result                                                      |
| -------------------------------- | ----------------------------------------------------------- |
| `pnpm -r build`                  | green (4 packages: baseline, drift, k8s-baseline, policies) |
| `pnpm -r test`                   | green (10 workspace projects, 0 failures)                   |
| `pnpm -r typecheck`              | green                                                       |
| `pnpm -r lint`                   | green                                                       |
| `pnpm run lint:license-boundary` | OK                                                          |
| `pnpm run lint:exact-pin-guard`  | OK (5 `@pulumi/*` deps match pinned hashes)                 |

## Issues closed / progressed

- [#38 — EKS subnet auto-tagging](https://github.com/kerberosmansour/hulumi/issues/38) → **closed** by `EksSubnetTagger`.
- [#42 — DaemonSet Fargate-exclusion affinity](https://github.com/kerberosmansour/hulumi/issues/42) → **half-closed** — the `daemonSet: true` arg lands on `HardenedHelmRelease`; M2's `IstioFoundation` consumes it. Auto-detection of cluster Fargate profiles stays out of scope per design record.
- [#44 — Helm release-name suffix default](https://github.com/kerberosmansour/hulumi/issues/44) → **closed** by `HardenedHelmRelease`'s instance-name default.

## Surface added (stable from M1)

- `@hulumi/k8s-baseline.HardenedHelmRelease` + `HardenedHelmReleaseArgs` + `HardenedHelmReleaseOutputs` + `HARDENED_HELM_RELEASE_COMPONENT_TYPE`.
- `@hulumi/k8s-baseline.EksSubnetTagger` + `EksSubnetTaggerArgs` + `EksSubnetTaggerOutputs` + `EKS_SUBNET_TAGGER_COMPONENT_TYPE`.
- `@hulumi/k8s-baseline.assertVersionTested` + `TESTED_VERSIONS` + `TestedChartName`.

## Deferrals

- Kind integration test deferred to M5's release-readiness sweep (rationale in lessons file).
- Kind matrix entry in `.github/workflows/weekly-integration.yml` deferred to M5.
- Component reference docs are one-line stubs; full reference docs land in M5.

## Next milestone

M2 — `IstioFoundation`. The `chartClass: "istio"` enum extension already shipped in M1 (regression-locked test in place); M2 consumes it.
