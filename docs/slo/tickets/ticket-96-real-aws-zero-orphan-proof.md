# Real-AWS Reconciler Zero-Orphan Proof - SLO Ticket Contract v1

## 1. Ticket Metadata

| Field                                       | Value                                                                                                       |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Ticket Contract ID                          | `ticket-96-real-aws-zero-orphan-proof`                                                                      |
| Source tracker                              | `GitHub Issues`                                                                                             |
| Source issue                                | [#96](https://github.com/kerberosmansour/hulumi/issues/96)                                                  |
| Issue title                                 | `test(drift): add real-AWS reconciler e2e coverage and zero-orphan cleanup proof`                           |
| Labels                                      | `drift`, `reliability`, `integration-test`, `aws`, `cleanup`                                                |
| Assignee / owner                            | unassigned                                                                                                  |
| Target branch                               | `ticket/96-real-aws-zero-orphan-proof`                                                                      |
| Primary stack                               | TypeScript / Vitest / AWS SDK                                                                               |
| Default formatter command                   | `pnpm format:check`                                                                                         |
| Default typecheck / build command           | `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build`                                |
| Default static analysis / lint command      | `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`       |
| Default unit / BDD command                  | `pnpm --filter @hulumi/drift run test:integration -- tests/integration/reconciler-s3.integration.test.ts`   |
| Default runtime validation command          | `HULUMI_INTEGRATION=1 HULUMI_RECONCILER_AWS_INTEGRATION=1 pnpm --filter @hulumi/drift run test:integration` |
| Default dependency / security audit command | `pnpm audit --prod`                                                                                         |
| Default debugger or state-inspection tool   | `git status --short --branch`, targeted Vitest output, AWS SDK errors                                       |
| Public interfaces stable by default         | yes                                                                                                         |
| Allowed new dependencies by default         | none                                                                                                        |
| Schema/config migration allowed by default  | no                                                                                                          |

### Public interfaces that must remain stable unless explicitly listed otherwise

- Existing reconciler, discovery, and execution exports remain source compatible.
- `DriftClassifier.classify()` remains non-destructive.

## 2. Sizing Gate

| Check                                          | Answer                                                                                               |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| User-visible outcome fits in one sentence      | yes - a gated real-AWS test proves S3 reconciler cleanup leaves zero in-scope bucket orphans         |
| Expected changed files <= 8                    | yes                                                                                                  |
| New public surfaces <= 1                       | no new public surface                                                                                |
| No schema migration unless explicitly approved | yes                                                                                                  |
| No cross-subsystem rewrite                     | yes                                                                                                  |
| Can be reviewed as one PR                      | yes for the first S3-only proof                                                                      |
| Requires full v4 runbook instead               | full parent #96 likely does; this ticket is the first real-AWS proof slice for the shipped primitive |

## 3. Issue Context

### Problem

#93-#95 added the reconciler core, discovery model, and conservative execution. #96 needs a real sandbox proof that the S3 cleanup primitive can remove a versioned bucket and leave zero in-scope orphans, while staying safe on ordinary PRs and local machines without credentials.

### Acceptance Criteria From Issue

- [ ] Tests are gated behind explicit integration env vars and skip visibly without credentials.
- [ ] Tests use GitHub OIDC / sandbox AWS only, not long-lived keys.
- [ ] Cleanup `afterAll` runs on success and failure.
- [ ] Final verification checks zero in-scope resources for the test suffix.
- [ ] Logs and artifacts do not expose account IDs, role ARNs, backend URLs, bucket names, object keys, or secrets.
- [ ] The AWS environment is clean after the test run, or the test fails with a precise retained-resource report.

### Non-Goals

- Building the protected workflow; #97 owns that.
- Pulumi stack fixture with `@pulumi/aws`; this slice proves the shipped S3 primitive via AWS SDK only.
- GuardDuty/SecurityHub singleton live tests; they remain later real-AWS coverage.

## 4. Compact Architecture Delta

| Component            | Existing behavior                          | Change                                                     | Interface / trust boundary touched |
| -------------------- | ------------------------------------------ | ---------------------------------------------------------- | ---------------------------------- |
| Drift integration    | classifier todos only                      | add gated reconciler S3 real-AWS integration file          | test harness                       |
| S3 cleanup primitive | unit-tested with fake client               | exercised against sandbox AWS when explicit env is present | AWS mutation boundary              |
| Docs                 | integration doc says drift cleanup roadmap | document new gated reconciler S3 proof and env contract    | operator guidance                  |

### Data Flow Delta

```text
HULUMI_RECONCILER_AWS_INTEGRATION=1 + AWS sandbox credentials
  -> create scoped versioned S3 fixture
  -> plan dry-run and assert no mutation
  -> execute reconciler S3 sweep
  -> verify no in-scope bucket remains
  -> afterAll cleanup repeats idempotently
```

## 5. Contract Block

| Contract Row                       | Value                                                                                                                                                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inputs                             | #96 issue, #93-#95 reconciler implementation, `docs/integration-testing.md`                                                                                                                                                                                   |
| Outputs                            | gated integration test, docs update, issue workpad update                                                                                                                                                                                                     |
| Interfaces touched                 | none; test-only/runtime docs                                                                                                                                                                                                                                  |
| Files allowed to change            | `docs/slo/tickets/ticket-96-real-aws-zero-orphan-proof.md`, `packages/drift/tests/integration/reconciler-s3.integration.test.ts`, `packages/drift/vitest.integration.config.ts`, `packages/drift/package.json`, `package.json`, `docs/integration-testing.md` |
| Files to read before changing      | `packages/drift/tests/integration/drift-classify.integration.test.ts`, `docs/integration-testing.md`, `packages/drift/src/reconciler.ts`, `packages/drift/src/adapters/s3-sweeper.ts`                                                                         |
| New files allowed                  | `docs/slo/tickets/ticket-96-real-aws-zero-orphan-proof.md`, `packages/drift/tests/integration/reconciler-s3.integration.test.ts`, `packages/drift/vitest.integration.config.ts`                                                                               |
| New dependencies allowed           | none                                                                                                                                                                                                                                                          |
| Migration allowed                  | no                                                                                                                                                                                                                                                            |
| Compatibility commitments          | integration tests skip visibly without credentials; no local AWS calls unless both integration flags are set                                                                                                                                                  |
| Data classification                | Public; logs/results must not expose bucket names, object keys, account IDs, role ARNs, backend URLs, or secrets                                                                                                                                              |
| Proactive controls in play         | explicit env gates, scoped prefix, random suffix, afterAll cleanup, counts-only reporting, no shell execution                                                                                                                                                 |
| Abuse acceptance scenarios         | missing env skips; weak evidence blocks; dry-run has no mutation; afterAll cleans even after failure                                                                                                                                                          |
| Resource bounds introduced/changed | one temporary bucket, two object versions/delete markers max in fixture, integration timeout bounded by Vitest                                                                                                                                                |
| Invariants/assertions required     | no execute in dry-run; zero bucket remains after execute/cleanup; retained resources reported by count only                                                                                                                                                   |
| Debugger / inspection expectation  | inspect targeted Vitest output and AWS SDK errors; do not print sensitive identifiers                                                                                                                                                                         |
| Static analysis gates              | formatter, typecheck/build, lint, license-boundary, exact-pin guard, audit                                                                                                                                                                                    |
| Reversibility / rollback path      | remove gated integration file and doc paragraph                                                                                                                                                                                                               |
| Exemplar code to copy              | existing integration skip-gate pattern; #93 S3 executor guardrails                                                                                                                                                                                            |
| Anti-exemplar code not to copy     | AWS CLI shell cleanup, unguarded AWS calls, printing bucket/object names                                                                                                                                                                                      |
| Refactoring discipline             | no source refactor in this ticket                                                                                                                                                                                                                             |
| AI tolerance contract              | N/A - no AI component                                                                                                                                                                                                                                         |
| Forbidden shortcuts                | no fake pass as real-AWS proof, no static keys, no broad cleanup, no unredacted logs, no live call without explicit flags                                                                                                                                     |

## 6. Implementation Plan

1. Add the gated integration test with visible skip behavior.
2. Use AWS SDK S3 calls to create a tiny scoped versioned bucket fixture only when explicitly enabled.
3. Run dry-run planning and assert no mutation.
4. Execute the reconciler S3 sweep and assert zero in-scope bucket remains.
5. Ensure `afterAll` repeats cleanup idempotently.
6. Update integration docs and evidence.

## 7. BDD Acceptance Scenarios

| Scenario              | Category    | Given                                      | When                | Then                                            | Evidence |
| --------------------- | ----------- | ------------------------------------------ | ------------------- | ----------------------------------------------- | -------- |
| visible skip          | empty state | integration flags or AWS env missing       | test file runs      | skip notice explains missing contract           | Vitest   |
| dry-run no mutation   | happy path  | fixture bucket exists                      | plan mode runs      | bucket still exists                             | Vitest   |
| execute zero orphan   | happy path  | fixture bucket has versioned object state  | sweeper executes    | bucket no longer exists                         | Vitest   |
| weak evidence blocked | abuse case  | matching-prefix bucket with one signal     | plan runs           | delete is not executable                        | Vitest   |
| cleanup after failure | degraded    | fixture may remain after assertion failure | `afterAll` executes | cleanup repeats and reports retained count only | Vitest   |

## 8. Validation Plan

| Check                           | Command / Action                                                                                                      | Expected Result                         | Actual Result                                                                               | Status  | Notes                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------- | ------- | ---------------------------------------- |
| Repo hygiene                    | `git status --short --branch && git rev-parse --abbrev-ref HEAD && git symbolic-ref --short refs/remotes/origin/HEAD` | task branch, default branch known       | branch `ticket/96-real-aws-zero-orphan-proof`; default `origin/main`; clean at start        | pass    |                                          |
| New tests fail first            | `pnpm --filter @hulumi/drift test -- tests/integration/reconciler-s3.integration.test.ts`                             | fails before implementation             | failed because default Drift Vitest config excludes `tests/integration/**`                  | pass    | Added explicit integration config/script |
| Formatter                       | `pnpm format:check`                                                                                                   | passes                                  | passed                                                                                      | pass    |                                          |
| Typecheck / build               | `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build`                                          | passes                                  | passed                                                                                      | pass    |                                          |
| Static analysis / lint          | `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`                 | passes                                  | passed                                                                                      | pass    |                                          |
| Integration skip contract       | `pnpm --filter @hulumi/drift run test:integration -- tests/integration/reconciler-s3.integration.test.ts`             | visible skip without env                | passed locally: existing drift integration gate passed; reconciler S3 suite skipped visibly | pass    |                                          |
| Full drift compatibility        | `pnpm --filter @hulumi/drift test`                                                                                    | passes                                  | 17 files passed, 77 tests passed                                                            | pass    |                                          |
| Runtime validation              | `HULUMI_INTEGRATION=1 HULUMI_RECONCILER_AWS_INTEGRATION=1 pnpm --filter @hulumi/drift run test:integration`           | passes in sandbox or documented blocked | blocked locally: no AWS/Pulumi/Hulumi env vars present                                      | blocked | Needs sandbox/OIDC environment           |
| Dependency / security audit     | `pnpm audit --prod`                                                                                                   | passes                                  | passed                                                                                      | pass    |                                          |
| `.gitignore` / artifact cleanup | `git status --short`                                                                                                  | no stray generated artifacts            | only #96 source/docs/package files are dirty                                                | pass    |                                          |

## 9. Workpad / Tracker Updates

Workpad comment: https://github.com/kerberosmansour/hulumi/issues/96#issuecomment-4410197144

## 10. Self-Review Gate

- [x] Stayed inside the file allow-list.
- [x] Added gated integration coverage.
- [x] Avoided live AWS calls without explicit flags.
- [x] Preserved classifier/source compatibility.
- [x] Ran formatter, typecheck/build, static analysis, and full compatibility tests.
- [ ] Updated issue workpad evidence.

## 11. Closure Summary

### Completed

- Added a Drift integration Vitest config so integration tests can run explicitly while remaining excluded from default PR tests.
- Added a double-gated real-AWS S3 reconciler integration harness.
- The harness creates one scoped versioned bucket only when both integration flags and sandbox AWS credentials are present.
- The harness proves dry-run plan mode is non-mutating, weak ownership evidence blocks deletion, execute removes the bucket, and `afterAll` repeats cleanup idempotently.
- Updated integration testing docs with the new reconciler S3 proof contract.

### Tests And Validation

- `pnpm --filter @hulumi/drift run test:integration -- tests/integration/reconciler-s3.integration.test.ts` - pass locally with visible skip for the S3 suite.
- `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build` - pass.
- `pnpm --filter @hulumi/drift test` - pass, 77 tests.
- `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard` - pass.
- `pnpm format:check` - pass.
- `pnpm audit --prod` - pass.
- Real-AWS runtime validation - blocked locally because no `AWS_*`, `PULUMI_*`, or `HULUMI_*` env vars are present; run in the sandbox/OIDC environment.
