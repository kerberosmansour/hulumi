# Lessons Learned — hulumi-k8s-security Milestone 1

## What changed

- `@hulumi/k8s-baseline` is now publish-ready: `private:true` removed; `publishConfig.provenance:true` retained.
- Release workflow promoted from three-package atomic publish to four-package atomic publish (`baseline` / `policies` / `drift` / `k8s-baseline`); CycloneDX SBOM and SLSA Build L3 attestation paths cover all four.
- `packages/k8s-baseline/COMPATIBILITY.md` synced with the runtime `TESTED_VERSIONS` typed const (Istio `istiod` / `cni` / `gateway` at `1.24.2`); a BDD invariant in `packages/k8s-baseline/tests/release-readiness.test.ts` keeps them in lockstep going forward.
- Kind / EKS integration test skeletons exist at `packages/k8s-baseline/tests/integration/{kind,eks}/release-readiness.{kind,eks}.test.ts` with safe-by-default gating: skip with explicit precondition messages when their flags (`HULUMI_INTEGRATION_KIND` / `HULUMI_INTEGRATION_EKS`) are unset; fail visibly when the flag is set but the prerequisite (kind binary or `HULUMI_EKS_SANDBOX_CLUSTER`) is missing.
- `ci.yml` runs the new `k8s-baseline-test` job (unit + integration-lane contract) on every PR; `weekly-integration.yml` runs the same lanes weekly so the contract test never silently rots.
- README, `CHANGELOG.md`, `docs/ARCHITECTURE.md`, `docs/README.md`, and `docs/components/README.md` all describe the K8s package surface alongside AWS and GitHub.

## Design decisions and why

- **New top-level test file (`packages/k8s-baseline/tests/release-readiness.test.ts`) outside the runbook's stated `New files allowed` set** — needed because three of the five BDD scenarios are static-shape assertions (release.yml package set, package.json publishability, COMPATIBILITY.md ↔ TESTED_VERSIONS lockstep) and the existing `vitest.config.ts` excludes `tests/integration/**` from the default `pnpm test` run. Putting them under `tests/integration/kind/` would have meant they never run on the regular suite — defeating their purpose as continuous BDD invariants. Captured here as an allow-list deviation with rationale rather than a silent widening.
- **New `packages/k8s-baseline/vitest.integration.config.ts`** — required because vitest 1.6 has no `--include` / `--exclude` CLI flags, and the default `vitest.config.ts` excludes `tests/integration/**`. The mechanical fix is a sibling config that flips the include/exclude. The default config is intentionally untouched; only `package.json` scripts (which are on the allow-list) wire up `--config vitest.integration.config.ts` for the new lanes.
- **Kind/EKS lanes always run in CI even without their flags** — the gated tests skip cleanly with explicit precondition messages, so running them on every PR proves the gating shape stays intact. When a future milestone (M2 / M4 / M5 / M6) flips the integration flag in CI, the same shape exercises real clusters without further wiring.
- **Did NOT bump K8s package version off `1.0.0-pre.1`** — runbook §6.7 forbids bundling release work into M1. The four-package atomic release path is now ready; the actual version bump and tag belong to a separate launch PR (foreshadowed in `docs/slo/lessons/hulumi-k8s-m5.md`).
- **Did NOT touch `packages/k8s-baseline/src/*` or `packages/k8s-baseline/tests/*` (existing)** — runbook explicitly says M1 is release plumbing and evidence, not behavior change.

## Assumptions verified

- `pnpm -w run lint:license-boundary` and `pnpm -w run lint:exact-pin-guard` both pass after my changes (the M5 K8s lessons file flagged this as a foot-gun: root-only scripts must use `-w`, not `-r`). Confirmed with the actual commands.
- Pre-existing format warnings (85 files) are out of M1's scope; I introduced one new warning in `docs/components/README.md` and fixed it. No other format regressions.
- All 271 baseline + 59 policies + 54 drift + 87 k8s-baseline + 28 skill-bdd + 4 example smoke tests pass.

## Assumptions still unresolved

- **Real kind cluster boot wiring is deferred to M2 / M4** — the M1 contract test only proves the gating shape works, not that kind actually spins up a cluster. M2 ALB/secret kind tests will be the first to need a live API server.
- **`HULUMI_INTEGRATION_KIND=1` / `HULUMI_INTEGRATION_EKS=1` are not set in any CI workflow yet** — the contract test runs always; real-cluster runs are gated on operator opt-in via `workflow_dispatch` until someone wires up secrets in a future milestone.

## Mistakes made

- Initial draft of the BDD test was placed under `tests/integration/kind/` per the runbook's stated path, but I caught the vitest exclude and moved it to a top-level test file before running. Documented above as the allow-list deviation rationale.
- First commit of the kind/EKS gated tests had `// eslint-disable-next-line no-console` comments that were unused (the package's eslint config does not flag console.log in tests). Removed before final lint pass.

## Root causes

- The runbook's "New files allowed" list under M1's contract block did not anticipate the vitest exclude pattern. The mechanical workaround (sibling config + top-level test file) is small but had to be captured as a deviation.
- The K8s M5 lessons file is the source of truth on the `pnpm -w` vs `-r` foot-gun for root scripts. Reading it first saved a wasted iteration.

## What was harder than expected

- Confirming the format-check baseline was already red required a `git stash` round trip; the runbook's pre-flight protocol does not list `format:check`, only the post-flight does. Worth surfacing in M2's pre-flight: run format:check before changes so any new warnings are clearly attributable.

## Invariants/assertions added or strengthened

- **Release workflow names exactly four packages** in its pack loop: `baseline`, `policies`, `drift`, `k8s-baseline`. Asserted at runtime by `release-readiness.test.ts > Release packs four packages`.
- **K8s-baseline `publishConfig.provenance` stays `true`** and `private` is absent or false. Asserted at runtime.
- **`COMPATIBILITY.md` lists every chart name and version present in `TESTED_VERSIONS`.** This is the new lockstep guard.
- **Kind/EKS lanes either skip with explicit messages or fail visibly** — never silently pass while doing nothing.

## Resource bounds established or verified

- Release artifact list is bounded to exactly four packages by the test invariant; the SBOM / publish loop runs four times with named packages, not a glob.
- Kind/EKS test suites are bounded to one test file each at this milestone; per-component kind tests will land at their own milestones (M2, M4, M5, M6).

## Debugging / inspection notes

- Inspected `vitest.config.ts` directly to discover the `tests/integration/**` exclude — tests were silently skipped before that read. State inspection over guessing.
- Inspected the actual `release.yml` pack loop to confirm the three-package iteration (`for pkg in baseline policies drift`) before extending it.

## Naming conventions established

- Integration test gate flags: `HULUMI_INTEGRATION_KIND` (kind) and `HULUMI_INTEGRATION_EKS` (EKS). Sandbox cluster name lives in `HULUMI_EKS_SANDBOX_CLUSTER`. M5/M6 should reuse these names.
- New scripts on `packages/k8s-baseline/package.json`: `test:integration:kind` and `test:integration:eks`. Both shell out to the sibling integration config.
- Sibling config file convention: `vitest.integration.config.ts` next to `vitest.config.ts`.

## Test patterns that worked well

- BDD scenarios as static-shape assertions on YAML / JSON / Markdown strings. Cheap, fast, catches release plumbing rot.
- Integration-lane gating: explicit `console.log` skip messages + `expect(...).toBe(false)` so a flag-off run proves the test ran and chose to skip; a flag-on-but-prereq-missing run throws so CI doesn't claim coverage it doesn't have.

## Missing tests that should exist now

- A test that asserts `package.json:files` of `@hulumi/k8s-baseline` includes `dist/` and `scripts/` (currently true, not asserted). Worth adding when scripts/ contents change in a future milestone.
- A test that asserts the `ci.yml` `k8s-baseline-test` job exists. Right now the BDD tests cover release.yml shape but not ci.yml shape.

## Rules for the next milestone

1. **Pre-flight should run `pnpm -w run format:check` before any changes** to capture the dirty-baseline warning count. Any new warnings introduced by the milestone's edits must then be fixed.
2. **Allow-list deviations must be captured in both the lessons file AND the Evidence Log row notes.** A deviation that is documented but not surfaced in the milestone's evidence is invisible at retro time.
3. **`pnpm -w run <root-script>` for any root-only script** (license-boundary, exact-pin-guard, format:check, format). Never use `-r --stream` for these — pnpm's helpful error message will redirect, but the wasted iteration is avoidable.
4. **K8s primitive behavior changes (M2's actual goal) should land alongside their kind tests** — but those kind tests should follow the M1 gating shape (`HULUMI_INTEGRATION_KIND=1` opt-in) so they don't break CI on machines without a kind binary.
