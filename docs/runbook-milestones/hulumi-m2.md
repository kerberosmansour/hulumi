# Milestone 2 — `SecureBucket` component + tiered defaults + `HulumiHardeningPack`

Parent runbook: [docs/RUNBOOK-hulumi.md](../RUNBOOK-hulumi.md).

**Goal**: After M2, `@hulumi/baseline.aws.SecureBucket` is a shipped Pulumi ComponentResource with an explicit Sandbox vs Startup-Hardened tier matrix (≥3 per-tier control deltas). `@hulumi/policies.HulumiHardeningPack` is a CrossGuard pack that **blocks raw `aws.s3.Bucket` / `aws.s3.BucketV2`** usage and **blocks unencrypted Pulumi state backends** (critique S5). Pulumi policy-test framework mock-unit tests run on every PR. The `/hulumi-threat-model` skill's `s3-public-bucket-hardening` scenario transitions from forward-reference to live recommendation.

**Context**: M1 shipped the skill but no Pulumi code. M2 ships the first real component and the first policy pack, together. Research [synthesis §3](../research/hulumi/synthesis.md) established CrossGuard as the sanctioned policy substrate. [interfaces.md §1–§2](../design/hulumi/interfaces.md) defines the stable `SecureBucket` + `HulumiHardeningPack` public surface. Critique C2 forced the tier matrix to have ≥2 concrete deltas; we deliver ≥3. Critique E3 locked "mocks-only for every-PR tests, sandbox integration weekly" — weekly sandbox is in M3; M2 ships the mock-unit path.

**Important design rule**: **Tier is behaviourally load-bearing, not decoration.** The Startup-Hardened tier MUST enforce at least three concrete controls that Sandbox does not (object-lock, mandatory access logging, CloudTrail data-events). If a future PR relaxes the Startup-Hardened tier to match Sandbox, the tier-matrix BDD scenario fails and CI blocks the merge.

**Refactor budget**: `No refactor permitted beyond M1 files. M1 skill scripts can be lightly edited (one-line forward-reference update for SecureBucket) — this is the only M1-file edit allowed.`

## Contract Block

| Field                                  | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Inputs                                 | Pulumi program imports `SecureBucket` from `@hulumi/baseline/aws`, instantiates with `{ tier: "sandbox" \| "startup-hardened", kmsKeyArn?, logBucketArn?, objectLock?, lifecycleRules?, replication? }`. Pulumi program registers `HulumiHardeningPack` as a CrossGuard pack.                                                                                                                                                                                                                                                  |
| Outputs                                | At preview/up: S3 BucketV2 + PublicAccessBlock + SSE + OwnershipControls + Versioning + BucketPolicy + optionally ObjectLock, Logging, Replication. Tags `hulumi:component=SecureBucket`, `hulumi:tier=<tier>`, `hulumi:controls=<csv>`. Component exports `SecureBucketOutputs`.                                                                                                                                                                                                                                              |
| Interfaces touched                     | `hulumi.baseline.aws.SecureBucket`, `Args`, `Outputs`, `Tier`; `hulumi.policies.aws.HulumiHardeningPack`; `PackMetadata`; AWS tags. All `stable` per [interfaces.md](../design/hulumi/interfaces.md).                                                                                                                                                                                                                                                                                                                          |
| Files allowed to change                | **New packages**: `packages/baseline/*`, `packages/policies/*`. **Edits**: root `package.json`, `pnpm-workspace.yaml`, `.github/workflows/ci.yml`, `skills/hulumi-threat-model/scripts/generate-threat-model.ts` (single line: forward-ref → live ref), `skills/hulumi-threat-model/scenarios/s3-public-bucket-hardening.json`, `docs/threat-model-examples/s3-public-bucket-hardening.md`. **New docs**: `docs/components/secure-bucket.md`, `docs/tiers.md`, `docs/components/README.md`, `examples/secure-bucket-smoke/**`. |
| Files to read before changing anything | `docs/design/hulumi/interfaces.md`, `docs/design/hulumi/stack-decision.md`, `docs/critique/hulumi.md` (C2, E3, S5, S3), `docs/lessons/hulumi-m1.md`, [`@pulumi/aws` S3 docs](https://www.pulumi.com/registry/packages/aws/api-docs/s3/), existing skill scenario JSON.                                                                                                                                                                                                                                                         |
| New files allowed                      | All files listed in the allow-list.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| New dependencies allowed               | Runtime: `@pulumi/pulumi` (exact pin + integrity hash), `@pulumi/aws` (exact pin), `@pulumi/policy` (exact pin). Dev: `pulumi.runtime.setMocks` (zero extra dep).                                                                                                                                                                                                                                                                                                                                                              |
| Migration allowed                      | `no`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Compatibility commitments              | M1 skill remains installable + invocable. Public types match [interfaces.md §1–§2](../design/hulumi/interfaces.md) exactly. AWS tag schema stable.                                                                                                                                                                                                                                                                                                                                                                             |
| Forbidden shortcuts                    | (a) No mocks in production. (b) No TODO markers for missing tier deltas. (c) No silent fallback when Startup-Hardened is missing `logBucketArn` — explicit throw. (d) No shell exec with user-supplied strings. (e) No weakening `HulumiHardeningPack` rules to "advisory" to pass tests. (f) No embedding verbatim CCM/CIS prose. (g) No `@pulumi/aws` pin diverging from `pnpm-lock.yaml` integrity hash.                                                                                                                    |

## Out of Scope / Must Not Do

- No `AccountFoundation` — M3.
- No drift classifier — M4.
- No weekly sandbox integration infrastructure — M3.
- No SLSA release — M5.
- No SCP template — M5.
- No mandatory H3 — M5 (paired with SCP).
- No RDS, Lambda, VPC, or other resources — S3 only.
- No cross-region replication by default — opt-in arg.
- No full CIS AWS v5.0 pack — only bucket-relevant rules in M2 stub.

## Pre-Flight

1. Global Entry Rules.
2. Read `docs/lessons/hulumi-m1.md`; apply corrections.
3. Read allowed files.
4. Copy Evidence Log template.
5. Re-state load-bearing constraints: (i) ≥3 tier deltas, (ii) H1 + H2 block raw bucket and file:// backend, (iii) mocks-only in CI, no real AWS.

## Files Allowed To Change

| File                                                                         | Planned Change                                                                                   |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `packages/baseline/package.json`                                             | NEW: `@hulumi/baseline`, peer-deps exact-pinned, exports map, Apache-2.0                         |
| `packages/baseline/tsconfig.json`                                            | NEW: extends root base                                                                           |
| `packages/baseline/src/index.ts`                                             | NEW: re-exports `aws`, `mappings`                                                                |
| `packages/baseline/src/aws/index.ts`                                         | NEW: re-exports `SecureBucket`, `Args`, `Outputs`, `Tier`                                        |
| `packages/baseline/src/aws/tier.ts`                                          | NEW: `Tier` union + runtime guard                                                                |
| `packages/baseline/src/aws/secure-bucket.ts`                                 | NEW: ComponentResource with tier-differentiated sub-resources + tags                             |
| `packages/baseline/src/aws/secure-bucket.args.ts`                            | NEW: typed args matching interfaces.md §1                                                        |
| `packages/baseline/src/aws/secure-bucket.outputs.ts`                         | NEW: typed outputs                                                                               |
| `packages/baseline/src/mappings/{ccm,cis-aws,nist-800-53-r5,atlas}.ts`       | NEW: programmatic ID tables synced with `docs/mappings/`                                         |
| `packages/baseline/tests/secure-bucket.test.ts`                              | NEW: Vitest + `pulumi.runtime.setMocks` covering M2 BDDs                                         |
| `packages/baseline/tests/mappings.test.ts`                                   | NEW: asserts TS ID tables ⊆ docs tables                                                          |
| `packages/baseline/README.md`                                                | NEW                                                                                              |
| `packages/policies/package.json`                                             | NEW: `@hulumi/policies`, peer-dep exact-pinned                                                   |
| `packages/policies/tsconfig.json`                                            | NEW                                                                                              |
| `packages/policies/src/index.ts`                                             | NEW: re-exports `HulumiHardeningPack`, `PackMetadata`, `CisV5Pack` (stub)                        |
| `packages/policies/src/metadata.ts`                                          | NEW: `PackMetadata` type (cdk-nag-style)                                                         |
| `packages/policies/src/aws/hulumi-hardening-pack.ts`                         | NEW: H1/H2/H3/H4 rules                                                                           |
| `packages/policies/src/aws/cis-v5-bucket.ts`                                 | NEW stub: bucket-only CIS rules                                                                  |
| `packages/policies/src/aws/suppressions.ts`                                  | NEW: `Suppression` type + evaluator                                                              |
| `packages/policies/tests/hulumi-hardening-pack.test.ts`                      | NEW                                                                                              |
| `packages/policies/README.md`                                                | NEW                                                                                              |
| `examples/secure-bucket-smoke/{Pulumi.yaml,index.ts,package.json,README.md}` | NEW: minimal working example                                                                     |
| `docs/components/secure-bucket.md`                                           | NEW: full component docs — tier matrix, cited IDs                                                |
| `docs/components/README.md`                                                  | NEW: component index                                                                             |
| `docs/tiers.md`                                                              | NEW: **the tier matrix** with concrete deltas                                                    |
| `skills/hulumi-threat-model/scripts/generate-threat-model.ts`                | EDIT: drop "v0.2+" marker for SecureBucket                                                       |
| `skills/hulumi-threat-model/scenarios/s3-public-bucket-hardening.json`       | EDIT                                                                                             |
| `docs/threat-model-examples/s3-public-bucket-hardening.md`                   | EDIT                                                                                             |
| `package.json` (root)                                                        | EDIT: scripts `test:policies`, `test:baseline`; engines pinned                                   |
| `pnpm-workspace.yaml`                                                        | EDIT: add `packages/*`, `examples/*`                                                             |
| `.github/workflows/ci.yml`                                                   | EDIT: add `baseline-test`, `policies-test`, `examples-typecheck` jobs + **exact-pin-guard** step |
| `.gitignore`                                                                 | EDIT: `packages/*/dist/`, `examples/*/node_modules/`, Pulumi checkpoints                         |

## Step-by-Step

1. Write BDD test stubs first for all M2 scenarios.
2. Add `@pulumi/*` deps with exact versions; run `pnpm install`; commit `pnpm-lock.yaml`; record integrity hashes in Evidence Log.
3. Implement `@hulumi/baseline`: `Tier` → Args/Outputs → `SecureBucket` (sandbox first, then startup-hardened deltas) → mappings.
4. Implement `@hulumi/policies`: `PackMetadata` → `HulumiHardeningPack` H1/H2/H3/H4 → `Suppression` → stub `CisV5Pack` with bucket-only rules.
5. Wire `examples/secure-bucket-smoke/` end-to-end; mocked `pulumi preview` emits expected diff for each tier.
6. Edit M1 skill's one-line forward-reference.
7. Make all BDD tests pass; run full `pnpm -r test`.
8. Write `docs/tiers.md` + `docs/components/secure-bucket.md` with concrete matrix and citations.
9. `git status` clean; `.gitignore` updated.
10. Smoke tests + Self-Review Gate + `docs/lessons/hulumi-m2.md` + `docs/completion/hulumi-m2.md`.

## BDD Acceptance Scenarios

**Feature: `SecureBucket` applies tier-differentiated defaults; `HulumiHardeningPack` blocks footguns**

| Scenario                                                        | Category                    | Given                                                 | When                       | Then                                                                                                                                    |
| --------------------------------------------------------------- | --------------------------- | ----------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Sandbox tier emits baseline sub-resources                       | happy path                  | `new SecureBucket("s", { tier: "sandbox" })`          | mocked preview             | PublicAccessBlock T/T/T/T, SSE-KMS, Versioning, OwnershipControls BucketOwnerEnforced, TLS-only BucketPolicy. NO ObjectLock, NO Logging |
| Startup-Hardened adds object-lock + logging + data-events       | happy path                  | `{ tier: "startup-hardened", logBucketArn: "arn:…" }` | mocked preview             | all sandbox PLUS ObjectLock(governance, 30d), Logging(target=logs), CloudTrail data-events toggle                                       |
| Tier matrix delta count ≥ 3                                     | schema / regression         | source                                                | static AST check           | Startup-Hardened emits ≥3 sub-resource kinds Sandbox does not                                                                           |
| Startup-Hardened without logBucketArn throws                    | invalid input               | no logBucketArn                                       | preview                    | error "Startup-Hardened requires logBucketArn; see docs/tiers.md"                                                                       |
| Invalid tier rejected at compile                                | invalid input               | `tier: "pro-max-ultra" as any`                        | `tsc --noEmit`             | TS error on `Tier` union                                                                                                                |
| Invalid tier rejected at runtime                                | invalid input               | bypass via `as any`                                   | preview                    | constructor throws listing valid tiers                                                                                                  |
| Tags emitted on all sub-resources                               | compatibility               | any `SecureBucket`                                    | preview                    | every sub-resource carries 3 required tags; `hulumi:controls` ≥5 entries                                                                |
| H1 blocks raw `aws.s3.BucketV2`                                 | security (S5)               | raw bucket + pack loaded                              | preview                    | mandatory violation `HULUMI-H1` with URL                                                                                                |
| H2 blocks file:// state backend                                 | security (S5)               | `Pulumi.yaml` `backend: file://`                      | preview                    | mandatory violation `HULUMI-H2`                                                                                                         |
| H2 blocks unencrypted S3 state backend                          | security (S5)               | S3 backend without SSE                                | preview                    | mandatory violation if detectable; advisory if config unreadable                                                                        |
| H3 advisory on missing IaC-role tag                             | security (M2 advisory)      | role without `hulumi:iac-role=true`                   | preview                    | advisory warning `HULUMI-H3` with SCP pointer                                                                                           |
| H4 blocks Startup-Hardened without logBucketArn at policy layer | security (defense in depth) | pack loaded                                           | preview                    | H4 mandatory violation alongside component throw                                                                                        |
| Mappings subset of docs                                         | schema / sync               | TS mappings + markdown                                | `mappings.test.ts`         | every ID in TS exists in docs with non-empty URL                                                                                        |
| License-boundary lint on built dist                             | license / compliance        | `pnpm -r build`                                       | IDs-only lint on `dist/**` | zero verbatim CCM/CIS hits                                                                                                              |
| Exact-pin-guard CI step catches drift                           | supply chain                | hand-edited `pnpm-lock.yaml`                          | CI                         | job fails with allowlist violation message                                                                                              |

## Regression Tests

- Full M1 BDD suite green.
- M1 IDs-only lint still green on M2 source.
- Skill invocation on `s3-public-bucket-hardening` still ends end-to-end AND references `@hulumi/baseline.aws.SecureBucket` without "v0.2+".
- agentskills.io schema still validates M1 `SKILL.md`.

## Compatibility Checklist

- [ ] `SKILL.md` frontmatter unchanged.
- [ ] M1's output markdown frontmatter schema unchanged.
- [ ] `@hulumi/baseline` exports match [interfaces.md §1](../design/hulumi/interfaces.md) (TS assignability).
- [ ] `@hulumi/policies` exports match [interfaces.md §2](../design/hulumi/interfaces.md).
- [ ] AWS tag schema stable.
- [ ] `pnpm-lock.yaml` integrity hashes match CI allowlist snapshot.
- [ ] `pnpm install && pnpm -r build && pnpm -r test && pnpm -r lint && pnpm -r typecheck` green on Node 20 LTS.

## E2E Runtime Validation

**File**: `packages/baseline/tests/secure-bucket.test.ts`

| E2E Test                                      | What It Proves                | Pass Criteria                                |
| --------------------------------------------- | ----------------------------- | -------------------------------------------- |
| `sandbox_tier_matches_plan_snapshot`          | Sandbox shape stable          | Matches `tests/__snapshots__/sandbox.snap`   |
| `startup_hardened_tier_matches_plan_snapshot` | Startup-Hardened shape stable | Matches startup-hardened snapshot; ≥3 deltas |
| `startup_hardened_missing_log_bucket_throws`  | Input validation at component | Constructor throws before registration       |
| `invalid_tier_string_throws`                  | Runtime guard                 | Throws on `"pro-max-ultra"`                  |
| `tags_emitted_on_all_sub_resources`           | Attribution tags applied      | Every registered sub-resource carries tags   |
| `mappings_subset_of_docs`                     | ID consistency                | TS tables ⊆ docs tables                      |

**File**: `packages/policies/tests/hulumi-hardening-pack.test.ts`

| E2E Test                                              | What It Proves      | Pass Criteria                                                     |
| ----------------------------------------------------- | ------------------- | ----------------------------------------------------------------- |
| `blocks_raw_aws_s3_bucket`                            | H1                  | Fixture raw bucket → H1 violation                                 |
| `blocks_file_backend`                                 | H2                  | Fixture `file://` backend → H2 violation                          |
| `warns_on_unencrypted_s3_backend`                     | H2 best-effort      | Fixture SSE-missing backend → H2 violation; unreadable → advisory |
| `warns_on_missing_iac_role_tag`                       | H3 advisory         | Fixture role without tag → H3 advisory                            |
| `blocks_startup_hardened_without_log_bucket_via_pack` | H4 defense in depth | Even if component constructor mocked away                         |
| `suppressions_scope_correctly`                        | `Suppression` works | Scoped suppression silences only matching rule                    |

**File**: `examples/secure-bucket-smoke/` smoke under mocked Pulumi

| E2E Test                              | What It Proves          | Pass Criteria                                                                                   |
| ------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------- |
| `example_preview_emits_expected_diff` | End-to-end example runs | Diff contains sandbox + startup-hardened buckets, tier-appropriate sub-resources, no violations |

## Smoke Tests

- [ ] `pnpm install && pnpm -r build && pnpm -r test && pnpm -r typecheck && pnpm -r lint` → green.
- [ ] `cd examples/secure-bucket-smoke && pulumi preview --policy-pack ../../packages/policies` → clean.
- [ ] Drop `logBucketArn` from Startup-Hardened example → preview fails with component's error → revert.
- [ ] Change `Pulumi.yaml` to `file://` → preview fails with H2 → revert.
- [ ] `rm packages/baseline/src/mappings/ccm.ts && pnpm -r test` → `mappings.test.ts` fails → restore.
- [ ] `git status` clean.
- [ ] `docs/tiers.md` has one table "Sandbox vs Startup-Hardened" with ≥3 "Startup-Hardened only" rows.
- [ ] `docs/components/secure-bucket.md` has working code for both tiers.
- [ ] `skills/hulumi-threat-model/scripts/generate-threat-model.ts` no longer contains `"v0.2+"` for SecureBucket.

## Evidence Log

| Step                      | Command / Check                                      | Expected                          | Actual | Pass/Fail | Notes |
| ------------------------- | ---------------------------------------------------- | --------------------------------- | ------ | --------- | ----- |
| Baseline (M1)             | `pnpm -r test` pre-edits                             | green                             |        |           |       |
| Pulumi deps pinned        | `pnpm list @pulumi/aws`                              | exact versions + integrity hashes |        |           |       |
| BDD stubs                 | tests fail expectedly                                |                                   |        |           |       |
| Implementation (baseline) | contract satisfied                                   |                                   |        |           |       |
| Implementation (policies) | contract satisfied                                   |                                   |        |           |       |
| Example smoke             | `pulumi preview` clean                               |                                   |        |           |       |
| Full tests                | `pnpm -r test`                                       | green                             |        |           |       |
| E2E mock tests            | component + pack + example                           | all green                         |        |           |       |
| Build / lint / typecheck  | `pnpm -r build && pnpm -r lint && pnpm -r typecheck` | green                             |        |           |       |
| Exact-pin-guard           | seeded drift                                         | fails as designed                 |        |           |       |
| License-boundary lint     | built `dist/` + source                               | no verbatim                       |        |           |       |
| Mappings sync             | `mappings.test.ts`                                   | TS ⊆ docs                         |        |           |       |
| Skill forward-ref         | `grep 'v0.2+' skills/` for SecureBucket              | zero                              |        |           |       |
| Smoke tests               | manual                                               | all checked                       |        |           |       |
| Test artifact cleanup     | `git status`                                         | clean                             |        |           |       |
| .gitignore review         | new patterns present                                 |                                   |        |           |       |
| Compatibility             | M1 regression                                        | green                             |        |           |       |

## Definition of Done

- All M2 BDD scenarios pass.
- All E2E validations pass.
- Full M1 + M2 test suite green.
- Smoke tests checked.
- Compatibility complete.
- No forbidden shortcuts.
- `git status` clean.
- `.gitignore` up to date.
- `docs/components/secure-bucket.md` + `docs/tiers.md` + `docs/components/README.md` complete.
- M1 skill forward-reference updated; M1 regression green.
- `@pulumi/*` exact-pinned + on CI allowlist.
- `docs/lessons/hulumi-m2.md` + `docs/completion/hulumi-m2.md` written.
- Milestone Tracker `done`.

## Post-Flight

- **ARCHITECTURE.md** (Hulumi): add `@hulumi/baseline` + `@hulumi/policies` to Key Components; note M3 adds `AccountFoundation`.
- **README.md**: quick-start snippet for `SecureBucket` in both tiers.
- **Other docs**: `docs/components/README.md` index.

## Notes

- H3 advisory-in-M2, mandatory-in-M5 is explicit phasing — mandatory before drift classifier exists creates noise without teeth.
- `CisV5Pack` stub registers only bucket-relevant CIS recommendations; full pack in M3.
- CRR is not a tier delta; opt-in arg in either tier.
- Mappings sync test prevents source drift from docs source-of-truth.
