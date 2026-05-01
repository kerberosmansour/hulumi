# Completion Summary — hulumi-k8s-security Milestone 1

## Goal completed

`@hulumi/k8s-baseline` is publish-ready as the fourth package in the atomic SLSA Build L3 release path. Docs (README, ARCHITECTURE, docs index, components index, CHANGELOG, COMPATIBILITY) accurately describe the K8s surface. A safely-gated kind/EKS integration test skeleton exists and runs on every PR to keep the gating shape honest.

## Files changed

### Modified
- `README.md` — adds K8s package row to "What's in the box" and install snippet.
- `CHANGELOG.md` — `[Unreleased]` section captures M1 deliverables.
- `docs/ARCHITECTURE.md` — overview, workspace tree, components table reflect K8s.
- `docs/README.md` — Reference section + runbook list call out K8s baseline.
- `docs/components/README.md` — separate AWS / K8s tables; lists all 7 K8s components.
- `packages/k8s-baseline/package.json` — drops `private:true`; adds `test:integration:eks` script.
- `packages/k8s-baseline/COMPATIBILITY.md` — Istio `istiod` / `cni` / `gateway` at `1.24.2` rows; lockstep note.
- `.github/workflows/release.yml` — four-package pack loop, four SBOMs, four `pnpm publish` lines.
- `.github/workflows/ci.yml` — new `k8s-baseline-test` job; attestation-dry-run pack loop now four packages.
- `.github/workflows/weekly-integration.yml` — k8s-baseline integration lanes always run (contract-only by default).
- `docs/RUNBOOK-hulumi-operations-k8s-security.md` — Milestone Tracker M1 → `in_progress` (will flip to `done` on close).

### Added
- `packages/k8s-baseline/tests/release-readiness.test.ts` — 4 BDD scenarios (static-shape invariants).
- `packages/k8s-baseline/tests/integration/kind/release-readiness.kind.test.ts` — kind-gated contract test.
- `packages/k8s-baseline/tests/integration/eks/release-readiness.eks.test.ts` — EKS-gated contract test.
- `packages/k8s-baseline/vitest.integration.config.ts` — sibling config so integration lanes can run.
- `docs/lessons/hulumi-k8s-security-m1.md` — lessons file (this milestone).
- `docs/completion/hulumi-k8s-security-m1.md` — this file.

## Tests added

- `tests/release-readiness.test.ts` — 4 tests across 3 scenarios:
  - Release workflow pack loop names baseline + policies + drift + k8s-baseline.
  - Release workflow generates a CycloneDX SBOM for k8s-baseline.
  - K8s package metadata is publish-ready (`private` absent, `provenance:true`, `access:public`).
  - `COMPATIBILITY.md` lists every chart and version in `TESTED_VERSIONS`.

## Runtime validations added

- `tests/integration/kind/release-readiness.kind.test.ts` — `kind_cluster_contract_or_skip`.
- `tests/integration/eks/release-readiness.eks.test.ts` — `eks_contract_or_skip`.

## Static analysis and formatter evidence

| Check | Command | Result |
|---|---|---|
| Format (touched files) | `npx prettier --check <files>` | clean |
| Typecheck | `pnpm -r typecheck` | green across 10 projects |
| Build | `pnpm -r build` | green |
| Lint | `pnpm -r lint` | green (3 warnings I introduced were fixed before final pass) |
| License boundary | `pnpm -w run lint:license-boundary` | OK |
| Exact-pin guard | `pnpm -w run lint:exact-pin-guard` | OK (6 `@pulumi/*` deps match pinned hashes) |

## Compatibility checks performed

- Existing AWS package release behavior preserved — `pnpm pack` still runs for `baseline` first; the additional iteration is appended.
- Existing GitHub package release behavior preserved — same `@hulumi/baseline` tarball ships unchanged.
- Existing K8s public exports unchanged — `packages/k8s-baseline/src/*` was not touched.
- Existing docs links remain valid — only added rows / sections; did not rename or delete.
- Full pre-existing test suite still green: 67 baseline / 59 policies / 54 drift / 87 k8s-baseline (was 83) / 28 skill-bdd / 4 example smoke.

## Invariants/assertions added

- Release workflow names exactly four packages (asserted at test time).
- K8s-baseline package metadata is publishable (`private:true` removed; `provenance:true` retained).
- `COMPATIBILITY.md` ↔ `TESTED_VERSIONS` lockstep enforced by BDD invariant.
- Integration lanes either skip with explicit precondition messages or fail visibly — never silently pass.

## Resource bounds added or verified

- Release artifact list bounded to exactly four packages.
- Each integration lane has one test file at M1; future milestones append per-component test files.

## Documentation updated

- `README.md` § "What's in the box" + install snippet.
- `CHANGELOG.md` § `[Unreleased]`.
- `docs/ARCHITECTURE.md` § Overview + Workspace Structure + Key Components table.
- `docs/README.md` § Reference + new Runbooks list.
- `docs/components/README.md` — split into AWS + K8s tables; lists all 7 K8s components.
- `packages/k8s-baseline/COMPATIBILITY.md` — synced with TESTED_VERSIONS.

## .gitignore changes

- None required.

## Test artifact cleanup verified

- `git status --short` shows only intentional file changes (modified or added). No `.pulumi/` checkpoints, kind kubeconfigs, helm caches, generated tarballs, or scratch outputs.

## Deferred follow-ups

- **K8s package version bump** to `1.0.0` and the v1.2 train tag — belongs in a separate launch PR (per K8s M5 lessons file carry-forward).
- **Real kind cluster boot in CI** — first per-component kind test (M2 ALB/secret) will need a kind binary in CI; today's contract test only validates the gating shape.
- **EKS sandbox secrets / OIDC role** — wired in when M5's detection + backup components need a live cluster.
- **Three carry-forward cookbooks** (release-rename, mesh-bootstrap, github-app-private-deps) and **two carry-forward examples** — flagged in K8s M5 lessons; not in M1's scope.

## Known non-blocking limitations

- 85 pre-existing format warnings persist across the repo. Out of M1's scope per runbook §6.7 ("Fixing warnings in files that were working before you got there — out of scope"). A separate format-sweep PR is the right vehicle.
- M1's BDD invariant on `COMPATIBILITY.md` is a string-match, not a structural parse. If a future chart name accidentally appears in a code-block elsewhere in the doc, the assertion would falsely pass. Acceptable risk for a doc-sync invariant.
