# CloudTrail Retry Budget - SLO Ticket Contract v1

## 1. Ticket Metadata

| Field                               | Value                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Ticket Contract ID                  | `ticket-19-cloudtrail-retry-budget`                                                                           |
| Source tracker                      | `GitHub Issues`                                                                                               |
| Source issue                        | [#19](https://github.com/kerberosmansour/hulumi/issues/19)                                                    |
| Issue title                         | `feat(drift): add bounded retry to CloudTrailAdapter with budget-bounded test`                                |
| Labels                              | `enhancement`, `drift`, `reliability`                                                                         |
| Assignee / owner                    | `kerberosmansour`                                                                                             |
| Target branch                       | `ticket/19-cloudtrail-retry-budget`                                                                           |
| Primary stack                       | TypeScript / Vitest                                                                                           |
| Default formatter command           | `pnpm format:check`                                                                                           |
| Default typecheck / build command   | `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build`                                  |
| Default unit / BDD command          | `pnpm --filter @hulumi/drift test -- tests/cloudtrail-retry-budget.test.ts tests/namespace-rejection.test.ts` |
| Default static analysis command     | `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`         |
| Public interfaces stable by default | additive only; `CloudTrailAdapterArgs.retry` is optional                                                      |
| Allowed new dependencies by default | none                                                                                                          |
| Schema/config migration allowed     | no                                                                                                            |

## 2. Sizing Gate

| Check                                          | Answer                                               |
| ---------------------------------------------- | ---------------------------------------------------- |
| User-visible outcome fits in one sentence      | yes - transient CloudTrail lookup failures can retry |
| Expected changed files <= 5                    | yes                                                  |
| New public surfaces <= 1                       | yes - optional retry config                          |
| No schema migration unless explicitly approved | yes                                                  |
| No cross-subsystem rewrite                     | yes                                                  |
| Can be reviewed as one PR                      | yes                                                  |
| Requires full v4 runbook instead               | no                                                   |

## 3. Issue Context

`CloudTrailAdapter.signal()` currently calls the injected lookup once. Transient throttling or AWS API blips immediately produce a degraded signal. The retry must be bounded so it cannot become an unbounded wait or exceed the caller's probe budget.

The repo also enforces no `setTimeout`, `sleep`, or `await new Promise` in `packages/drift/src/` outside the sanctioned probe wrapper. Therefore this ticket may add bounded retry math and an optional delay hook, but it must not add inline sleeps to `CloudTrailAdapter`.

## 4. Compact Architecture Delta

| Component           | Existing behavior        | Change                                               | Interface / trust boundary touched |
| ------------------- | ------------------------ | ---------------------------------------------------- | ---------------------------------- |
| `CloudTrailAdapter` | one lookup attempt       | optional bounded retry attempts                      | AWS lookup adapter API             |
| Retry delay         | N/A                      | injectable `wait(delayMs)` hook, default no-op delay | no new cloud trust boundary        |
| Tests               | namespace filtering only | budget and exhaustion tests                          | local unit tests                   |

## 5. Contract Block

| Contract Row                       | Value                                                                                                                                                                                                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inputs                             | #19 issue body, `packages/drift/src/adapters/cloudtrail.ts`, existing namespace tests, no-sleep guard                                                                                                                                                                               |
| Outputs                            | optional retry config, budget-bounded tests, issue workpad evidence                                                                                                                                                                                                                 |
| Interfaces touched                 | additive `CloudTrailAdapterArgs.retry?: { attempts: number; backoffMs: number; maxElapsedMs?: number; wait?: (delayMs: number) => Promise<void> }`                                                                                                                                  |
| Files allowed to change            | `docs/slo/tickets/ticket-19-cloudtrail-retry-budget.md`, `packages/drift/src/adapters/cloudtrail.ts`, `packages/drift/tests/cloudtrail-retry-budget.test.ts`, `packages/drift/tests/namespace-rejection.test.ts`, `packages/drift/README.md`, `docs/components/drift-classifier.md` |
| Files to read before changing      | `docs/ARCHITECTURE.md`, `packages/drift/src/adapters/cloudtrail.ts`, `packages/drift/tests/namespace-rejection.test.ts`, `packages/drift/tests/no-shell-exec.test.ts`, `packages/drift/src/probe.ts`                                                                                |
| New files allowed                  | this ticket contract and `packages/drift/tests/cloudtrail-retry-budget.test.ts`                                                                                                                                                                                                     |
| New dependencies allowed           | none                                                                                                                                                                                                                                                                                |
| Migration allowed                  | no                                                                                                                                                                                                                                                                                  |
| Compatibility commitments          | existing no-retry behavior remains default; existing constructor calls remain valid                                                                                                                                                                                                 |
| Data classification                | Public; no CloudTrail event payload expansion beyond existing redacted event summary                                                                                                                                                                                                |
| Proactive controls in play         | bounded attempts, bounded accumulated delay, no source-level sleep, existing namespace rejection                                                                                                                                                                                    |
| Abuse acceptance scenarios         | invalid retry config falls back to one attempt; exhausted retries return `ok: false`; budget prevents waits beyond `maxElapsedMs`                                                                                                                                                   |
| Resource bounds introduced/changed | max lookup attempts = sanitized `retry.attempts`; max accumulated delay = `retry.maxElapsedMs` when set                                                                                                                                                                             |
| Invariants/assertions required     | no retry loop can run forever; no delay is scheduled if it would exceed budget; filtered IaC principal semantics unchanged                                                                                                                                                          |
| Debugger / inspection expectation  | inspect unit test call counts and delay hook calls                                                                                                                                                                                                                                  |
| Static analysis gates              | drift lint, no-shell/no-sleep test, license-boundary, exact-pin guard, formatter                                                                                                                                                                                                    |
| Reversibility / rollback path      | remove retry helper and tests; default behavior remains original one-attempt lookup                                                                                                                                                                                                 |
| Exemplar code to copy              | existing `CloudTrailAdapter.signal()` error result shape and `namespace-rejection.test.ts` adapter construction                                                                                                                                                                     |
| Anti-exemplar code not to copy     | no `setTimeout`, no source `sleep`, no unbounded while loop, no swallowing final error as `ok: true`                                                                                                                                                                                |
| Refactoring discipline             | no broad adapter refactor                                                                                                                                                                                                                                                           |
| AI tolerance contract              | N/A - no AI component                                                                                                                                                                                                                                                               |
| Forbidden shortcuts                | no real AWS calls; no long sleeps in tests; no weakening `no-shell-exec.test.ts`                                                                                                                                                                                                    |

## 6. Implementation Plan

1. Add failing retry-budget tests for successful retry, budget stop, and default one-attempt behavior.
2. Implement sanitized retry options in `CloudTrailAdapter`.
3. Preserve existing namespace filtering and error result shape.
4. Document the optional retry config briefly.
5. Run validation and update evidence.

## 7. BDD Acceptance Scenarios

| Scenario              | Category   | Given                                 | When              | Then                                      | Evidence |
| --------------------- | ---------- | ------------------------------------- | ----------------- | ----------------------------------------- | -------- |
| transient success     | happy path | lookup fails once then succeeds       | adapter retries   | result is `ok: true` and delay is bounded | vitest   |
| budget exhausted      | abuse case | next backoff would exceed max elapsed | adapter evaluates | no extra lookup/wait is attempted         | vitest   |
| default compatibility | regression | no retry config                       | lookup fails      | exactly one attempt returns `ok: false`   | vitest   |
| namespace unchanged   | regression | IaC principal tags and console tags   | lookup succeeds   | filtering behavior remains unchanged      | vitest   |

## 8. Validation Plan

| Check                      | Command / Action                                                                                                      | Expected Result                   | Actual Result                                                                  | Status | Notes |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------ | ------ | ----- |
| Repo hygiene               | `git status --short --branch && git rev-parse --abbrev-ref HEAD && git symbolic-ref --short refs/remotes/origin/HEAD` | task branch, not default          | branch `ticket/19-cloudtrail-retry-budget`; default `origin/main`; clean start | pass   |       |
| Baseline targeted test     | `pnpm --filter @hulumi/drift test -- tests/namespace-rejection.test.ts`                                               | baseline passes before edits      | passed; 6 tests                                                                | pass   |       |
| New BDD pre-implementation | `pnpm --filter @hulumi/drift test -- tests/cloudtrail-retry-budget.test.ts`                                           | fails before retry implementation | failed as expected; retry API/metadata missing                                 | pass   |       |
| Targeted BDD               | `pnpm --filter @hulumi/drift test -- tests/cloudtrail-retry-budget.test.ts tests/namespace-rejection.test.ts`         | passes                            | passed; 2 files / 9 tests                                                      | pass   |       |
| Drift package tests        | `pnpm --filter @hulumi/drift test`                                                                                    | passes                            | passed; 18 files / 81 tests                                                    | pass   |       |
| Typecheck / build          | `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build`                                          | passes                            | passed                                                                         | pass   |       |
| Static analysis / lint     | `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`                 | passes                            | passed                                                                         | pass   |       |
| Formatter                  | `pnpm format:check`                                                                                                   | passes                            | passed after formatting adapter and contract                                   | pass   |       |

## 9. Workpad / Tracker Updates

Workpad comment: https://github.com/kerberosmansour/hulumi/issues/19#issuecomment-4410492058

## 10. Self-Review Gate

- [x] Stayed inside the file allow-list.
- [x] Added failing retry-budget tests before implementation.
- [x] Preserved default one-attempt behavior.
- [x] Did not add source-level sleeps.
- [x] Existing namespace filtering test still passes.
- [x] Updated issue workpad evidence.

## 11. Closure Summary

### Completed

- Added optional `CloudTrailAdapterArgs.retry`.
- Added bounded attempts, exponential backoff accounting, optional caller-provided `wait(delayMs)` hook, and `maxElapsedMs` stop condition.
- Preserved default one-attempt behavior when retry is omitted.
- Added `packages/drift/tests/cloudtrail-retry-budget.test.ts`.
- Documented the retry option in drift package/component docs.

### Tests And Validation

- `pnpm --filter @hulumi/drift test -- tests/namespace-rejection.test.ts` - baseline pass, 6 tests.
- New retry BDD before implementation - failed as expected.
- `pnpm --filter @hulumi/drift test -- tests/cloudtrail-retry-budget.test.ts tests/namespace-rejection.test.ts tests/no-shell-exec.test.ts` - pass, 3 files / 11 tests after formatting.
- `pnpm --filter @hulumi/drift test` - pass, 18 files / 81 tests.
- `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build` - pass.
- `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard` - pass.
- `pnpm format:check` - pass.
