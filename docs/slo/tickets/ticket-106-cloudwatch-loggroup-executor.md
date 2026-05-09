# CloudWatch Log Group Reconciler Executor - SLO Ticket Contract v1

> **Purpose**: Execute one issue-sized change with v4 SLO rigor, without requiring a full multi-milestone runbook.
> **Audience**: AI coding agents first, humans second.
> **Source template**: Derived from `docs/slo/templates/runbook-template_v_4_template.md`. Use the full v4 runbook when this contract cannot stay issue-sized.

---

## 1. Ticket Metadata

| Field                                       | Value                                                                                                                                                                       |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ticket Contract ID                          | `ticket-106-cloudwatch-loggroup-executor`                                                                                                                                   |
| Source tracker                              | `GitHub Issues`                                                                                                                                                             |
| Source issue                                | [#106](https://github.com/kerberosmansour/hulumi/issues/106)                                                                                                                |
| Issue title                                 | `feat(drift): implement first non-S3 AWS executor with guarded idempotent cleanup`                                                                                          |
| Labels                                      | `drift`, `integration-test`, `aws`, `cleanup`                                                                                                                               |
| Assignee / owner                            | `kerberosmansour`                                                                                                                                                           |
| Target branch                               | `ticket/106-cloudwatch-loggroup-executor`                                                                                                                                   |
| Primary stack                               | TypeScript, AWS SDK v3, pnpm, Vitest                                                                                                                                        |
| Default formatter command                   | `pnpm format:check`                                                                                                                                                         |
| Default typecheck / build command           | `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build`                                                                                                |
| Default static analysis / lint command      | `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`                                                                       |
| Default unit / BDD command                  | `pnpm --filter @hulumi/drift test -- tests/cloudwatch-log-group-executor.test.ts tests/execution.test.ts tests/s3-sweeper.test.ts tests/reconciler-action-families.test.ts` |
| Default runtime validation command          | `pnpm --filter @hulumi/drift run test:integration -- tests/integration/reconciler-cloudwatch-log-group.integration.test.ts`                                                 |
| Default dependency / security audit command | `pnpm run lint:exact-pin-guard`                                                                                                                                             |
| Default debugger or state-inspection tool   | `git diff -- packages/drift/src/adapters/cloudwatch-log-group.ts packages/drift/tests/cloudwatch-log-group-executor.test.ts`                                                |
| Public interfaces stable by default         | yes                                                                                                                                                                         |
| Allowed new dependencies by default         | one exact-pinned AWS SDK client for CloudWatch Logs                                                                                                                         |
| Schema/config migration allowed by default  | no                                                                                                                                                                          |

### Public interfaces that must remain stable unless explicitly listed otherwise

- Existing `S3SweeperExecutor` behavior and exports remain unchanged.
- `OrphanReconciler.execute()` remains confirmation-token and allow-list gated.
- Additive export of `CloudWatchLogGroupExecutor` is allowed.

---

## 2. Sizing Gate

| Check                                          | Answer                                                        |
| ---------------------------------------------- | ------------------------------------------------------------- |
| User-visible outcome fits in one sentence      | yes - execute one CloudWatch log group cleanup family safely  |
| Expected changed files <= 8                    | yes                                                           |
| New public surfaces <= 1                       | yes - one executor export                                     |
| No schema migration unless explicitly approved | yes                                                           |
| No cross-subsystem rewrite                     | yes                                                           |
| Can be reviewed as one PR                      | yes                                                           |
| Requires full v4 runbook instead               | no - narrow resource family and double-gated live integration |

---

## 3. Issue Context

### Problem

Issue #106 asks for the first non-S3 AWS cleanup executor as the pattern for later families. The chosen first candidate is CloudWatch Logs log groups because deletion is narrow, idempotent, and already represented by #105 as `deleteCloudWatchLogGroup`.

### Acceptance Criteria From Issue

- [ ] Executor is opt-in and only runs with explicit execute mode + confirmation token + allow list.
- [ ] No broad delete permissions or wildcard target behavior.
- [ ] Results remain resumable/idempotent and redacted.
- [ ] Existing S3 executor behavior remains unchanged.

### Non-Goals

- No additional non-S3 executor families beyond CloudWatch Logs log groups.
- No IAM policy authoring.
- No always-on real AWS test; live AWS remains explicitly gated and cleans up after itself.
- No broad wildcard deletion or discovery expansion.

### Reproduction / Current Signal

| Signal           | Evidence                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline command | `pnpm --filter @hulumi/drift test -- tests/s3-sweeper.test.ts tests/execution.test.ts tests/reconciler-action-families.test.ts`        |
| Current result   | pass before edits; `deleteCloudWatchLogGroup` plans are non-executable without an executor                                             |
| Expected result  | a registered CloudWatch Logs executor makes scoped log group plans executable and idempotently deletes or reports already-absent state |

---

## 4. Compact Architecture Delta

| Component                           | Existing behavior                 | Change                                                                         | Interface / trust boundary touched       |
| ----------------------------------- | --------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------- |
| `packages/drift/src/adapters/`      | S3 is the only cleanup executor   | Add CloudWatch log group executor with prefix guard and re-check before delete | AWS SDK CloudWatch Logs client           |
| `packages/drift/src/index.ts`       | Exports S3 executor               | Export CloudWatch log group executor                                           | Public TypeScript API                    |
| `packages/drift/tests/integration/` | S3 real-AWS proof is double-gated | Add double-gated CloudWatch Logs proof with cleanup                            | Live AWS sandbox when explicitly enabled |

### Data Flow Delta

```text
OrphanReconciler.plan(deleteCloudWatchLogGroup target)
  -> executor registered
  -> execute(confirmToken + allow deleteCloudResource)
  -> DescribeLogGroups exact re-check
  -> DeleteLogGroup or alreadyAbsent success
```

---

## 5. Contract Block

| Contract Row                       | Value                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inputs                             | Issue #106, #105 action-family planning, S3 executor pattern, AWS SDK v3 CloudWatch Logs client                                                                                                                                                                                                                                                                                           |
| Outputs                            | Ticket contract, executor, unit tests, gated integration skip/proof, dependency pin updates, PR                                                                                                                                                                                                                                                                                           |
| Interfaces touched                 | Additive `CloudWatchLogGroupExecutor` export, `@aws-sdk/client-cloudwatch-logs` dependency                                                                                                                                                                                                                                                                                                |
| Files allowed to change            | `docs/slo/tickets/ticket-106-cloudwatch-loggroup-executor.md`, `packages/drift/src/adapters/cloudwatch-log-group.ts`, `packages/drift/src/index.ts`, `packages/drift/tests/cloudwatch-log-group-executor.test.ts`, `packages/drift/tests/integration/reconciler-cloudwatch-log-group.integration.test.ts`, `packages/drift/package.json`, `pnpm-lock.yaml`, `scripts/exact-pin-guard.mjs` |
| Files to read before changing      | `docs/ARCHITECTURE.md`, `packages/drift/src/reconciler.ts`, `packages/drift/src/adapters/s3-sweeper.ts`, `packages/drift/tests/s3-sweeper.test.ts`, `packages/drift/tests/integration/reconciler-s3.integration.test.ts`, `packages/drift/package.json`, `scripts/exact-pin-guard.mjs`                                                                                                    |
| New files allowed                  | `packages/drift/src/adapters/cloudwatch-log-group.ts`, `packages/drift/tests/cloudwatch-log-group-executor.test.ts`, `packages/drift/tests/integration/reconciler-cloudwatch-log-group.integration.test.ts`                                                                                                                                                                               |
| New dependencies allowed           | `@aws-sdk/client-cloudwatch-logs` exact-pinned to the same AWS SDK version family as existing drift clients                                                                                                                                                                                                                                                                               |
| Migration allowed                  | no                                                                                                                                                                                                                                                                                                                                                                                        |
| Compatibility commitments          | Existing S3 executor tests remain green; planner still blocks CloudWatch executor unless registered; no live AWS mutation unless integration env vars are set                                                                                                                                                                                                                             |
| Data classification                | Public                                                                                                                                                                                                                                                                                                                                                                                    |
| Proactive controls in play         | Prefix validation, exact resource re-check, idempotent absent handling, redacted counts-only results, double-gated integration                                                                                                                                                                                                                                                            |
| Abuse acceptance scenarios         | BDD rows below cover wrong-prefix rejection and wildcard constructor rejection                                                                                                                                                                                                                                                                                                            |
| Resource bounds introduced/changed | One Describe request plus one Delete request per action; no pagination beyond exact-prefix re-check                                                                                                                                                                                                                                                                                       |
| Invariants/assertions required     | Physical ID must start with expected prefix; action type must be `deleteCloudWatchLogGroup`; recommended decision must be `deleteCloudResource`; result must not contain physical ID or account ID                                                                                                                                                                                        |
| Debugger / inspection expectation  | Use `git diff` and targeted Vitest output; no interactive debugger required                                                                                                                                                                                                                                                                                                               |
| Static analysis gates              | Formatter, TypeScript typecheck/build, ESLint, license-boundary lint, exact-pin guard                                                                                                                                                                                                                                                                                                     |
| Reversibility / rollback path      | Revert this branch; no persisted state migration                                                                                                                                                                                                                                                                                                                                          |
| Exemplar code to copy              | `packages/drift/src/adapters/s3-sweeper.ts` and its tests                                                                                                                                                                                                                                                                                                                                 |
| Anti-exemplar code not to copy     | No wildcard prefix acceptance, no direct logging of AWS identifiers, no broad inventory delete loop                                                                                                                                                                                                                                                                                       |
| Refactoring discipline             | No broad refactor; only additive executor/export/dependency work                                                                                                                                                                                                                                                                                                                          |
| AI tolerance contract              | N/A - no AI component                                                                                                                                                                                                                                                                                                                                                                     |
| Forbidden shortcuts                | No placeholder executor, no unguarded delete, no broad prefix, no unredacted result messages, no always-on AWS integration                                                                                                                                                                                                                                                                |

---

## 6. Implementation Plan

1. Confirm repo hygiene and baseline tests.
2. Add BDD unit tests for success, already-absent, wrong-prefix rejection, SDK failure via reconciler redaction, and opt-in execution gating.
3. Add a gated integration test that visibly skips unless both integration flags are set.
4. Run new tests before implementation and confirm expected missing-module/export failure.
5. Add the exact-pinned AWS SDK dependency and exact-pin guard entry.
6. Implement the CloudWatch log group executor and export it.
7. Run targeted tests, full drift tests, typecheck/build, static gates, and formatter.
8. Fill evidence, update workpad, and hand off PR.

---

## 7. BDD Acceptance Scenarios

| Scenario                              | Category               | Given                                                                                      | When                                                                                 | Then                                                                                                                     | Evidence                                              |
| ------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| deletes scoped log group              | happy path             | executable `deleteCloudWatchLogGroup` action with exact prefix and fake existing log group | executor runs through `OrphanReconciler.execute()` with confirm token and allow list | describe then delete commands are sent and result reports counts only                                                    | `cloudwatch-log-group-executor.test.ts`               |
| absent log group is success           | empty / degraded state | fake SDK reports resource not found during re-check                                        | executor runs                                                                        | result succeeds with `alreadyAbsent: 1` and no identifier leakage                                                        | `cloudwatch-log-group-executor.test.ts`               |
| wrong prefix is blocked               | invalid input          | action physical ID is outside expected prefix or constructor prefix is broad               | executor is created or run                                                           | broad prefix throws; wrong target returns blocked without SDK mutation                                                   | `cloudwatch-log-group-executor.test.ts`               |
| SDK failure is redacted by reconciler | abuse case             | fake SDK throws an error containing the physical ID                                        | execution catches executor failure                                                   | result status is failed with generic redacted message                                                                    | `cloudwatch-log-group-executor.test.ts`               |
| live AWS proof is gated and clean     | runtime                | integration env vars and sandbox credentials are absent or present                         | integration suite runs                                                               | skipped visibly when absent; creates and deletes one scoped log group when present; `afterAll` cleanup removes leftovers | `reconciler-cloudwatch-log-group.integration.test.ts` |

---

## 8. Validation Plan

| Check                            | Command / Action                                                                                                                                                            | Expected Result                                                         | Actual Result                                                                                       | Status | Notes                    |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------ | ------------------------ |
| Repo hygiene                     | `git status --short --branch && git rev-parse --abbrev-ref HEAD && git symbolic-ref --short refs/remotes/origin/HEAD`                                                       | branch `ticket/106-cloudwatch-loggroup-executor`, default `origin/main` | branch `ticket/106-cloudwatch-loggroup-executor`, default `origin/main`; clean before contract edit | pass   |                          |
| Baseline before change           | `pnpm --filter @hulumi/drift test -- tests/s3-sweeper.test.ts tests/execution.test.ts tests/reconciler-action-families.test.ts`                                             | passes                                                                  | pass, 3 files / 11 tests                                                                            | pass   | before executor edits    |
| New tests fail first             | `pnpm --filter @hulumi/drift test -- tests/cloudwatch-log-group-executor.test.ts`                                                                                           | fails for missing executor/export/dependency                            | failed as expected: missing `@aws-sdk/client-cloudwatch-logs` before dependency/executor work       | pass   |                          |
| Formatter                        | `pnpm format:check`                                                                                                                                                         | passes                                                                  | pass after formatting touched files                                                                 | pass   |                          |
| Typecheck / build                | `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build`                                                                                                | passes                                                                  | pass                                                                                                | pass   |                          |
| Static analysis / lint           | `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`                                                                       | passes                                                                  | pass; license-boundary OK; exact-pin guard OK with 12 pinned deps                                   | pass   |                          |
| Unit / BDD tests                 | `pnpm --filter @hulumi/drift test -- tests/cloudwatch-log-group-executor.test.ts tests/execution.test.ts tests/s3-sweeper.test.ts tests/reconciler-action-families.test.ts` | passes                                                                  | pass, 4 files / 15 tests                                                                            | pass   |                          |
| Runtime validation               | `pnpm --filter @hulumi/drift run test:integration -- tests/integration/reconciler-cloudwatch-log-group.integration.test.ts`                                                 | passes or visible skip                                                  | pass with visible skip; AWS mutation tests skipped because integration env vars were not set        | pass   | double-gated live AWS    |
| Drift package tests              | `pnpm --filter @hulumi/drift test`                                                                                                                                          | passes                                                                  | pass, 23 files / 101 tests                                                                          | pass   |                          |
| Dependency / security audit      | `pnpm run lint:exact-pin-guard`                                                                                                                                             | passes                                                                  | pass, `@aws-sdk/client-cloudwatch-logs@3.1045.0` integrity recorded                                 | pass   | new AWS SDK pin recorded |
| Resource bound / invariant check | assertions in `cloudwatch-log-group-executor.test.ts`                                                                                                                       | one describe and one delete; wrong prefix blocks before SDK call        | pass; scoped delete sends Describe then Delete; wrong-prefix action sends no SDK commands           | pass   |                          |
| Compatibility check              | existing S3/execution/action-family tests in targeted command                                                                                                               | passes                                                                  | pass, existing S3 executor and action-family tests remain green                                     | pass   |                          |
| `.gitignore` / artifact cleanup  | `git status --short`                                                                                                                                                        | no stray artifacts                                                      | only allow-listed contract/source/test/dependency files changed                                     | pass   |                          |

---

## 9. Workpad / Tracker Updates

Use issue comment `https://github.com/kerberosmansour/hulumi/issues/106#issuecomment-4410836654` as the persistent workpad.

---

## 10. Self-Review Gate

- [x] Did I stay inside the file allow-list?
- [x] Did I write or update BDD tests before production code?
- [x] Did I confirm new tests failed for the right reason before implementing?
- [x] Did I preserve public interfaces unless explicitly allowed to change them?
- [x] Did I add or strengthen assertions/invariants where the contract required them?
- [x] Did I bound new resource growth or document why no bound applies?
- [x] Did I run formatter, typecheck/build, and static analysis?
- [x] Did I use a debugger or state-inspection tool when failure evidence was ambiguous?
- [x] Did I remove temporary proof edits, debug output, and placeholder logic?
- [x] Did I record evidence rather than claims?
- [x] Did I update the issue workpad and PR handoff notes?

---

## 11. Closure Summary

### Completed

- Added `CloudWatchLogGroupExecutor` for the `deleteCloudWatchLogGroup` action family.
- Added exact-prefix validation, exact re-check with `DescribeLogGroups`, idempotent already-absent success, and counts-only results.
- Exported the executor from `@hulumi/drift`.
- Added exact-pinned `@aws-sdk/client-cloudwatch-logs@3.1045.0` and recorded its integrity in `scripts/exact-pin-guard.mjs`.
- Added unit BDD coverage plus a double-gated real-AWS integration proof with cleanup.

### Tests And Validation

- `pnpm --filter @hulumi/drift test -- tests/cloudwatch-log-group-executor.test.ts`: failed before implementation for missing dependency/executor, then passed 4 tests.
- `pnpm --filter @hulumi/drift test -- tests/cloudwatch-log-group-executor.test.ts tests/execution.test.ts tests/s3-sweeper.test.ts tests/reconciler-action-families.test.ts`: pass, 4 files / 15 tests.
- `pnpm --filter @hulumi/drift run test:integration -- tests/integration/reconciler-cloudwatch-log-group.integration.test.ts`: pass with visible skip for live AWS mutation because integration env vars were not set.
- `pnpm --filter @hulumi/drift test`: pass, 23 files / 101 tests.
- `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build`: pass.
- `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`: pass.
- `pnpm format:check`: pass.

### Lessons / Follow-Ups

- Live AWS mutation remains double-gated and was not run in this local environment, so no AWS resources were created by this verification pass.
- #107 should broaden real-AWS coverage once the sequence reaches the integration-focused ticket.

### PR / Issue Links

- PR: Pending.
- Issue: https://github.com/kerberosmansour/hulumi/issues/106
