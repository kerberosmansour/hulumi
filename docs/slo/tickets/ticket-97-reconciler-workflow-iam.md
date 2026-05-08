# Protected Reconciler Workflow And IAM Docs - SLO Ticket Contract v1

## 1. Ticket Metadata

| Field                                       | Value                                                                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Ticket Contract ID                          | `ticket-97-reconciler-workflow-iam`                                                                               |
| Source tracker                              | `GitHub Issues`                                                                                                   |
| Source issue                                | [#97](https://github.com/kerberosmansour/hulumi/issues/97)                                                        |
| Issue title                                 | `ci(drift): add protected GitHub Actions workflow and least-privilege IAM docs for reconciler`                    |
| Labels                                      | `enhancement`, `drift`, `reliability`, `aws`, `supply-chain`, `cleanup`                                           |
| Assignee / owner                            | unassigned                                                                                                        |
| Target branch                               | `ticket/97-reconciler-workflow-iam`                                                                               |
| Primary stack                               | GitHub Actions / JSON IAM docs                                                                                    |
| Default formatter command                   | `pnpm format:check`                                                                                               |
| Default typecheck / build command           | `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build`                                      |
| Default static analysis / lint command      | `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`             |
| Default unit / BDD command                  | `pnpm --filter @hulumi/drift run test:integration -- tests/integration/reconciler-s3.integration.test.ts`         |
| Default runtime validation command          | `gh workflow run drift-reconciler-cleanup.yml -f mode=plan -f stack_suffix=sandbox-0000000000` in configured repo |
| Default dependency / security audit command | `pnpm audit --prod`                                                                                               |
| Default debugger or state-inspection tool   | `actionlint` if installed; otherwise workflow YAML inspection + local format/lint gates                           |
| Public interfaces stable by default         | yes                                                                                                               |
| Allowed new dependencies by default         | none                                                                                                              |
| Schema/config migration allowed by default  | no                                                                                                                |

## 2. Sizing Gate

| Check                                          | Answer                                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| User-visible outcome fits in one sentence      | yes - maintainers can run plan or protected execute mode for reconciler S3 cleanup |
| Expected changed files <= 8                    | yes                                                                                |
| New public surfaces <= 1                       | yes - one manual workflow                                                          |
| No schema migration unless explicitly approved | yes                                                                                |
| No cross-subsystem rewrite                     | yes                                                                                |
| Can be reviewed as one PR                      | yes                                                                                |
| Requires full v4 runbook instead               | no for workflow/docs shape; real sandbox execution remains environment-dependent   |

## 3. Issue Context

### Problem

#96 added a gated real-AWS S3 proof, but maintainers need a public-repo-safe workflow and least-privilege IAM docs to run plan and protected execute modes through OIDC.

### Acceptance Criteria From Issue

- [ ] Plan mode succeeds without destructive execute permissions.
- [ ] Execute mode fails closed if required secrets/vars/protected environment are missing.
- [ ] Workflow masks account IDs, role ARNs, backend URLs, bucket names, and tokens.
- [ ] Artifacts contain only redacted identifiers unless explicitly configured otherwise.
- [ ] IAM docs distinguish read-only plan role from S3 execute role.
- [ ] Public repo threat model is documented in `docs/integration-testing.md` or cookbook docs.

### Non-Goals

- Running the workflow from this local shell.
- Replacing the old `e2e-cleanup` workflow for Pulumi stack cleanup.
- Adding new AWS deleters.

## 4. Compact Architecture Delta

| Component        | Existing behavior                     | Change                                                          | Interface / trust boundary touched |
| ---------------- | ------------------------------------- | --------------------------------------------------------------- | ---------------------------------- |
| GitHub Actions   | `e2e-cleanup` script workflow only    | add `drift-reconciler-cleanup.yml` with plan/execute modes      | OIDC / protected environment       |
| IAM docs         | weekly integration broad sandbox role | add separate read-only plan and S3 execute policy examples      | AWS least privilege boundary       |
| Integration docs | #96 proof described                   | add public repo workflow threat model and required secrets/vars | maintainer guidance                |

## 5. Contract Block

| Contract Row                       | Value                                                                                                                                                                                                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inputs                             | #97 issue, #96 integration harness, existing workflow patterns                                                                                                                                                                                       |
| Outputs                            | workflow YAML, IAM policy docs, integration docs, issue workpad update                                                                                                                                                                               |
| Interfaces touched                 | GitHub Actions workflow dispatch                                                                                                                                                                                                                     |
| Files allowed to change            | `docs/slo/tickets/ticket-97-reconciler-workflow-iam.md`, `.github/workflows/drift-reconciler-cleanup.yml`, `docs/deployment/reconciler-plan-iam-policy.json`, `docs/deployment/reconciler-s3-execute-iam-policy.json`, `docs/integration-testing.md` |
| Files to read before changing      | `.github/workflows/e2e-cleanup.yml`, `.github/workflows/weekly-integration.yml`, `docs/integration-testing.md`, `docs/deployment/weekly-integration-iam-policy.json`                                                                                 |
| New files allowed                  | `.github/workflows/drift-reconciler-cleanup.yml`, `docs/deployment/reconciler-plan-iam-policy.json`, `docs/deployment/reconciler-s3-execute-iam-policy.json`, this ticket contract                                                                   |
| New dependencies allowed           | none                                                                                                                                                                                                                                                 |
| Migration allowed                  | no                                                                                                                                                                                                                                                   |
| Compatibility commitments          | existing workflows keep working                                                                                                                                                                                                                      |
| Data classification                | Public; workflow must mask account IDs, role ARNs, backend URLs, tokens, and stack suffix-derived names                                                                                                                                              |
| Proactive controls in play         | OIDC only, protected execute environment, separate plan/execute roles, concurrency lock per stack suffix                                                                                                                                             |
| Abuse acceptance scenarios         | execute mode without role/env fails before AWS calls; plan mode uses read-only role                                                                                                                                                                  |
| Resource bounds introduced/changed | workflow timeout bounded; execute runs one explicit integration suite                                                                                                                                                                                |
| Invariants/assertions required     | execute cannot run without protected environment and execute role secret                                                                                                                                                                             |
| Debugger / inspection expectation  | inspect workflow YAML and local command output                                                                                                                                                                                                       |
| Static analysis gates              | formatter, typecheck/build, lint, license-boundary, exact-pin, audit                                                                                                                                                                                 |
| Reversibility / rollback path      | remove workflow and IAM docs                                                                                                                                                                                                                         |
| Exemplar code to copy              | masking and backend validation from existing workflows                                                                                                                                                                                               |
| Anti-exemplar code not to copy     | static AWS keys, unprotected execute mode, unredacted artifacts                                                                                                                                                                                      |
| Refactoring discipline             | docs/workflow only; no source refactor                                                                                                                                                                                                               |
| AI tolerance contract              | N/A - no AI component                                                                                                                                                                                                                                |
| Forbidden shortcuts                | no long-lived keys, no broad admin policy, no execute without environment protection                                                                                                                                                                 |

## 6. Implementation Plan

1. Add the workflow with plan/execute inputs, validation, masking, OIDC, concurrency, and artifact upload.
2. Add separate IAM policy examples for plan and execute roles.
3. Update integration docs with required secrets/vars and threat model.
4. Run local validation and update evidence.

## 7. BDD Acceptance Scenarios

| Scenario                   | Category      | Given                                | When            | Then                                                 | Evidence               |
| -------------------------- | ------------- | ------------------------------------ | --------------- | ---------------------------------------------------- | ---------------------- |
| plan role only             | happy path    | mode `plan`                          | workflow runs   | uses read-only role and uploads redacted plan intent | YAML inspection        |
| execute protected          | abuse case    | mode `execute`                       | workflow runs   | requires protected environment and execute role      | YAML inspection        |
| missing config fail closed | invalid input | required secrets/vars absent         | validation runs | job exits before AWS calls                           | shell validation block |
| artifact redaction         | abuse case    | identifiers present in secrets/input | validation runs | masks values and writes redacted artifact only       | YAML inspection        |

## 8. Validation Plan

| Check                           | Command / Action                                                                                                      | Expected Result                                    | Actual Result                                                                           | Status | Notes |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------- | ------ | ----- |
| Repo hygiene                    | `git status --short --branch && git rev-parse --abbrev-ref HEAD && git symbolic-ref --short refs/remotes/origin/HEAD` | task branch, default branch known                  | branch `ticket/97-reconciler-workflow-iam`; default `origin/main`; clean at start       | pass   |       |
| Formatter                       | `pnpm format:check`                                                                                                   | passes                                             | passed                                                                                  | pass   |       |
| Typecheck / build               | `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build`                                          | passes                                             | passed                                                                                  | pass   |       |
| Static analysis / lint          | `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`                 | passes                                             | passed                                                                                  | pass   |       |
| Integration skip contract       | `pnpm --filter @hulumi/drift run test:integration -- tests/integration/reconciler-s3.integration.test.ts`             | passes locally with visible skip                   | passed: drift integration gate ran, reconciler S3 suite skipped visibly                 | pass   |       |
| Workflow inspection             | inspect `.github/workflows/drift-reconciler-cleanup.yml`                                                              | plan/execute roles, protected env, masks, artifact | passed; `actionlint .github/workflows/drift-reconciler-cleanup.yml` emitted no findings | pass   |       |
| Dependency / security audit     | `pnpm audit --prod`                                                                                                   | passes                                             | passed                                                                                  | pass   |       |
| `.gitignore` / artifact cleanup | `git status --short`                                                                                                  | no stray generated artifacts                       | only #97 docs/workflow files are dirty                                                  | pass   |       |

## 9. Workpad / Tracker Updates

Workpad comment: https://github.com/kerberosmansour/hulumi/issues/97#issuecomment-4410223635

## 10. Self-Review Gate

- [x] Stayed inside the file allow-list.
- [x] Kept existing workflows compatible.
- [x] Separated plan and execute roles.
- [x] Required protected execute environment.
- [x] Ran validation gates.
- [ ] Updated issue workpad evidence.

## 11. Closure Summary

### Completed

- Added `.github/workflows/drift-reconciler-cleanup.yml`.
- Added separate read-only plan and narrow S3 execute IAM policy examples.
- Updated integration testing docs with the public-repo workflow threat model and required secrets/environment.

### Tests And Validation

- `actionlint .github/workflows/drift-reconciler-cleanup.yml` - pass, no findings.
- `pnpm --filter @hulumi/drift run test:integration -- tests/integration/reconciler-s3.integration.test.ts` - pass locally with visible skip for the live S3 suite.
- `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build` - pass.
- `pnpm --filter @hulumi/drift test` - pass, 77 tests.
- `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard` - pass.
- `pnpm format:check` - pass.
- `pnpm audit --prod` - pass.
