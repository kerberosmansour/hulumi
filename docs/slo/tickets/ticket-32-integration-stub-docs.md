# Integration Test Stub Docs - SLO Ticket Contract v1

> **Purpose**: Execute one issue-sized change with v4 SLO rigor, without requiring a full multi-milestone runbook.
> **Audience**: AI coding agents first, humans second.
> **Source template**: Derived from `docs/slo/templates/runbook-template_v_4_template.md`. Use the full v4 runbook when this contract cannot stay issue-sized.

---

## 1. Ticket Metadata

| Field                                       | Value                                                                                                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ticket Contract ID                          | `ticket-32-integration-stub-docs`                                                                                                                                                                       |
| Source tracker                              | `GitHub Issues`                                                                                                                                                                                         |
| Source issue                                | [#32](https://github.com/kerberosmansour/hulumi/issues/32)                                                                                                                                              |
| Issue title                                 | `chore(tests): document the it.skip integration-test stub pattern as the official convention`                                                                                                           |
| Labels                                      | `documentation`, `tests`                                                                                                                                                                                |
| Assignee / owner                            | `kerberosmansour`                                                                                                                                                                                       |
| Target branch                               | `ticket/32-integration-stub-docs`                                                                                                                                                                       |
| Primary stack                               | Markdown docs, Vitest convention                                                                                                                                                                        |
| Default formatter command                   | `pnpm run format:check`                                                                                                                                                                                 |
| Default typecheck / build command           | `N/A - docs-only change`                                                                                                                                                                                |
| Default static analysis / lint command      | `pnpm run lint:license-boundary`                                                                                                                                                                        |
| Default unit / BDD command                  | `rg -n "Integration test stub pattern" docs/development.md && rg -n "HULUMI_INTEGRATION" docs/development.md && rg -n "describe\\.skipIf" docs/development.md && rg -n "it\\.skip" docs/development.md` |
| Default runtime validation command          | `N/A - documentation-only convention`                                                                                                                                                                   |
| Default dependency / security audit command | `pnpm run lint:exact-pin-guard`                                                                                                                                                                         |
| Default debugger or state-inspection tool   | `N/A - deterministic docs edit`                                                                                                                                                                         |
| Public interfaces stable by default         | `yes - no package API or workflow behavior changes`                                                                                                                                                     |
| Allowed new dependencies by default         | `none`                                                                                                                                                                                                  |
| Schema/config migration allowed by default  | `no`                                                                                                                                                                                                    |

### Public interfaces that must remain stable unless explicitly listed otherwise

- Package runtime APIs remain unchanged.
- Existing CI and weekly integration workflow behavior remains unchanged.
- Existing integration tests are not modified by this ticket.

---

## 2. Sizing Gate

| Check                                          | Answer                                                                                                      |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| User-visible outcome fits in one sentence      | yes - contributors get the canonical real-service integration skip/gate convention in the development guide |
| Expected changed files <= 8                    | yes                                                                                                         |
| New public surfaces <= 1                       | yes - one docs convention section                                                                           |
| No schema migration unless explicitly approved | yes                                                                                                         |
| No cross-subsystem rewrite                     | yes                                                                                                         |
| Can be reviewed as one PR                      | yes                                                                                                         |
| Requires full v4 runbook instead               | no - docs-only convention update                                                                            |

---

## 3. Issue Context

### Problem

Hulumi already uses skip-gated real-service integration tests, but the
canonical contributor-facing pattern is not documented in `docs/development.md`.

Issue excerpt, fenced as tracker input:

```text
Document it in docs/development.md section Testing strategy with the canonical shape so the M5-and-beyond pattern is unambiguous.
```

### Acceptance Criteria From Issue

- [ ] `docs/development.md` has a small `Integration test stub pattern` section showing the canonical `it.skip` and env-var gate shape.
- [ ] Future integration tests follow it.

### Non-Goals

- Do not change integration test behavior.
- Do not modify the weekly workflow.
- Do not add dependencies.
- Do not document real credentials, account IDs, role ARNs, backend bucket names, or secret values.

### Reproduction / Current Signal

| Signal               | Evidence                                                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Missing docs section | `rg -n "Integration test stub pattern" docs/development.md` fails before implementation                                                                                                                |
| Existing pattern     | `packages/baseline/tests/integration/account-foundation.integration.test.ts` and `packages/drift/tests/integration/drift-classify.integration.test.ts` use `HULUMI_INTEGRATION` gates and skip notices |
| Expected result      | `docs/development.md` includes the pattern and future-test instruction                                                                                                                                 |

---

## 4. Compact Architecture Delta

N/A - no architecture delta. This is a development-documentation update only.

### Data Flow Delta

```text
developer reads docs/development.md
  -> copies the canonical real-service integration gate
  -> PR CI stays non-mutating by default
  -> weekly/manual workflow owns real deploy/assert/teardown proof
```

---

## 5. Contract Block

| Contract Row                       | Value                                                                                                                                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Inputs                             | GitHub issue #32, existing integration test files, `docs/development.md`, `docs/integration-testing.md`                                                                                                                                    |
| Outputs                            | Development-guide section, ticket contract, PR                                                                                                                                                                                             |
| Interfaces touched                 | Documentation only                                                                                                                                                                                                                         |
| Files allowed to change            | `docs/development.md`, `docs/slo/tickets/ticket-32-integration-stub-docs.md`                                                                                                                                                               |
| Files to read before changing      | `docs/development.md`, `docs/integration-testing.md`, `packages/baseline/tests/integration/account-foundation.integration.test.ts`, `packages/drift/tests/integration/drift-classify.integration.test.ts`, `docs/slo/lessons/hulumi-m4.md` |
| New files allowed                  | `docs/slo/tickets/ticket-32-integration-stub-docs.md`                                                                                                                                                                                      |
| New dependencies allowed           | none                                                                                                                                                                                                                                       |
| Migration allowed                  | no                                                                                                                                                                                                                                         |
| Compatibility commitments          | Existing workflows/tests remain unchanged; docs do not reveal secrets or weaken integration gates                                                                                                                                          |
| Data classification                | Public                                                                                                                                                                                                                                     |
| Proactive controls in play         | N/A - docs-only change; secret-handling warning remains in prose                                                                                                                                                                           |
| Abuse acceptance scenarios         | Docs must not encourage real credentials on PRs or print secret values                                                                                                                                                                     |
| Resource bounds introduced/changed | N/A - no runtime resource change                                                                                                                                                                                                           |
| Invariants/assertions required     | Pattern keeps default PR path skipped/non-mutating and exposes skip reason                                                                                                                                                                 |
| Debugger / inspection expectation  | N/A - deterministic docs edit                                                                                                                                                                                                              |
| Static analysis gates              | Markdown formatting, license-boundary lint, exact-pin guard, diff whitespace check                                                                                                                                                         |
| Reversibility / rollback path      | Revert the docs section and ticket contract                                                                                                                                                                                                |
| Exemplar code to copy              | Existing skip-gated integration tests listed above                                                                                                                                                                                         |
| Anti-exemplar code not to copy     | Do not show always-on real AWS tests or ambient credential assumptions                                                                                                                                                                     |
| Refactoring discipline             | N/A - no refactor                                                                                                                                                                                                                          |
| AI tolerance contract              | N/A - no AI component                                                                                                                                                                                                                      |
| Forbidden shortcuts                | No secret values, no behavior changes, no workflow changes, no broad docs rewrite                                                                                                                                                          |

---

## 6. Implementation Plan

1. Read the existing development guide and integration-test examples.
2. Record the red-first docs probe.
3. Add a small `Integration test stub pattern` section under `Testing strategy`.
4. Add this ticket contract.
5. Run docs/static validation.
6. Update the issue workpad, commit with DCO sign-off, push, and open a PR.

---

## 7. BDD Acceptance Scenarios

| Scenario             | Category             | Given                                   | When                                           | Then                                                                               | Evidence                          |
| -------------------- | -------------------- | --------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------- |
| Pattern documented   | happy path           | contributor reads `docs/development.md` | they search for integration stub guidance      | the guide shows `HULUMI_INTEGRATION`, `describe.skipIf`, and `it.skip` skip notice | `rg` validation                   |
| PR path remains safe | abuse case           | a future contributor copies the pattern | the test runs in PR CI without opt-in env vars | real-service block stays skipped and skip reason is visible                        | docs text + snippet               |
| No secrets disclosed | abuse case           | public docs render the snippet          | user reads required gates                      | docs mention env var names only, not values                                        | review + license/static gates     |
| Existing docs absent | empty/degraded state | development guide before implementation | red-first probe runs                           | `Integration test stub pattern` is missing                                         | failed `rg` before implementation |

---

## 8. Validation Plan

| Check                            | Command / Action                                                                                                                                                                                        | Expected Result                                | Actual Result                                                                                                         | Status | Notes |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| Repo hygiene                     | `git status --short --branch && git rev-parse --abbrev-ref HEAD && git symbolic-ref --short refs/remotes/origin/HEAD`                                                                                   | branch is ticket branch; no unrelated dirt     | branch `ticket/32-integration-stub-docs`; origin default `main`; clean before edits                                   | pass   |       |
| Baseline before change           | `rg -n "Integration test stub pattern" docs/development.md`                                                                                                                                             | fails before implementation                    | failed before implementation                                                                                          | pass   |       |
| New docs check                   | `rg -n "Integration test stub pattern" docs/development.md && rg -n "HULUMI_INTEGRATION" docs/development.md && rg -n "describe\\.skipIf" docs/development.md && rg -n "it\\.skip" docs/development.md` | passes                                         | passed; section and key gate symbols found                                                                            | pass   |       |
| Formatter                        | `pnpm run format:check`                                                                                                                                                                                 | passes                                         | passed                                                                                                                | pass   |       |
| Typecheck / build                | N/A                                                                                                                                                                                                     | docs-only change                               | N/A - no TypeScript/runtime changes                                                                                   | pass   |       |
| Static analysis / lint           | `pnpm run lint:license-boundary`                                                                                                                                                                        | passes                                         | passed                                                                                                                | pass   |       |
| Unit / BDD tests                 | N/A                                                                                                                                                                                                     | docs-only change; grep check covers acceptance | N/A - acceptance is docs grep                                                                                         | pass   |       |
| Runtime validation               | N/A                                                                                                                                                                                                     | no runtime behavior changed                    | N/A - docs-only change                                                                                                | pass   |       |
| Dependency / security audit      | `pnpm run lint:exact-pin-guard`                                                                                                                                                                         | passes                                         | passed                                                                                                                | pass   |       |
| Resource bound / invariant check | docs review                                                                                                                                                                                             | no real-service PR default is documented       | passed; docs keep PR path skipped/non-mutating and weekly/manual workflow owns real deploy/assert/teardown proof      | pass   |       |
| Compatibility check              | `git diff --check`                                                                                                                                                                                      | passes                                         | passed                                                                                                                | pass   |       |
| `.gitignore` / artifact cleanup  | `git status --short`                                                                                                                                                                                    | scoped files only                              | scoped visible change in `docs/development.md`; this ticket file is under ignored `docs/slo/` and must be force-added | pass   |       |

---

## 9. Workpad / Tracker Updates

Workpad comment: https://github.com/kerberosmansour/hulumi/issues/32#issuecomment-4464844117

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

- Added `docs/development.md` section `Integration test stub pattern` under Testing strategy.
- Documented the env-var gate, `describe.skipIf(!ENABLED)` real-service block, explicit `it.skip` skip notice, and the rule that PR CI remains non-mutating while weekly/manual workflows own real evidence.
- Added this SLO ticket contract.

### Tests And Validation

- Red-first docs probe failed before implementation: `rg -n "Integration test stub pattern" docs/development.md`.
- `rg -n "Integration test stub pattern|HULUMI_INTEGRATION|describe\\.skipIf|it\\.skip" docs/development.md` passed.
- `pnpm run format:check` passed.
- `pnpm run lint:license-boundary` passed.
- `pnpm run lint:exact-pin-guard` passed.
- `git diff --check` passed.

### Lessons / Follow-Ups

- `docs/slo/` is ignored by repo policy; force-add this ticket file when committing.

### PR / Issue Links

- PR: pending
- Issue: https://github.com/kerberosmansour/hulumi/issues/32
