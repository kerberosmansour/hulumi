# Milestone 3 — `AccountFoundation` component + full `CisV5Pack` (sections 1–3) + weekly sandbox integration

Parent runbook: [docs/RUNBOOK-hulumi.md](../RUNBOOK-hulumi.md).

**Goal**: After M3, `@hulumi/baseline.aws.AccountFoundation` is a shipped Pulumi ComponentResource wiring CloudTrail + AWS Config + GuardDuty + Security Hub + IAM baseline + KMS ring into one tiered unit (≥4 per-tier deltas). `@hulumi/policies.CisV5Pack` expands from M2's bucket-only stub to full CIS AWS Foundations v5.0.0 for **sections 1 (IAM), 2 (Storage), and 3 (Logging)**. A **weekly GitHub Actions integration workflow** runs `pulumi up AccountFoundation` against a dedicated sandbox AWS account via OIDC (no long-lived creds), asserts all six sub-resources reach `ACTIVE`/`Enabled` within a 15-minute window (critique E7), and tears down on exit.

**Context**: M2 shipped `SecureBucket` + hardening pack. M3 delivers the other half of the "secure day-zero cloud account" wedge. [interfaces.md §1 — AccountFoundation](../design/hulumi/interfaces.md) locks the public surface. Critique C2 demanded ≥2 per-tier deltas; AccountFoundation delivers ≥4 by construction. Critique E3 locked dual test strategy — M3 stands up the weekly real-AWS integration path; E7 requires polling eventual-consistency-bound states with explicit timeout.

**Important design rule**: **Eventual-consistency is a first-class contract.** AWS service enablement is not synchronous. `AccountFoundation` MUST resolve these via Pulumi `dependsOn` and custom `aws.dynamic` readiness-probes, not `sleep`. Integration test polls with 15-minute ceiling and fails loudly if any sub-resource misses the window — no retry-on-failure in CI.

**Refactor budget**: `Minimal local refactor permitted: rename packages/policies/src/aws/cis-v5-bucket.ts → cis-v5-pack.ts (scope expansion). M2 files outside that rename stay frozen. No refactor of secure-bucket.ts.`

## Contract Block

| Field                         | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inputs                        | `{ tier: Tier, iacRoleArn: string, cisVersion?, region?, orgAccountIds? }`. iacRoleArn role MUST carry `hulumi:iac-role=true` (H3 advisory in M3, mandatory in M5).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Outputs                       | CloudTrail + log bucket (via `SecureBucket`), Config recorder + optional aggregator, GuardDuty detector + protections, Security Hub hub + CIS v5.0 (+ NIST 800-53 Rev 5 on Startup-Hardened), IAM password policy + Access Analyzer (Startup-Hardened), KMS key ring with rotation. Tags: `hulumi:component=AccountFoundation`, `hulumi:tier`, `hulumi:controls`. Exports `AccountFoundationOutputs`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Interfaces touched            | `AccountFoundation`, `Args`, `Outputs`; `CisV5Pack` (expanded sections 1–3); `PackMetadata` (new rule IDs). Internal helpers `internal` stability.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Files allowed to change       | **New**: 6 helpers + `account-foundation.{ts,args.ts,outputs.ts}` in `packages/baseline/src/aws/`; `packages/baseline/tests/account-foundation.test.ts` + snapshots; `packages/baseline/tests/integration/account-foundation.integration.test.ts`; `packages/policies/src/aws/cis-v5-pack.{ts,rules.ts}`; `packages/policies/tests/cis-v5-pack.test.ts`; `examples/account-foundation-smoke/*`; `docs/components/account-foundation.md`; `docs/integration-testing.md`; `docs/deployment/sandbox-account.md`; `.github/workflows/weekly-integration.yml`. **Edits**: `packages/policies/src/aws/cis-v5-bucket.ts` → `cis-v5-pack.ts` (renamed + expanded), `packages/baseline/src/aws/index.ts` (export AccountFoundation), `packages/policies/src/index.ts`, root `package.json`, `.github/workflows/ci.yml`, `docs/tiers.md`, `docs/components/README.md`, `skills/hulumi-threat-model/scripts/generate-threat-model.ts` (drop "v0.2+" for AccountFoundation), `skills/hulumi-threat-model/scenarios/{aws-multi-account-baseline,iam-least-privilege,rds-encryption-at-rest}.json`, `.gitignore`. |
| Files to read before changing | [interfaces.md §1](../design/hulumi/interfaces.md), [ARCHITECTURE.md](../design/hulumi/ARCHITECTURE.md), [critique §§C2, E3, E7](../critique/hulumi.md), `docs/lessons/hulumi-m{1,2}.md`, [AWS Security Hub CIS v5](https://aws.amazon.com/about-aws/whats-new/2025/10/aws-security-hub-cspm-cis-foundations-benchmark-v5/), [GuardDuty API](https://docs.aws.amazon.com/AmazonGuardDuty/latest/APIReference/).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| New files allowed             | As listed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| New dependencies allowed      | Runtime: none (reuses M2 `@pulumi/aws`). Dev: `aws-sdk-client-mock` (exact-pinned) for integration test cleanup assertions. **No long-lived AWS creds** — OIDC via `aws-actions/configure-aws-credentials@v4` (exact SHA).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Migration allowed             | `yes` one file: `cis-v5-bucket.ts` → `cis-v5-pack.ts` rename. Old deleted; imports updated. No state migration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Compatibility commitments     | M2 `SecureBucket` + `HulumiHardeningPack` unchanged. M1 skill unchanged. Public export `CisV5Pack` name unchanged. M1+M2 BDDs still green. `@pulumi/*` exact pins unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Forbidden shortcuts           | (a) No `sleep` between sub-resources — dependsOn + `aws.dynamic` probes only. (b) No long-lived creds. (c) No integration test retries on failure. (d) No teardown skipped on failure (finally-equivalent). (e) No hand-coded waits > 15 min. (f) No eager enablement of CIS v7.0 subscriptions AWS doesn't support. (g) No verbatim CIS prose.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## Out of Scope / Must Not Do

- No drift classifier — M4.
- No SLSA release — M5.
- No SCP template — M5.
- No dogfood adoption work — sunlit-guardian's own runbook handles that on its own timeline; not a Hulumi deliverable.
- No CIS sections 4 (Monitoring) or 5 (Networking) — stubs only with "not implemented in v1" advisory.
- No CIS v7.0 pack — staged; `cisVersion: "v7.0.0"` accepted with compile-time warning.
- No Control Tower integration — LZA is complementary.
- No SCPs applied — `orgAccountIds` for Config aggregator wiring only.
- No Azure / GCP.
- No new public interfaces beyond `AccountFoundation`.

## Pre-Flight

1. Global Entry Rules.
2. Read `docs/lessons/hulumi-m2.md`; apply corrections.
3. Read allowed files.
4. Copy Evidence Log template.
5. Re-state four load-bearing constraints: (i) ≥4 per-tier deltas on AccountFoundation; (ii) eventual-consistency via dependsOn + readiness probes, not sleeps; (iii) weekly sandbox integration on OIDC, ≤15-min timeout, guaranteed teardown; (iv) CIS v5.0 sections 1–3 full; 4–5 stubbed.

## Files Allowed To Change

| File                                                                                                                | Planned Change                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/baseline/src/aws/account-foundation.{ts,args.ts,outputs.ts}`                                              | NEW: ComponentResource orchestrator + typed Args/Outputs matching interfaces.md §1                                                                                       |
| `packages/baseline/src/aws/cloudtrail.ts`                                                                           | NEW internal: multi-region on Startup-Hardened, log-file validation, data events on log bucket on Startup-Hardened                                                       |
| `packages/baseline/src/aws/config.ts`                                                                               | NEW internal: recorder + delivery channel + optional aggregator                                                                                                          |
| `packages/baseline/src/aws/guardduty.ts`                                                                            | NEW internal: Sandbox=basic; Startup-Hardened = S3Protection + MalwareProtection + RuntimeMonitoring + RDSProtection + EKSAuditLogs                                      |
| `packages/baseline/src/aws/securityhub.ts`                                                                          | NEW internal: hub + CIS v5.0 (+ NIST 800-53 Rev 5 on Startup-Hardened) with `aws.dynamic` readiness probe polling `GetDetector` until ENABLED (10-min cap)               |
| `packages/baseline/src/aws/iam-baseline.ts`                                                                         | NEW internal: password policy, Access Analyzer (Startup-Hardened), archive rules for Hulumi-tagged principals                                                            |
| `packages/baseline/src/aws/kms-ring.ts`                                                                             | NEW internal: per-service CMKs (logs, data, secrets, config), automatic rotation, deny-without-tag policies (Startup-Hardened + `orgAccountIds` only, bootstrap paradox) |
| `packages/baseline/tests/account-foundation.test.ts` + snapshots                                                    | NEW: mocks; both tiers; arg validation; tag emission; dependsOn graph shape                                                                                              |
| `packages/baseline/tests/integration/account-foundation.integration.test.ts`                                        | NEW: real AWS weekly-only; skipped by default; `HULUMI_INTEGRATION=1` + OIDC; 15-min timeout; teardown in `afterAll`                                                     |
| `packages/baseline/tests/integration/README.md`                                                                     | NEW: pointer to `docs/integration-testing.md`                                                                                                                            |
| `packages/policies/src/aws/cis-v5-pack.{ts,rules.ts}`                                                               | RENAMED + EXPANDED: sections 1-3 full, sections 4-5 stub advisory                                                                                                        |
| `packages/policies/tests/cis-v5-pack.test.ts`                                                                       | NEW: mocked fixtures for every implemented rule; catch-all metadata test                                                                                                 |
| `packages/policies/src/aws/cis-v5-bucket.ts`                                                                        | DELETED                                                                                                                                                                  |
| `packages/policies/src/index.ts`                                                                                    | EDIT: re-export updated `CisV5Pack`                                                                                                                                      |
| `packages/baseline/src/aws/index.ts`                                                                                | EDIT: add `AccountFoundation` exports                                                                                                                                    |
| `examples/account-foundation-smoke/{Pulumi.yaml,index.ts,package.json,README.md}`                                   | NEW: Sandbox and Startup-Hardened stacks                                                                                                                                 |
| `docs/components/account-foundation.md`                                                                             | NEW: tier matrix, eventual-consistency notes, ordering graph (mermaid), tags, IDs                                                                                        |
| `docs/tiers.md`                                                                                                     | EDIT: append AccountFoundation row                                                                                                                                       |
| `docs/components/README.md`                                                                                         | EDIT: index AccountFoundation                                                                                                                                            |
| `docs/integration-testing.md`                                                                                       | NEW: workflow, trigger, credentials, local-run, cost budget                                                                                                              |
| `docs/deployment/sandbox-account.md`                                                                                | NEW: OIDC IdP, IAM role trust policy template, scoped permissions, teardown                                                                                              |
| `.github/workflows/weekly-integration.yml`                                                                          | NEW: cron `0 4 * * 0`, workflow_dispatch, matrix both tiers, 30-min timeout, OIDC, up→test→destroy, stack-export artifact on failure                                     |
| `.github/workflows/ci.yml`                                                                                          | EDIT: add `account-foundation-mocks` + `cis-v5-pack-tests` jobs                                                                                                          |
| Root `package.json`                                                                                                 | EDIT: `test:integration`, `test:integration:weekly` scripts                                                                                                              |
| `.gitignore`                                                                                                        | EDIT: integration test `.pulumi/` patterns                                                                                                                               |
| `skills/hulumi-threat-model/scripts/generate-threat-model.ts`                                                       | EDIT (3 lines): drop "v0.2+" for AccountFoundation                                                                                                                       |
| `skills/hulumi-threat-model/scenarios/{aws-multi-account-baseline,iam-least-privilege,rds-encryption-at-rest}.json` | EDIT: live AccountFoundation references                                                                                                                                  |

## Step-by-Step

1. Write BDD test stubs first. Mock tests + integration test skeleton (`it.skip` until OIDC).
2. Rename `cis-v5-bucket.ts` → `cis-v5-pack.ts`; expand to sections 1-3 + section 4-5 stubs; make `cis-v5-pack.test.ts` pass.
3. Implement 6 internal helpers in isolation — each with unit tests before composing.
4. Implement `AccountFoundation` composing helpers with tier-aware config + `dependsOn` + readiness probes.
5. Make mock tests pass; snapshot both tiers; review snapshots.
6. Wire `examples/account-foundation-smoke/` end-to-end on mocked Pulumi.
7. Stand up weekly integration workflow: OIDC role trust policy (via docs/deployment/), workflow file, dry-run via `workflow_dispatch` once.
8. Enable weekly schedule; confirm first Sunday 04:00 UTC run green during M3 review window.
9. Edit M1 skill scenario JSONs + script to drop "v0.2+" for AccountFoundation.
10. `git status` clean; `.gitignore` updated; lessons + completion + Milestone Tracker.

## BDD Acceptance Scenarios

**Feature: `AccountFoundation` delivers tier-differentiated account baseline with eventual-consistency safety**

| Scenario                                  | Category                           | Given                                                                        | When                                                                                                              | Then                                                                                                                                                                                                                          |
| ----------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sandbox emits 6 sub-resource groups       | happy path                         | `{ tier: "sandbox", iacRoleArn: "arn:…" }`                                   | mocked preview                                                                                                    | single-region CloudTrail, Config basic, GuardDuty basic, Security Hub + CIS v5.0, IAM password policy, KMS 4 CMKs. NO multi-region, extended GuardDuty, Access Analyzer, NIST, deny-without-tag                               |
| Startup-Hardened adds ≥4 deltas           | happy path                         | `{ tier: "startup-hardened", iacRoleArn, orgAccountIds: ["111","222"] }`     | preview                                                                                                           | adds (1) multi-region CloudTrail + log-file validation + data events, (2) Config aggregator, (3) GuardDuty full protections, (4) Security Hub NIST 800-53 Rev 5, (5) Access Analyzer, (6) KMS deny-without-tag. AST check ≥ 4 |
| Tier delta AST check ≥ 4                  | schema / regression                | source                                                                       | `tests/account-foundation-tier-matrix.test.ts` traverses AST counts conditionals on `tier === "startup-hardened"` | ≥ 4                                                                                                                                                                                                                           |
| Security Hub waits for GuardDuty ACTIVE   | concurrency / eventual-consistency | mocked preview with GuardDuty detector in CREATING                           | mock `pulumi up` with staged state machine                                                                        | Security Hub subscribeToStandards has `dependsOn` → GuardDuty readiness probe; probe polls up to 10min                                                                                                                        |
| No `sleep` in source                      | forbidden-shortcut guard           | `grep -rn "setTimeout\|sleep\|await new Promise" packages/baseline/src/aws/` | `tests/no-sleep.test.ts`                                                                                          | zero hits                                                                                                                                                                                                                     |
| IacRoleArn without tag → H3 advisory      | security (advisory in M3)          | iacRoleArn on role lacking tag                                               | preview                                                                                                           | H3 fires advisory; no mandatory block                                                                                                                                                                                         |
| `cisVersion: "v7.0.0"` accepted with warn | roadmap                            | `{ cisVersion: "v7.0.0" }`                                                   | typecheck + preview                                                                                               | TS accepts; preview warns "AWS Security Hub currently maxes at v5.0.0"                                                                                                                                                        |
| Tags emitted on every sub-resource        | compatibility                      | any AccountFoundation                                                        | preview                                                                                                           | every child carries 3 tags with non-empty `hulumi:controls`                                                                                                                                                                   |
| CisV5Pack sections 1–3 fire               | security                           | fixture with non-compliant IAM, public S3, disabled CloudTrail               | preview with pack                                                                                                 | 3 violations, one per section, each citing CIS rec ID with AWS URL                                                                                                                                                            |
| CisV5Pack section 4 stub fires advisory   | roadmap                            | fixture with CloudWatch alarm                                                | preview                                                                                                           | `HULUMI-CIS-v5-NOT-IMPLEMENTED-v1` advisory with roadmap URL                                                                                                                                                                  |
| Integration — Sandbox tier                | e2e weekly                         | OIDC + sandbox; `HULUMI_INTEGRATION=1`                                       | `pulumi up` + poll                                                                                                | all 6 sub-resources reach ACTIVE/ENABLED within 15 min; teardown succeeds; run cost ≤ $1                                                                                                                                      |
| Integration — Startup-Hardened            | e2e weekly                         | same                                                                         | `pulumi up` on Startup-Hardened                                                                                   | all 6 + extended within 15 min; teardown succeeds                                                                                                                                                                             |
| Integration fails loudly on missed window | reliability / no auto-retry        | simulated Security Hub timeout via wrong region                              | workflow run                                                                                                      | fails with clear error; stack export as artifact; no retry; teardown still runs                                                                                                                                               |
| Teardown runs on failure                  | cost / safety                      | force-fail mid-`pulumi up`                                                   | workflow                                                                                                          | `afterAll` `pulumi destroy`; subsequent runs clean                                                                                                                                                                            |
| OIDC is only auth path                    | supply chain                       | workflow grep                                                                | `grep -E "AWS_ACCESS_KEY_ID\|aws_secret_access_key" .github/workflows/`                                           | zero hits                                                                                                                                                                                                                     |
| `@pulumi/*` pins unchanged from M2        | supply chain                       | CI exact-pin-guard                                                           | lockfile diff vs M2 snapshot                                                                                      | no Pulumi changes                                                                                                                                                                                                             |

## Regression Tests

- Full M1 + M2 BDDs green.
- `SecureBucket` mock + snapshot tests green; snapshots unchanged.
- `HulumiHardeningPack` H1/H2/H3/H4 still fire against M2 fixtures.
- M1 skill `s3-public-bucket-hardening` + `iam-least-privilege` + `aws-multi-account-baseline` + `rds-encryption-at-rest` scenarios still produce valid output; frontmatter schema unchanged.
- agentskills.io schema validates `SKILL.md`.
- IDs-only lint on new source + `dist/`.

## Compatibility Checklist

- [ ] `SecureBucket` signatures unchanged.
- [ ] `HulumiHardeningPack` H1–H4 IDs unchanged.
- [ ] `Tier` union unchanged.
- [ ] Public `CisV5Pack` name unchanged.
- [ ] `AccountFoundation` matches [interfaces.md §1](../design/hulumi/interfaces.md).
- [ ] AWS tag schema stable.
- [ ] `pnpm-lock.yaml` Pulumi integrity hashes match M2 allowlist.
- [ ] `pnpm install && pnpm -r build && pnpm -r test && pnpm -r lint && pnpm -r typecheck` green on Node 20 LTS.
- [ ] Skill invocation works on all 5 M1 scenarios; three now reference live AccountFoundation.

## E2E Runtime Validation

**File**: `packages/baseline/tests/account-foundation.test.ts` (mocks)

| E2E Test                                           | What It Proves           | Pass Criteria                                             |
| -------------------------------------------------- | ------------------------ | --------------------------------------------------------- |
| `sandbox_tier_matches_plan_snapshot`               | Sandbox stable           | Matches snapshot                                          |
| `startup_hardened_tier_matches_plan_snapshot`      | Startup-Hardened stable  | Matches snapshot; ≥4 deltas                               |
| `dependson_graph_has_guardduty_before_securityhub` | Ordering contract        | Security Hub has transitive `dependsOn` → GuardDuty probe |
| `no_sleep_in_source`                               | No in-process waits      | AST/grep passes                                           |
| `tag_emission_uniform`                             | All sub-resources tagged | Check passes                                              |
| `invalid_iac_role_arn_throws`                      | Input validation         | Constructor throws on empty/malformed                     |

**File**: `packages/policies/tests/cis-v5-pack.test.ts`

| E2E Test                                 | What It Proves    | Pass Criteria                                                                         |
| ---------------------------------------- | ----------------- | ------------------------------------------------------------------------------------- |
| `section_1_iam_rules_fire`               | Section 1         | Each rule has a triggering fixture                                                    |
| `section_2_storage_rules_fire`           | Section 2         | Same                                                                                  |
| `section_3_logging_rules_fire`           | Section 3         | Same                                                                                  |
| `section_4_stub_fires_advisory`          | Stub              | CloudWatch alarm fixture → advisory not mandatory                                     |
| `every_registered_rule_has_test`         | Test completeness | Metadata scan asserts test named `rule_<id>` exists for every `PackMetadata.rules[i]` |
| `no_verbatim_cis_prose_in_rule_messages` | License boundary  | IDs-only lint on rules file                                                           |

**File**: `packages/baseline/tests/integration/account-foundation.integration.test.ts` (real AWS, weekly)

| E2E Test                                                    | What It Proves         | Pass Criteria                                 |
| ----------------------------------------------------------- | ---------------------- | --------------------------------------------- |
| `integration_sandbox_reaches_active_within_15_min`          | Sandbox works          | All 6 within window; teardown succeeds        |
| `integration_startup_hardened_reaches_active_within_15_min` | Startup-Hardened works | Same with extended                            |
| `integration_teardown_on_failure`                           | Cost safety            | Force-fail variant completes; fixture removed |
| `integration_cost_under_budget`                             | Cost bound             | Post-run CostExplorer shows < $5              |

## Smoke Tests

- [ ] `pnpm install && pnpm -r build && pnpm -r test && pnpm -r lint && pnpm -r typecheck` → green.
- [ ] `cd examples/account-foundation-smoke && pulumi preview --policy-pack ../../packages/policies` → clean.
- [ ] Change example to `tier: "startup-hardened"` without `orgAccountIds` → aggregator skipped gracefully → preview still green.
- [ ] Set `Pulumi.yaml` to `file://` → H2 blocks (M2 regression) → revert.
- [ ] `gh workflow run weekly-integration.yml` → OIDC assumes sandbox role, `pulumi up` + integration test + `pulumi destroy` completes green.
- [ ] Sunday 04:00 UTC scheduled run → green.
- [ ] Remove a rule impl in `cis-v5-pack.rules.ts` → `every_registered_rule_has_test` fails → restore.
- [ ] `grep 'v0.2+' skills/hulumi-threat-model/` → zero hits.
- [ ] `git status` clean.

## Evidence Log

| Step                               | Command / Check                      | Expected                    | Actual | Pass/Fail | Notes |
| ---------------------------------- | ------------------------------------ | --------------------------- | ------ | --------- | ----- |
| Baseline (M1+M2)                   | `pnpm -r test` pre-edits             | green                       |        |           |       |
| Rename cis-v5-bucket → cis-v5-pack | `git mv` + imports                   | builds                      |        |           |       |
| BDD stubs                          | all test files                       | fail expectedly             |        |           |       |
| Implementation (helpers)           | 6 helpers each passes isolated test  |                             |        |           |       |
| Implementation (AccountFoundation) | composition                          | mock tests pass             |        |           |       |
| Snapshots reviewed                 | manual                               | ≥4 deltas visible           |        |           |       |
| CisV5Pack expansion                | sections 1-3 + stubs                 | pack tests pass             |        |           |       |
| Example smoke                      | mocked preview clean                 |                             |        |           |       |
| Sandbox setup                      | `docs/deployment/sandbox-account.md` | OIDC + scoped role          |        |           |       |
| Weekly workflow dry-run            | `gh workflow run`                    | green; cost < $5; teardown  |        |           |       |
| First scheduled run                | Sunday 04:00 UTC                     | green                       |        |           |       |
| Forced-failure integration         | simulated region mismatch            | fails loudly; teardown runs |        |           |       |
| Full tests                         | `pnpm -r test`                       | green                       |        |           |       |
| Build / lint / typecheck           | green                                |                             |        |           |       |
| Exact-pin-guard                    | lockfile                             | passes                      |        |           |       |
| License-boundary lint              | `dist/`                              | no hits                     |        |           |       |
| Skill forward-ref                  | `grep 'v0.2+' skills/`               | zero                        |        |           |       |
| Smoke tests                        | manual                               | all checked                 |        |           |       |
| Test artifact cleanup              | `git status`                         | clean                       |        |           |       |
| .gitignore review                  | integration patterns                 | clean                       |        |           |       |
| Compatibility                      | M1+M2 regression                     | green                       |        |           |       |

## Definition of Done

- All M3 BDD scenarios pass (mocked + integration where applicable).
- All E2E validations pass.
- ≥1 weekly scheduled integration has completed green against sandbox during M3 review window.
- Full M1+M2+M3 test suite green on PRs.
- Smoke tests checked.
- Compatibility complete.
- Forbidden shortcuts absent (no-sleep AST test; no long-lived creds).
- `git status` clean.
- `.gitignore` updated.
- `docs/components/account-foundation.md`, `docs/tiers.md` (extended), `docs/integration-testing.md`, `docs/deployment/sandbox-account.md` complete.
- M1 skill live AccountFoundation references; M1 regression green.
- `docs/lessons/hulumi-m3.md` + `docs/completion/hulumi-m3.md` written.
- Milestone Tracker `done`.

## Post-Flight

- **ARCHITECTURE.md** (Hulumi): add AccountFoundation to Key Components; Data Flow reflects 6-service composition; note M4 adds drift classifier.
- **README.md**: quick-start for AccountFoundation both tiers; link to integration-testing docs.
- **Other docs**: `docs/deployment/README.md` pointer to `sandbox-account.md` + forward to `scp.json` in M5.

## Notes

- Sections 4–5 deferred as stubs; resources audited are not Hulumi-created in v1 or require Networking components (v1.1+).
- 15-min integration timeout reflects AWS eventual-consistency realities; shorter is flaky, longer masks breakage.
- KMS deny-without-tag only in Startup-Hardened + `orgAccountIds` mode (bootstrap paradox on first-ever single-account run). Documented in `docs/components/account-foundation.md`.
- Weekly cost ceiling < $5/run is operational contract. A > $5 run indicates undeleted resources — treated as defect.
- Snapshot diffs on future Pulumi minor/major bumps: `ask`, not auto-merge.
