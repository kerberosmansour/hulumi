# Mixed DriftSource Emission - SLO Ticket Contract v1

## 1. Ticket Metadata

| Field                               | Value                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Ticket Contract ID                  | `ticket-18-mixed-drift-source`                                                                         |
| Source tracker                      | `GitHub Issues`                                                                                        |
| Source issue                        | [#18](https://github.com/kerberosmansour/hulumi/issues/18)                                             |
| Issue title                         | `feat(drift): support Mixed DriftSource when multiple adapters concurrently report drift`              |
| Labels                              | `enhancement`, `drift`, `tla-relevant`                                                                 |
| Assignee / owner                    | `kerberosmansour`                                                                                      |
| Target branch                       | `ticket/18-mixed-drift-source`                                                                         |
| Primary stack                       | TypeScript / Vitest                                                                                    |
| Default formatter command           | `pnpm format:check`                                                                                    |
| Default typecheck / build command   | `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build`                           |
| Default unit / BDD command          | `pnpm --filter @hulumi/drift test -- tests/verdict-matrix.feature.test.ts tests/tla-alignment.test.ts` |
| Default static analysis command     | `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`  |
| Public interfaces stable by default | yes; `Mixed` already exists in `DRIFT_SOURCES`                                                         |
| Allowed new dependencies by default | none                                                                                                   |
| Schema/config migration allowed     | no                                                                                                     |

## 2. Sizing Gate

| Check                                          | Answer                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| User-visible outcome fits in one sentence      | yes - simultaneous console/provider evidence emits `Mixed / high` |
| Expected changed files <= 10                   | yes - docs alignment plus one focused classifier test             |
| New public surfaces <= 1                       | no new surface; existing enum value becomes reachable             |
| No schema migration unless explicitly approved | yes                                                               |
| No cross-subsystem rewrite                     | yes                                                               |
| Can be reviewed as one PR                      | yes                                                               |
| Requires full v4 runbook instead               | no                                                                |

## 3. Issue Context

`DRIFT_SOURCES` already includes `Mixed`, but `hardenedVerdict()` and the vendored trace matrix still use the original five-row table. A console drift event plus provider-version drift in the same classification window currently collapses to `ConsoleBreakGlass / high`; the operator loses the provider-churn context.

## 4. Compact Architecture Delta

| Component      | Existing behavior                     | Change                                                        | Interface / trust boundary touched |
| -------------- | ------------------------------------- | ------------------------------------------------------------- | ---------------------------------- |
| Verdict matrix | five rows; console evidence dominates | add sixth row for `eventDelivered && providerDrift`           | package-local classifier contract  |
| Classifier     | long-window CloudTrail promotion wins | preserve `Mixed` when CloudTrail and provider drift both fire | no new trust boundary              |
| Documentation  | describes `Mixed` as known gap        | document it as implemented behavior                           | public docs                        |

## 5. Contract Block

| Contract Row                       | Value                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inputs                             | #18 issue body, `packages/drift/src/verdict.ts`, current trace matrix, classifier post-processing logic                                                                                                                                                                                                                                                                             |
| Outputs                            | sixth verdict row, classifier mixed-source preservation, updated BDD/docs, issue workpad evidence                                                                                                                                                                                                                                                                                   |
| Interfaces touched                 | `hardenedVerdict(snapshot)` behavior only; no type shape change                                                                                                                                                                                                                                                                                                                     |
| Files allowed to change            | `docs/slo/tickets/ticket-18-mixed-drift-source.md`, `packages/drift/src/verdict.ts`, `packages/drift/src/classifier.ts`, `packages/drift/tests/_utils/trace-matrix.ts`, `packages/drift/tests/verdict-matrix.feature.test.ts`, `packages/drift/tests/classifier-mixed.test.ts`, `packages/drift/README.md`, `docs/components/drift-classifier.md`, `docs/papers/drift-detection.md` |
| Files to read before changing      | `docs/ARCHITECTURE.md`, `packages/drift/src/types.ts`, `packages/drift/src/verdict.ts`, `packages/drift/src/classifier.ts`, `packages/drift/tests/_utils/trace-matrix.ts`, `packages/drift/tests/verdict-matrix.feature.test.ts`, `packages/drift/tests/tla-alignment.test.ts`                                                                                                      |
| New files allowed                  | this ticket contract and `packages/drift/tests/classifier-mixed.test.ts`                                                                                                                                                                                                                                                                                                            |
| New dependencies allowed           | none                                                                                                                                                                                                                                                                                                                                                                                |
| Migration allowed                  | no                                                                                                                                                                                                                                                                                                                                                                                  |
| Compatibility commitments          | existing five row outcomes remain unchanged except the previously under-covered `eventDelivered && providerDrift` combination now returns `Mixed`                                                                                                                                                                                                                                   |
| Data classification                | Public; no cloud identifiers or secrets                                                                                                                                                                                                                                                                                                                                             |
| Proactive controls in play         | TLA alignment meta-test, verdict matrix BDD, monotonicity confidence guard                                                                                                                                                                                                                                                                                                          |
| Abuse acceptance scenarios         | `ProviderApiChurn` must still never reach `high` by itself; `Mixed / high` requires console/audit evidence plus provider drift                                                                                                                                                                                                                                                      |
| Resource bounds introduced/changed | trace matrix grows from 5 rows to 6 rows                                                                                                                                                                                                                                                                                                                                            |
| Invariants/assertions required     | `DRIFT_SOURCES` remains unchanged; row count assertion updates to exactly 6; ProviderApiChurn-only medium ceiling still holds                                                                                                                                                                                                                                                       |
| Debugger / inspection expectation  | inspect direct Vitest output and diff                                                                                                                                                                                                                                                                                                                                               |
| Static analysis gates              | formatter, drift lint, license-boundary, exact-pin guard                                                                                                                                                                                                                                                                                                                            |
| Reversibility / rollback path      | revert the sixth row and the two branch-condition changes                                                                                                                                                                                                                                                                                                                           |
| Exemplar code to copy              | existing trace-matrix BDD rows and `buildRecommendation("Mixed")`                                                                                                                                                                                                                                                                                                                   |
| Anti-exemplar code not to copy     | do not add a new enum value; do not make provider drift alone high; do not remove the console high-confidence path                                                                                                                                                                                                                                                                  |
| Refactoring discipline             | no broad classifier refactor                                                                                                                                                                                                                                                                                                                                                        |
| AI tolerance contract              | N/A - no AI component                                                                                                                                                                                                                                                                                                                                                               |
| Forbidden shortcuts                | no fake TLA alignment claim; no weakening `tla-alignment.test.ts`; no docs-only closure                                                                                                                                                                                                                                                                                             |

## 6. Implementation Plan

1. Update the verdict matrix BDD data with a failing sixth `Mixed / high` row.
2. Update row-count assertions and direct ceiling checks.
3. Implement `Mixed` in `hardenedVerdict()` for delivered audit evidence plus provider drift.
4. Preserve `Mixed` in `DriftClassifier` when long-window CloudTrail evidence and provider drift both fire.
5. Update package docs to describe the sixth row and remove the known-gap language.
6. Run validation and update evidence.

## 7. BDD Acceptance Scenarios

| Scenario                    | Category   | Given                                              | When                | Then                                  | Evidence |
| --------------------------- | ---------- | -------------------------------------------------- | ------------------- | ------------------------------------- | -------- |
| mixed source emitted        | happy path | `mutated`, `eventDelivered`, and `providerDrift`   | verdict matrix runs | result is `Mixed / high`              | vitest   |
| provider ceiling preserved  | regression | `mutated`, `providerDrift`, and no delivered event | verdict matrix runs | result is `ProviderApiChurn / medium` | vitest   |
| console-only unchanged      | regression | `mutated` and delivered event only                 | verdict matrix runs | result is `ConsoleBreakGlass / high`  | vitest   |
| TLA enum alignment retained | schema     | existing `DRIFT_SOURCES` tuple                     | meta-test runs      | sources still match the upstream set  | vitest   |

## 8. Validation Plan

| Check                      | Command / Action                                                                                                      | Expected Result              | Actual Result                                                                | Status | Notes |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------- | ------ | ----- |
| Repo hygiene               | `git status --short --branch && git rev-parse --abbrev-ref HEAD && git symbolic-ref --short refs/remotes/origin/HEAD` | task branch, not default     | branch `ticket/18-mixed-drift-source`; default `origin/main`; clean at start | pass   |       |
| Baseline targeted test     | `pnpm --filter @hulumi/drift test -- tests/verdict-matrix.feature.test.ts tests/tla-alignment.test.ts`                | baseline passes before edits | passed; 2 files / 11 tests                                                   | pass   |       |
| New BDD pre-implementation | same targeted command after adding row before implementation                                                          | fails on `Mixed` row         | failed as expected: row 6 expected `Mixed`, received `ConsoleBreakGlass`     | pass   |       |
| Classifier BDD             | `pnpm --filter @hulumi/drift test -- tests/classifier-mixed.test.ts`                                                  | passes                       | passed; 1 test                                                               | pass   |       |
| Targeted BDD/meta          | `pnpm --filter @hulumi/drift test -- tests/verdict-matrix.feature.test.ts tests/tla-alignment.test.ts`                | passes                       | passed; 2 files / 12 tests                                                   | pass   |       |
| Drift package tests        | `pnpm --filter @hulumi/drift test`                                                                                    | passes                       | passed; 18 files / 80 tests                                                  | pass   |       |
| Typecheck / build          | `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build`                                          | passes                       | passed                                                                       | pass   |       |
| Static analysis / lint     | `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`                 | passes                       | passed                                                                       | pass   |       |
| Formatter                  | `pnpm format:check`                                                                                                   | passes                       | passed after formatting markdown                                             | pass   |       |

## 9. Workpad / Tracker Updates

Workpad comment: https://github.com/kerberosmansour/hulumi/issues/18#issuecomment-4410468638

## 10. Self-Review Gate

- [x] Stayed inside the file allow-list.
- [x] Added failing BDD row before implementation.
- [x] Kept `ProviderApiChurn` ceiling intact.
- [x] Kept `DRIFT_SOURCES` unchanged and TLA alignment passing.
- [x] Updated issue workpad evidence.

## 11. Closure Summary

### Completed

- Added the sixth vendored trace row for `mutated && eventDelivered && providerDrift`.
- Updated `hardenedVerdict()` to emit `Mixed / high` for that row.
- Preserved `Mixed / high` when classifier long-window CloudTrail evidence and provider-version drift both fire.
- Added `packages/drift/tests/classifier-mixed.test.ts`.
- Updated package and component docs to describe the six-row matrix.
- Updated the drift paper to move `Mixed` out of the known-undercoverage section.

### Tests And Validation

- Baseline targeted test before behavior edits - pass, 2 files / 11 tests.
- New BDD row before implementation - failed as expected on `ConsoleBreakGlass` vs `Mixed`.
- `pnpm --filter @hulumi/drift test -- tests/classifier-mixed.test.ts` - pass, 1 test.
- `pnpm --filter @hulumi/drift test -- tests/verdict-matrix.feature.test.ts tests/tla-alignment.test.ts` - pass, 2 files / 12 tests.
- `pnpm --filter @hulumi/drift test` - pass, 18 files / 80 tests.
- `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build` - pass.
- `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard` - pass.
- `pnpm format:check` - pass.
