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
| Default runtime validation command          | `gh workflow run weekly-integration.yml --ref main -f tier=both` (OIDC trust is main-scoped by design) |
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
| Runtime validation               | `gh workflow run weekly-integration.yml --ref main -f tier=both`                                                                        | manual weekly integration passes for both tiers                                 | PASS: run [25953144114](https://github.com/kerberosmansour/hulumi/actions/runs/25953144114) on `main` — **sandbox => success** and **startup-hardened => success**; `account-foundation.integration.test.ts` `2 passed` (real deploy/assert/destroy), real-AWS step + Teardown ✓ | pass    | OIDC trust is main-scoped by design; proof runs from `main`. Sandbox green 9+ runs; startup-hardened required the user-approved production-fix chain (#149,#153–#158) + #150 |
| Dependency / security audit      | `pnpm run lint:exact-pin-guard`                                                                                                         | passes                                                                          | passed: 13 pinned deps match expected integrity hashes                                                                                                                         | pass    | no deps changed                                                                               |
| Resource bound / invariant check | weekly workflow job duration + KMS cleanup assertion                                                                                    | under 30 min job timeout; KMS keys not left enabled                             | PASS: run 25953144114 real-AWS integration ~145s well under the 30-min job timeout; post-destroy KMS-cleanup assertion passed; `pulumi destroy` reclaimed all resources cleanly | pass    | EventDataStore termination-protection now honours forceDestroy (#158); e2e analyzer + EDS self-heal sweeps prevent orphan/cost accrual |
| Compatibility check              | `pnpm test:integration`                                                                                                                 | command remains safe/contract-only locally                                      | passed: baseline/drift integration commands stayed skip-gated locally                                                                                                          | pass    | no AWS backend or role available locally                                                      |
| `.gitignore` / artifact cleanup  | `git status --short`                                                                                                                    | no stray integration artifacts outside scoped files                             | passed: worktree clean across all closeout commits                                                                                                                             | pass    |                                                                                               |
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

- Replaced the sandbox-only integration gate with a tier-aware real-AWS deploy/assert/destroy body for `sandbox` and `startup-hardened` (PR #146).
- Added bounded AWS CLI reachability checks for CloudTrail, Config recorder, GuardDuty, Security Hub, and KMS keys; post-destroy KMS-cleanup assertion.
- **Real-AWS proof captured for BOTH tiers** on `main`, run [25953144114](https://github.com/kerberosmansour/hulumi/actions/runs/25953144114): sandbox **and** startup-hardened deploy → AWS-API assertions → destroy → KMS-cleanup all pass.
- The startup-hardened lane had **never been deployable**; the real-AWS proof exposed a chain of production defects. Scope was **explicitly extended with user approval** (the §3 Non-Goal gate) to fix them:
  - #149 — `logs` KMS key policy missing the CloudWatch Logs grant; CloudTrail not wired to its CWL log group (also resolves Codex security finding `205dfa88`).
  - #153 — CloudTrail S3 data-event selector used a bare bucket ARN; Config `DeliveryChannel` missing `s3KmsKeyArn`.
  - #154 — self-heal sweep for orphaned e2e IAM Access Analyzers (account quota).
  - #155 / #156 — dropped the `s3:x-amz-acl` ACL condition (incompatible with `BucketOwnerEnforced`) from the Config delivery **bucket policy** and the **recorder-role** policy.
  - #157 — opted the Config/CloudTrail delivery bucket out of Object Lock (GOVERNANCE/30d default retention broke Config's write-then-delete delivery validation); SecureBucket keeps Object Lock as the Startup-Hardened default for other consumers.
  - #158 — EventDataStore `terminationProtectionEnabled` now honours `forceDestroy` so ephemeral stacks tear down; e2e EventDataStore self-heal sweep clears prior cost orphans.
- #150 — independent: added CrossGuard policy **H5** closing the forged-SecureBucket-URN raw-bucket bypass (Codex security finding `3d1e90c1`).

### Tests And Validation

- Authoritative runtime proof: weekly-integration run 25953144114 on `main`, `tier=both` — `conclusion=success`; both tier jobs `success`; startup-hardened `account-foundation.integration.test.ts` `2 passed | 5 skipped | 1 todo`, real-AWS step + Teardown ✓, ~145s (well under the 30-min job timeout); post-destroy KMS-cleanup assertion passed; `pulumi destroy` reclaimed all resources.
- Sandbox real-AWS lane: green across 9+ consecutive runs during the fix chain.
- Every closeout PR (#149–#158) passed the full CI matrix (typecheck/build/lint, baseline+policies+drift unit suites, license-boundary, exact-pin-guard, cooling-off, DCO, CodeQL) and `git diff --check`.
- Local skip-gated `account-foundation.integration.test.ts` remains `1 passed` with only the separate failure-injection `todo`.

### Lessons / Follow-Ups

- The sandbox OIDC trust is **main-scoped by design** ([docs/integration-testing.md](../../integration-testing.md)); real-AWS proof must run from `main`, not a ticket branch. The contract's original branch-ref runtime command was unsatisfiable and has been corrected to `--ref main`.
- Mock unit suites could not catch any of the startup-hardened production defects — they only surface under real AWS. Each fix was verified by the next real-AWS run advancing (resource count 1 → 9 → 37 → full), not by assertion alone.
- AWS-doc verification (not guessing) was required: two `s3:x-amz-acl` hypotheses (#155/#156) were AWS-doc-grounded but not the Config-delivery root cause; the Object Lock vs Config-delivery incompatibility (#157), found via the sandbox/startup-hardened tier discriminator, was.
- Follow-up (not blocking #24): failure-injection teardown scenario remains the documented `it.todo` per the roadmap.

### PR / Issue Links

- PRs: #146 (base), #148, #149, #150, #153, #154, #155, #156, #157, #158 — all merged.
- Issue: https://github.com/kerberosmansour/hulumi/issues/24
- Issue: https://github.com/kerberosmansour/hulumi/issues/24
