# Broaden Reconciler Real-AWS Coverage - SLO Ticket Contract v1

> **Purpose**: Execute one issue-sized change with v4 SLO rigor, without requiring a full multi-milestone runbook.
> **Audience**: AI coding agents first, humans second.
> **Source template**: Derived from `docs/slo/templates/runbook-template_v_4_template.md`. Use the full v4 runbook when this contract cannot stay issue-sized.

---

## 1. Ticket Metadata

| Field                                       | Value                                                                                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ticket Contract ID                          | `ticket-107-reconciler-aws-coverage`                                                                                                                                            |
| Source tracker                              | `GitHub Issues`                                                                                                                                                                 |
| Source issue                                | [#107](https://github.com/kerberosmansour/hulumi/issues/107)                                                                                                                    |
| Issue title                                 | `test(drift): broaden real-AWS reconciler coverage beyond S3 proof`                                                                                                             |
| Labels                                      | `drift`, `reliability`, `integration-test`, `aws`, `cleanup`                                                                                                                    |
| Assignee / owner                            | `kerberosmansour`                                                                                                                                                               |
| Target branch                               | `ticket/107-reconciler-aws-coverage`                                                                                                                                            |
| Primary stack                               | TypeScript, Vitest integration tests, GitHub Actions OIDC                                                                                                                       |
| Default formatter command                   | `pnpm format:check`                                                                                                                                                             |
| Default typecheck / build command           | `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build`                                                                                                    |
| Default static analysis / lint command      | `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`                                                                           |
| Default unit / BDD command                  | `pnpm --filter @hulumi/drift test -- tests/cloudwatch-log-group-executor.test.ts tests/reconciler-action-families.test.ts`                                                      |
| Default runtime validation command          | `pnpm --filter @hulumi/drift run test:integration -- tests/integration/reconciler-cloudwatch-log-group.integration.test.ts tests/integration/reconciler-s3.integration.test.ts` |
| Default dependency / security audit command | `pnpm run lint:exact-pin-guard`                                                                                                                                                 |
| Default debugger or state-inspection tool   | `git diff -- .github/workflows/weekly-integration.yml docs/integration-testing.md packages/drift/tests/integration/reconciler-cloudwatch-log-group.integration.test.ts`         |
| Public interfaces stable by default         | yes                                                                                                                                                                             |
| Allowed new dependencies by default         | none                                                                                                                                                                            |
| Schema/config migration allowed by default  | no                                                                                                                                                                              |

### Public interfaces that must remain stable unless explicitly listed otherwise

- No new package API.
- No new AWS executor.
- Weekly integration remains OIDC-only for real AWS.

---

## 2. Sizing Gate

| Check                                          | Answer                                                                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| User-visible outcome fits in one sentence      | yes - reconciler integration covers non-S3 dry-run, block, retained singleton, resumability, and zero in-scope cleanup |
| Expected changed files <= 8                    | yes                                                                                                                    |
| New public surfaces <= 1                       | yes - one optional workflow variable gate                                                                              |
| No schema migration unless explicitly approved | yes                                                                                                                    |
| No cross-subsystem rewrite                     | yes                                                                                                                    |
| Can be reviewed as one PR                      | yes                                                                                                                    |
| Requires full v4 runbook instead               | no - no new executor or broad AWS setup; only gated coverage and docs                                                  |

---

## 3. Issue Context

### Problem

#107 asks for real-AWS reconciler coverage beyond the S3 proof and for clean sandbox teardown guarantees. The CloudWatch Logs executor from #106 gives a narrow non-S3 target, so this ticket broadens that integration file and wires the weekly workflow to run reconciler integration only behind explicit opt-in gates.

### Acceptance Criteria From Issue

- [ ] Tests are gated behind explicit integration env vars and skip visibly without credentials.
- [ ] Tests use GitHub OIDC / sandbox AWS only, not long-lived keys.
- [ ] Cleanup runs on success and failure.
- [ ] Final verification checks zero in-scope resources or reports retained resources precisely.
- [ ] Logs/artifacts do not expose account IDs, role ARNs, backend URLs, resource names, object keys, or secrets.

### Non-Goals

- No new cleanup executor.
- No live AWS execution from PR CI.
- No long-lived AWS credentials.
- No logging of account IDs, role ARNs, backend URLs, resource names, object keys, or secrets.

### Reproduction / Current Signal

| Signal           | Evidence                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline command | `pnpm --filter @hulumi/drift run test:integration -- tests/integration/reconciler-cloudwatch-log-group.integration.test.ts tests/integration/reconciler-s3.integration.test.ts` |
| Current result   | pass with visible local skip because integration env vars are not set                                                                                                           |
| Expected result  | CloudWatch Logs integration covers all #107 scenarios when enabled and still skips visibly when disabled                                                                        |

---

## 4. Compact Architecture Delta

| Component                                             | Existing behavior                                                 | Change                                                                                                           | Interface / trust boundary touched      |
| ----------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `reconciler-cloudwatch-log-group.integration.test.ts` | proves one non-S3 create/delete path                              | add weak evidence, singleton retention, dry-run zero mutation, resumable failure, and zero in-scope verification | live AWS sandbox only when double-gated |
| `weekly-integration.yml`                              | runs drift-classify integration behind `HULUMI_DRIFT_INTEGRATION` | add separate optional reconciler integration gate with `HULUMI_RECONCILER_AWS_INTEGRATION=1`                     | GitHub Actions OIDC sandbox             |
| `docs/integration-testing.md`                         | documents first S3 and CloudWatch proofs partially                | document the broader non-S3 coverage and cleanup contract                                                        | docs only                               |

### Data Flow Delta

```text
weekly-integration workflow
  -> OIDC assume sandbox role
  -> if HULUMI_RECONCILER_AWS_INTEGRATION=1
  -> run @hulumi/drift integration tests
  -> tests create scoped log group
  -> failure/success cleanup
  -> zero in-scope verification
```

---

## 5. Contract Block

| Contract Row                       | Value                                                                                                                                                                                                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inputs                             | Issue #107, integration docs, weekly workflow, CloudWatch Logs integration file                                                                                                                                                                                 |
| Outputs                            | Updated integration coverage, workflow gate, docs, SLO ticket contract, PR                                                                                                                                                                                      |
| Interfaces touched                 | Optional GitHub Actions variable gate `HULUMI_RECONCILER_AWS_INTEGRATION`                                                                                                                                                                                       |
| Files allowed to change            | `docs/slo/tickets/ticket-107-reconciler-aws-coverage.md`, `packages/drift/tests/integration/reconciler-cloudwatch-log-group.integration.test.ts`, `.github/workflows/weekly-integration.yml`, `docs/integration-testing.md`                                     |
| Files to read before changing      | `docs/ARCHITECTURE.md`, `docs/integration-testing.md`, `.github/workflows/weekly-integration.yml`, `packages/drift/tests/integration/reconciler-cloudwatch-log-group.integration.test.ts`, `packages/drift/tests/integration/reconciler-s3.integration.test.ts` |
| New files allowed                  | none                                                                                                                                                                                                                                                            |
| New dependencies allowed           | none                                                                                                                                                                                                                                                            |
| Migration allowed                  | no                                                                                                                                                                                                                                                              |
| Compatibility commitments          | PR CI remains mock-only; real AWS remains OIDC-only and explicit opt-in; disabled local runs skip visibly                                                                                                                                                       |
| Data classification                | Public                                                                                                                                                                                                                                                          |
| Proactive controls in play         | OIDC-only AWS auth, explicit env gating, scoped resource prefix, `afterAll` cleanup, redacted result assertions                                                                                                                                                 |
| Abuse acceptance scenarios         | BDD rows below cover leaked identifiers and failure cleanup                                                                                                                                                                                                     |
| Resource bounds introduced/changed | At most one CloudWatch log group per enabled test run; cleanup lists only the generated suffix prefix                                                                                                                                                           |
| Invariants/assertions required     | dry-run leaves log group present; weak evidence does not mutate; singleton retain has no cloud mutation; failure is resumable; final in-scope list is empty after cleanup                                                                                       |
| Debugger / inspection expectation  | Use targeted integration command and `git diff`; no interactive debugger required                                                                                                                                                                               |
| Static analysis gates              | Formatter, TypeScript typecheck/build, ESLint, license-boundary lint, exact-pin guard                                                                                                                                                                           |
| Reversibility / rollback path      | Revert this branch; no persistent state migration                                                                                                                                                                                                               |
| Exemplar code to copy              | Existing S3 and CloudWatch reconciler integration gate patterns                                                                                                                                                                                                 |
| Anti-exemplar code not to copy     | Do not print AWS identifiers; do not use static credentials; do not run live AWS in PR CI                                                                                                                                                                       |
| Refactoring discipline             | Minimal helper extraction inside the integration file only                                                                                                                                                                                                      |
| AI tolerance contract              | N/A - no AI component                                                                                                                                                                                                                                           |
| Forbidden shortcuts                | No fake cleanup claims, no unguarded live AWS, no broad prefixes, no secrets in logs/docs                                                                                                                                                                       |

---

## 6. Implementation Plan

1. Confirm repo hygiene and baseline integration skip behavior.
2. Add failing/absent scenario coverage by extending the CloudWatch Logs integration test.
3. Add workflow step gated by `vars.HULUMI_RECONCILER_AWS_INTEGRATION == '1'`.
4. Update docs with the new coverage and cleanup contract.
5. Run targeted integration command and verify visible local skip.
6. Run unit, full drift, typecheck/build, static gates, formatter.
7. Fill evidence, update workpad, and open PR.

---

## 7. BDD Acceptance Scenarios

| Scenario                           | Category               | Given                                                                   | When                                     | Then                                                                               | Evidence               |
| ---------------------------------- | ---------------------- | ----------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------- |
| disabled integrations skip visibly | empty / degraded state | no integration env vars                                                 | targeted integration command runs        | S3 and CloudWatch reconciler suites skip visibly                                   | integration command    |
| weak evidence blocks mutation      | invalid input          | one scoped log group exists but target has one ownership signal         | sweep plan runs                          | plan is non-executable and log group remains                                       | CloudWatch integration |
| shared singleton retain/report     | happy path             | GuardDuty/Security Hub singleton target is in plan scope                | sweep plan runs without singleton delete | recommended action is retain and cloud mutation is false                           | CloudWatch integration |
| dry-run zero mutation              | happy path             | one scoped log group exists                                             | `plan` mode runs                         | plan is non-executable and log group remains                                       | CloudWatch integration |
| mid-execute failure is resumable   | abuse case             | one scoped log group exists and a failing executor throws before delete | execute runs then real executor retries  | first result fails redacted; second result succeeds; no in-scope log groups remain | CloudWatch integration |
| cleanup on success/failure         | runtime                | enabled suite creates a log group                                       | test exits or fails                      | `afterAll` removes in-scope log groups and final verification checks zero          | CloudWatch integration |

---

## 8. Validation Plan

| Check                              | Command / Action                                                                                                                                                                | Expected Result                                                        | Actual Result                                                                                                                                   | Status | Notes                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------- |
| Repo hygiene                       | `git status --short --branch && git rev-parse --abbrev-ref HEAD && git symbolic-ref --short refs/remotes/origin/HEAD`                                                           | branch `ticket/107-reconciler-aws-coverage`, default `origin/main`     | branch `ticket/107-reconciler-aws-coverage`, default `origin/main`; clean before contract edit                                                  | pass   |                                        |
| Baseline before change             | `pnpm --filter @hulumi/drift run test:integration -- tests/integration/reconciler-cloudwatch-log-group.integration.test.ts tests/integration/reconciler-s3.integration.test.ts` | passes or visible skip                                                 | pass with visible skip, 1 passed / 2 skipped files                                                                                              | pass   | before edits                           |
| New/expanded integration scenarios | code inspection + targeted integration command                                                                                                                                  | scenarios present and skip safely without env vars                     | CloudWatch integration now covers dry-run, weak evidence, singleton retain, injected failure, successful retry, and final zero-prefix assertion | pass   | local command skipped live AWS safely  |
| Formatter                          | `pnpm format:check`                                                                                                                                                             | passes                                                                 | pass                                                                                                                                            | pass   |                                        |
| Typecheck / build                  | `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build`                                                                                                    | passes                                                                 | pass                                                                                                                                            | pass   |                                        |
| Static analysis / lint             | `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`                                                                           | passes                                                                 | pass; license-boundary OK; exact-pin guard OK with 12 pinned deps                                                                               | pass   |                                        |
| Unit / BDD tests                   | `pnpm --filter @hulumi/drift test -- tests/cloudwatch-log-group-executor.test.ts tests/reconciler-action-families.test.ts`                                                      | passes                                                                 | pass, 2 files / 9 tests                                                                                                                         | pass   |                                        |
| Runtime validation                 | `pnpm --filter @hulumi/drift run test:integration -- tests/integration/reconciler-cloudwatch-log-group.integration.test.ts tests/integration/reconciler-s3.integration.test.ts` | passes with visible local skip unless AWS flags are set                | pass with visible local skip; no AWS resources created locally                                                                                  | pass   |                                        |
| Drift package tests                | `pnpm --filter @hulumi/drift test`                                                                                                                                              | passes                                                                 | pass, 23 files / 101 tests                                                                                                                      | pass   |                                        |
| Dependency / security audit        | `pnpm run lint:exact-pin-guard`                                                                                                                                                 | passes                                                                 | pass, no dependency changes                                                                                                                     | pass   | no dependency changes                  |
| Cleanup / zero in-scope assertion  | integration test assertions and `afterAll`                                                                                                                                      | enabled path lists zero log groups with generated prefix after cleanup | pass by code path and targeted skip check; enabled path calls `cleanupLogGroup()` and asserts empty prefix list in `afterAll`                   | pass   | local run did not create AWS resources |
| `.gitignore` / artifact cleanup    | `git status --short`                                                                                                                                                            | no stray artifacts                                                     | only allow-listed contract, integration test, workflow, and docs changed                                                                        | pass   |                                        |

---

## 9. Workpad / Tracker Updates

Use issue comment `https://github.com/kerberosmansour/hulumi/issues/107#issuecomment-4412048982` as the persistent workpad.

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

- Broadened the CloudWatch Logs reconciler integration proof to cover dry-run zero mutation, weak ownership evidence blocking, shared singleton retain/report behavior, injected pre-delete failure with redacted failed result, successful retry, and zero in-scope log groups after cleanup.
- Added an explicit weekly integration workflow lane gated by `vars.HULUMI_RECONCILER_AWS_INTEGRATION == '1'` after OIDC sandbox role setup.
- Updated integration docs with the non-S3 proof and cleanup contract.

### Tests And Validation

- `pnpm --filter @hulumi/drift run test:integration -- tests/integration/reconciler-cloudwatch-log-group.integration.test.ts tests/integration/reconciler-s3.integration.test.ts`: pass with visible local skip; no AWS resources created locally.
- `pnpm --filter @hulumi/drift test -- tests/cloudwatch-log-group-executor.test.ts tests/reconciler-action-families.test.ts`: pass, 2 files / 9 tests.
- `pnpm --filter @hulumi/drift test`: pass, 23 files / 101 tests.
- `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build`: pass.
- `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`: pass.
- `pnpm format:check`: pass.

### Lessons / Follow-Ups

- Live AWS execution was not run locally because the integration flags were not set; the workflow path now runs it only after GitHub OIDC sandbox auth and explicit maintainer opt-in.
- No follow-up issue needed for this sequence unless maintainers want more executor families beyond CloudWatch Logs.

### PR / Issue Links

- PR: Pending.
- Issue: https://github.com/kerberosmansour/hulumi/issues/107
