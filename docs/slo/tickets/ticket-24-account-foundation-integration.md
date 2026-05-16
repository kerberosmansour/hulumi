# AccountFoundation Real-AWS Integration - SLO Ticket Contract v1

> **Purpose**: Execute one issue-sized change with v4 SLO rigor, without requiring a full multi-milestone runbook.
> **Audience**: AI coding agents first, humans second.
> **Source template**: Derived from `docs/slo/templates/runbook-template_v_4_template.md`. Use the full v4 runbook when this contract cannot stay issue-sized.

---

## 1. Ticket Metadata

| Field                                       | Value                                                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Ticket Contract ID                          | `ticket-24-account-foundation-integration`                                                           |
| Source tracker                              | `GitHub Issues`                                                                                      |
| Source issue                                | [#24](https://github.com/kerberosmansour/hulumi/issues/24)                                           |
| Issue title                                 | `test(baseline): fill in tests/integration/account-foundation.integration.test.ts`                   |
| Labels                                      | `integration-test`, `requires-token`, `baseline`, `tests`                                            |
| Assignee / owner                            | `kerberosmansour`                                                                                    |
| Target branch                               | `ticket/24-account-foundation-integration`                                                           |
| Primary stack                               | TypeScript, Vitest, Pulumi Automation API, AWS CLI via GitHub Actions OIDC                           |
| Default formatter command                   | `pnpm run format:check`                                                                              |
| Default typecheck / build command           | `pnpm --filter @hulumi/baseline typecheck && pnpm --filter @hulumi/baseline build`                   |
| Default static analysis / lint command      | `pnpm --filter @hulumi/baseline lint && pnpm run lint:license-boundary`                              |
| Default unit / BDD command                  | `pnpm --filter @hulumi/baseline test -- tests/integration/account-foundation.integration.test.ts`    |
| Default runtime validation command          | `gh workflow run weekly-integration.yml --ref ticket/24-account-foundation-integration -f tier=both` |
| Default dependency / security audit command | `pnpm run lint:exact-pin-guard`                                                                      |
| Default debugger or state-inspection tool   | GitHub Actions job log plus bounded AWS CLI probes in the integration test                           |
| Public interfaces stable by default         | `yes`                                                                                                |
| Allowed new dependencies by default         | `none`                                                                                               |
| Schema/config migration allowed by default  | `no`                                                                                                 |

### Public interfaces that must remain stable unless explicitly listed otherwise

- `AccountFoundation` constructor args and outputs stay source-compatible.
- `.github/workflows/weekly-integration.yml` trigger and `tier` input stay source-compatible.
- `HULUMI_INTEGRATION=1`, `HULUMI_TIER`, `HULUMI_IAC_ROLE_ARN`, `PULUMI_BACKEND_URL`, and `PULUMI_ACCESS_TOKEN` keep their existing meanings.

---

## 2. Sizing Gate

| Check                                          | Answer                                                                                         |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| User-visible outcome fits in one sentence      | yes - replace the placeholder AccountFoundation real-AWS test with deploy/assert/destroy proof |
| Expected changed files <= 8                    | yes                                                                                            |
| New public surfaces <= 1                       | yes - stronger documented integration-test behavior                                            |
| No schema migration unless explicitly approved | yes                                                                                            |
| No cross-subsystem rewrite                     | yes                                                                                            |
| Can be reviewed as one PR                      | yes                                                                                            |
| Requires full v4 runbook instead               | no - this is one integration-test body plus docs, with manual workflow evidence                |

---

## 3. Issue Context

### Problem

Issue #24 asks to replace the AccountFoundation real-AWS placeholder with the actual weekly/manual integration proof.

```text
Real body should: deploy Sandbox + Startup-Hardened stacks, assert detector / trail / config-recorder ARNs are reachable, destroy cleanly, assert no orphaned KMS keys.
```

The current test file has a sandbox-only real-AWS smoke and two `it.todo()` rows. The weekly workflow already has a manual `workflow_dispatch` path with AWS OIDC and a `tier` matrix, so this ticket can use that workflow for the required real-AWS proof.

### Acceptance Criteria From Issue

- [ ] Test body deploys + asserts + destroys against the sandbox account.
- [ ] Both Sandbox and Startup-Hardened lanes are covered by the weekly workflow tier matrix.
- [ ] AWS API checks prove detector, trail, config recorder, Security Hub, and KMS outputs are reachable.
- [ ] Teardown verifies KMS keys are no longer enabled after destroy.
- [ ] `docs/integration-testing.md` documents the result.
- [ ] Cost remains within the documented `<$1/run` budget.

### Non-Goals

- Do not change published `AccountFoundation` public API unless the real-AWS proof exposes a production bug and the contract is explicitly extended.
- Do not change the weekly workflow auth model or add long-lived AWS credentials.
- Do not add dependencies.
- Do not implement drift-classifier follow-ups, failure-injection teardown, or broad cleanup workflows.
- Do not print sandbox account IDs, role ARNs, backend URLs, or Pulumi state in logs.

### Reproduction / Current Signal

| Signal           | Evidence                                                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline command | `pnpm --filter @hulumi/baseline test -- tests/integration/account-foundation.integration.test.ts`                                       |
| Current result   | passed locally with `1 passed \| 2 skipped \| 2 todo`; startup-hardened and failure-injection rows are not implemented                  |
| Red-first grep   | `rg -n "it\\.todo\|SANDBOX_ENABLED\|sandbox real AWS smoke" packages/baseline/tests/integration/account-foundation.integration.test.ts` |
| Expected result  | focused test still skip-gates locally, but the implementation contains real sandbox + startup-hardened deploy/assert/destroy paths      |

---

## 4. Compact Architecture Delta

| Component                          | Existing behavior                                  | Change                                                            | Interface / trust boundary touched  |
| ---------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------- |
| AccountFoundation integration test | Sandbox-only real-AWS smoke plus startup todo rows | Tier-parameterized real-AWS test with AWS API reachability checks | GitHub Actions OIDC sandbox account |
| Integration docs                   | Describe sandbox smoke as current status           | Describe sandbox + startup-hardened weekly proof and KMS cleanup  | Public documentation                |

### Data Flow Delta

```text
weekly-integration workflow
  -> matrix tier=sandbox/startup-hardened
  -> Vitest integration file
  -> Pulumi Automation API stack up
  -> AWS CLI bounded reachability probes
  -> Pulumi destroy/removeStack
  -> AWS CLI KMS post-destroy state check
```

---

## 5. Contract Block

| Contract Row                       | Value                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inputs                             | GitHub issue #24, existing weekly workflow, AccountFoundation integration test, integration docs, roadmap contract                                                                                                                                                                                                                             |
| Outputs                            | Updated integration test, updated integration docs, ticket evidence, PR handoff                                                                                                                                                                                                                                                                |
| Interfaces touched                 | Test/runtime behavior of `weekly-integration`; public package API unchanged                                                                                                                                                                                                                                                                    |
| Files allowed to change            | `packages/baseline/tests/integration/account-foundation.integration.test.ts`, `docs/integration-testing.md`, `docs/integration-testing-roadmap.md`, `docs/slo/tickets/ticket-24-account-foundation-integration.md`                                                                                                                             |
| Files to read before changing      | `.github/workflows/weekly-integration.yml`, `docs/integration-testing.md`, `docs/integration-testing-roadmap.md`, `docs/issue-candidates.md`, `docs/ARCHITECTURE.md`, `packages/baseline/src/aws/account-foundation.ts`, `packages/baseline/src/aws/kms-ring.ts`, `packages/baseline/tests/integration/account-foundation.integration.test.ts` |
| New files allowed                  | this ticket contract only                                                                                                                                                                                                                                                                                                                      |
| New dependencies allowed           | none                                                                                                                                                                                                                                                                                                                                           |
| Migration allowed                  | no                                                                                                                                                                                                                                                                                                                                             |
| Compatibility commitments          | Local PR/unit runs remain skip-gated by default; weekly workflow remains OIDC-only; no secrets or state details printed                                                                                                                                                                                                                        |
| Data classification                | Public; runtime AWS secrets remain confined to GitHub Actions secrets and masked envs                                                                                                                                                                                                                                                          |
| Proactive controls in play         | OIDC-only AWS auth, bounded polling, explicit teardown, no broad IAM/admin expansion, IDs-only docs posture                                                                                                                                                                                                                                    |
| Abuse acceptance scenarios         | BDD rows below cover missing backend, branch/secret limitations, and teardown safety                                                                                                                                                                                                                                                           |
| Resource bounds introduced/changed | Per-AWS-probe timeout capped; test timeout stays within weekly job's 30-minute envelope; workflow matrix remains serialized                                                                                                                                                                                                                    |
| Invariants/assertions required     | Real path must skip without `HULUMI_INTEGRATION=1`; stack destroy/removeStack run in `afterAll`; KMS keys are not left `Enabled` after destroy                                                                                                                                                                                                 |
| Debugger / inspection expectation  | Use GitHub Actions logs and AWS CLI JSON parsing when manual workflow fails; do not use console-only claims                                                                                                                                                                                                                                    |
| Static analysis gates              | Prettier, baseline typecheck/build, baseline lint, license-boundary lint, exact-pin guard, `git diff --check`                                                                                                                                                                                                                                  |
| Reversibility / rollback path      | Revert test/docs changes; no runtime migration or persisted schema change                                                                                                                                                                                                                                                                      |
| Exemplar code to copy              | Existing sandbox smoke in `account-foundation.integration.test.ts`; drift integration cleanup pattern in `packages/drift/tests/integration/drift-classify.integration.test.ts`                                                                                                                                                                 |
| Anti-exemplar code not to copy     | Do not leave `it.todo()` as evidence; do not assert output string shape only; do not add unbounded sleep loops; do not log full Pulumi output/state                                                                                                                                                                                            |
| Refactoring discipline             | Only refactor within the integration test when it directly removes duplication between sandbox/startup lanes                                                                                                                                                                                                                                   |
| AI tolerance contract              | N/A - no AI component                                                                                                                                                                                                                                                                                                                          |
| Forbidden shortcuts                | No fake AWS proof, no contract-only success claimed as real-AWS pass, no broad workflow auth change, no dependency additions                                                                                                                                                                                                                   |

---

## 6. Implementation Plan

1. Create/switch to `ticket/24-account-foundation-integration` and record repo hygiene.
2. Record current local baseline and red-first `it.todo`/sandbox-only signal.
3. Replace sandbox-only constants with tier-aware integration gating.
4. Add bounded AWS CLI helpers for CloudTrail, Config, GuardDuty, Security Hub, and KMS post-destroy checks.
5. Replace startup-hardened todo with the same real deploy/assert/destroy body under `HULUMI_TIER=startup-hardened`.
6. Keep failure-injection teardown as roadmap unless the issue explicitly expands scope.
7. Update `docs/integration-testing.md` and `docs/integration-testing-roadmap.md`.
8. Run local skip-gated focused tests plus typecheck/build/lint/format/static gates.
9. Push branch, trigger `weekly-integration.yml` manually with `tier=both`, and record run evidence.
10. Open PR and update issue workpad.

---

## 7. BDD Acceptance Scenarios

| Scenario                        | Category               | Given                                        | When                          | Then                                                                                | Evidence            |
| ------------------------------- | ---------------------- | -------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------- | ------------------- |
| Skip-gate preserved             | empty / degraded state | Local PR run without integration envs        | Focused integration file runs | Real AWS suites skip and one gate-invariant test passes                             | local Vitest        |
| Sandbox real-AWS proof          | happy path             | Weekly workflow with `tier=sandbox`          | Test runs with OIDC + backend | Stack deploys, AWS API checks pass, destroy/removeStack complete                    | weekly workflow     |
| Startup-Hardened real-AWS proof | happy path             | Weekly workflow with `tier=startup-hardened` | Test runs with OIDC + backend | Stack deploys, AWS API checks pass, destroy/removeStack complete                    | weekly workflow     |
| KMS cleanup invariant           | abuse case             | Stack creates four KMS CMKs                  | `afterAll` destroys the stack | Each test-created key is no longer `Enabled`; pending deletion counts as cleaned up | test assertion      |
| Missing backend remains safe    | invalid input          | Workflow lacks Pulumi backend                | Weekly workflow runs          | Contract-only mode avoids `pulumi up` and no fake real-AWS claim is made            | workflow log / docs |

---

## 8. Validation Plan

| Check                            | Command / Action                                                                                                                        | Expected Result                                                                 | Actual Result                                                                                                                                                                  | Status  | Notes                                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | --------------------------------------------------------------------------------------------- |
| Repo hygiene                     | `git status --short --branch && git rev-parse --abbrev-ref HEAD && git symbolic-ref --short refs/remotes/origin/HEAD`                   | branch is ticket branch; no unrelated dirt                                      | branch `ticket/24-account-foundation-integration`; default `origin/main`; clean before edits                                                                                   | pass    | started from `origin/main` at `b8124ce`                                                       |
| Baseline before change           | `pnpm --filter @hulumi/baseline test -- tests/integration/account-foundation.integration.test.ts`                                       | records current placeholder/skipped behavior                                    | passed with `1 passed`, `2 skipped`, `2 todo`                                                                                                                                  | pass    | confirms implementation gap                                                                   |
| New tests fail first             | `rg -n "it\\.todo\|SANDBOX_ENABLED\|sandbox real AWS smoke" packages/baseline/tests/integration/account-foundation.integration.test.ts` | finds current todo / sandbox-only implementation                                | found `it.todo`, `SANDBOX_ENABLED`, and sandbox-only suite                                                                                                                     | pass    | red-first source probe                                                                        |
| Formatter                        | `pnpm run format:check`                                                                                                                 | passes                                                                          | passed: all matched files use Prettier code style                                                                                                                              | pass    | targeted Prettier run first                                                                   |
| Typecheck / build                | `pnpm --filter @hulumi/baseline typecheck && pnpm --filter @hulumi/baseline build`                                                      | passes                                                                          | passed                                                                                                                                                                         | pass    |                                                                                               |
| Static analysis / lint           | `pnpm --filter @hulumi/baseline lint && pnpm run lint:license-boundary`                                                                 | passes                                                                          | passed                                                                                                                                                                         | pass    | license scan was rerun after build completed; an earlier parallel run saw `dist/` mid-rebuild |
| Unit / BDD tests                 | `pnpm --filter @hulumi/baseline test -- tests/integration/account-foundation.integration.test.ts`                                       | local skip-gated pass with only the separate failure-injection `todo` remaining | passed with `1 passed`, `2 skipped`, `1 todo`                                                                                                                                  | pass    | startup success path is no longer a todo                                                      |
| Runtime validation               | `gh workflow run weekly-integration.yml --ref ticket/24-account-foundation-integration -f tier=both`                                    | manual weekly integration passes or auth limitation recorded                    | blocked before test execution: workflow run #25947974310 accepted the branch, but both tier jobs failed at OIDC with `Not authorized to perform sts:AssumeRoleWithWebIdentity` | blocked | trust policy appears main-branch scoped; no Pulumi up ran                                     |
| Dependency / security audit      | `pnpm run lint:exact-pin-guard`                                                                                                         | passes                                                                          | passed: 13 pinned deps match expected integrity hashes                                                                                                                         | pass    | no deps changed                                                                               |
| Resource bound / invariant check | weekly workflow job duration + KMS cleanup assertion                                                                                    | under 30 min job timeout; KMS keys not left enabled                             | local assertions implemented; real-AWS timing blocked by branch OIDC trust                                                                                                     | blocked | no AWS resources were created in the blocked run                                              |
| Compatibility check              | `pnpm test:integration`                                                                                                                 | command remains safe/contract-only locally                                      | passed: baseline/drift integration commands stayed skip-gated locally                                                                                                          | pass    | no AWS backend or role available locally                                                      |
| `.gitignore` / artifact cleanup  | `git status --short`                                                                                                                    | no stray integration artifacts outside scoped files                             |                                                                                                                                                                                | pending |                                                                                               |
| Diff whitespace                  | `git diff --check`                                                                                                                      | passes                                                                          | passed                                                                                                                                                                         | pass    |                                                                                               |

---

## 9. Workpad / Tracker Updates

Workpad comment: https://github.com/kerberosmansour/hulumi/issues/24#issuecomment-4464702626

---

## 10. Self-Review Gate

- [ ] Did I stay inside the file allow-list?
- [ ] Did I write or update BDD tests before production code?
- [ ] Did I confirm new tests/probes failed for the right reason before implementing?
- [ ] Did I preserve public interfaces unless explicitly allowed to change them?
- [ ] Did I add or strengthen assertions/invariants where the contract required them?
- [ ] Did I bound new resource growth or document why no bound applies?
- [ ] Did I run formatter, typecheck/build, and static analysis?
- [ ] Did I use a debugger or state-inspection tool when failure evidence was ambiguous?
- [ ] Did I remove temporary proof edits, debug output, and placeholder logic?
- [ ] Did I record evidence rather than claims?
- [ ] Did I update the issue workpad and PR handoff notes?

---

## 11. Closure Summary

### Completed

- Replaced the sandbox-only integration gate with a tier-aware real-AWS deploy/assert/destroy body for `sandbox` and `startup-hardened`.
- Added bounded AWS CLI reachability checks for CloudTrail, Config recorder, GuardDuty, Security Hub, and KMS keys.
- Added post-destroy KMS cleanup assertion so test-created CMKs must not remain `Enabled`.
- Updated integration docs and roadmap for the new success-path coverage and remaining failure-injection gap.

### Tests And Validation

- `pnpm --filter @hulumi/baseline test -- tests/integration/account-foundation.integration.test.ts` passed locally with `1 passed`, `2 skipped`, `1 todo`.
- `pnpm --filter @hulumi/baseline typecheck` passed.
- `pnpm --filter @hulumi/baseline build` passed.
- `pnpm --filter @hulumi/baseline lint` passed.
- `pnpm run lint:license-boundary` passed after sequential rerun.
- `pnpm run lint:exact-pin-guard` passed.
- `pnpm run format:check` passed.
- `pnpm test:integration` passed locally with skip-gated real-AWS lanes.
- Manual `weekly-integration` run #25947974310 was triggered for `tier=both` on the branch, but both tier jobs failed at AWS OIDC assume-role before test execution.

### Lessons / Follow-Ups

- Real-AWS pre-merge proof is blocked by the sandbox role trust policy for feature branches. To finish the real AWS proof, either run the workflow after this branch reaches `main`, or temporarily authorize `repo:kerberosmansour/hulumi:ref:refs/heads/ticket/24-account-foundation-integration` in the sandbox OIDC trust policy and rerun workflow #25947974310.

### PR / Issue Links

- PR: pending
- Issue: https://github.com/kerberosmansour/hulumi/issues/24
