# Region-Aware Probe Timeout - SLO Ticket Contract v1

## 1. Ticket Metadata

| Field                               | Value                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Ticket Contract ID                  | `ticket-20-region-aware-probe-timeout`                                                                 |
| Source tracker                      | `GitHub Issues`                                                                                        |
| Source issue                        | [#20](https://github.com/kerberosmansour/hulumi/issues/20)                                             |
| Issue title                         | `feat(drift): make probeTimeoutMs default region-aware (CloudTrail delivery latency varies)`           |
| Labels                              | `enhancement`, `drift`                                                                                 |
| Assignee / owner                    | `kerberosmansour`                                                                                      |
| Target branch                       | `ticket/20-region-aware-probe-timeout`                                                                 |
| Primary stack                       | TypeScript / Vitest                                                                                    |
| Default formatter command           | `pnpm format:check`                                                                                    |
| Default typecheck / build command   | `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build`                           |
| Default unit / BDD command          | `pnpm --filter @hulumi/drift test -- tests/probe-timeout-defaults.test.ts tests/probe-timeout.test.ts` |
| Default static analysis command     | `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`  |
| Public interfaces stable by default | additive only; optional `awsRegion` classifier/per-call config                                         |
| Allowed new dependencies by default | none                                                                                                   |
| Schema/config migration allowed     | no                                                                                                     |

## 2. Sizing Gate

| Check                                          | Answer                                                      |
| ---------------------------------------------- | ----------------------------------------------------------- |
| User-visible outcome fits in one sentence      | yes - default CloudTrail probe timeout varies by AWS region |
| Expected changed files <= 7                    | yes                                                         |
| New public surfaces <= 1                       | yes - optional `awsRegion` config                           |
| No schema migration unless explicitly approved | yes                                                         |
| No cross-subsystem rewrite                     | yes                                                         |
| Can be reviewed as one PR                      | yes                                                         |
| Requires full v4 runbook instead               | no                                                          |

## 3. Issue Context

`DriftClassifier.classify()` currently defaults `probeTimeoutMs` to `60_000` everywhere. Some AWS regions can have slower CloudTrail delivery, so the default should be derived from explicit region config or environment while preserving explicit `probeTimeoutMs` overrides.

## 4. Compact Architecture Delta

| Component         | Existing behavior                 | Change                                             | Interface / trust boundary touched |
| ----------------- | --------------------------------- | -------------------------------------------------- | ---------------------------------- |
| `ClassifyOptions` | `probeTimeoutMs` only             | optional per-call `awsRegion`                      | package API                        |
| `DriftClassifier` | hard-coded 60s fallback           | helper resolves explicit timeout, region, then env | no new trust boundary              |
| Docs              | one global 60s default documented | table documents region defaults and fallback order | public docs                        |

## 5. Contract Block

| Contract Row                       | Value                                                                                                                                                                                                                                                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inputs                             | #20 issue body, `packages/drift/src/classifier.ts`, `packages/drift/src/types.ts`, probe timeout tests, drift docs                                                                                                                                                                                             |
| Outputs                            | region-aware timeout resolver, tests, docs, issue workpad evidence                                                                                                                                                                                                                                             |
| Interfaces touched                 | additive `ClassifyOptions.awsRegion?: string`; additive `DriftClassifierArgs.awsRegion?: string`                                                                                                                                                                                                               |
| Files allowed to change            | `docs/slo/tickets/ticket-20-region-aware-probe-timeout.md`, `packages/drift/src/classifier.ts`, `packages/drift/src/types.ts`, `packages/drift/tests/probe-timeout-defaults.test.ts`, `packages/drift/tests/probe-timeout.test.ts`, `docs/components/drift-classifier.md`, `docs/cookbooks/drift-detection.md` |
| Files to read before changing      | `docs/ARCHITECTURE.md`, `packages/drift/src/classifier.ts`, `packages/drift/src/types.ts`, `packages/drift/src/probe.ts`, `packages/drift/tests/probe-timeout.test.ts`, `docs/components/drift-classifier.md`, `docs/cookbooks/drift-detection.md`                                                             |
| New files allowed                  | this ticket contract and `packages/drift/tests/probe-timeout-defaults.test.ts`                                                                                                                                                                                                                                 |
| New dependencies allowed           | none                                                                                                                                                                                                                                                                                                           |
| Migration allowed                  | no                                                                                                                                                                                                                                                                                                             |
| Compatibility commitments          | explicit `probeTimeoutMs` continues to win; default remains 60s for `us-east-1` and unknown regions                                                                                                                                                                                                            |
| Data classification                | Public; only region names and timeout numbers                                                                                                                                                                                                                                                                  |
| Proactive controls in play         | focused resolver tests, existing probe timeout tests, no source-level sleeps                                                                                                                                                                                                                                   |
| Abuse acceptance scenarios         | invalid/blank region falls back to 60s; env values do not override explicit options; explicit timeout overrides all defaults                                                                                                                                                                                   |
| Resource bounds introduced/changed | default timeout bounded to documented values; no unbounded wait introduced                                                                                                                                                                                                                                     |
| Invariants/assertions required     | no `setTimeout` / sleep added to source; `probeTimeoutMs` override behavior unchanged                                                                                                                                                                                                                          |
| Debugger / inspection expectation  | inspect resolver outputs and Vitest results                                                                                                                                                                                                                                                                    |
| Static analysis gates              | drift lint, no-shell/no-sleep test through package tests, license-boundary, exact-pin guard, formatter                                                                                                                                                                                                         |
| Reversibility / rollback path      | remove resolver and `awsRegion` fields; default returns to hard-coded `60_000`                                                                                                                                                                                                                                 |
| Exemplar code to copy              | existing `ClassifyOptions` additive pattern and probe timeout tests                                                                                                                                                                                                                                            |
| Anti-exemplar code not to copy     | no real sleeps in tests, no global mutation left behind, no exhaustive/unstable AWS region claim                                                                                                                                                                                                               |
| Refactoring discipline             | no broad classifier refactor                                                                                                                                                                                                                                                                                   |
| AI tolerance contract              | N/A - no AI component                                                                                                                                                                                                                                                                                          |
| Forbidden shortcuts                | no docs-only closure; no changing explicit timeout semantics; no live AWS calls                                                                                                                                                                                                                                |

## 6. Implementation Plan

1. Add failing resolver tests for explicit override, per-call region, constructor region, `AWS_REGION`, and fallback behavior.
2. Add additive `awsRegion` fields to classifier args/options.
3. Implement a small exported resolver used by `classify()`.
4. Document fallback order and region default table.
5. Run validation and update evidence.

## 7. BDD Acceptance Scenarios

| Scenario                   | Category      | Given                        | When          | Then                       | Evidence |
| -------------------------- | ------------- | ---------------------------- | ------------- | -------------------------- | -------- |
| explicit timeout wins      | regression    | timeout and region are set   | resolver runs | explicit timeout is used   | vitest   |
| per-call region default    | happy path    | `awsRegion=ap-southeast-3`   | resolver runs | 120s default is used       | vitest   |
| constructor region default | happy path    | classifier arg region is set | resolver runs | region default is used     | vitest   |
| environment fallback       | compatibility | `AWS_REGION` is set          | resolver runs | env region default is used | vitest   |
| unknown region fallback    | abuse case    | unknown or blank region      | resolver runs | 60s default is used        | vitest   |

## 8. Validation Plan

| Check                      | Command / Action                                                                                                      | Expected Result                      | Actual Result                                                                     | Status | Notes |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------- | ------ | ----- |
| Repo hygiene               | `git status --short --branch && git rev-parse --abbrev-ref HEAD && git symbolic-ref --short refs/remotes/origin/HEAD` | task branch, not default             | branch `ticket/20-region-aware-probe-timeout`; default `origin/main`; clean start | pass   |       |
| Baseline targeted test     | `pnpm --filter @hulumi/drift test -- tests/probe-timeout.test.ts`                                                     | baseline passes before edits         | passed; 2 tests                                                                   | pass   |       |
| New BDD pre-implementation | `pnpm --filter @hulumi/drift test -- tests/probe-timeout-defaults.test.ts`                                            | fails before resolver implementation | failed as expected; `resolveProbeTimeoutMs` missing                               | pass   |       |
| Targeted BDD               | `pnpm --filter @hulumi/drift test -- tests/probe-timeout-defaults.test.ts tests/probe-timeout.test.ts`                | passes                               | passed; 2 files / 7 tests                                                         | pass   |       |
| Drift package tests        | `pnpm --filter @hulumi/drift test`                                                                                    | passes                               | passed; 20 files / 88 tests                                                       | pass   |       |
| Typecheck / build          | `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build`                                          | passes                               | passed after exact-optional-property fix                                          | pass   |       |
| Static analysis / lint     | `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`                 | passes                               | passed after replacing `NodeJS.ProcessEnv` with plain record type                 | pass   |       |
| Formatter                  | `pnpm format:check`                                                                                                   | passes                               | passed after formatting contract/classifier                                       | pass   |       |

## 9. Workpad / Tracker Updates

Workpad comment: https://github.com/kerberosmansour/hulumi/issues/20#issuecomment-4410545735

## 10. Self-Review Gate

- [x] Stayed inside the file allow-list.
- [x] Added failing timeout-default tests before implementation.
- [x] Preserved explicit `probeTimeoutMs` override behavior.
- [x] Documented fallback order and region table.
- [x] Updated issue workpad evidence.

## 11. Closure Summary

### Completed

- Added optional `awsRegion` fields to `ClassifyOptions` and `DriftClassifierArgs`.
- Added `resolveProbeTimeoutMs()` with explicit-timeout, per-call region, constructor region, `AWS_REGION`, `AWS_DEFAULT_REGION`, and 60s fallback order.
- Added a documented region default table: standard 60s defaults, 90s for selected `ap-southeast-*` regions, and 120s for `ap-southeast-3`.
- Added `packages/drift/tests/probe-timeout-defaults.test.ts`.
- Updated component and cookbook docs.

### Tests And Validation

- `pnpm --filter @hulumi/drift test -- tests/probe-timeout.test.ts` - baseline pass, 2 tests.
- New timeout-default BDD before implementation - failed as expected.
- `pnpm --filter @hulumi/drift test -- tests/probe-timeout-defaults.test.ts tests/probe-timeout.test.ts tests/no-shell-exec.test.ts` - pass, 3 files / 9 tests.
- `pnpm --filter @hulumi/drift test` - pass, 20 files / 88 tests.
- `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build` - pass.
- `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard` - pass.
- `pnpm format:check` - pass.
