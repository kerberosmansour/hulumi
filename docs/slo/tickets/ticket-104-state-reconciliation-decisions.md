# State Reconciliation Decisions - SLO Ticket Contract v1

## 1. Ticket Metadata

| Field                               | Value                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Ticket Contract ID                  | `ticket-104-state-reconciliation-decisions`                                                             |
| Source tracker                      | `GitHub Issues`                                                                                         |
| Source issue                        | [#104](https://github.com/kerberosmansour/hulumi/issues/104)                                            |
| Issue title                         | `feat(drift): add state reconciliation decisions and action boundaries`                                 |
| Labels                              | `drift`, `cleanup`, `reliability`, `enhancement`                                                        |
| Assignee / owner                    | `kerberosmansour`                                                                                       |
| Target branch                       | `ticket/104-state-reconciliation-decisions`                                                             |
| Primary stack                       | TypeScript / Vitest                                                                                     |
| Default formatter command           | `pnpm format:check`                                                                                     |
| Default typecheck / build command   | `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build`                            |
| Default static analysis command     | `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`   |
| Default unit / BDD command          | `pnpm --filter @hulumi/drift test -- tests/reconciler-state-decisions.test.ts tests/reconciler.test.ts` |
| Default runtime validation command  | N/A - planner-only unit-tested change                                                                   |
| Default dependency / security audit | `pnpm run lint:exact-pin-guard`                                                                         |
| Public interfaces stable by default | yes - uses existing `supportedActions` hint; no new exported types                                      |
| Allowed new dependencies by default | none                                                                                                    |
| Schema/config migration allowed     | no                                                                                                      |

### Public interfaces that must remain stable unless explicitly listed otherwise

- `OrphanReconciler.plan()`
- `OrphanReconciler.execute()`
- existing S3 sweep plan behavior
- `DriftClassifier.classify()` non-destructive behavior

## 2. Sizing Gate

| Check                                          | Answer                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| User-visible outcome fits in one sentence      | yes - reconciler plans first-class state/adoption decisions              |
| Expected changed files <= 8                    | yes                                                                      |
| New public surfaces <= 1                       | yes - no new surface; existing `supportedActions` semantics are expanded |
| No schema migration unless explicitly approved | yes                                                                      |
| No cross-subsystem rewrite                     | yes                                                                      |
| Can be reviewed as one PR                      | yes                                                                      |
| Requires full v4 runbook instead               | no - planner-only and dependency-free                                    |

## 3. Issue Context

### Problem

`OrphanReconciler` already has decision names such as `refreshState`, `importToState`, `stateDelete`, `codifyProduction`, `revertProduction`, and `ignoreWithJustification`, but planning mostly behaves like S3 sweep vs retain. #104 asks for state reconciliation decisions and action boundaries to become explicit without adding live state mutation executors.

### Acceptance Criteria From Issue

- [ ] Existing classifier behavior remains non-destructive.
- [ ] Existing S3 sweep planning remains backwards compatible.
- [ ] State-only actions require explicit `state-only` or `reconcile` mode before executable planning.
- [ ] Plans expose alternatives for state/adoption decisions without requiring a new dependency.
- [ ] Unit tests cover state-owned, state-missing, cloud-only, and unsupported-resource paths.

### Non-Goals

- Adding Pulumi state mutation executors.
- Adding AWS SDK dependencies.
- Changing S3 executor behavior.
- Implementing non-S3 AWS action families from #105.

### Reproduction / Current Signal

| Signal            | Evidence                                                                 |
| ----------------- | ------------------------------------------------------------------------ |
| Current tests     | `packages/drift/tests/reconciler.test.ts` covers S3/delete/retain basics |
| Current behavior  | cloud-only non-S3 resources retain; state-owned resources default no-op  |
| Expected behavior | existing `supportedActions` can steer state/adoption planner decisions   |

## 4. Compact Architecture Delta

| Component                 | Existing behavior                              | Change                                                      | Interface / trust boundary touched |
| ------------------------- | ---------------------------------------------- | ----------------------------------------------------------- | ---------------------------------- |
| `OrphanReconciler.plan()` | recommends S3 delete, stateDelete, retain/noOp | honors state/adoption `supportedActions` planner boundaries | package API behavior               |
| Tests                     | broad reconciler tests                         | focused state-decision BDD tests                            | none                               |

### Data Flow Delta

```text
ReconcileTarget.supportedActions
  -> classifyTarget()
  -> recommendedAction + alternatives + mode-gated executable flag
  -> execute() still refuses without an executor/confirmation/allow list
```

## 5. Contract Block

| Contract Row                       | Value                                                                                                                                                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inputs                             | #104 issue, #92 status, `packages/drift/src/reconciler.ts`, existing reconciler tests                                                                                                                     |
| Outputs                            | planner semantics, focused tests, ticket evidence, PR                                                                                                                                                     |
| Interfaces touched                 | existing `supportedActions` planner behavior only                                                                                                                                                         |
| Files allowed to change            | `docs/slo/tickets/ticket-104-state-reconciliation-decisions.md`, `packages/drift/src/reconciler.ts`, `packages/drift/tests/reconciler-state-decisions.test.ts`, `packages/drift/tests/reconciler.test.ts` |
| Files to read before changing      | `docs/ARCHITECTURE.md`, `packages/drift/src/reconciler.ts`, `packages/drift/tests/reconciler.test.ts`, `packages/drift/tests/execution.test.ts`                                                           |
| New files allowed                  | this ticket contract and `packages/drift/tests/reconciler-state-decisions.test.ts`                                                                                                                        |
| New dependencies allowed           | none                                                                                                                                                                                                      |
| Migration allowed                  | no                                                                                                                                                                                                        |
| Compatibility commitments          | S3 sweep plans remain executable in `sweep-only`; read-only modes remain non-executable; execute still requires token/allow/executor                                                                      |
| Data classification                | Public - tests use synthetic redacted IDs                                                                                                                                                                 |
| Proactive controls in play         | BDD/unit tests, no live AWS, no shell, redaction preserved                                                                                                                                                |
| Abuse acceptance scenarios         | read-only `plan` mode cannot execute state mutation; unsupported cloud-only resources do not default to deletion                                                                                          |
| Resource bounds introduced/changed | none - planner-only                                                                                                                                                                                       |
| Invariants/assertions required     | mode boundaries for `state-only`, `adopt-only`, `sweep-only`, `reconcile`; no classifier mutation                                                                                                         |
| Debugger / inspection expectation  | inspect failed Vitest assertions if planner behavior is ambiguous                                                                                                                                         |
| Static analysis gates              | formatter, typecheck/build, drift lint, license-boundary, exact-pin guard                                                                                                                                 |
| Reversibility / rollback path      | revert planner helper changes and new tests                                                                                                                                                               |
| Exemplar code to copy              | current `classifyTarget()` branch style and reconciler tests                                                                                                                                              |
| Anti-exemplar code not to copy     | no executor stubs, no real Pulumi state mutation, no AWS SDK calls                                                                                                                                        |
| Refactoring discipline             | limited helper extraction inside `reconciler.ts` only if it reduces branch risk                                                                                                                           |
| AI tolerance contract              | N/A - no AI component                                                                                                                                                                                     |
| Forbidden shortcuts                | no dependency addition; no broad #105 action-family work; no changing redaction/token behavior                                                                                                            |

## 6. Implementation Plan

1. Run repo hygiene and baseline reconciler tests.
2. Add failing state-decision BDD tests.
3. Update planner branch logic to honor `supportedActions` for state/adoption decisions.
4. Preserve existing S3 sweep behavior.
5. Run targeted and package validation.
6. Update workpad and open PR.

## 7. BDD Acceptance Scenarios

| Scenario                         | Category               | Given                                       | When              | Then                                        | Evidence |
| -------------------------------- | ---------------------- | ------------------------------------------- | ----------------- | ------------------------------------------- | -------- |
| state-owned refresh              | happy path             | state + cloud resource supports refresh     | `state-only` plan | recommends `refreshState` and is executable | vitest   |
| read-only state boundary         | abuse case             | same resource in `plan` mode                | plan generated    | action is not executable                    | vitest   |
| cloud-only adoption              | happy path             | strong evidence and `importToState` support | `adopt-only` plan | recommends `importToState`                  | vitest   |
| unsupported cloud-only retention | empty / degraded state | non-S3 cloud-only resource, no support      | `sweep-only` plan | recommends `retainExternal`, not delete     | vitest   |
| existing S3 sweep compatibility  | regression             | S3 cloud-only target                        | `sweep-only` plan | still recommends `deleteCloudResource`      | vitest   |

## 8. Validation Plan

| Check                      | Command / Action                                                                                                      | Expected Result                     | Actual Result                                                                                           | Status | Notes |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------- | ------ | ----- |
| Repo hygiene               | `git status --short --branch && git rev-parse --abbrev-ref HEAD && git symbolic-ref --short refs/remotes/origin/HEAD` | task branch, not default            | branch `ticket/104-state-reconciliation-decisions`; default `origin/main`; only ticket contract pending | pass   |       |
| Baseline targeted tests    | `pnpm --filter @hulumi/drift test -- tests/reconciler.test.ts tests/execution.test.ts`                                | baseline passes before edits        | passed; 2 files / 10 tests                                                                              | pass   |       |
| New BDD pre-implementation | `pnpm --filter @hulumi/drift test -- tests/reconciler-state-decisions.test.ts`                                        | fails before planner implementation | failed as expected; planner returned `noOp` / `retainExternal` before honoring `supportedActions`       | pass   |       |
| Targeted BDD               | `pnpm --filter @hulumi/drift test -- tests/reconciler-state-decisions.test.ts tests/reconciler.test.ts`               | passes                              | passed; 2 files / 11 tests                                                                              | pass   |       |
| Drift package tests        | `pnpm --filter @hulumi/drift test`                                                                                    | passes                              | passed; 21 files / 92 tests                                                                             | pass   |       |
| Typecheck / build          | `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build`                                          | passes                              | passed                                                                                                  | pass   |       |
| Static analysis / lint     | `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`                 | passes                              | passed; license-boundary OK; exact-pin guard OK                                                         | pass   |       |
| Formatter                  | `pnpm format:check`                                                                                                   | passes                              | passed after Prettier                                                                                   | pass   |       |
| Artifact cleanup           | `git status --short`                                                                                                  | no stray artifacts                  | only intended source/test/ticket changes                                                                | pass   |       |

## 9. Workpad / Tracker Updates

Workpad comment: https://github.com/kerberosmansour/hulumi/issues/104#issuecomment-4410677557

## 10. Self-Review Gate

- [x] Stayed inside the file allow-list.
- [x] Added failing BDD tests before implementation.
- [x] Preserved public runtime interfaces except documented `supportedActions` behavior.
- [x] Preserved S3 sweep compatibility.
- [x] Preserved read-only mode boundaries.
- [x] Added no dependencies.
- [x] Ran formatter, typecheck/build, and static analysis.
- [x] Recorded evidence rather than claims.
- [ ] Updated the issue workpad and PR handoff notes.

## 11. Closure Summary

### Completed

- Added `packages/drift/tests/reconciler-state-decisions.test.ts`.
- Planner now honors existing `ReconcileTarget.supportedActions` for state/adoption decisions.
- `refreshState` can be recommended for state-owned resources and only becomes executable in state mutation modes.
- `importToState` can be recommended for strongly-owned cloud-only resources in adopt mode.
- Unsupported non-S3 cloud-only resources remain retained, not swept.
- Existing S3 sweep planning remains backwards compatible.

### Tests And Validation

- `pnpm --filter @hulumi/drift test -- tests/reconciler.test.ts tests/execution.test.ts` - baseline pass, 2 files / 10 tests.
- New BDD before implementation failed as expected.
- `pnpm --filter @hulumi/drift test -- tests/reconciler-state-decisions.test.ts tests/reconciler.test.ts` - pass, 2 files / 11 tests.
- `pnpm --filter @hulumi/drift test` - pass, 21 files / 92 tests.
- `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build` - pass.
- `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard` - pass.
- `pnpm format:check` - pass.

### Lessons / Follow-Ups

- #105 should add non-S3 AWS action-family vocabulary after this state/adoption boundary is merged.

### PR / Issue Links

- PR: pending
- Issue: https://github.com/kerberosmansour/hulumi/issues/104
