# Forbidden Shortcut Helper - SLO Ticket Contract v1

> **Purpose**: Execute one issue-sized change with v4 SLO rigor, without requiring a full multi-milestone runbook.
> **Audience**: AI coding agents first, humans second.
> **Source template**: Derived from `docs/slo/templates/runbook-template_v_4_template.md`. Use the full v4 runbook when this contract cannot stay issue-sized.

---

## 1. Ticket Metadata

| Field                                       | Value                                                                                                                   |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Ticket Contract ID                          | `ticket-25-forbidden-shortcut-helper`                                                                                   |
| Source tracker                              | `GitHub Issues`                                                                                                         |
| Source issue                                | [#25](https://github.com/kerberosmansour/hulumi/issues/25)                                                              |
| Issue title                                 | `chore(tests): extract reusable forbidden-shortcut lint helper`                                                         |
| Labels                                      | `good first issue`, `tooling`, `tests`                                                                                  |
| Assignee / owner                            | `kerberosmansour`                                                                                                       |
| Target branch                               | `ticket/25-forbidden-shortcut-helper`                                                                                   |
| Primary stack                               | TypeScript, Vitest, repo-wide test utilities                                                                            |
| Default formatter command                   | `pnpm run format:check`                                                                                                 |
| Default typecheck / build command           | `pnpm --filter @hulumi/baseline typecheck && pnpm --filter @hulumi/drift typecheck`                                     |
| Default static analysis / lint command      | `pnpm --filter @hulumi/baseline lint && pnpm --filter @hulumi/drift lint && pnpm run lint:license-boundary`             |
| Default unit / BDD command                  | `pnpm --filter @hulumi/baseline test -- tests/account-foundation.test.ts && pnpm --filter @hulumi/drift test -- tests/no-shell-exec.test.ts` |
| Default runtime validation command          | `N/A - test-helper refactor only; behavior covered by Vitest`                                                           |
| Default dependency / security audit command | `pnpm run lint:exact-pin-guard`                                                                                         |
| Default debugger or state-inspection tool   | `N/A - deterministic file-system scans`                                                                                 |
| Public interfaces stable by default         | `yes - test-only helper; no package runtime API change`                                                                 |
| Allowed new dependencies by default         | `none`                                                                                                                  |
| Schema/config migration allowed by default  | `no`                                                                                                                    |

### Public interfaces that must remain stable unless explicitly listed otherwise

- Runtime package APIs remain unchanged.
- Existing forbidden-shortcut test intent remains unchanged.
- The helper is a test utility, not an exported package API.

---

## 2. Sizing Gate

| Check                                          | Answer                                                                            |
| ---------------------------------------------- | --------------------------------------------------------------------------------- |
| User-visible outcome fits in one sentence      | yes - duplicate forbidden-shortcut scan logic is replaced by one shared test helper |
| Expected changed files <= 8                    | yes                                                                               |
| New public surfaces <= 1                       | yes - one repo test utility                                                       |
| No schema migration unless explicitly approved | yes                                                                               |
| No cross-subsystem rewrite                     | yes                                                                               |
| Can be reviewed as one PR                      | yes                                                                               |
| Requires full v4 runbook instead               | no - local test-helper refactor                                                   |

---

## 3. Issue Context

### Problem

The repo has repeated file-walking / forbidden-symbol scanning tests. The drift package owns `packages/drift/tests/no-shell-exec.test.ts`; the current baseline no-sleep scan lives inside `packages/baseline/tests/account-foundation.test.ts` rather than a standalone `no-sleep.test.ts`. Both should use one helper that walks TypeScript files, strips comments before matching, and supports exclude paths.

Issue excerpt, fenced as tracker input:

~~~text
Extract into a tests/_utils/forbidden-shortcut.ts helper that takes (dir, denyPatterns, excludePaths) and returns a vitest-compatible matcher. Refactor both call sites.
~~~

### Acceptance Criteria From Issue

- [ ] `tests/_utils/forbidden-shortcut.ts` exists with the helper API.
- [ ] `packages/drift/tests/no-shell-exec.test.ts` uses it.
- [ ] The active no-sleep scan uses it. Current HEAD has this scan in `packages/baseline/tests/account-foundation.test.ts`, not in a standalone `no-sleep.test.ts`.
- [ ] Behavior remains unchanged and comment stripping still works.

### Non-Goals

- Do not change production source.
- Do not add dependencies.
- Do not broaden or weaken the forbidden-shortcut deny lists.
- Do not move tests between packages unless needed by the helper import.
- Do not create a fake standalone `no-sleep.test.ts` just to satisfy stale issue wording.

### Reproduction / Current Signal

| Signal                | Evidence                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------- |
| Missing helper         | `test -f tests/_utils/forbidden-shortcut.ts` fails before implementation                 |
| Duplicate scan logic   | `packages/drift/tests/no-shell-exec.test.ts` owns walk/comment stripping locally         |
| Current no-sleep scan  | `packages/baseline/tests/account-foundation.test.ts` owns a separate walk/deny loop      |
| Expected result        | Both call sites import the shared helper and their focused tests stay green              |

---

## 4. Compact Architecture Delta

N/A - no runtime architecture delta. This is a test-helper refactor.

### Data Flow Delta

```text
package test files
  -> tests/_utils/forbidden-shortcut.ts
  -> walk TypeScript files
  -> strip comments
  -> report offenders to Vitest expect()
```

---

## 5. Contract Block

| Contract Row                       | Value                                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inputs                             | GitHub issue #25, drift forbidden-shortcut test, baseline no-sleep scan, M4 lessons note                                                          |
| Outputs                            | Shared helper, two refactored call sites, focused validation evidence, ticket evidence                                                            |
| Interfaces touched                 | Test utility only                                                                                                                                 |
| Files allowed to change            | `docs/slo/tickets/ticket-25-forbidden-shortcut-helper.md`, `tests/_utils/forbidden-shortcut.ts`, `packages/drift/tests/no-shell-exec.test.ts`, `packages/baseline/tests/account-foundation.test.ts` |
| Files to read before changing      | `packages/drift/tests/no-shell-exec.test.ts`, `packages/baseline/tests/account-foundation.test.ts`, `packages/drift/src/urn-sanitize.ts`, `packages/drift/src/probe.ts`, `docs/slo/lessons/hulumi-m4.md`, `docs/issue-candidates.md` |
| New files allowed                  | `tests/_utils/forbidden-shortcut.ts`, this ticket contract                                                                                        |
| New dependencies allowed           | none                                                                                                                                              |
| Migration allowed                  | no                                                                                                                                                |
| Compatibility commitments          | Existing tests stay semantically equivalent; comments mentioning forbidden APIs must not fail the scan                                             |
| Data classification                | Public                                                                                                                                            |
| Proactive controls in play         | C5 Validate Inputs / Outputs - helper reports deterministic offender paths and labels                                                             |
| Abuse acceptance scenarios         | BDD rows cover comments that mention forbidden APIs and exclude paths that allow sanctioned wrappers                                               |
| Resource bounds introduced/changed | Helper walks finite local directory trees synchronously; no network, subprocesses, or unbounded recursion outside provided root                    |
| Invariants/assertions required     | Helper strips block and line comments before matching; helper only scans `.ts` files; exclude paths are honored by suffix or exact normalized path |
| Debugger / inspection expectation  | N/A - offender arrays provide direct state inspection                                                                                              |
| Static analysis gates              | formatter, baseline/drift typecheck, baseline/drift lint, license-boundary lint, exact-pin guard                                                   |
| Reversibility / rollback path      | Inline helper logic back into the two tests; no runtime rollback                                                                                   |
| Exemplar code to copy              | Existing `no-shell-exec.test.ts` comment-stripping behavior                                                                                        |
| Anti-exemplar code not to copy     | Do not scan comments naively; do not use shell commands or grep from tests                                                                         |
| Refactoring discipline             | Preserve tests green before/after; extract helper without changing deny pattern semantics                                                          |
| AI tolerance contract              | N/A - no AI component                                                                                                                             |
| Forbidden shortcuts                | No production changes; no new dependency; no broad test reorganization; no weakening of deny lists                                                |

---

## 6. Implementation Plan

1. Run focused baseline/drift tests as baseline.
2. Record red-first helper absence with `test -f tests/_utils/forbidden-shortcut.ts`.
3. Add `tests/_utils/forbidden-shortcut.ts` with walk, comment stripping, exclude handling, and Vitest assertion helper.
4. Refactor `packages/drift/tests/no-shell-exec.test.ts` to use the helper.
5. Refactor the baseline no-sleep block in `packages/baseline/tests/account-foundation.test.ts` to use the helper.
6. Run focused tests, typecheck, lint/static gates, format, and diff checks.
7. Fill evidence, update workpad, commit with DCO sign-off, push, and open PR.

---

## 7. BDD Acceptance Scenarios

| Scenario                                  | Category               | Given                                        | When                    | Then                                                       | Evidence |
| ----------------------------------------- | ---------------------- | -------------------------------------------- | ----------------------- | ---------------------------------------------------------- | -------- |
| Drift shell shortcuts stay banned          | happy path             | `packages/drift/src`                         | no-shell test runs      | no `child_process`, `exec`, `spawn`, or `execSync` offenders | focused drift test |
| Drift inline waits stay banned             | happy path             | `packages/drift/src` with `src/probe.ts` excluded | no-shell test runs      | no unsanctioned `setTimeout`, `sleep`, or `await new Promise` offenders | focused drift test |
| Baseline inline waits stay banned          | happy path             | `packages/baseline/src/aws` with `probes/` excluded | AccountFoundation test runs | no unsanctioned wait offenders                             | focused baseline test |
| Comment mentions do not false-positive     | abuse case             | source comments mention forbidden names      | helper strips comments  | comments alone do not produce offenders                    | drift test keeps `urn-sanitize.ts` green |
| Missing helper fails before implementation | empty / degraded state | helper file absent                           | `test -f` probe runs    | command fails before implementation                        | red-first shell probe |

---

## 8. Validation Plan

| Check                            | Command / Action                                                                                                                                 | Expected Result                                    | Actual Result | Status  | Notes |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | ------------- | ------- | ----- |
| Repo hygiene                     | `git status --short --branch && git rev-parse --abbrev-ref HEAD && git symbolic-ref --short refs/remotes/origin/HEAD`                            | branch is ticket branch; no unrelated dirt         | branch `ticket/25-forbidden-shortcut-helper`; origin default `main`; no dirty files before edits | pass |       |
| Baseline before change           | `pnpm --filter @hulumi/baseline test -- tests/account-foundation.test.ts && pnpm --filter @hulumi/drift test -- tests/no-shell-exec.test.ts`      | green or known failure captured                    | passed before implementation: baseline 22 tests; drift no-shell 2 tests | pass |       |
| New helper fails first           | `test -f tests/_utils/forbidden-shortcut.ts`                                                                                                      | fails before implementation                        | failed before implementation | pass |       |
| Formatter                        | `pnpm run format:check`                                                                                                                          | passes                                             | initially flagged refactored test files; targeted Prettier run; rerun passed | pass |       |
| Typecheck / build                | `pnpm --filter @hulumi/baseline typecheck && pnpm --filter @hulumi/drift typecheck`                                                              | passes                                             | passed | pass |       |
| Static analysis / lint           | `pnpm --filter @hulumi/baseline lint && pnpm --filter @hulumi/drift lint && pnpm exec eslint tests/_utils/forbidden-shortcut.ts && pnpm run lint:license-boundary` | passes                                 | passed; helper file linted directly; license-boundary OK | pass |       |
| Unit / BDD tests                 | `pnpm --filter @hulumi/baseline test -- tests/account-foundation.test.ts && pnpm --filter @hulumi/drift test -- tests/no-shell-exec.test.ts`      | passes                                             | passed: baseline 22 tests; drift no-shell 3 tests | pass |       |
| Runtime validation               | N/A                                                                                                                                              | no runtime behavior changed                        | N/A - test-helper refactor only | pass |       |
| Dependency / security audit      | `pnpm run lint:exact-pin-guard`                                                                                                                  | passes                                             | passed: 13 pinned deps match expected integrity hashes | pass | no deps changed |
| Resource bound / invariant check | helper-focused call sites and exclude paths                                                                                                      | helper scans only finite `.ts` file trees          | passed through focused tests and helper lint | pass |       |
| Compatibility check              | focused tests + typecheck                                                                                                                        | existing behavior preserved                        | passed | pass |       |
| `.gitignore` / artifact cleanup  | `git status --short`                                                                                                                             | no stray artifacts outside scoped files            | scoped changes only: two refactored tests, helper, ticket contract | pass | ticket file is ignored by repo policy and must be force-added if committed |
| Diff whitespace                  | `git diff --check`                                                                                                                               | passes                                             | passed | pass |       |

---

## 9. Workpad / Tracker Updates

Workpad comment: https://github.com/kerberosmansour/hulumi/issues/25#issuecomment-4464631084

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
- [ ] Did I update the issue workpad and PR handoff notes?

---

## 11. Closure Summary

### Completed

- Added `tests/_utils/forbidden-shortcut.ts` with TypeScript file walking, comment stripping, exclude-path support, offender reporting, and a Vitest assertion helper.
- Refactored `packages/drift/tests/no-shell-exec.test.ts` to use the helper.
- Refactored the active baseline no-sleep scan in `packages/baseline/tests/account-foundation.test.ts` to use the helper.
- Added a direct drift helper-contract assertion that comment-only forbidden prose is stripped before matching.

### Tests And Validation

- Baseline before change passed: `pnpm --filter @hulumi/baseline test -- tests/account-foundation.test.ts` and `pnpm --filter @hulumi/drift test -- tests/no-shell-exec.test.ts`.
- Red-first helper probe passed: `test -f tests/_utils/forbidden-shortcut.ts` failed before implementation.
- `pnpm --filter @hulumi/baseline test -- tests/account-foundation.test.ts` passed with 22 tests.
- `pnpm --filter @hulumi/drift test -- tests/no-shell-exec.test.ts` passed with 3 tests.
- `pnpm --filter @hulumi/baseline typecheck && pnpm --filter @hulumi/drift typecheck` passed.
- `pnpm --filter @hulumi/baseline lint && pnpm --filter @hulumi/drift lint && pnpm exec eslint tests/_utils/forbidden-shortcut.ts && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard` passed.
- `pnpm run format:check` passed after targeted Prettier.
- `git diff --check` passed.

### Lessons / Follow-Ups

- Issue text referenced a standalone `no-sleep.test.ts`; current HEAD keeps that scan in `packages/baseline/tests/account-foundation.test.ts`, so this ticket refactored the active call site.

### PR / Issue Links

- PR: pending
- Issue: https://github.com/kerberosmansour/hulumi/issues/25
