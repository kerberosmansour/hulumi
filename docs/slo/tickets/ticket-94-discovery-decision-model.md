# AWS Inventory, Pulumi State, And Ownership Decision Model - SLO Ticket Contract v1

## 1. Ticket Metadata

| Field                                       | Value                                                                                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Ticket Contract ID                          | `ticket-94-discovery-decision-model`                                                                                                           |
| Source tracker                              | `GitHub Issues`                                                                                                                                |
| Source issue                                | [#94](https://github.com/kerberosmansour/hulumi/issues/94)                                                                                     |
| Issue title                                 | `feat(drift): add AWS inventory, Pulumi state, and ownership decision model`                                                                   |
| Labels                                      | `enhancement`, `drift`, `reliability`, `aws`, `cleanup`                                                                                        |
| Assignee / owner                            | unassigned                                                                                                                                     |
| Target branch                               | `ticket/94-discovery-decision-model`                                                                                                           |
| Primary stack                               | TypeScript / pnpm / Vitest                                                                                                                     |
| Default formatter command                   | `pnpm format:check`                                                                                                                            |
| Default typecheck / build command           | `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build`                                                                   |
| Default static analysis / lint command      | `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`                                          |
| Default unit / BDD command                  | `pnpm --filter @hulumi/drift test -- tests/discovery.test.ts tests/reconciler.test.ts`                                                         |
| Default runtime validation command          | `HULUMI_INTEGRATION=1 pnpm --filter @hulumi/drift test -- tests/integration/` when AWS/Pulumi sandbox env exists; otherwise record skip reason |
| Default dependency / security audit command | `pnpm audit --prod`                                                                                                                            |
| Default debugger or state-inspection tool   | `git status --short --branch`, TypeScript diagnostics, targeted Vitest output                                                                  |
| Public interfaces stable by default         | yes                                                                                                                                            |
| Allowed new dependencies by default         | none                                                                                                                                           |
| Schema/config migration allowed by default  | no                                                                                                                                             |

### Public interfaces that must remain stable unless explicitly listed otherwise

- Existing #93 reconciler exports remain source compatible.
- New discovery exports are additive and read-only.
- `DriftClassifier.classify()` remains non-destructive.

## 2. Sizing Gate

| Check                                          | Answer                                                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| User-visible outcome fits in one sentence      | yes - callers can turn Pulumi state and scoped inventory into reconciler targets without mutating anything |
| Expected changed files <= 8                    | yes                                                                                                        |
| New public surfaces <= 1                       | yes - one read-only discovery helper surface                                                               |
| No schema migration unless explicitly approved | yes                                                                                                        |
| No cross-subsystem rewrite                     | yes                                                                                                        |
| Can be reviewed as one PR                      | yes                                                                                                        |
| Requires full v4 runbook instead               | no, because live AWS enumeration is deferred                                                               |

## 3. Issue Context

### Problem

#93 provides a guarded plan/execute API, but callers still need a safe way to convert known Pulumi state and scoped cloud inventory into `ReconcileTarget`s. #94 adds that read-only decision model while deferring live AWS enumeration to later issues.

### Acceptance Criteria From Issue

- [ ] Discovery can ingest Pulumi state export / Automation API state.
- [ ] AWS inventory is scoped by explicit prefix/tag/resource selector only.
- [ ] Cloud-only resources require configurable minimum ownership signals.
- [ ] Shared singletons default to `retainExternal` / report, not delete.
- [ ] Unsupported resource types are reported and blocked, not silently ignored.
- [ ] Unit tests cover weak evidence, wrong account/region, too-new resources, and singleton retain behavior.

### Non-Goals

- Calling AWS APIs directly.
- Importing or deleting Pulumi state.
- Adding new cloud deleters.
- Replacing the weekly cleanup workflow.

## 4. Compact Architecture Delta

| Component       | Existing behavior                 | Change                                                   | Interface / trust boundary touched |
| --------------- | --------------------------------- | -------------------------------------------------------- | ---------------------------------- |
| Reconciler core | caller manually supplies targets  | add pure state/inventory discovery into targets          | public TypeScript API              |
| Scope guard     | plan validates prefix/age/account | discovery refuses unscoped inventory and filters targets | read-only selection boundary       |

### Data Flow Delta

```text
Pulumi state export + caller-supplied cloud inventory + explicit selectors
  -> discoverReconcileTargets()
  -> ReconcileTarget[] with relationship + ownership evidence
  -> OrphanReconciler.plan()
```

## 5. Contract Block

| Contract Row                       | Value                                                                                                                                                                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inputs                             | #94 issue, #93 reconciler API, Pulumi state export shape, scoped cloud inventory fixtures                                                                                                                                                                                       |
| Outputs                            | read-only discovery helper, tests, issue workpad update                                                                                                                                                                                                                         |
| Interfaces touched                 | `@hulumi/drift` exports                                                                                                                                                                                                                                                         |
| Files allowed to change            | `docs/slo/tickets/ticket-94-discovery-decision-model.md`, `packages/drift/src/discovery.ts`, `packages/drift/src/reconciler.ts`, `packages/drift/src/index.ts`, `packages/drift/tests/discovery.test.ts`, `packages/drift/tests/reconciler.test.ts`, `packages/drift/README.md` |
| Files to read before changing      | `docs/ARCHITECTURE.md`, `docs/slo/tickets/ticket-93-reconciler-s3-sweeper.md`, `packages/drift/src/reconciler.ts`, `packages/drift/tests/reconciler.test.ts`, `packages/drift/src/index.ts`                                                                                     |
| New files allowed                  | `docs/slo/tickets/ticket-94-discovery-decision-model.md`, `packages/drift/src/discovery.ts`, `packages/drift/tests/discovery.test.ts`                                                                                                                                           |
| New dependencies allowed           | none                                                                                                                                                                                                                                                                            |
| Migration allowed                  | no                                                                                                                                                                                                                                                                              |
| Compatibility commitments          | additive exports only; no classifier changes                                                                                                                                                                                                                                    |
| Data classification                | Public; discovery diagnostics and plans must not expose sensitive identifiers once passed through plan redaction                                                                                                                                                                |
| Proactive controls in play         | explicit selector required, no live AWS mutation, no shell execution, unsupported resources reported not dropped                                                                                                                                                                |
| Abuse acceptance scenarios         | unscoped inventory rejected; wrong account/region filtered; tag-only weak ownership remains blocked by planner                                                                                                                                                                  |
| Resource bounds introduced/changed | discovery is linear in provided state + inventory; no polling/retry loops                                                                                                                                                                                                       |
| Invariants/assertions required     | state-owned/state-missing/cloud-only/shared-singleton/unknown relationships are distinguishable; scoped selectors are required                                                                                                                                                  |
| Debugger / inspection expectation  | inspect failing fixtures and target relationships via Vitest output                                                                                                                                                                                                             |
| Static analysis gates              | formatter, typecheck/build, lint, license-boundary, exact-pin guard, audit                                                                                                                                                                                                      |
| Reversibility / rollback path      | remove additive discovery exports/source/tests                                                                                                                                                                                                                                  |
| Exemplar code to copy              | #93 redaction and scope patterns                                                                                                                                                                                                                                                |
| Anti-exemplar code not to copy     | live AWS enumeration in this slice, broad account inventory, tag-only deletion decisions                                                                                                                                                                                        |
| Refactoring discipline             | no classifier refactor; reconciler edits limited to adding relationship metadata or helper integration                                                                                                                                                                          |
| AI tolerance contract              | N/A - no AI component                                                                                                                                                                                                                                                           |
| Forbidden shortcuts                | no placeholder discovery, no unscoped inventory, no live AWS calls, no shell usage, no silently ignored unsupported resources                                                                                                                                                   |

## 6. Implementation Plan

1. Add failing discovery tests first.
2. Add discovery types and pure `discoverReconcileTargets()` implementation.
3. Add relationship metadata to `ReconcileTarget`.
4. Export the discovery surface.
5. Update README with a short discovery example.
6. Run validation and update this contract/workpad.

## 7. BDD Acceptance Scenarios

| Scenario                    | Category       | Given                                                       | When                                | Then                                                           | Evidence                                 |
| --------------------------- | -------------- | ----------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------- | ---------------------------------------- |
| state relationships         | happy path     | one state-owned, one state-missing, one cloud-only resource | discovery runs with explicit prefix | targets include distinct relationship labels                   | `packages/drift/tests/discovery.test.ts` |
| unscoped inventory rejected | invalid input  | state and cloud inventory but no selector                   | discovery runs                      | throws before returning targets                                | `packages/drift/tests/discovery.test.ts` |
| wrong account/region        | abuse case     | cloud inventory outside selector                            | discovery runs                      | out-of-scope resource is excluded with diagnostic              | `packages/drift/tests/discovery.test.ts` |
| too-new resource            | degraded state | cloud inventory newer than min age                          | discovery + plan run                | planner blocks with age guard                                  | `packages/drift/tests/discovery.test.ts` |
| singleton retained          | abuse case     | singleton resource in cloud inventory                       | discovery + plan run                | target relationship is `shared-singleton` and plan retains it  | `packages/drift/tests/discovery.test.ts` |
| unsupported reported        | degraded state | unsupported resource in cloud inventory                     | discovery + plan run                | target exists and planner reports retain/unsupported, not drop | `packages/drift/tests/discovery.test.ts` |

## 8. Validation Plan

| Check                           | Command / Action                                                                                                      | Expected Result                   | Actual Result                                                                      | Status  | Notes                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------- |
| Repo hygiene                    | `git status --short --branch && git rev-parse --abbrev-ref HEAD && git symbolic-ref --short refs/remotes/origin/HEAD` | task branch, default branch known | branch `ticket/94-discovery-decision-model`; default `origin/main`; clean at start | pass    |                                                                        |
| New tests fail first            | `pnpm --filter @hulumi/drift test -- tests/discovery.test.ts`                                                         | fails before implementation       | failed on missing `../src/discovery` module                                        | pass    |                                                                        |
| Formatter                       | `pnpm format:check`                                                                                                   | passes                            | passed                                                                             | pass    |                                                                        |
| Typecheck / build               | `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build`                                          | passes                            | passed                                                                             | pass    |                                                                        |
| Static analysis / lint          | `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`                 | passes                            | passed                                                                             | pass    |                                                                        |
| Unit / BDD tests                | `pnpm --filter @hulumi/drift test -- tests/discovery.test.ts tests/reconciler.test.ts`                                | passes                            | 13 tests passed                                                                    | pass    |                                                                        |
| Runtime validation              | inspect AWS/Pulumi env, run integration only if configured                                                            | pass or documented skip           | no AWS/Pulumi/Hulumi env present locally                                           | blocked | Pure discovery is unit-covered; real sandbox still needs OIDC workflow |
| Dependency / security audit     | `pnpm audit --prod`                                                                                                   | passes                            | passed                                                                             | pass    |                                                                        |
| Compatibility check             | `pnpm --filter @hulumi/drift test`                                                                                    | passes                            | 16 files passed, 73 tests passed                                                   | pass    |                                                                        |
| `.gitignore` / artifact cleanup | `git status --short`                                                                                                  | no stray generated artifacts      | only #94 source/docs files are dirty                                               | pass    |                                                                        |

## 9. Workpad / Tracker Updates

Workpad comment: https://github.com/kerberosmansour/hulumi/issues/94#issuecomment-4410150209

## 10. Self-Review Gate

- [x] Stayed inside the file allow-list.
- [x] Added focused BDD/unit tests first.
- [x] Preserved classifier compatibility.
- [x] Avoided live AWS mutation/enumeration.
- [x] Ran formatter, typecheck/build, static analysis, and full compatibility tests.
- [ ] Updated issue workpad evidence.

## 11. Closure Summary

### Completed

- Added `discoverReconcileTargets()` as a pure read-only discovery helper.
- Added Pulumi state export and caller-supplied cloud inventory types.
- Added relationship labels for `state-owned`, `state-missing`, `cloud-only`, `shared-singleton`, and `unknown`.
- Added explicit selector enforcement plus account/region/prefix/tag/type filtering diagnostics.
- Documented the discovery flow in `packages/drift/README.md`.

### Tests And Validation

- `pnpm --filter @hulumi/drift test -- tests/discovery.test.ts tests/reconciler.test.ts` - pass, 13 tests.
- `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build` - pass.
- `pnpm --filter @hulumi/drift test` - pass, 73 tests.
- `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard` - pass.
- `pnpm format:check` - pass.
- `pnpm audit --prod` - pass.
- Real-AWS runtime validation - blocked locally because no `AWS_*`, `PULUMI_*`, or `HULUMI_*` env vars are present; #94 is pure/read-only and should be exercised with sandbox inventory fixtures in later e2e work.
