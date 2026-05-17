# Ticket 167: SecureRepository Existing Repository Adoption

## 1. Ticket Metadata

| Field | Value |
|---|---|
| Ticket Contract ID | `ticket-167-secure-repository-adopt-existing` |
| Source tracker | `GitHub Issues` |
| Source issue | [#167](https://github.com/kerberosmansour/hulumi/issues/167) |
| Issue title | `SecureRepository should support adopting existing GitHub repositories` |
| Labels | `enhancement`, `github` |
| Assignee / owner | `kerberosmansour` |
| Target branch | `slo/ticket-167-secure-repository-adopt-existing` |
| Primary stack | TypeScript / Pulumi |
| Default formatter command | `pnpm run format:check` |
| Default typecheck / build command | `pnpm --filter @hulumi/baseline typecheck && pnpm --filter @hulumi/baseline build` |
| Default static analysis / lint command | `pnpm --filter @hulumi/baseline lint && pnpm run lint:license-boundary` |
| Default unit / BDD command | `pnpm --filter @hulumi/baseline test -- tests/github/secure-repository.test.ts` |
| Default runtime validation command | `N/A - Pulumi mock-runtime BDD covers emitted resource graph; real GitHub integration is credential-gated` |
| Default dependency / security audit command | `pnpm run lint:exact-pin-guard` |
| Default debugger or state-inspection tool | Pulumi mock registration inspection in `packages/baseline/tests/setup.ts` |
| Public interfaces stable by default | yes |
| Allowed new dependencies by default | none |
| Schema/config migration allowed by default | no |

### Public interfaces that must remain stable unless explicitly listed otherwise

- `@hulumi/baseline/github` `SecureRepository` class and existing constructor behavior.
- `SecureRepositoryArgsPrivate` and `SecureRepositoryArgsPublic` remain source-compatible for callers that do not opt into adoption.
- `SecureRepositoryOutputs` remain source-compatible.

## 2. Sizing Gate

| Check | Answer |
|---|---|
| User-visible outcome fits in one sentence | yes - existing GitHub repos can be adopted into `SecureRepository` without duplicate repository creation |
| Expected changed files <= 8 | yes |
| New public surfaces <= 1 | yes - one optional adoption/import API on `SecureRepositoryArgs` |
| No schema migration unless explicitly approved | yes |
| No cross-subsystem rewrite | yes |
| Can be reviewed as one PR | yes |
| Requires full v4 runbook instead | no |

## 3. Issue Context

### Problem

`SecureRepository` currently assumes it owns `github.Repository` creation. For an existing repository, using the component directly would try to create a duplicate repository before applying the Hulumi default-branch ruleset and repository settings.

Issue body excerpt:

~~~text
`@hulumi/baseline.github.SecureRepository` works well for new repositories, but applying Hulumi to an already-created repository currently requires dropping to lower-level `@pulumi/github` resources or direct GitHub API calls.
~~~

### Acceptance Criteria From Issue

- [ ] Existing GitHub repositories can be adopted/hardened without attempting to create a duplicate repository.
- [ ] Adoption path preserves Hulumi startup-hardened posture where applicable.
- [ ] Adoption path supports deletion and force-push protection, required linear history, signed commits, PR gate, optional required status checks, empty bypass actors, squash-only merge posture, and delete-branch-on-merge.
- [ ] Safe Pulumi import/state behavior is documented.
- [ ] Public existing repositories retain explicit `acknowledgePublic` and `publicJustification` friction.

### Non-Goals

- Do not add a new package or dependency.
- Do not alter org-level `OrgFoundation`.
- Do not change existing `SecureRepository` defaults for new repositories.
- Do not implement a full drift/adoption wizard.
- Do not run real GitHub integration tests without configured sandbox credentials.

### Reproduction / Current Signal

| Signal | Evidence |
|---|---|
| Baseline command / UI path / failing test | `pnpm --filter @hulumi/baseline test -- tests/github/secure-repository.test.ts` after adding adoption tests |
| Current result | No public argument can pass Pulumi `import` options to the child `github.Repository`; existing repos require lower-level code |
| Expected result | Caller can opt into adoption, emitted `github.Repository` has `opts.import`, and ruleset/settings posture remains the same |

## 4. Compact Architecture Delta

| Component | Existing behavior | Change | Interface / trust boundary touched |
|---|---|---|---|
| `SecureRepositoryArgs` | Only describes desired repository visibility and hardening posture | Adds explicit adoption/import option for an existing GitHub repository | Public TypeScript API |
| `SecureRepository` | Always creates a child `github.Repository` resource | When adoption is opted in, passes `import` through to the child repository resource options | Pulumi state import boundary |
| Component docs | No existing-repo adoption guidance | Documents preview/import expectations and rollback | User migration path |

### Data Flow Delta

```text
caller args
  -> SecureRepository(adoptExisting/importRepositoryId?)
  -> github.Repository(..., { import: existingRepoId })
  -> github.RepositoryRuleset(default branch, active)
```

## 5. Contract Block

| Contract Row | Value |
|---|---|
| Inputs | Issue #167; current `SecureRepository` API and tests; Pulumi `CustomResourceOptions.import` |
| Outputs | Code, BDD tests, component docs, ticket evidence, PR |
| Interfaces touched | Public TypeScript API: optional adoption/import args on `SecureRepositoryArgsCommon` |
| Files allowed to change | `packages/baseline/src/github/secure-repository.args.ts`; `packages/baseline/src/github/secure-repository.ts`; `packages/baseline/tests/github/secure-repository.test.ts`; `docs/components/secure-repository.md`; `docs/slo/tickets/ticket-167-secure-repository-adopt-existing.md` |
| Files to read before changing | `packages/baseline/src/github/secure-repository.args.ts`; `packages/baseline/src/github/secure-repository.ts`; `packages/baseline/src/github/secure-repository.outputs.ts`; `packages/baseline/src/github/index.ts`; `packages/baseline/tests/github/secure-repository.test.ts`; `packages/baseline/tests/setup.ts`; `docs/ARCHITECTURE.md`; `docs/components/deployment-repository-foundation.md` |
| New files allowed | `docs/components/secure-repository.md`; this ticket file |
| New dependencies allowed | none |
| Migration allowed | no |
| Compatibility commitments | Existing constructor calls compile and emit the same repository/ruleset graph when adoption args are absent |
| Data classification | Public |
| Proactive controls in play | Explicit opt-in for public repos; empty bypass actors by default; Pulumi import boundary documented; no secret/token output |
| Abuse acceptance scenarios | BDD abuse row below: public existing repo cannot bypass public acknowledgement |
| Resource bounds introduced/changed | N/A - no queues, caches, retries, or unbounded collections introduced |
| Invariants/assertions required | Adoption opt-in must be explicit; `importRepositoryId` without `adoptExisting: true` is invalid; default import ID is the repository name |
| Debugger / inspection expectation | Use Pulumi mock `registrations` inspection; no debugger required unless mock output is ambiguous |
| Static analysis gates | `pnpm run format:check`; baseline typecheck/build/lint; license-boundary; exact-pin guard |
| Reversibility / rollback path | Remove adoption args from user code to return to create-new behavior; remove this PR to drop the API before release |
| Exemplar code to copy | Existing `SecureRepository` tier/default resolution in `packages/baseline/src/github/secure-repository.ts`; existing BDD style in `packages/baseline/tests/github/secure-repository.test.ts` |
| Anti-exemplar code not to copy | Do not create a second component that duplicates `SecureRepository` hardening logic; do not hide adoption behind a silent fallback |
| Refactoring discipline | Permit only helper extraction needed to avoid duplicate resource-option assembly; prove with pre/post focused tests |
| AI tolerance contract | N/A - no AI component |
| Forbidden shortcuts | No placeholder docs, no broad GitHub subsystem rewrite, no dependency bump, no real GitHub API mutation in unit tests, no weakening public visibility friction |

## 6. Implementation Plan

1. Run baseline focused `SecureRepository` tests on the clean branch.
2. Add failing BDD tests for existing-repo adoption, invalid partial adoption args, public adoption acknowledgement, and default behavior compatibility.
3. Add the adoption/import fields and runtime invariant in `SecureRepositoryArgs` / `SecureRepository`.
4. Pass `import` through to the child `github.Repository` options only when adoption is explicit.
5. Add `docs/components/secure-repository.md` with new and existing repo examples plus Pulumi import notes.
6. Run formatter, focused tests, typecheck/build, lint/static checks, and hygiene checks.
7. Fill validation evidence and hand off PR.

## 7. BDD Acceptance Scenarios

| Scenario | Category | Given | When | Then | Evidence |
|---|---|---|---|---|---|
| Existing private repo adoption | happy path | `SecureRepository` with `adoptExisting: true` and `importRepositoryId` | Component is constructed | Child `github.Repository` has `opts.import`; repo settings and ruleset are still emitted | `secure-repository.test.ts` |
| Partial adoption args rejected | invalid input | `importRepositoryId` supplied without `adoptExisting: true` | Component is constructed | Runtime error names the required explicit opt-in | `secure-repository.test.ts` |
| Existing repo default import ID | empty / degraded state | `adoptExisting: true` with no custom import ID | Component is constructed | Child repository import ID defaults to repository name | `secure-repository.test.ts` |
| Public existing repo still requires acknowledgement | abuse case | Public repo adoption without `acknowledgePublic` / justification | Component is constructed | Existing public visibility runtime guard rejects it | `secure-repository.test.ts` |

## 8. Validation Plan

| Check | Command / Action | Expected Result | Actual Result | Status | Notes |
|---|---|---|---|---|---|
| Repo hygiene gate | `git status --short --branch`; `git rev-parse --abbrev-ref HEAD`; `git symbolic-ref --short refs/remotes/origin/HEAD` | On task branch, dirty only expected ticket/code files | Branch `slo/ticket-167-secure-repository-adopt-existing`, upstream `origin/main`; dirty files limited to the allowed code/test/doc/ticket set | `passed` | `docs/slo/` is ignored, so the ticket file must be force-added when committing |
| Baseline before change | `pnpm --filter @hulumi/baseline test -- tests/github/secure-repository.test.ts` | passes before adding new tests | Passed: 22 tests before new adoption scenarios | `passed` | |
| New tests fail first | `pnpm --filter @hulumi/baseline test -- tests/github/secure-repository.test.ts` | fails for missing adoption API/import opts | Failed as expected: 3 adoption assertions failed because import IDs were undefined and partial import args did not throw | `passed` | Red checkpoint captured before implementation |
| Formatter | `pnpm run format:check` | passes | Passed: all matched files use Prettier style | `passed` | |
| Typecheck / build | `pnpm --filter @hulumi/baseline typecheck && pnpm --filter @hulumi/baseline build` | passes | Passed: `tsc --noEmit` and `tsc -p tsconfig.build.json` | `passed` | |
| Static analysis / lint | `pnpm --filter @hulumi/baseline lint && pnpm run lint:license-boundary` | passes | Passed: ESLint plus `license-boundary-lint: OK` | `passed` | |
| Unit / BDD tests | `pnpm --filter @hulumi/baseline test -- tests/github/secure-repository.test.ts` | passes | Passed: 28 tests; broader `pnpm --filter @hulumi/baseline test` also passed with 129 passed, 7 skipped, 1 todo | `passed` | |
| Runtime validation | Pulumi mock registration inspection in BDD tests | passes | Passed: adopted repo registrations carry import IDs; ruleset and repository settings remain emitted | `passed` | Real GitHub integration skipped because this ticket is mock-runtime scoped |
| Dependency / security audit | `pnpm run lint:exact-pin-guard` | passes | Passed: `exact-pin-guard: OK` | `passed` | No dependency changes |
| Resource bound / invariant check | BDD tests for explicit adoption and invalid import args | passes | Passed: `importRepositoryId` without `adoptExisting: true` throws; blank import IDs are rejected in implementation | `passed` | |
| Compatibility check | BDD test that default `SecureRepository` has no import option | passes | Passed: default-created repo registration has no import id | `passed` | Existing constructor behavior preserved |
| `.gitignore` / artifact cleanup | `git status --short` | no stray artifacts | Code/test/doc changes only; `dist/` rebuild output was clean | `passed` | |

## 9. Workpad / Tracker Updates

Workpad comment: <https://github.com/kerberosmansour/hulumi/issues/167#issuecomment-4470248589>

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

## 11. Closure Summary

### Completed

- Added explicit `adoptExisting` / `importRepositoryId` support to `SecureRepository`.
- Preserved create-new behavior when adoption args are absent.
- Added BDD coverage for import IDs, default import ID, partial-adoption rejection, public-adoption acknowledgement, and compatibility.
- Added component docs for first-time import, steady-state cleanup, and public repository friction.

### Tests And Validation

- `pnpm --filter @hulumi/baseline test -- tests/github/secure-repository.test.ts` failed red before implementation, then passed with 28 tests.
- `pnpm run format:check`
- `pnpm --filter @hulumi/baseline typecheck && pnpm --filter @hulumi/baseline build`
- `pnpm --filter @hulumi/baseline lint && pnpm run lint:license-boundary`
- `pnpm run lint:exact-pin-guard`
- `pnpm --filter @hulumi/baseline test`
- `git diff --check`

### Lessons / Follow-Ups

- Pulumi import is a first-adoption state transition: users should remove `adoptExisting` and `importRepositoryId` after the repository is in state.
- A future helper could detect mismatches between component name and import ID before preview, but this ticket intentionally keeps the API small.

### PR / Issue Links

- PR: <https://github.com/kerberosmansour/hulumi/pull/168>
- Issue: <https://github.com/kerberosmansour/hulumi/issues/167>
