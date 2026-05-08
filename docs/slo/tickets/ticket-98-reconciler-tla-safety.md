# Reconciler TLA Safety Model - SLO Ticket Contract v1

## 1. Ticket Metadata

| Field                               | Value                                                                                                                   |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Ticket Contract ID                  | `ticket-98-reconciler-tla-safety`                                                                                       |
| Source tracker                      | `GitHub Issues`                                                                                                         |
| Source issue                        | [#98](https://github.com/kerberosmansour/hulumi/issues/98)                                                              |
| Issue title                         | `spec(drift): add TLA+ safety model for guarded reconciler state transitions`                                           |
| Labels                              | `enhancement`, `drift`, `tla-relevant`, `reliability`, `cleanup`                                                        |
| Target branch                       | `ticket/98-reconciler-tla-safety`                                                                                       |
| Primary stack                       | TLA+ / TypeScript alignment                                                                                             |
| Default formatter command           | `pnpm format:check`                                                                                                     |
| Default typecheck / build command   | `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build`                                            |
| Default unit / BDD command          | `pnpm --filter @hulumi/drift test -- tests/tla-alignment.test.ts`                                                       |
| Default runtime validation command  | `cd docs/TLAdocs/hulumi && java -jar "$HOME/.sldo/tla/tla2tools.jar" HulumiReconciler.tla -config HulumiReconciler.cfg` |
| Public interfaces stable by default | yes                                                                                                                     |
| Allowed new dependencies by default | none                                                                                                                    |

## 2. Sizing Gate

| Check                                          | Answer                                                                              |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| User-visible outcome fits in one sentence      | yes - the guarded reconciler has a checked safety model before broader execute mode |
| Expected changed files <= 8                    | yes                                                                                 |
| New public surfaces <= 1                       | yes - exported state-name tuple for alignment                                       |
| No schema migration unless explicitly approved | yes                                                                                 |
| No cross-subsystem rewrite                     | yes                                                                                 |
| Can be reviewed as one PR                      | yes                                                                                 |
| Requires full v4 runbook instead               | no                                                                                  |

## 3. Issue Context

The reconciler now has discovery, planning, execution locking, a gated real-AWS S3 proof, and protected workflow docs. Before enabling broader destructive execution, its state transitions need a checked safety model.

## 4. Contract Block

| Contract Row                       | Value                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inputs                             | #98 issue, existing reconciler API, `/slo-tla` workflow                                                                                                                                                                                                                                                                                                                       |
| Outputs                            | TLA+ spec/config, verified summary, TS state alignment test, issue workpad update                                                                                                                                                                                                                                                                                             |
| Interfaces touched                 | exported `RECONCILER_RESOURCE_STATES` names only                                                                                                                                                                                                                                                                                                                              |
| Files allowed to change            | `docs/slo/tickets/ticket-98-reconciler-tla-safety.md`, `docs/TLAdocs/hulumi/HulumiReconciler.tla`, `docs/TLAdocs/hulumi/HulumiReconciler.cfg`, `docs/TLAdocs/hulumi/HulumiReconciler-verified.md`, `packages/drift/src/reconciler.ts`, `packages/drift/src/index.ts`, `packages/drift/tests/tla-alignment.test.ts`, `packages/drift/README.md`, `docs/integration-testing.md` |
| New files allowed                  | this contract, TLA+ spec/config/verified summary                                                                                                                                                                                                                                                                                                                              |
| New dependencies allowed           | none                                                                                                                                                                                                                                                                                                                                                                          |
| Migration allowed                  | no                                                                                                                                                                                                                                                                                                                                                                            |
| Compatibility commitments          | no behavior changes to planning or execution                                                                                                                                                                                                                                                                                                                                  |
| Data classification                | Public; no cloud identifiers                                                                                                                                                                                                                                                                                                                                                  |
| Proactive controls in play         | bounded model checking, TS/spec state-name alignment                                                                                                                                                                                                                                                                                                                          |
| Abuse acceptance scenarios         | dry-run mutation, blocked deletion, out-of-scope deletion, singleton deletion, retry widening                                                                                                                                                                                                                                                                                 |
| Resource bounds introduced/changed | TLA model bounded to four resources and two modes                                                                                                                                                                                                                                                                                                                             |
| Invariants/assertions required     | invariants from #98 acceptance criteria                                                                                                                                                                                                                                                                                                                                       |
| Static analysis gates              | formatter, typecheck/build, drift tests                                                                                                                                                                                                                                                                                                                                       |
| Reversibility / rollback path      | remove model docs and state-name export                                                                                                                                                                                                                                                                                                                                       |
| Forbidden shortcuts                | no unverified "model exists" doc; TLC must pass at declared bounds                                                                                                                                                                                                                                                                                                            |

## 5. BDD Acceptance Scenarios

| Scenario             | Category   | Given                     | When                            | Then                                          | Evidence      |
| -------------------- | ---------- | ------------------------- | ------------------------------- | --------------------------------------------- | ------------- |
| dry-run safety       | abuse case | mode `Plan`               | TLC explores transitions        | no new `Deleted` or `Executing` state appears | TLC invariant |
| execute scope safety | abuse case | out-of-scope resource     | TLC explores delete transitions | resource cannot become newly deleted          | TLC invariant |
| ownership threshold  | abuse case | insufficient evidence     | TLC explores delete transitions | resource cannot become newly deleted          | TLC invariant |
| singleton retention  | abuse case | singleton delete disabled | TLC explores transitions        | singleton cannot become deleted               | TLC invariant |
| retry idempotence    | regression | already-deleted resource  | TLC explores retry stutter      | status remains `Deleted`                      | TLC invariant |
| TS/model alignment   | regression | exported TS state names   | unit test parses model          | arrays match exactly                          | vitest        |

## 6. Validation Plan

| Check                   | Command / Action                                                                                                        | Expected Result          | Actual Result                                            | Status | Notes                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------- | ------ | ---------------------------- |
| Repo hygiene            | `git status --short --branch`                                                                                           | task branch, clean start | branch `ticket/98-reconciler-tla-safety`; clean at start | pass   |                              |
| JVM / TLC prerequisites | `which java && test -f "$HOME/.sldo/tla/tla2tools.jar"`                                                                 | present                  | present                                                  | pass   | jar SHA-256 captured locally |
| TLC model check         | `cd docs/TLAdocs/hulumi && java -jar "$HOME/.sldo/tla/tla2tools.jar" HulumiReconciler.tla -config HulumiReconciler.cfg` | no invariant violations  | passed; 318 states generated, 72 distinct, depth 8       | pass   |                              |
| TS/model alignment      | `pnpm --filter @hulumi/drift test -- tests/tla-alignment.test.ts`                                                       | passes                   | passed; 4 tests                                          | pass   |                              |
| Typecheck / build       | `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build`                                            | passes                   | passed                                                   | pass   |                              |
| Drift package tests     | `pnpm --filter @hulumi/drift test`                                                                                      | passes                   | passed; 17 files, 78 tests                               | pass   |                              |
| Static analysis / lint  | `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`                   | passes                   | passed                                                   | pass   |                              |
| Dependency audit        | `pnpm audit --prod`                                                                                                     | passes                   | passed; no known vulnerabilities                         | pass   |                              |
| Formatter               | `pnpm format:check`                                                                                                     | passes                   | passed after formatting new markdown files               | pass   |                              |

## 7. Workpad / Tracker Updates

Workpad comment: https://github.com/kerberosmansour/hulumi/issues/98#issuecomment-4410250325

## 8. Self-Review Gate

- [x] Stayed inside the file allow-list.
- [x] TLC passed at declared bounds.
- [x] TypeScript alignment test passed.
- [x] Verified summary names the model bounds and invariants.
- [x] Updated issue workpad evidence.

## 9. Closure Summary

### Completed

- Added `docs/TLAdocs/hulumi/HulumiReconciler.tla` and `HulumiReconciler.cfg`.
- Added `docs/TLAdocs/hulumi/HulumiReconciler-verified.md` with model bounds and checked invariants.
- Exported `RECONCILER_RESOURCE_STATES` for implementation/model alignment.
- Extended `packages/drift/tests/tla-alignment.test.ts` to compare exported state names with the TLA+ `States` set.
- Linked broad execute-mode work to the model from `packages/drift/README.md` and `docs/integration-testing.md`.

### Tests And Validation

- TLC2 `2026.04.22.172729` - pass, 318 states generated, 72 distinct states, depth 8, no invariant violations.
- `pnpm --filter @hulumi/drift test -- tests/tla-alignment.test.ts` - pass, 4 tests.
- `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build` - pass.
- `pnpm --filter @hulumi/drift test` - pass, 17 files / 78 tests.
- `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard` - pass.
- `pnpm format:check` - pass after formatting new markdown files.
- `pnpm audit --prod` - pass, no known vulnerabilities.
