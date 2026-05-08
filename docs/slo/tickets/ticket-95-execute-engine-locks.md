# Conservative Execute Engine, Locks, And Resumable Results - SLO Ticket Contract v1

## 1. Ticket Metadata

| Field                                       | Value                                                                                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Ticket Contract ID                          | `ticket-95-execute-engine-locks`                                                                                                               |
| Source tracker                              | `GitHub Issues`                                                                                                                                |
| Source issue                                | [#95](https://github.com/kerberosmansour/hulumi/issues/95)                                                                                     |
| Issue title                                 | `feat(drift): add conservative execute engine, locks, and resumable results`                                                                   |
| Labels                                      | `enhancement`, `drift`, `reliability`, `aws`, `cleanup`                                                                                        |
| Assignee / owner                            | unassigned                                                                                                                                     |
| Target branch                               | `ticket/95-execute-engine-locks`                                                                                                               |
| Primary stack                               | TypeScript / pnpm / Vitest                                                                                                                     |
| Default formatter command                   | `pnpm format:check`                                                                                                                            |
| Default typecheck / build command           | `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build`                                                                   |
| Default static analysis / lint command      | `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`                                          |
| Default unit / BDD command                  | `pnpm --filter @hulumi/drift test -- tests/execution.test.ts tests/s3-sweeper.test.ts tests/reconciler.test.ts`                                |
| Default runtime validation command          | `HULUMI_INTEGRATION=1 pnpm --filter @hulumi/drift test -- tests/integration/` when AWS/Pulumi sandbox env exists; otherwise record skip reason |
| Default dependency / security audit command | `pnpm audit --prod`                                                                                                                            |
| Default debugger or state-inspection tool   | `git status --short --branch`, TypeScript diagnostics, targeted Vitest output                                                                  |
| Public interfaces stable by default         | yes                                                                                                                                            |
| Allowed new dependencies by default         | none                                                                                                                                           |
| Schema/config migration allowed by default  | no                                                                                                                                             |

### Public interfaces that must remain stable unless explicitly listed otherwise

- Existing #93/#94 exports remain source compatible.
- `DriftClassifier.classify()` remains non-destructive.
- Execution behavior changes are conservative: more refusal/reporting, not broader mutation.

## 2. Sizing Gate

| Check                                          | Answer                                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| User-visible outcome fits in one sentence      | yes - execution becomes locked, resumable, and idempotent for supported S3 cleanup |
| Expected changed files <= 8                    | yes                                                                                |
| New public surfaces <= 1                       | yes - optional lock options/result semantics on existing execute surface           |
| No schema migration unless explicitly approved | yes                                                                                |
| No cross-subsystem rewrite                     | yes                                                                                |
| Can be reviewed as one PR                      | yes                                                                                |
| Requires full v4 runbook instead               | no, because only existing S3 primitive is touched                                  |

## 3. Issue Context

### Problem

#93 added explicit execute mode, but execution still needs stronger operational behavior before real workflows rely on it: target locking, caught partial failures, and idempotent already-absent S3 handling.

### Acceptance Criteria From Issue

- [ ] Execute refuses read-only plans.
- [ ] Execute refuses stale/tampered confirmation tokens.
- [ ] Execute respects action allow-list/policy approval.
- [ ] Locking prevents two jobs from mutating the same target concurrently.
- [ ] Partial failures produce a resumable result or follow-up plan.
- [ ] Result artifacts remain redacted and safe to upload.
- [ ] Unit tests cover idempotent retry and mid-sweep failure paths.

### Non-Goals

- Adding new AWS deleters.
- Live AWS integration.
- Durable distributed lock storage.
- Pulumi state mutation execution.

## 4. Compact Architecture Delta

| Component    | Existing behavior                 | Change                                             | Interface / trust boundary touched |
| ------------ | --------------------------------- | -------------------------------------------------- | ---------------------------------- |
| Execute loop | stops if executor throws          | records failed action and continues                | result artifact                    |
| Locking      | no built-in execute lock          | in-process lock key per target/plan scope          | mutation concurrency boundary      |
| S3 executor  | errors on absent bucket mid-sweep | treats already absent bucket as idempotent success | AWS mutation boundary              |

### Data Flow Delta

```text
plan + token + allow-list
  -> execute acquires target lock
  -> each action catches failure into structured result
  -> lock released in finally
  -> result remains redacted/counts-only
```

## 5. Contract Block

| Contract Row                       | Value                                                                                                                                                                                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inputs                             | #95 issue, #93/#94 reconciler implementation                                                                                                                                                                                                                                                      |
| Outputs                            | tests, conservative execute behavior, issue workpad update                                                                                                                                                                                                                                        |
| Interfaces touched                 | `OrphanReconciler.execute()`, `S3SweeperExecutor.execute()`                                                                                                                                                                                                                                       |
| Files allowed to change            | `docs/slo/tickets/ticket-95-execute-engine-locks.md`, `packages/drift/src/reconciler.ts`, `packages/drift/src/adapters/s3-sweeper.ts`, `packages/drift/tests/execution.test.ts`, `packages/drift/tests/s3-sweeper.test.ts`, `packages/drift/tests/reconciler.test.ts`, `packages/drift/README.md` |
| Files to read before changing      | `docs/slo/tickets/ticket-93-reconciler-s3-sweeper.md`, `docs/slo/tickets/ticket-94-discovery-decision-model.md`, `packages/drift/src/reconciler.ts`, `packages/drift/src/adapters/s3-sweeper.ts`, `packages/drift/tests/reconciler.test.ts`, `packages/drift/tests/s3-sweeper.test.ts`            |
| New files allowed                  | `docs/slo/tickets/ticket-95-execute-engine-locks.md`, `packages/drift/tests/execution.test.ts`                                                                                                                                                                                                    |
| New dependencies allowed           | none                                                                                                                                                                                                                                                                                              |
| Migration allowed                  | no                                                                                                                                                                                                                                                                                                |
| Compatibility commitments          | existing plan/execute calls keep working; result shape is additive/counts-only                                                                                                                                                                                                                    |
| Data classification                | Public; result messages must not expose bucket names/object keys/account IDs                                                                                                                                                                                                                      |
| Proactive controls in play         | read-only refusal, token matching, allow-list gating, execute lock, failure capture, idempotent already-absent handling                                                                                                                                                                           |
| Abuse acceptance scenarios         | concurrent execute blocked; tampered token rejected; read-only plan refused                                                                                                                                                                                                                       |
| Resource bounds introduced/changed | no retries/polling; lock set is bounded by active executions and released in finally                                                                                                                                                                                                              |
| Invariants/assertions required     | lock releases after success/failure; partial failures do not widen scope; absent S3 bucket succeeds counts-only                                                                                                                                                                                   |
| Debugger / inspection expectation  | inspect targeted Vitest failures                                                                                                                                                                                                                                                                  |
| Static analysis gates              | formatter, typecheck/build, lint, license-boundary, exact-pin guard, audit                                                                                                                                                                                                                        |
| Reversibility / rollback path      | revert additive execute locking/failure handling                                                                                                                                                                                                                                                  |
| Exemplar code to copy              | #93 executor injection pattern and S3 prefix guard                                                                                                                                                                                                                                                |
| Anti-exemplar code not to copy     | throwing raw AWS errors into artifacts, shared global cleanup without target key                                                                                                                                                                                                                  |
| Refactoring discipline             | no broad reconciler rewrite                                                                                                                                                                                                                                                                       |
| AI tolerance contract              | N/A - no AI component                                                                                                                                                                                                                                                                             |
| Forbidden shortcuts                | no sleep/retry loop, no shell usage, no new cloud deleters, no unredacted error strings                                                                                                                                                                                                           |

## 6. Implementation Plan

1. Add failing execution tests first.
2. Add in-process execute lock and structured failure capture.
3. Add idempotent S3 no-such-bucket success.
4. Run validation and update evidence.

## 7. BDD Acceptance Scenarios

| Scenario                  | Category      | Given                        | When                  | Then                                        | Evidence                                  |
| ------------------------- | ------------- | ---------------------------- | --------------------- | ------------------------------------------- | ----------------------------------------- |
| read-only execute refused | invalid input | `plan` mode plan             | execute is called     | throws before executor runs                 | `packages/drift/tests/execution.test.ts`  |
| concurrent execute lock   | abuse case    | first execute is in progress | second execute starts | second result is blocked by lock            | `packages/drift/tests/execution.test.ts`  |
| partial failure captured  | degraded      | one executor throws          | execute runs          | result contains failed action and continues | `packages/drift/tests/execution.test.ts`  |
| absent S3 idempotent      | retry         | bucket is already gone       | S3 executor runs      | succeeded counts-only result                | `packages/drift/tests/s3-sweeper.test.ts` |

## 8. Validation Plan

| Check                           | Command / Action                                                                                                      | Expected Result                   | Actual Result                                                                  | Status  | Notes                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------ | ------- | ----------------------------- |
| Repo hygiene                    | `git status --short --branch && git rev-parse --abbrev-ref HEAD && git symbolic-ref --short refs/remotes/origin/HEAD` | task branch, default branch known | branch `ticket/95-execute-engine-locks`; default `origin/main`; clean at start | pass    |                               |
| New tests fail first            | `pnpm --filter @hulumi/drift test -- tests/execution.test.ts tests/s3-sweeper.test.ts`                                | fails before implementation       | failed on concurrent execute timeout and raw executor throw                    | pass    |                               |
| Formatter                       | `pnpm format:check`                                                                                                   | passes                            | passed                                                                         | pass    |                               |
| Typecheck / build               | `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build`                                          | passes                            | passed                                                                         | pass    |                               |
| Static analysis / lint          | `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`                 | passes                            | passed                                                                         | pass    |                               |
| Unit / BDD tests                | `pnpm --filter @hulumi/drift test -- tests/execution.test.ts tests/s3-sweeper.test.ts tests/reconciler.test.ts`       | passes                            | 13 tests passed                                                                | pass    |                               |
| Runtime validation              | inspect AWS/Pulumi env, run integration only if configured                                                            | pass or documented skip           | no AWS/Pulumi/Hulumi env present locally                                       | blocked | Real AWS proof belongs to #96 |
| Dependency / security audit     | `pnpm audit --prod`                                                                                                   | passes                            | passed                                                                         | pass    |                               |
| Compatibility check             | `pnpm --filter @hulumi/drift test`                                                                                    | passes                            | 17 files passed, 77 tests passed                                               | pass    |                               |
| `.gitignore` / artifact cleanup | `git status --short`                                                                                                  | no stray generated artifacts      | only #95 source/docs files are dirty                                           | pass    |                               |

## 9. Workpad / Tracker Updates

Workpad comment: https://github.com/kerberosmansour/hulumi/issues/95#issuecomment-4410170567

## 10. Self-Review Gate

- [x] Stayed inside the file allow-list.
- [x] Added focused BDD/unit tests first.
- [x] Preserved classifier compatibility.
- [x] Avoided adding new cloud deleters.
- [x] Ran formatter, typecheck/build, static analysis, and full compatibility tests.
- [ ] Updated issue workpad evidence.

## 11. Closure Summary

### Completed

- Added in-process target execution locking.
- Changed executor failures into structured failed action results so later actions can continue.
- Sanitized executor failure messages in result artifacts.
- Added S3 already-absent idempotent success.

### Tests And Validation

- `pnpm --filter @hulumi/drift test -- tests/execution.test.ts tests/s3-sweeper.test.ts tests/reconciler.test.ts` - pass, 13 tests.
- `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build` - pass.
- `pnpm --filter @hulumi/drift test` - pass, 77 tests.
- `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard` - pass.
- `pnpm format:check` - pass.
- `pnpm audit --prod` - pass.
- Real-AWS runtime validation - blocked locally because no `AWS_*`, `PULUMI_*`, or `HULUMI_*` env vars are present; #96 should provide the sandbox proof.
