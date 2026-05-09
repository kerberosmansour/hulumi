# Non-S3 AWS Reconcile Action Families - SLO Ticket Contract v1

> **Purpose**: Execute one issue-sized change with v4 SLO rigor, without requiring a full multi-milestone runbook.
> **Audience**: AI coding agents first, humans second.
> **Source template**: Derived from `docs/slo/templates/runbook-template_v_4_template.md`. Use the full v4 runbook when this contract cannot stay issue-sized.

---

## 1. Ticket Metadata

| Field                                       | Value                                                                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ticket Contract ID                          | `ticket-105-non-s3-action-families`                                                                                                              |
| Source tracker                              | `GitHub Issues`                                                                                                                                  |
| Source issue                                | [#105](https://github.com/kerberosmansour/hulumi/issues/105)                                                                                     |
| Issue title                                 | `feat(drift): add non-S3 AWS reconcile action families to plan schema`                                                                           |
| Labels                                      | `enhancement`, `drift`, `aws`, `cleanup`                                                                                                         |
| Assignee / owner                            | `kerberosmansour`                                                                                                                                |
| Target branch                               | `ticket/105-non-s3-action-families`                                                                                                              |
| Primary stack                               | TypeScript, pnpm, Vitest                                                                                                                         |
| Default formatter command                   | `pnpm format:check`                                                                                                                              |
| Default typecheck / build command           | `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build`                                                                     |
| Default static analysis / lint command      | `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`                                            |
| Default unit / BDD command                  | `pnpm --filter @hulumi/drift test -- tests/reconciler-action-families.test.ts tests/reconciler.test.ts tests/reconciler-state-decisions.test.ts` |
| Default runtime validation command          | `pnpm --filter @hulumi/drift test`                                                                                                               |
| Default dependency / security audit command | `pnpm run lint:exact-pin-guard`                                                                                                                  |
| Default debugger or state-inspection tool   | `git diff -- packages/drift/src/reconciler.ts packages/drift/tests/reconciler-action-families.test.ts`                                           |
| Public interfaces stable by default         | yes                                                                                                                                              |
| Allowed new dependencies by default         | none                                                                                                                                             |
| Schema/config migration allowed by default  | no                                                                                                                                               |

### Public interfaces that must remain stable unless explicitly listed otherwise

- `OrphanReconciler.plan()` remains backwards compatible for existing S3 sweep behavior.
- `ReconcilePlanAction` keeps existing fields; this ticket only adds `ReconcileActionType` values.
- `execute()` remains executor-gated and must not gain AWS SDK behavior in this slice.

---

## 2. Sizing Gate

| Check                                          | Answer                                                                        |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| User-visible outcome fits in one sentence      | yes - plans expose typed non-S3 AWS cleanup families without adding executors |
| Expected changed files <= 8                    | yes - contract, planner, focused BDD test                                     |
| New public surfaces <= 1                       | yes - additive action type vocabulary                                         |
| No schema migration unless explicitly approved | yes                                                                           |
| No cross-subsystem rewrite                     | yes                                                                           |
| Can be reviewed as one PR                      | yes                                                                           |
| Requires full v4 runbook instead               | no - planning-only, no live AWS mutations                                     |

---

## 3. Issue Context

### Problem

Issue #105 asks for non-S3 AWS reconciliation families to be visible in the plan schema instead of hiding every future cleanup behind the generic `deleteCloudResource` decision. Today only S3 buckets receive a typed executor family; non-S3 cloud-only resources are retained as unsupported even when they are strongly owned and scoped.

### Acceptance Criteria From Issue

- [ ] Plan schema exposes explicit action types rather than overloading generic `deleteCloudResource`.
- [ ] Unsupported/non-executable action families remain blocked without an executor.
- [ ] Shared singleton resources are retained by default unless a dedicated option allows singleton deletion.
- [ ] Unit tests verify deterministic ordering and redaction for the new action families.
- [ ] No AWS SDK dependency is added in this planning-only slice.

### Non-Goals

- No AWS SDK clients, live AWS calls, or destructive executors.
- No Pulumi state mutation executor.
- No changes to integration test account setup.
- No CodeQL, Semgrep, secret scanning, or GitHub security rule authoring.

### Reproduction / Current Signal

| Signal           | Evidence                                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Baseline command | `pnpm --filter @hulumi/drift test -- tests/reconciler.test.ts tests/reconciler-state-decisions.test.ts`                                                      |
| Current result   | pass before edits; non-S3 cloud-only resources plan as `retainUnsupportedResource` unless adoption is requested                                              |
| Expected result  | supported non-S3 AWS cleanup families plan as explicit action types, remain non-executable without executors, sort deterministically, and redact identifiers |

---

## 4. Compact Architecture Delta

| Component                          | Existing behavior                                                                 | Change                                                                  | Interface / trust boundary touched     |
| ---------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------- |
| `packages/drift/src/reconciler.ts` | S3 has typed sweep planning; non-S3 cleanup remains generic unsupported retention | Add planning-only action-family mapping for selected AWS resource types | Public TypeScript action type union    |
| `OrphanReconciler.execute()`       | Executes only when a typed executor is registered                                 | No behavior change; new action families have no executors by default    | Executor trust boundary remains closed |

### Data Flow Delta

```text
ReconcileTarget(identity.type)
  -> plan()
  -> typed non-S3 ReconcileActionType
  -> executable=false unless an executor is registered in a later ticket
```

---

## 5. Contract Block

| Contract Row                       | Value                                                                                                                                                                                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inputs                             | GitHub issue #105, existing reconciler planner, existing redaction/sorting helpers                                                                                                                                                                          |
| Outputs                            | Ticket contract, BDD tests, additive planner action-family vocabulary                                                                                                                                                                                       |
| Interfaces touched                 | `ReconcileActionType` public union, `OrphanReconciler.plan()` action classification                                                                                                                                                                         |
| Files allowed to change            | `docs/slo/tickets/ticket-105-non-s3-action-families.md`, `packages/drift/src/reconciler.ts`, `packages/drift/tests/reconciler-action-families.test.ts`, `packages/drift/tests/reconciler-state-decisions.test.ts`, `packages/drift/tests/discovery.test.ts` |
| Files to read before changing      | `docs/ARCHITECTURE.md`, `packages/drift/src/reconciler.ts`, `packages/drift/tests/reconciler.test.ts`, `packages/drift/tests/reconciler-state-decisions.test.ts`, `packages/drift/package.json`                                                             |
| New files allowed                  | `packages/drift/tests/reconciler-action-families.test.ts`                                                                                                                                                                                                   |
| New dependencies allowed           | none                                                                                                                                                                                                                                                        |
| Migration allowed                  | no                                                                                                                                                                                                                                                          |
| Compatibility commitments          | Existing S3 sweep action remains `drainS3BucketVersions`; read-only modes remain non-executable; `execute()` remains executor-gated                                                                                                                         |
| Data classification                | Public                                                                                                                                                                                                                                                      |
| Proactive controls in play         | Input validation through existing scope guardrails; safe-by-default executor gating; redaction of identifiers                                                                                                                                               |
| Abuse acceptance scenarios         | BDD rows below cover forged broad cleanup attempts and singleton retention defaults                                                                                                                                                                         |
| Resource bounds introduced/changed | No new queues/caches; existing `maxActions` cap remains in force                                                                                                                                                                                            |
| Invariants/assertions required     | New action families must not be executable without an executor; singleton delete must require `allowSingletonDelete`; plan JSON must not leak account IDs or physical IDs                                                                                   |
| Debugger / inspection expectation  | Use `git diff` if test failure location is ambiguous; no interactive debugger required                                                                                                                                                                      |
| Static analysis gates              | Formatter, TypeScript typecheck/build, ESLint, license-boundary lint, exact-pin guard                                                                                                                                                                       |
| Reversibility / rollback path      | Revert this branch; additive action type names do not require data migration                                                                                                                                                                                |
| Exemplar code to copy              | Existing S3 and state/adoption classification tests in `packages/drift/tests/reconciler*.test.ts`                                                                                                                                                           |
| Anti-exemplar code not to copy     | Do not add AWS SDK clients or executor side effects in `reconciler.ts`                                                                                                                                                                                      |
| Refactoring discipline             | Minimal helper extraction only when it directly supports typed action-family mapping                                                                                                                                                                        |
| AI tolerance contract              | N/A - no AI component                                                                                                                                                                                                                                       |
| Forbidden shortcuts                | No placeholder executor, no silent destructive default, no dependency additions, no broad refactor, no unredacted identifiers in plan artifacts                                                                                                             |

---

## 6. Implementation Plan

1. Confirm repo hygiene and baseline tests.
2. Write BDD tests for typed non-S3 action families, singleton retention, deterministic ordering, redaction, and executor blocking.
3. Run the new BDD file and confirm it fails for missing action-family planning.
4. Add additive `ReconcileActionType` values and a deterministic resource-type mapping helper.
5. Keep mapped non-S3 cleanup families non-executable until an executor is registered in later tickets.
6. Preserve S3 sweep and state/adoption behavior.
7. Run targeted and full drift validation plus static gates.
8. Fill evidence, update the issue workpad, and hand off a PR.

---

## 7. BDD Acceptance Scenarios

| Scenario                                          | Category               | Given                                                                                                        | When                                        | Then                                                                                                                   | Evidence                             |
| ------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| typed non-S3 cleanup families                     | happy path             | strongly owned cloud-only CloudTrail, log group, Config, IAM, KMS, SNS, EventBridge, Access Analyzer targets | planner runs in `sweep-only`                | each target gets an explicit action type and `deleteCloudResource` decision, but is non-executable without an executor | `reconciler-action-families.test.ts` |
| broad or weak cleanup remains blocked             | invalid input          | cloud-only supported non-S3 target with insufficient ownership evidence or missing prefix                    | planner runs                                | action is blocked or retained and not executable                                                                       | `reconciler-action-families.test.ts` |
| shared singletons retained by default             | empty / degraded state | GuardDuty/Security Hub singleton target in scope                                                             | planner runs without `allowSingletonDelete` | action recommends `retainExternal` and `retainSharedSingleton`                                                         | `reconciler-action-families.test.ts` |
| identifiers redacted and sorted deterministically | abuse case             | attacker-controlled physical IDs and account IDs are present                                                 | plan is serialized                          | account IDs and physical IDs are redacted; action order is stable by action type and resource identity                 | `reconciler-action-families.test.ts` |

---

## 8. Validation Plan

| Check                            | Command / Action                                                                                                                                 | Expected Result                                                                                     | Actual Result                                                                                                                    | Status | Notes                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------- |
| Repo hygiene                     | `git status --short --branch && git rev-parse --abbrev-ref HEAD && git symbolic-ref --short refs/remotes/origin/HEAD`                            | branch `ticket/105-non-s3-action-families`, default `origin/main`, no project edits before contract | branch `ticket/105-non-s3-action-families`, default `origin/main`; workpad comment created; contract added after branch creation | pass   |                                                     |
| Baseline before change           | `pnpm --filter @hulumi/drift test -- tests/reconciler.test.ts tests/reconciler-state-decisions.test.ts`                                          | passes                                                                                              | pass, 2 files / 11 tests                                                                                                         | pass   | before planner edits                                |
| New tests fail first             | `pnpm --filter @hulumi/drift test -- tests/reconciler-action-families.test.ts`                                                                   | fails for missing typed non-S3 planning                                                             | failed as expected: 4 tests saw `retainUnsupportedResource` instead of typed action families                                     | pass   | before planner edits                                |
| Formatter                        | `pnpm format:check`                                                                                                                              | passes                                                                                              | pass after running Prettier on touched files                                                                                     | pass   |                                                     |
| Typecheck / build                | `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build`                                                                     | passes                                                                                              | pass                                                                                                                             | pass   |                                                     |
| Static analysis / lint           | `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`                                            | passes                                                                                              | pass; license-boundary OK; exact-pin guard OK                                                                                    | pass   |                                                     |
| Unit / BDD tests                 | `pnpm --filter @hulumi/drift test -- tests/reconciler-action-families.test.ts tests/reconciler.test.ts tests/reconciler-state-decisions.test.ts` | passes                                                                                              | pass, 3 files / 16 tests                                                                                                         | pass   |                                                     |
| Runtime validation               | `pnpm --filter @hulumi/drift test`                                                                                                               | passes                                                                                              | pass, 22 files / 97 tests                                                                                                        | pass   | planning-only runtime exercised through drift tests |
| Dependency / security audit      | `pnpm run lint:exact-pin-guard`                                                                                                                  | passes                                                                                              | pass, 11 pinned deps match expected integrity hashes                                                                             | pass   | no dependency changes                               |
| Resource bound / invariant check | assertions in `reconciler-action-families.test.ts`                                                                                               | unsupported actions non-executable, redaction stable, singleton retained by default                 | pass: typed families are non-executable without executors; Config recorder depends on delivery channel; identifiers are redacted | pass   |                                                     |
| Compatibility check              | existing S3/state tests in targeted command                                                                                                      | passes                                                                                              | pass, existing S3 sweep behavior preserved                                                                                       | pass   | updated old unsupported fixtures to Lambda          |
| `.gitignore` / artifact cleanup  | `git status --short`                                                                                                                             | no stray artifacts                                                                                  | only allow-listed source/test/contract files changed                                                                             | pass   |                                                     |

---

## 9. Workpad / Tracker Updates

Use issue comment `https://github.com/kerberosmansour/hulumi/issues/105#issuecomment-4410758499` as the persistent workpad.

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

- Added explicit planning-only non-S3 AWS cleanup action-family types for CloudTrail, CloudWatch Logs, AWS Config delivery channels/recorders, IAM roles, KMS keys, SNS topics, EventBridge rules, Access Analyzer, GuardDuty, and Security Hub.
- Kept these families non-executable without registered executors and preserved existing S3 sweep behavior.
- Added deterministic AWS Config ordering so recorder deletion depends on delivery channel deletion when both appear in a plan.
- Updated older unsupported-resource fixtures from newly supported IAM/CloudWatch types to Lambda.

### Tests And Validation

- `pnpm --filter @hulumi/drift test -- tests/reconciler-action-families.test.ts`: failed before implementation for the expected typed-family assertions.
- `pnpm --filter @hulumi/drift test -- tests/reconciler-action-families.test.ts tests/reconciler.test.ts tests/reconciler-state-decisions.test.ts`: pass, 3 files / 16 tests.
- `pnpm --filter @hulumi/drift test`: pass, 22 files / 97 tests.
- `pnpm --filter @hulumi/drift typecheck && pnpm --filter @hulumi/drift build`: pass.
- `pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`: pass.
- `pnpm format:check`: pass.

### Lessons / Follow-Ups

- #106 should consume these typed families for the first guarded non-S3 executor; this ticket intentionally added no AWS SDK client or executor.

### PR / Issue Links

- PR: Pending.
- Issue: https://github.com/kerberosmansour/hulumi/issues/105
