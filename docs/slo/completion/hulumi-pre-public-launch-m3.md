# Completion Summary — hulumi-pre-public-launch Milestone 3

## Goal completed

The audit's "stubbed integration tests masquerading as coverage" finding is closed. Two of the four stub categories have real implementations (#26 cooling-off-diff, #30 SCP teardown); the other two (#21 + #24) have explicit `it.todo` slots backed by a roadmap doc that contracts the follow-up runbook.

## Files changed

- `tests/skill-bdd/cooling-off-diff.test.ts` — NEW (5 test cases, network-gated for 2 of them).
- `tests/skill-bdd/fixtures/cooling-off-diff/{baseline,aged-pulumi-bump,nonexistent-version,no-pulumi-packages}.lock.yaml` — NEW (4 fixtures).
- `tests/skill-bdd/scp-teardown-harness.ts` — NEW (pure-function 5-state phase machine, hard-capped poll budget, IllegalTransitionError).
- `tests/skill-bdd/scp-teardown.test.ts` — NEW (9 test cases).
- `packages/baseline/tests/integration/account-foundation.integration.test.ts` — 3 tautological `it()` bodies → `it.todo()` with roadmap pointers.
- `packages/drift/tests/integration/drift-classify.integration.test.ts` — 4 tautological `it()` bodies → `it.todo()` with roadmap pointers.
- `docs/integration-testing-roadmap.md` — NEW (acceptance contract for `hulumi-integration-real-aws` follow-up runbook).
- `.prettierignore` — added `tests/skill-bdd/fixtures/cooling-off-diff/`.
- `CHANGELOG.md` — entry under [1.2.0] "Changed".

## Tests added

- 5 cooling-off-diff scenarios (3 always-on + 2 network-gated)
- 9 SCP teardown scenarios (happy / no-op / detach-fail / poll-exhaust / hard-cap-reject + 4 illegal-transition assertions)
- 7 `it.todo` slots (3 account-foundation + 4 drift-classify)

## Runtime validations added

- The SCP teardown phase machine encodes the manual-procedure invariants as executable assertions — refactors that break the documented sequence will fail the test, even without `requires-aws-org-write` AWS permissions.
- The cooling-off-diff fixture-replay catches regressions in the script's exit-code semantics (0 on no-bump, 0 on aged bump, 2 on registry failure, 2 on usage error).

## Static analysis and formatter evidence

- `pnpm -r typecheck` — clean
- `pnpm -r build` — clean
- `pnpm -r lint` — clean
- `pnpm run lint:license-boundary` — `OK`
- `pnpm run lint:exact-pin-guard` — `OK`
- `pnpm run format:check` — clean
- `pnpm -r test` — all green:
  - drift 58 tests passed
  - policies 106 tests passed
  - skill-bdd 43 passed | 2 skipped (network-gated)
  - baseline 99 passed | 5 skipped | 3 todo
  - k8s-baseline 167 tests passed
  - 4 example smoke tests passed
- `HULUMI_NETWORK_TESTS=1 pnpm --filter @hulumi/tests-skill-bdd test` — 45/45 (cooling-off-diff network tests pass against real npm)

## Compatibility checks performed

- M1's release-readiness.test.ts — green (atomic version + per-package shape unchanged).
- M2's workflow-action-pinning.test.ts — green (no workflow YAML touched).
- `cooling-off-diff.mjs` CLI surface unchanged.
- `HULUMI_INTEGRATION=1` skip-gate preserved (the always-on `it()` in each integration file documents the gate-invariant).
- No production source under `packages/*/src/` modified.
- No new runtime dependency added.
- `docs/deployment/scp-guide.md` and `scp.json` unchanged.

## Invariants/assertions added

- 5-state SCP teardown phase machine with 4 legal transitions from Idle, 2 each from AttachedDetectable / DetachInFlight; Detached + Failed terminal. Illegal transitions throw with diagnostic.
- SCP teardown poll budget: default 10, hard cap 12 (runtime check).
- cooling-off-diff exit-code invariants encoded as test expectations.
- Network gate `HULUMI_NETWORK_TESTS=1` for any test that touches npm.

## Resource bounds added or verified

- SCP teardown poll budget: 10 (default) / 12 (hard cap).
- Cooling-off-diff fixture set: 4 fixtures (well under the soft cap of 50 declared in the M3 contract).

## Documentation updated

- `docs/integration-testing-roadmap.md` — NEW (acceptance contract for follow-up runbook).
- `CHANGELOG.md` — M3 entry.
- `.prettierignore` — fixtures-dir entry.

## .gitignore changes

None in M3 (M1's `.gitignore` updates remain in force; new test artifacts use `tempfile`-style paths in vitest defaults, which `.gitignore` already handles via `.tmp/` patterns).

## Test artifact cleanup verified

`git status` after the full test run shows only the M3 file changes. No untracked test artifacts.

## Deferred follow-ups

- **`cooling-off-diff.mjs` silently passes on malformed lockfiles** — fail-open vulnerability. Documented in M3 lessons; should land as a script-level fix in M4 or as a follow-up issue.
- **`cooling-off-diff.mjs` silently passes on version downgrades** — same class of fail-open behavior. Documented.
- **Real-AWS implementation of #21 + #24 integration tests** — captured in `docs/integration-testing-roadmap.md`; future runbook `hulumi-integration-real-aws`.
- **`HULUMI_NETWORK_TESTS=1` is not run in CI today** — opt-in only. A future workflow change could run it weekly to catch upstream npm registry changes.

## Known non-blocking limitations

- The drift integration test file's `it.todo` slots are excluded from default `pnpm test` (existing `vitest.config.ts` convention). They appear in `HULUMI_INTEGRATION=1 pnpm test:integration`.
- The cooling-off-diff fixture-replay tests are subprocess-based, not unit tests of the script's internals. The script's `extractVersions` / `classifyBump` / `fetchPublishTime` are not exported; a future refactor that exposes them would enable tighter unit coverage.
