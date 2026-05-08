# Drift Classify Real-AWS Integration - SLO Ticket Contract v1

## 1. Ticket Metadata

| Field                               | Value                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Ticket Contract ID                  | `ticket-21-drift-classify-integration`                                                                                          |
| Source tracker                      | `GitHub Issues`                                                                                                                 |
| Source issue                        | [#21](https://github.com/kerberosmansour/hulumi/issues/21)                                                                      |
| Issue title                         | `test(drift): fill in tests/integration/drift-classify.integration.test.ts now that PULUMI_ACCESS_TOKEN is set`                 |
| Labels                              | `drift`, `integration-test`, `requires-token`, `tests`                                                                          |
| Assignee / owner                    | `kerberosmansour`                                                                                                               |
| Target branch                       | `ticket/21-drift-classify-integration`                                                                                          |
| Primary stack                       | TypeScript / Vitest / Pulumi Automation API / AWS SDK                                                                           |
| Default formatter command           | `pnpm format:check`                                                                                                             |
| Default typecheck / build command   | `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build`                                                    |
| Default static analysis command     | `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`                           |
| Default unit / BDD command          | `pnpm --filter @hulumi/drift test -- tests/integration/drift-classify.integration.test.ts`                                      |
| Default runtime validation command  | `HULUMI_INTEGRATION=1 pnpm --filter @hulumi/drift run test:integration -- tests/integration/drift-classify.integration.test.ts` |
| Default dependency / security audit | `pnpm run lint:exact-pin-guard`                                                                                                 |
| Public interfaces stable by default | yes - test/docs only; no package runtime API changes                                                                            |
| Allowed new dependencies by default | dev-only `@pulumi/aws@7.27.0` if required for the inline Pulumi fixture                                                         |
| Schema/config migration allowed     | no                                                                                                                              |

### Public interfaces that must remain stable unless explicitly listed otherwise

- `DriftClassifier.classify()`
- `AutomationApiAdapter`
- `CloudTrailAdapter`
- existing `HULUMI_INTEGRATION=1` integration-test gate

## 2. Sizing Gate

| Check                                          | Answer                                                        |
| ---------------------------------------------- | ------------------------------------------------------------- |
| User-visible outcome fits in one sentence      | yes - #21 gets one real-AWS drift-classify integration lane   |
| Expected changed files <= 8                    | yes                                                           |
| New public surfaces <= 1                       | yes - no runtime API; test env behavior only                  |
| No schema migration unless explicitly approved | yes                                                           |
| No cross-subsystem rewrite                     | yes                                                           |
| Can be reviewed as one PR                      | yes                                                           |
| Requires full v4 runbook instead               | no - scoped to one S3 console-drift lane plus cache-hit proof |

## 3. Issue Context

### Problem

`packages/drift/tests/integration/drift-classify.integration.test.ts` currently contains honest `it.todo(...)` slots. #21 asks for the first real body now that the Pulumi backend/token path is available: deploy a known fixture, mutate it out-of-band, classify it, and prove a second classification uses the cache.

### Acceptance Criteria From Issue

- [ ] Test body exercises the full real-AWS classification path against the sandbox account.
- [ ] Skipped by default unless `HULUMI_INTEGRATION=1`.
- [ ] Documented in `docs/integration-testing.md` cost contract row.

### Non-Goals

- Implementing provider-version drift as a separate live test.
- Implementing failure-injection teardown tests beyond cleanup around this fixture.
- Adding broad AWS cleanup or reconciler behavior.
- Changing `DriftClassifier` production behavior.

### Reproduction / Current Signal

| Signal            | Evidence                                                                 |
| ----------------- | ------------------------------------------------------------------------ |
| Current test file | four `it.todo(...)` slots plus the skip-gate invariant                   |
| Current result    | integration file does not classify any real AWS resource                 |
| Expected result   | gated real-AWS test creates a fixture, mutates it, classifies it, cleans |

## 4. Compact Architecture Delta

| Component                  | Existing behavior                      | Change                                                     | Interface / trust boundary touched |
| -------------------------- | -------------------------------------- | ---------------------------------------------------------- | ---------------------------------- |
| Drift integration test     | todo-only roadmap slots                | one gated S3/Pulumi/CloudTrail classification body         | sandbox AWS + Pulumi backend       |
| Weekly integration docs    | drift-classify remains roadmap-only    | cost/cleanup row documents the new drift-classify lane     | public docs                        |
| Drift package dev metadata | no direct `@pulumi/aws` dev dependency | dev-only dependency for inline Pulumi S3 fixture if needed | package test surface               |

### Data Flow Delta

```text
Vitest (HULUMI_INTEGRATION=1)
  -> Pulumi Automation API creates one versioned S3 bucket fixture
  -> AWS SDK mutates bucket tags outside Pulumi
  -> CloudTrail LookupEvents observes the mutation
  -> DriftClassifier.classify() returns ConsoleBreakGlass/high
  -> second classify() reads cache and does not call adapters again
  -> Pulumi destroy + workspace cleanup always run
```

## 5. Contract Block

| Contract Row                       | Value                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Inputs                             | #21 issue body/workpad, drift classifier/adapters, integration roadmap, weekly integration docs, existing AccountFoundation and reconciler integration patterns                                                                                                                                                                                                                                                                |
| Outputs                            | real-AWS drift classify test body, docs cost/cleanup updates, ticket evidence, PR                                                                                                                                                                                                                                                                                                                                              |
| Interfaces touched                 | test-only environment behavior; no runtime package API changes                                                                                                                                                                                                                                                                                                                                                                 |
| Files allowed to change            | `docs/slo/tickets/ticket-21-drift-classify-integration.md`, `packages/drift/tests/integration/drift-classify.integration.test.ts`, `packages/drift/package.json`, `pnpm-lock.yaml`, `docs/integration-testing.md`, `docs/integration-testing-roadmap.md`                                                                                                                                                                       |
| Files to read before changing      | `docs/ARCHITECTURE.md`, `docs/integration-testing.md`, `docs/integration-testing-roadmap.md`, `packages/drift/src/classifier.ts`, `packages/drift/src/adapters/automation-api.ts`, `packages/drift/src/adapters/cloudtrail.ts`, `packages/baseline/tests/integration/account-foundation.integration.test.ts`, `packages/drift/tests/integration/reconciler-s3.integration.test.ts`, `.github/workflows/weekly-integration.yml` |
| New files allowed                  | this ticket contract only                                                                                                                                                                                                                                                                                                                                                                                                      |
| New dependencies allowed           | dev-only `@pulumi/aws@7.27.0` in `@hulumi/drift` if needed                                                                                                                                                                                                                                                                                                                                                                     |
| Migration allowed                  | no                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Compatibility commitments          | normal PR/unit tests still skip live AWS; `HULUMI_INTEGRATION=1` remains the outer integration gate; cleanup runs on success and failure                                                                                                                                                                                                                                                                                       |
| Data classification                | Internal - live sandbox resource names exist only as ephemeral runtime values and must not be logged                                                                                                                                                                                                                                                                                                                           |
| Proactive controls in play         | OIDC/backend-only gating, bounded CloudTrail polling, no shell interpolation, Pulumi destroy in `afterAll`, redacted/no bucket-name logs, cache-hit call counters                                                                                                                                                                                                                                                              |
| Abuse acceptance scenarios         | missing backend skips visibly; weak/missing CloudTrail event fails rather than fabricating evidence; cache-hit proof rejects second adapter invocation                                                                                                                                                                                                                                                                         |
| Resource bounds introduced/changed | one S3 bucket per run, one tag mutation, bounded CloudTrail wait, bounded Pulumi work directory under test `.tmp`                                                                                                                                                                                                                                                                                                              |
| Invariants/assertions required     | second classify call must not run adapters; final cleanup removes Pulumi stack/workdir; docs explain cost/cleanup                                                                                                                                                                                                                                                                                                              |
| Debugger / inspection expectation  | inspect Vitest output and Pulumi/CloudTrail errors; no debugger required unless the live AWS run fails ambiguously                                                                                                                                                                                                                                                                                                             |
| Static analysis gates              | formatter, drift lint, typecheck/build, exact-pin guard, license-boundary                                                                                                                                                                                                                                                                                                                                                      |
| Reversibility / rollback path      | revert test body/docs/package metadata to todo-only roadmap state                                                                                                                                                                                                                                                                                                                                                              |
| Exemplar code to copy              | AccountFoundation integration gating/cleanup; reconciler S3 integration skip notice and no-secret logging                                                                                                                                                                                                                                                                                                                      |
| Anti-exemplar code not to copy     | previous tautological `expect(RUN_INTEGRATION).toBe(true)` coverage; console output containing bucket names, account IDs, backend URLs, or secrets                                                                                                                                                                                                                                                                             |
| Refactoring discipline             | no classifier or adapter refactor; integration harness only                                                                                                                                                                                                                                                                                                                                                                    |
| AI tolerance contract              | N/A - no AI component                                                                                                                                                                                                                                                                                                                                                                                                          |
| Forbidden shortcuts                | no mock-only replacement for real-AWS acceptance; no destructive resource without `afterAll` cleanup; no static AWS credentials; no skipping the cache-hit assertion                                                                                                                                                                                                                                                           |

## 6. Implementation Plan

1. Run repo hygiene and baseline drift integration command on the task branch.
2. Add the real-AWS integration harness in the existing #21 file.
3. Confirm the new harness skips visibly without `HULUMI_INTEGRATION=1` / backend.
4. Add docs updates for the new drift-classify cost/cleanup row.
5. Add exact-pinned dev dependency only if the inline Pulumi fixture needs it.
6. Run formatter, typecheck/build, lint/static gates, and local gated validation.
7. Record that live AWS execution is deferred unless credentials are available.
8. Update workpad and open PR.

## 7. BDD Acceptance Scenarios

| Scenario                 | Category               | Given                                     | When                              | Then                                     | Evidence          |
| ------------------------ | ---------------------- | ----------------------------------------- | --------------------------------- | ---------------------------------------- | ----------------- |
| console drift classified | happy path             | Pulumi-created S3 bucket and tag mutation | `DriftClassifier.classify()` runs | `ConsoleBreakGlass/high`                 | live-gated vitest |
| cache hit short-circuits | compatibility          | first verdict is cached                   | `classify()` is called again      | adapter/probe counters do not increase   | live-gated vitest |
| missing integration env  | empty / degraded state | `HULUMI_INTEGRATION` or backend is absent | local integration command runs    | suite emits visible skip notice          | local vitest      |
| CloudTrail not delivered | abuse case             | mutation event never appears in budget    | poll expires                      | test fails with precise non-secret error | live-gated vitest |

## 8. Validation Plan

| Check                         | Command / Action                                                                                                                | Expected Result                     | Actual Result                                                                                                  | Status  | Notes                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------- |
| Repo hygiene                  | `git status --short --branch && git rev-parse --abbrev-ref HEAD && git symbolic-ref --short refs/remotes/origin/HEAD`           | task branch, not default            | branch `ticket/21-drift-classify-integration`; default `origin/main`; only ticket file untracked at planning   | pass    | branch was fast-forwarded to merged #102 before final validation |
| Baseline integration behavior | `pnpm --filter @hulumi/drift run test:integration -- tests/integration/drift-classify.integration.test.ts`                      | skips/todos without live env        | passed before edits; 1 passing gate invariant, 2 skipped, 4 todo across drift/reconciler integration files     | pass    | baseline captured                                                |
| New BDD pre-live check        | `pnpm --filter @hulumi/drift run test:integration -- tests/integration/drift-classify.integration.test.ts`                      | visible skip when env absent        | passed after implementation; 1 pass, 4 skipped, 2 todo                                                         | pass    | local env has no Pulumi/AWS backend                              |
| Targeted integration command  | `HULUMI_INTEGRATION=1 pnpm --filter @hulumi/drift run test:integration -- tests/integration/drift-classify.integration.test.ts` | skips if backend/AWS unavailable    | passed; 1 pass, 4 skipped, 2 todo                                                                              | pass    | confirms backend gate                                            |
| Drift package tests           | `pnpm --filter @hulumi/drift test`                                                                                              | passes                              | passed; 20 files / 88 tests                                                                                    | pass    |                                                                  |
| Typecheck / build             | `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build`                                                    | passes                              | passed after fast-forwarding branch to include #102 classifier types                                           | pass    |                                                                  |
| Static analysis / lint        | `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`                           | passes                              | passed; license-boundary OK; exact-pin guard OK                                                                | pass    |                                                                  |
| Formatter                     | `pnpm format:check`                                                                                                             | passes                              | passed after formatting ticket/test/roadmap                                                                    | pass    |                                                                  |
| Live AWS validation           | GitHub weekly/manual integration with `HULUMI_INTEGRATION=1` and backend configured                                             | green and sandbox resources cleaned | not run locally                                                                                                | skipped | current shell does not expose Pulumi/AWS credentials             |
| Artifact cleanup              | `git status --short`                                                                                                            | no stray Pulumi/cache artifacts     | only intended source/docs/package/lock/ticket changes; no `.tmp`, `.pulumi`, or drift-cache artifacts observed | pass    |                                                                  |

## 9. Workpad / Tracker Updates

Workpad comment: https://github.com/kerberosmansour/hulumi/issues/21#issuecomment-4410577061

## 10. Self-Review Gate

- [x] Stayed inside the file allow-list.
- [x] Added/updated BDD integration behavior before production changes.
- [x] Confirmed local skip behavior before claiming live behavior.
- [x] Preserved public runtime interfaces.
- [x] Added cleanup around every live AWS resource.
- [x] Bounded CloudTrail polling and resource count.
- [x] Ran formatter, typecheck/build, and static analysis.
- [x] Avoided logging secrets, account IDs, backend URLs, bucket names, or object keys.
- [x] Recorded evidence rather than claims.
- [ ] Updated the issue workpad and PR handoff notes.

## 11. Closure Summary

### Completed

- Replaced the console-drift/cache TODO slots with one gated real-AWS S3 fixture test.
- The test deploys a Pulumi-managed S3 bucket, mutates tags through AWS SDK, waits for CloudTrail, asserts `ConsoleBreakGlass / high`, and proves the second `classify()` call is cache-served.
- Added cleanup via `Stack.destroy()`, `removeStack()`, and local workdir removal in `afterAll`.
- Updated integration docs and roadmap status.
- Added exact-pinned dev-only `@pulumi/aws@7.27.0` to `@hulumi/drift`.

### Tests And Validation

- `pnpm --filter @hulumi/drift run test:integration -- tests/integration/drift-classify.integration.test.ts` - pass locally with live body skipped, 1 pass / 4 skipped / 2 todo.
- `HULUMI_INTEGRATION=1 pnpm --filter @hulumi/drift run test:integration -- tests/integration/drift-classify.integration.test.ts` - pass locally with backend-gated live body skipped, 1 pass / 4 skipped / 2 todo.
- `pnpm --filter @hulumi/drift test` - pass, 20 files / 88 tests.
- `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build` - pass.
- `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard` - pass.
- `pnpm format:check` - pass.

### Lessons / Follow-Ups

- Local validation can only prove skip/gating behavior without Pulumi/AWS credentials. The PR should be verified by the GitHub sandbox integration path before closing #21.
- Provider-version and failure-injection drift scenarios remain explicit roadmap TODOs.

### PR / Issue Links

- PR: pending
- Issue: https://github.com/kerberosmansour/hulumi/issues/21
