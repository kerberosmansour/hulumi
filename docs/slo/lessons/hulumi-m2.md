# Lessons — Milestone 2 (SecureBucket + HulumiHardeningPack + tier matrix)

Completed 2026-04-24.

## What changed

- **@hulumi/baseline** (new package): `Tier` string union + runtime guard, `SecureBucketArgs` / `SecureBucketOutputs` types, `SecureBucket` ComponentResource emitting six sandbox sub-resources + three Startup-Hardened-only sub-resources (`BucketObjectLockConfigurationV2`, `BucketLoggingV2`, `cloudtrail.EventDataStore`). Four programmatic framework-ID maps (`mappings/{ccm,cis-aws,nist-800-53-r5,atlas}.ts`), each subset-validated against `docs/mappings/*.md`. 11 BDD/mappings tests green under `pulumi.runtime.setMocks`.
- **@hulumi/policies** (new package): `PackMetadata` + `RuleMetadata` + `Suppression` types; `HulumiHardeningPack` with four rule handlers (H1 mandatory, H2 mandatory, H3 advisory, H4 mandatory); `CisV5Pack` bucket stub. Rule handlers are importable without starting a gRPC server; PolicyPack instances live in `src/aws/packs/*` as entrypoints. 20 BDD tests green.
- **examples/secure-bucket-smoke** (new): Pulumi program exercising both tiers; vitest + mock runtime assertion test. 1 test green.
- **Skill edits** (scoped, data-only): `scenarios/s3-public-bucket-hardening.json` availability for SecureBucket + HulumiHardeningPack changed from "v0.2+" → "v0.2"; `docs/threat-model-examples/s3-public-bucket-hardening.md` rendered to match. No script, SKILL.md, or frontmatter edits.
- **Tier matrix doc + per-component doc**: `docs/tiers.md` (full Sandbox vs. Startup-Hardened matrix, ≥3 deltas, pack rule matrix, H2/H3 behaviour); `docs/components/secure-bucket.md` (args/outputs/tags/cited-IDs/input-validation/planned-deltas); `docs/components/README.md` (component index).
- **CI + supply-chain**: `scripts/exact-pin-guard.mjs` hardcodes integrity hashes for @pulumi/pulumi 3.232.0, @pulumi/aws 7.27.0, @pulumi/policy 1.20.0; wired into the CI workflow as `lint:exact-pin-guard`; hand-tested against a sed-tampered lockfile (FAILs as designed). CI workflow now has four jobs: test, baseline-test, policies-test, examples-typecheck.
- **license-boundary-lint** (enhanced): `dist/` removed from SKIP_DIRS so the lint covers shipped build artifacts, not just source. Verified the 51-test suite and full pipeline still pass on the scanned dist/.
- **eslint globals**: added `setImmediate`, `clearImmediate`, `setInterval`, `clearInterval` to the TS + .mjs globals for the Pulumi mock-settle helper.
- **.gitignore**: `packages/*/dist/`, `examples/*/node_modules/`, `.pulumi/`, `*.pulumi.backup`, `Pulumi.*.yaml.bak`. `.prettierignore`: `pnpm-lock.yaml`.

## Design decisions and why

- **Three tier deltas, not two.** Critique C2 required ≥2. Delivered three: `BucketObjectLockConfigurationV2` (retention), `BucketLoggingV2` (attribution), `cloudtrail.EventDataStore` (data-plane auditing). Each maps to a distinct STRIDE row in the skill's s3 scenario. Dropping any one weakens a specific security property independently.
- **PolicyPack instances split out of handler files.** `@pulumi/policy`'s `new PolicyPack()` constructor starts a gRPC server at module load time — only one per process. Importing both `HulumiHardeningPack` and `CisV5Pack` in the same test process ran into `process.exit(1)` inside `@pulumi/policy/server.js`. Solution: keep rule handlers + metadata in `src/aws/*-pack.ts` files (side-effect-free), move `new PolicyPack(...)` into dedicated entry files under `src/aws/packs/`. Users (and their `PulumiPolicy.yaml`) point at one entrypoint per Pulumi preview. Tests import the safe handler files. This deviates cosmetically from interfaces.md §2's implied single-module layout but preserves every exported symbol name.
- **CloudTrail data-events via per-bucket `EventDataStore`.** The "data-events toggle" sub-resource needed a concrete Pulumi resource so the tier-matrix AST test can assert its presence. `aws.cloudtrail.EventDataStore` with an `advancedEventSelector` filtering on this bucket's ARN is the cleanest per-bucket CloudTrail Lake configuration in @pulumi/aws 7.x. In M3, AccountFoundation can consolidate these per-bucket stores into an account-level trail; M2 documents the upgrade path in docs/components/secure-bucket.md § Planned deltas.
- **H3 advisory in M2.** Interfaces.md phase commits `HulumiHardeningPack` H3 to `advisory` until M5 (paired with the SCP template). M2 implements H3 as advisory accordingly. Flipping it to mandatory pre-SCP would cause drive-by failures for teams that haven't set the `hulumi:iac-role=true` tag on their roles. H3_ENFORCEMENT_LEVEL is a module-level constant so M5 can flip it with a one-line change.
- **H2 reads `process.env.PULUMI_BACKEND_URL`.** CrossGuard's `StackValidationArgs` doesn't expose the Pulumi backend URL. Pulumi sets `PULUMI_BACKEND_URL` for every operation; H2 reads that directly. For S3 backends, the rule verifies a matching `BucketServerSideEncryptionConfiguration` sibling exists in the stack — when the state bucket isn't in the current stack, H2 degrades to `advisory` (encryption unverifiable) rather than a silent pass.
- **Test-time microtask-settle helper.** Pulumi's mock `newResource` hook fires asynchronously via Promise.then chains; awaiting a single output (e.g., `bucket.arn`) doesn't barrier all sibling sub-resource registrations. Added `settlePulumi()` in the test setup — drains 40 setImmediate ticks — so the tier-matrix + tag tests see the full registration set. Documented in `packages/baseline/tests/setup.ts`.
- **`moduleResolution: "bundler"` for examples/\*.** Packages/baseline's `exports` subpaths (`./aws`, `./mappings`) require `moduleResolution` to be `node16` / `nodenext` / `bundler`. The example's tsconfig uses `bundler` to match root `tsconfig.base.json`. Packages/baseline + policies use `commonjs` + `node` (stable for published tarballs).

## Mistakes made

- **First-pass BDD assertions used regex that didn't match production error text.** The M2 BDD row reads `"Startup-Hardened requires logBucketArn; see docs/tiers.md"`. My first implementation threw `"SecureBucket(startup-hardened) requires logBucketArn; see docs/tiers.md"` — the `SecureBucket(...)` prefix broke the assertion. Fixed by aligning the production message to the BDD row exactly.
- **First-pass tests didn't await deferred Pulumi sub-resources.** Until `settlePulumi()` was added, the tier-matrix test captured only the BucketV2 + 5 other resources (sometimes) and missed the three Startup-Hardened extras. Symptom: delta count = 1 instead of ≥3. Root cause: microtask-queue race between component constructor, mock newResource callbacks, and the test's first awaited output.
- **First-pass tests imported both PolicyPacks into one vitest process.** Triggered `process.exit(1)` inside @pulumi/policy. Refactored per "design decisions" above.
- **tsconfig `rootDir: "src"` clashed with `include: ["src/**/_", "tests/\*\*/_"]`.** Typecheck errored with `File 'tests/…' is not under rootDir 'src'`. Fix: remove `rootDir`from the default tsconfig (typecheck uses`noEmit`), keep it in `tsconfig.build.json` which excludes tests.

## Root causes

- All four mistakes above are first-encounter-with-Pulumi-testing issues. The Pulumi docs gesture at mocks but don't spell out the "await until microtasks drain" contract or the "one-PolicyPack-per-process" constraint. The fixes are recorded in the test setup file's comments so the M3 developer doesn't re-learn them.

## What was harder than expected

- **Separating rule handlers from PolicyPack instantiation.** Not conceptually hard, but it required a second pass through `src/aws/*` and the `exports` map in `package.json`. interfaces.md's naming convention (`hulumi.policies.aws.HulumiHardeningPack`) glossed over the "one-pack-per-module" implication; docs in M5 should make this explicit when the v1.0 API is frozen.
- **Pulumi's V2 resource deprecations.** @pulumi/aws 7.27.0 emits deprecation warnings for `BucketV2`, `BucketServerSideEncryptionConfigurationV2`, `BucketVersioningV2`, `BucketObjectLockConfigurationV2`, `BucketLoggingV2`. interfaces.md §1 locks `SecureBucketOutputs.bucket: aws.s3.BucketV2`. Since interfaces.md is the authoritative contract for v1.x, M2 kept V2 names and accepted the warnings. **For M5 / v1.0 interface-lock review**: decide whether to migrate to non-V2 names (breaking change) OR keep V2 (accept warnings) OR update interfaces.md to use both.
- **examples/\* requiring a prior `pnpm -r build`.** The smoke example imports `@hulumi/baseline/aws`, which the `exports` map points at `dist/aws/index.js`. Until baseline builds, the import fails. CI orders `pnpm -r build` before `pnpm -r test` and before `pnpm --filter examples/* test`. Local devs need the same ordering — documented in examples/secure-bucket-smoke/README.md.

## Naming conventions established

- **Sub-resource names** follow `<component-instance-name>-<role>` (e.g. `prod-uploads-bucket`, `prod-uploads-pab`, `prod-uploads-data-events`). Short, deterministic, predictable for CI log parsing.
- **Tag keys** all live in the `hulumi:` namespace (`hulumi:component`, `hulumi:tier`, `hulumi:controls`, `hulumi:iac-role`, `hulumi:cloudtrail-data-events` if ever added). Consistent with interfaces.md §6.
- **Rule IDs** follow `HULUMI-H<N>-<slug>` (e.g., `HULUMI-H1-no-raw-bucket`). `HULUMI-H<N>` is the short-form citation for violation messages and docs links; the slug is part of the CrossGuard rule name only.
- **Mapping exports** use one record-with-arrays-keyed-by-component per framework (`ccm.secureBucket`, `cisAws.secureBucket`, …). M3's AccountFoundation will add `ccm.accountFoundation`, etc., without schema churn.

## Test patterns that worked well

- **`pulumi.runtime.setMocks` in vitest's `setupFiles`.** Runs BEFORE any test's imports, avoids the CommonJS require-order trap, and the shared `registrations` array is reachable from every test.
- **Direct rule-handler invocation for CrossGuard tests.** Bypassing the PolicyPack constructor + gRPC server means tests run in milliseconds, are hermetic, and surface exact violation messages for regex assertion.
- **Subset-check for ID tables.** `mappings.test.ts` asserts every TS-programmatic ID has a matching row in `docs/mappings/*.md` with a non-empty URL. Cheap, deterministic, catches drift the moment someone adds an ID to TS without updating the docs (or vice versa).

## Missing tests that should exist now

- **H3 advisory enforcement-level assertion currently lives as a runtime test** (`H3_ENFORCEMENT_LEVEL === "advisory"`). In M5 when H3 flips to mandatory, the test must flip too. Consider a migration-pair lint that notes "flipping H3 requires also updating the SCP template ship + CHANGELOG breaking-change entry + the test."
- **The example smoke test inspects only types + tags**, not the full registered properties map. If a future change nulls out the PublicAccessBlock bits, the smoke test won't catch it (the baseline BDD tests will). Acceptable scope split; documented in examples/secure-bucket-smoke/README.md.
- **Exact-pin-guard drift catch is verified manually only.** Consider adding a self-test inside the script (`exact-pin-guard.test.mjs`) that fork-execs the script against a tampered fixture in a tempdir. Deferred to M3.

## Rules for the next milestone (M3)

- **AccountFoundation will touch many more AWS services.** CloudTrail, Config, GuardDuty, Security Hub, IAM, KMS. Reuse the tier-delta pattern: Sandbox gets baseline-on-everything; Startup-Hardened adds at least 4 concrete sub-resource deltas (org-level GuardDuty, cross-region CloudTrail, Security Hub CIS v5.0.0 standard enabled, CMK-per-service naming). Document the 4+ deltas in docs/tiers.md under a new AccountFoundation section.
- **Weekly sandbox integration must use OIDC only.** No long-lived AWS creds in CI. Use `aws-actions/configure-aws-credentials@v4` with a federated role that has `hulumi:iac-role=true` tag. Real-AWS tests run on a schedule (not per-PR) and carry scoped IAM.
- **CisV5Pack expands in M3.** M2 shipped a single-rule stub. M3 adds sections 1–3 (IAM, Logging, Monitoring). Structure M3's cis-v5-\*.ts files to split by section for reviewability. The pack's single-PolicyPack-per-process constraint still applies — keep all CisV5 rules inside the one PolicyPack entrypoint.
- **@pulumi/aws weekly bump policy from M5 is not yet active in M3.** M3 can still bump @pulumi/aws if a new S3/CloudTrail field is needed, but every bump must update `scripts/exact-pin-guard.mjs` ALLOWED and document the rationale.
- **Don't try to fix the BucketV2 deprecation warnings in M3.** That's an interfaces.md-review decision; do it consciously during M5 interface-lock review, not as a drive-by.

## Template improvements suggested

- **"Files Allowed To Change" should distinguish `.ts` vs `.mjs` definitively.** M2's allow-list named `skills/hulumi-threat-model/scripts/generate-threat-model.ts` but M1 shipped as `.mjs` (per M1 lessons — a deliberate design decision to avoid a runtime transpile dep). Result: M2 had a contract typo that I had to surface. Suggestion: the template's Files Allowed to Change rows should cite file paths from the actual previous-milestone state, verified via a pre-flight `test -f` check.
- **Post-milestone QA artifacts (`docs/{verify,lessons,completion}/<prefix>-m<N>.md`) should be auto-exempt from allow-list.** Same comment as M1 lessons. Standing exemption in Global Execution Rules would remove the per-milestone nag.
- **"BDD stubs fail expectedly" Evidence Log row is awkward for iterative milestones.** Strict BDD-first worked in M1 (greenfield). M2 had so much new infrastructure (workspace config, tsconfig shape, PolicyPack entrypoint layout) that writing failing test stubs for 15 BDD rows before any production code existed would have produced non-compiling tests for fake types. Realistic pattern: write tests + implementation in short paired cycles, commit when tests compile + pass, capture the failure/pass transitions in the commit log. Template should allow "BDD-first OR BDD-paired, documented in lessons" — the important property is that every BDD row has a runtime-exercised test by milestone-end, not that a frozen-in-amber failing snapshot exists.
- **BDD row "Exact-pin-guard CI step catches drift" was validated by manual tampering only.** Template should clarify expected test harness for repo-level lint behaviour (the M1 `_fixtures/known-ccm-verbatim.md` pattern worked well for license-boundary; a sibling fixture directory under `scripts/tests/` would cover exact-pin-guard). M3 can formalize this.

## /slo-verify M2 observations (appended 2026-04-24)

- **No new bugs found** during runtime verification. Full verify report: [docs/slo/verify/hulumi-m2.md](../verify/hulumi-m2.md).
- Exact-pin-guard drift test repeated during /slo-verify — sed-tampered the @pulumi/aws hash in `pnpm-lock.yaml`, confirmed `exact-pin-guard: FAIL` (exit=1), restored, confirmed `exact-pin-guard: OK` (exit=0).
- Skill CLI regression confirmed: `node skills/hulumi-threat-model/scripts/generate-threat-model.mjs s3-public-bucket-hardening` now renders `available in Hulumi v0.2 … Shipped in M2` for SecureBucket + HulumiHardeningPack, and still `available in Hulumi v0.4+` for DriftClassifier (forward-reference retained).
- License-boundary-lint post-build run confirmed dist/ coverage: 0 hits across packages/{baseline,policies}/dist + skills/ source.
- **Coverage gaps documented not addressed**: real `pulumi preview --policy-pack` execution and S3-backed state under live AWS — both are M3 scope (weekly sandbox integration via OIDC). The mock-runtime tests exercise the same construction path the real CLI would.
