# Guarded Reconciler Core API And S3 Sweep Primitive - SLO Ticket Contract v1

## 1. Ticket Metadata

| Field                                       | Value                                                                                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Ticket Contract ID                          | `ticket-93-reconciler-s3-sweeper`                                                                                                              |
| Source tracker                              | `GitHub Issues`                                                                                                                                |
| Source issue                                | [#93](https://github.com/kerberosmansour/hulumi/issues/93)                                                                                     |
| Issue title                                 | `feat(drift): add guarded reconciler core API and S3 sweep primitive`                                                                          |
| Labels                                      | `enhancement`, `drift`, `reliability`, `aws`, `cleanup`                                                                                        |
| Assignee / owner                            | unassigned                                                                                                                                     |
| Target branch                               | `ticket/93-reconciler-s3-sweeper`                                                                                                              |
| Primary stack                               | TypeScript / pnpm / Vitest                                                                                                                     |
| Default formatter command                   | `pnpm format:check`                                                                                                                            |
| Default typecheck / build command           | `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build`                                                                   |
| Default static analysis / lint command      | `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`                                          |
| Default unit / BDD command                  | `pnpm --filter @hulumi/drift test -- tests/reconciler.test.ts tests/s3-sweeper.test.ts`                                                        |
| Default runtime validation command          | `HULUMI_INTEGRATION=1 pnpm --filter @hulumi/drift test -- tests/integration/` when AWS/Pulumi sandbox env exists; otherwise record skip reason |
| Default dependency / security audit command | `pnpm audit --prod --filter @hulumi/drift`                                                                                                     |
| Default debugger or state-inspection tool   | `git status --short --branch`, TypeScript diagnostics, targeted Vitest output                                                                  |
| Public interfaces stable by default         | yes                                                                                                                                            |
| Allowed new dependencies by default         | `@aws-sdk/client-s3@3.1045.0` only                                                                                                             |
| Schema/config migration allowed by default  | no                                                                                                                                             |

### Public interfaces that must remain stable unless explicitly listed otherwise

- `DriftClassifier.classify()` remains read-only and non-destructive.
- Existing `@hulumi/drift` exports remain source compatible.
- New public exports are additive: `OrphanReconciler`, `OrphanSweeper`, reconciler plan/result types, and `S3SweeperExecutor`.

## 2. Sizing Gate

| Check                                          | Answer                                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| User-visible outcome fits in one sentence      | yes - `@hulumi/drift` can plan a guarded, redacted S3 orphan cleanup and execute it only with explicit confirmation |
| Expected changed files <= 8                    | no - package lock, tests, docs, and ticket contract make this a compact but slightly larger slice                   |
| New public surfaces <= 1                       | yes - one additive reconciler/sweeper API surface                                                                   |
| No schema migration unless explicitly approved | yes                                                                                                                 |
| No cross-subsystem rewrite                     | yes                                                                                                                 |
| Can be reviewed as one PR                      | yes                                                                                                                 |
| Requires full v4 runbook instead               | no for #93; yes for the full parent #92                                                                             |

## 3. Issue Context

### Problem

#92 is too large for one implementation ticket. #93 is the first slice: create the conservative API and first S3 versioned-bucket cleanup primitive while preserving the existing classify-only drift behavior.

### Acceptance Criteria From Issue

- [ ] Existing classifier remains read-only and backwards compatible.
- [ ] Plans reject empty/broad prefixes and weak ownership evidence.
- [ ] Cloud-only deletion requires at least two ownership signals by default.
- [ ] S3 version/delete-marker cleanup batches at 1000 objects.
- [ ] Plan artifacts do not expose account IDs, ARNs, backend URLs, bucket names, object keys, or secrets.
- [ ] Focused unit/BDD tests cover guardrails and S3 batching.
- [ ] Package README documents classify-only vs reconcile/sweep mode.

### Non-Goals

- Full AWS inventory discovery.
- Pulumi state import/delete execution.
- IAM/KMS/Config/GuardDuty/SecurityHub deleters.
- GitHub Actions workflow replacement.
- TLA+ model for the full lifecycle.

### Reproduction / Current Signal

| Signal               | Evidence                                                                             |
| -------------------- | ------------------------------------------------------------------------------------ |
| Current cleanup path | `scripts/cleanup-e2e-stack.mjs` drains S3 versions via AWS CLI before Pulumi destroy |
| Current result       | cleanup logic is tactical script-only and not exported by `@hulumi/drift`            |
| Expected result      | reusable package API with typed plan/execute guardrails and SDK-based S3 primitive   |

## 4. Compact Architecture Delta

| Component       | Existing behavior                          | Change                                                   | Interface / trust boundary touched |
| --------------- | ------------------------------------------ | -------------------------------------------------------- | ---------------------------------- |
| `@hulumi/drift` | read-only classifier                       | additive reconciler/sweeper plan and gated execute API   | public TypeScript API              |
| S3 cleanup      | tactical Node script shells out to AWS CLI | typed AWS SDK executor drains versions/uploads by prefix | AWS mutation boundary              |
| Docs            | drift cookbook covers classify-only        | README documents classify-only vs reconcile/sweep split  | public docs                        |

### Data Flow Delta

```text
caller-supplied scoped targets
  -> OrphanReconciler.plan()
  -> redacted deterministic plan artifact
  -> OrphanReconciler.execute(plan, confirmToken, allow)
  -> injected action executor, currently S3SweeperExecutor
```

## 5. Contract Block

| Contract Row                       | Value                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inputs                             | #93 issue, #92 parent context, existing drift package, `scripts/cleanup-e2e-stack.mjs`                                                                                                                                                                                                                                                                   |
| Outputs                            | additive code, tests, docs, issue workpad update                                                                                                                                                                                                                                                                                                         |
| Interfaces touched                 | `@hulumi/drift` exports                                                                                                                                                                                                                                                                                                                                  |
| Files allowed to change            | `docs/slo/tickets/ticket-93-reconciler-s3-sweeper.md`, `packages/drift/src/reconciler.ts`, `packages/drift/src/adapters/s3-sweeper.ts`, `packages/drift/src/index.ts`, `packages/drift/package.json`, `packages/drift/tests/reconciler.test.ts`, `packages/drift/tests/s3-sweeper.test.ts`, `packages/drift/README.md`, `package.json`, `pnpm-lock.yaml` |
| Files to read before changing      | `AGENTS.md`, `docs/ARCHITECTURE.md`, `packages/drift/src/index.ts`, `packages/drift/src/types.ts`, `packages/drift/tests/no-shell-exec.test.ts`, `scripts/cleanup-e2e-stack.mjs`, `docs/integration-testing.md`                                                                                                                                          |
| New files allowed                  | `docs/slo/tickets/ticket-93-reconciler-s3-sweeper.md`, `packages/drift/src/reconciler.ts`, `packages/drift/src/adapters/s3-sweeper.ts`, `packages/drift/tests/reconciler.test.ts`, `packages/drift/tests/s3-sweeper.test.ts`                                                                                                                             |
| New dependencies allowed           | `@aws-sdk/client-s3@3.1045.0`; root pnpm override for patched transitive `fast-xml-builder@1.1.7` if audit requires it                                                                                                                                                                                                                                   |
| Migration allowed                  | no                                                                                                                                                                                                                                                                                                                                                       |
| Compatibility commitments          | additive exports only; no classifier behavior change                                                                                                                                                                                                                                                                                                     |
| Data classification                | Public; generated plans/results must redact sensitive cloud identifiers                                                                                                                                                                                                                                                                                  |
| Proactive controls in play         | no shell execution, explicit scope, broad-prefix rejection, ownership threshold, singleton retain-by-default, bounded S3 batch size                                                                                                                                                                                                                      |
| Abuse acceptance scenarios         | broad prefix rejected; tag-only resource blocked; singleton retained by default                                                                                                                                                                                                                                                                          |
| Resource bounds introduced/changed | S3 delete batches capped at 1000; default max actions 50                                                                                                                                                                                                                                                                                                 |
| Invariants/assertions required     | read-only modes cannot execute; execute requires token; cloud-only delete requires enough evidence; S3 executor refuses buckets outside prefix                                                                                                                                                                                                           |
| Debugger / inspection expectation  | use targeted TypeScript/Vitest output; inspect env before claiming real-AWS validation                                                                                                                                                                                                                                                                   |
| Static analysis gates              | formatter, typecheck/build, lint, license-boundary, exact-pin guard                                                                                                                                                                                                                                                                                      |
| Reversibility / rollback path      | revert additive exports/source/tests/dependency/docs                                                                                                                                                                                                                                                                                                     |
| Exemplar code to copy              | guardrails from `scripts/cleanup-e2e-stack.mjs`; no-shell posture from drift tests                                                                                                                                                                                                                                                                       |
| Anti-exemplar code not to copy     | AWS CLI shell interpolation, tag-only deletes, account-wide cleanup                                                                                                                                                                                                                                                                                      |
| Refactoring discipline             | no existing classifier refactor permitted                                                                                                                                                                                                                                                                                                                |
| AI tolerance contract              | N/A - no AI component                                                                                                                                                                                                                                                                                                                                    |
| Forbidden shortcuts                | no placeholder logic, no broad cleanup, no unredacted artifact, no destructive default mode, no `exec`/shell usage                                                                                                                                                                                                                                       |

## 6. Implementation Plan

1. Preserve repo hygiene on `ticket/93-reconciler-s3-sweeper`.
2. Add focused tests for guardrails, redaction, singleton behavior, token mismatch, raw executor context, and S3 batching.
3. Add `OrphanReconciler` / `OrphanSweeper` implementation.
4. Add `S3SweeperExecutor` using `@aws-sdk/client-s3`.
5. Export the new API.
6. Update `packages/drift/README.md`.
7. Run validation commands and update this contract/workpad with evidence.

## 7. BDD Acceptance Scenarios

| Scenario                         | Category       | Given                                          | When                          | Then                                                | Evidence                                  |
| -------------------------------- | -------------- | ---------------------------------------------- | ----------------------------- | --------------------------------------------------- | ----------------------------------------- |
| deterministic redacted plan      | happy path     | fixed clock/nonce and strongly-owned S3 target | `plan()` runs in `sweep-only` | plan is repeatable and hides account ID/bucket name | `packages/drift/tests/reconciler.test.ts` |
| broad prefix rejected            | invalid input  | empty, wildcard, short, or broad prefix        | `plan()` runs                 | error rejects the scope                             | `packages/drift/tests/reconciler.test.ts` |
| weak cloud-only evidence blocked | abuse case     | S3 target has only one ownership signal        | `plan()` runs                 | action is blocked for insufficient evidence         | `packages/drift/tests/reconciler.test.ts` |
| singleton retained               | abuse case     | singleton-like resource is cloud-only          | `plan()` runs                 | resource is retained, not executable                | `packages/drift/tests/reconciler.test.ts` |
| S3 batch bound                   | resource bound | 1001 versions and one multipart upload         | executor runs                 | two delete batches and counts-only result           | `packages/drift/tests/s3-sweeper.test.ts` |

## 8. Validation Plan

| Check                            | Command / Action                                                                                                      | Expected Result                                                          | Actual Result                                                                                       | Status  | Notes                                                                      |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------- |
| Repo hygiene                     | `git status --short --branch && git rev-parse --abbrev-ref HEAD && git symbolic-ref --short refs/remotes/origin/HEAD` | task branch, default branch known                                        | branch `ticket/93-reconciler-s3-sweeper`; default `origin/main`; dirty tree contains #93 files only | pass    | Branch renamed from broader #92 branch                                     |
| New tests fail first             | `pnpm --filter @hulumi/drift test -- tests/reconciler.test.ts tests/s3-sweeper.test.ts`                               | fail before implementation for missing surface or expected guardrail bug | failed first on missing installed S3 SDK and unredacted account scope                               | pass    | SLO process started after initial code, but failure still caught real gaps |
| Formatter                        | `pnpm format:check`                                                                                                   | passes                                                                   | passed                                                                                              | pass    |                                                                            |
| Typecheck / build                | `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build`                                          | passes                                                                   | passed                                                                                              | pass    |                                                                            |
| Static analysis / lint           | `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`                 | passes                                                                   | passed                                                                                              | pass    |                                                                            |
| Unit / BDD tests                 | `pnpm --filter @hulumi/drift test -- tests/reconciler.test.ts tests/s3-sweeper.test.ts`                               | passes                                                                   | 9 tests passed                                                                                      | pass    |                                                                            |
| Runtime validation               | inspect AWS/Pulumi env, run integration only if configured                                                            | pass or documented skip                                                  | no AWS/Pulumi/Hulumi env present locally                                                            | blocked | Must run via configured sandbox/OIDC environment                           |
| Dependency / security audit      | `pnpm audit --prod`                                                                                                   | passes or documented skip                                                | passed after root override to `fast-xml-builder@1.1.7`                                              | pass    |                                                                            |
| Resource bound / invariant check | targeted tests plus `pnpm --filter @hulumi/drift test -- tests/no-shell-exec.test.ts`                                 | passes                                                                   | passed                                                                                              | pass    |                                                                            |
| Compatibility check              | `pnpm --filter @hulumi/drift test`                                                                                    | passes                                                                   | 15 files passed, 67 tests passed                                                                    | pass    |                                                                            |
| `.gitignore` / artifact cleanup  | `git status --short`                                                                                                  | no stray generated artifacts                                             | only #93 source/docs/package files are dirty                                                        | pass    |                                                                            |

## 9. Workpad / Tracker Updates

Workpad comment: https://github.com/kerberosmansour/hulumi/issues/93#issuecomment-4410128397

## 10. Self-Review Gate

- [x] Stayed inside the file allow-list.
- [x] Added focused BDD/unit tests.
- [x] Preserved classifier compatibility by avoiding classifier edits.
- [x] Added guardrail assertions and resource bounds.
- [x] Ran formatter, typecheck/build, static analysis, and full compatibility tests.
- [ ] Updated issue workpad evidence.

## 11. Closure Summary

### Completed

- Added additive `OrphanReconciler` / `OrphanSweeper` exports.
- Added guarded plan/execute semantics, redacted plans, singleton retain behavior, and S3 versioned bucket cleanup executor.
- Added focused guardrail and S3 batching tests.
- Documented classify-only vs guarded reconcile/sweep mode in the drift README.

### Tests And Validation

- `pnpm --filter @hulumi/drift test -- tests/reconciler.test.ts tests/s3-sweeper.test.ts` - pass, 9 tests.
- `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build` - pass.
- `pnpm --filter @hulumi/drift test` - pass, 67 tests.
- `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard` - pass.
- `pnpm format:check` - pass.
- `pnpm audit --prod` - pass.
- Real-AWS runtime validation - blocked locally because no `AWS_*`, `PULUMI_*`, or `HULUMI_*` env vars are present; should run through the configured sandbox/OIDC workflow.

### Lessons / Follow-Ups

#94 should add read-only discovery/decision inputs before any broader resource execution work.

### PR / Issue Links

- #93
