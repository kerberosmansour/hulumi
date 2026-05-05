# Completion Summary — hulumi-pre-public-launch Milestone 4

## Goal completed

Pin-guard extended to cover `@hulumi/drift`'s runtime deps (5 new entries: 3 `@aws-sdk/*`, `p-timeout`, `simple-git`). Unused `poll.ts` escape hatch removed; ARCHITECTURE.md narrative reconciled. Issue #27 + #28 closed.

## Files changed

- `scripts/exact-pin-guard.mjs` — 5 new ALLOWED entries; `resolveFromLockfile` enhanced to handle quoted + bare lockfile headers; status message updated.
- `packages/baseline/src/aws/probes/poll.ts` — REMOVED.
- `docs/ARCHITECTURE.md` — dropped row 56 (probes/poll.ts row); reconciled line 170 narrative.
- `tests/skill-bdd/exact-pin-guard.test.ts` — NEW (10 BDD scenarios).
- `CHANGELOG.md` — entry under [1.2.0] "Changed".
- `docs/slo/current/RUNBOOK-hulumi-pre-public-launch.md` — M4 milestone tracker entry updated to `done`.
- `docs/slo/lessons/hulumi-pre-public-launch-m4.md` — NEW.
- `docs/slo/completion/hulumi-pre-public-launch-m4.md` — NEW.

## Tests added

10 BDD scenarios in `tests/skill-bdd/exact-pin-guard.test.ts`:

1. Pin-guard subprocess exits 0 against current lockfile.
   2-6. ALLOWED contains each of the 5 new drift runtime deps.
2. `packages/baseline/src/aws/probes/poll.ts` does not exist.
3. ARCHITECTURE.md preserves the gotcha narrative + drops the escape-hatch pointer.
4. Script source contains the integrity-mismatch fail-closed branch.
5. ALLOWED contains no `@hulumi/*` entries.

## Runtime validations added

- `pnpm run lint:exact-pin-guard` — `OK (11 pinned deps match expected integrity hashes)`. The pin-guard now defends drift's runtime deps + the existing @pulumi/_ + the k8s-baseline @aws-sdk/_ against silent dependency substitution.

## Static analysis and formatter evidence

- `pnpm -r typecheck` — clean
- `pnpm -r build` — clean (poll.ts removal had zero callers)
- `pnpm -r lint` — clean
- `pnpm run lint:license-boundary` — `OK`
- `pnpm run lint:exact-pin-guard` — `OK (11 pinned deps match expected integrity hashes)`
- `pnpm run format:check` — clean
- `pnpm -r test` — all green:
  - drift 58, policies 106, skill-bdd 53 passed | 2 skipped (cooling-off network), baseline 99 + 5 skipped + 3 todo, k8s-baseline 167, 4 examples
- Total: 483 tests across the workspace (M3 had 473; M4 added 10 BDD scenarios).

## Compatibility checks performed

- M1's release-readiness.test.ts — green (all 22 tests).
- M2's workflow-action-pinning.test.ts — green (all 3 scenarios).
- M3's cooling-off-diff.test.ts + scp-teardown.test.ts — green.
- `pnpm-lock.yaml` content unchanged (no version bumps).
- `pnpm run lint:exact-pin-guard` exits 0.
- `pnpm -r build` + `pnpm -r typecheck` clean after poll.ts removal.
- No production source modified other than `poll.ts` deletion.
- No new runtime dep.
- No pin-guard CLI flag change.
- ARCHITECTURE.md gotcha narrative preserved.

## Invariants/assertions added

- Pin-guard ALLOWED has at least the 5 new drift runtime deps (BDD).
- `poll.ts` does not exist at the expected path (BDD).
- ARCHITECTURE.md preserves vitest-pool gotcha + drops escape-hatch pointer (positive + negative regex assertions in BDD).
- Pin-guard source contains the integrity-mismatch fail-closed branch (BDD).
- Pin-guard ALLOWED excludes `@hulumi/*` entries (BDD; scope-drift defense).

## Resource bounds added or verified

None new. M4 is mechanical.

## Documentation updated

- `docs/ARCHITECTURE.md` — Component Summary Table (line 56) + Constraints in force at HEAD (line 170).
- `CHANGELOG.md` — M4 entry under [1.2.0] "Changed".

## .gitignore changes

None.

## Test artifact cleanup verified

`git status` after the test run shows only the M4 file changes.

## Deferred follow-ups

- `cooling-off-diff.mjs` malformed-lockfile fail-open (carry-over from M3 lessons).
- `cooling-off-diff.mjs` version-downgrade silent-pass (carry-over from M3 lessons).
- Build-time dep pinning (vitest, typescript, prettier — not in published tarballs but could inject into dist/). Different threat class; not in scope here.
- `@hulumi/k8s-baseline` may grow more runtime deps; future additions should follow the M4 pattern.

## Known non-blocking limitations

- Pin-guard's status message is generic ("N pinned deps") — doesn't break out by category. If/when ALLOWED grows to 20+ entries, a categorized summary would help readers.
- The BDD's source-inspection approach can't catch the case where ALLOWED entries are _present but their integrity hashes are subtly wrong_. The actual pin-guard exit-code check (always-on in `pnpm run lint:exact-pin-guard`) catches that — the BDD covers the orthogonal "are the entries there at all" question.
