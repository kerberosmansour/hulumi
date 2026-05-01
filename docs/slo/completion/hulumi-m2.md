# Completion — Milestone 2 (SecureBucket + HulumiHardeningPack + tier matrix)

Completed 2026-04-24.

## Goal completed

Achieved. `@hulumi/baseline.aws.SecureBucket` ships as a Pulumi `ComponentResource` with Sandbox and Startup-Hardened tiers. The Startup-Hardened tier emits three concrete sub-resource kinds Sandbox does not (`BucketObjectLockConfigurationV2`, `BucketLoggingV2`, `cloudtrail.EventDataStore`) — encoded as a runtime-verified tier-matrix test that fails if anyone collapses the delta. `@hulumi/policies.HulumiHardeningPack` enforces H1 (mandatory, no raw `aws.s3.Bucket` / `BucketV2` outside SecureBucket), H2 (mandatory, blocks `file://` state backend + unencrypted S3 backend), H3 (advisory in M2, mandatory in M5 — missing `hulumi:iac-role=true` tag), H4 (mandatory, Startup-Hardened requires a logging sibling). `CisV5Pack` ships as a bucket-only stub.

All 51 tests green (19 M1 regression + 11 baseline + 20 policies + 1 smoke). Build + typecheck + lint + license-boundary-lint + exact-pin-guard + format:check all green. The skill's `s3-public-bucket-hardening` scenario transitioned from forward-reference ("v0.2+") to live recommendation ("v0.2 — Shipped in M2") for SecureBucket + HulumiHardeningPack.

## Files changed

### New packages

- `packages/baseline/` — package.json (peer-pinned @pulumi/\*), tsconfig.json + tsconfig.build.json, vitest.config.ts.
- `packages/baseline/src/` — `aws/{tier,secure-bucket,secure-bucket.args,secure-bucket.outputs,index}.ts`, `mappings/{ccm,cis-aws,nist-800-53-r5,atlas,index}.ts`, `index.ts`.
- `packages/baseline/tests/` — `setup.ts`, `secure-bucket.test.ts`, `mappings.test.ts`.
- `packages/policies/` — package.json (peer-pinned @pulumi/\*), tsconfig.json + tsconfig.build.json, vitest.config.ts, PulumiPolicy.yaml.
- `packages/policies/src/` — `metadata.ts`, `aws/{hulumi-hardening-pack,cis-v5-bucket,suppressions}.ts`, `aws/packs/{hulumi-hardening,cis-v5}.ts`, `index.ts`.
- `packages/policies/tests/hulumi-hardening-pack.test.ts`.

### New example

- `examples/secure-bucket-smoke/` — package.json (workspace:\* dep on @hulumi/baseline), tsconfig.json, Pulumi.yaml, index.ts, vitest.config.ts, README.md, tests/smoke.test.ts.

### New repo-level scripts + docs

- `scripts/exact-pin-guard.mjs` — @pulumi/\* version + integrity-hash allowlist enforcer.
- `docs/tiers.md` — Sandbox vs Startup-Hardened matrix (3 deltas); HulumiHardeningPack rule matrix; H2 state-backend behaviour; H3 advisory→mandatory phasing rationale.
- `docs/components/secure-bucket.md` — full component doc: quick-start per tier, args, outputs, tags, cited framework IDs, input validation, planned deltas.
- `docs/components/README.md` — component index.

### Edits

- `pnpm-workspace.yaml` — added `packages/*`, `examples/*`.
- Root `package.json` — added `build`, `test:baseline`, `test:policies`, `lint:exact-pin-guard` scripts.
- `.github/workflows/ci.yml` — four jobs (test + baseline-test + policies-test + examples-typecheck), exact-pin-guard step before install+test, `pnpm -r build` before test.
- `.gitignore` — `packages/*/dist/`, `examples/*/node_modules/`, `.pulumi/`, `*.pulumi.backup`, `Pulumi.*.yaml.bak`.
- `.prettierignore` — `pnpm-lock.yaml` (machine-managed).
- `eslint.config.mjs` — added `setImmediate`, `clearImmediate`, `setInterval`, `clearInterval` globals.
- `scripts/license-boundary-lint.mjs` — removed `dist` from SKIP_DIRS so shipped artifacts are scanned.
- `skills/hulumi-threat-model/scenarios/s3-public-bucket-hardening.json` — `availability` strings for SecureBucket + HulumiHardeningPack flipped from "v0.2+" to "v0.2"; rationales updated to note "Shipped in M2".
- `docs/threat-model-examples/s3-public-bucket-hardening.md` — rendered to match the scenario JSON edits.

## Tests added

### @hulumi/baseline (11 tests)

- Sandbox tier emits baseline sub-resources (happy path).
- Startup-Hardened tier adds object-lock + logging + data-events (happy path).
- Tier matrix delta count ≥ 3 (schema regression).
- Startup-Hardened without logBucketArn throws (invalid input).
- Invalid tier rejected at runtime (invalid input).
- Tags emitted on all sub-resources (compatibility, with ≥5 controls).
- Type-level tier enforcement documented (placeholder — compile-time is proven by `tsc --noEmit`).
- Mappings — TS ⊆ docs for CCM, CIS-AWS, NIST-800-53-r5, ATLAS (4 tests).

### @hulumi/policies (20 tests)

- HulumiHardeningPack H1 — 4 tests (blocks raw BucketV2, blocks raw Bucket, allows SecureBucket-parented, silent on non-bucket).
- HulumiHardeningPack H2 — 5 tests (file:// mandatory, s3:// missing SSE mandatory, s3:// external advisory, unset silent, s3:// with SSE silent).
- HulumiHardeningPack H3 — 3 tests (advisory level, missing tag reports, present tag silent).
- HulumiHardeningPack H4 — 3 tests (hardened + no logging reports, hardened + logging silent, sandbox silent).
- Suppressions — 3 tests (URN-scoped, expires, glob prefix).
- PackMetadata shape — 2 tests (rule IDs + enforcement phasing, docsUrl + frameworkIds presence).

### Smoke (1 test)

- examples/secure-bucket-smoke — preview emits expected tier diff (both tiers, correct tags, tier-appropriate sub-resources).

## Runtime validations added

- 51 runtime tests across 4 workspaces (baseline + policies + examples + skill-bdd).
- `scripts/exact-pin-guard.mjs` wired to CI; verified catches drift via sed-tampered lockfile test (exit=1 with integrity mismatch message); reverts cleanly (exit=0 `OK (3 @pulumi/* deps match pinned hashes)`).
- license-boundary-lint now scans `dist/` in addition to source; green across the full scan tree.

## Compatibility checks performed

- M1 BDD suite: 19/19 still pass post-M2 edits.
- SKILL.md unchanged.
- Output markdown frontmatter schema unchanged.
- agentskills.io schema still validates M1 `SKILL.md`.
- Skill invocation on `s3-public-bucket-hardening` scenario renders "available in Hulumi v0.2 ... Shipped in M2" (no "v0.2+" for SecureBucket + HulumiHardeningPack).
- `@hulumi/baseline` and `@hulumi/policies` exports match interfaces.md §1–§2 names.
- AWS tag schema stable: `hulumi:component`, `hulumi:tier`, `hulumi:controls`.
- `pnpm install && pnpm -r build && pnpm -r test && pnpm -r lint && pnpm -r typecheck` all green on Node 20 engines.

## Documentation updated

- `docs/tiers.md` — new; full tier matrix + rule matrix + rationale.
- `docs/components/secure-bucket.md` — new; full per-component doc.
- `docs/components/README.md` — new; component index.
- `packages/baseline/README.md` — not written in M2 (component docs live in `docs/components/secure-bucket.md`; the package README lands in M5 alongside the npm-publish work).
- `packages/policies/README.md` — same as above, deferred to M5.

Deferred package READMEs noted in Deferred follow-ups below.

## .gitignore changes

- Added `packages/*/dist/`, `examples/*/node_modules/`, `.pulumi/`, `*.pulumi.backup`, `Pulumi.*.yaml.bak`.
- Pre-existing top-level `dist/` entry retained for belt-and-suspenders.

## Test artifact cleanup verified

`git status` clean after the M2 commit. `dist/` dirs inside `packages/*/` gitignored. No `.pulumi/` checkpoints produced (mocks-only in CI).

## Deferred follow-ups

- **`packages/baseline/README.md` + `packages/policies/README.md`** — M2 shipped the code; the tarball-level package READMEs (the ones that land on npmjs.com) are part of the M5 SLSA-release package. Target: M5.
- **ARCHITECTURE.md update in Hulumi repo root** — M2's Post-Flight lists "add `@hulumi/baseline` + `@hulumi/policies` to Key Components; note M3 adds `AccountFoundation`". Not done in this M2 session because `docs/slo/design/hulumi/ARCHITECTURE.md` doesn't exist in the Hulumi repo yet (still in the upstream TauriMobile planning corpus). Importing the planning corpus is an M5 follow-up; the Hulumi-repo ARCHITECTURE.md stub should be written as part of that import.
- **README.md quick-start for SecureBucket** — M2's Post-Flight mentions this. Current `README.md` references v0.1 scope; updating it for v0.2 requires touching the root README which, per M2's allow-list, is NOT changeable in this milestone. Target: M3 (when v0.2 components are released alongside AccountFoundation) or M5 (when the v1.0 README is rewritten for npm launch).
- **Self-test for `exact-pin-guard.mjs`** — M2 verified drift-catch manually. A `scripts/tests/exact-pin-guard.test.mjs` fork-exec test against a fixture tampered lockfile would formalize the BDD row "CI step catches drift". Target: M3.
- **BucketV2 deprecation review** — @pulumi/aws 7.27.0 deprecates V2 names; interfaces.md §1 locks `SecureBucketOutputs.bucket: aws.s3.BucketV2`. Decision: keep V2 in M2, revisit as part of M5 interface-lock review for v1.0.0.

## Known non-blocking limitations

- **CloudTrail `EventDataStore` per bucket is arguably heavy-weight** for real AWS deployments; AccountFoundation in M3 will provide the consolidation path. Documented in `docs/components/secure-bucket.md § Planned deltas`.
- **H2's unencrypted-S3-backend detection is best-effort.** If the state bucket is not in the current Pulumi stack, encryption cannot be verified — H2 emits `advisory`, not `mandatory`, in that case. Documented in `docs/tiers.md § H2 state-backend detection`.
- **`HulumiHardeningPack` and `CisV5Pack` cannot be imported into the same Node process** (one-PolicyPack-per-process constraint from @pulumi/policy). Users point their `PulumiPolicy.yaml` at one pack at a time. Documented in `packages/policies/src/index.ts` module header and at the top of both pack entrypoint files. Interfaces.md §2 still lists both symbols as `stable` — that remains true; only the simultaneous-import is constrained.
- **Pulumi V2 resource deprecation warnings** appear on every test run. Cosmetic; tracked under M5 interface-lock review.
- **`packages/*/README.md` files** intentionally omitted — see Deferred follow-ups.

## /slo-verify close-out (appended 2026-04-24)

- Runtime verification pass completed via `/slo-verify M2`. No bugs found.
- All 15 BDD rows + tier-delta schema test + 4 mappings-sync tests + 1 smoke test exercised at runtime via vitest under `pulumi.runtime.setMocks()`.
- Exact-pin-guard drift test manually re-verified during /slo-verify (sed-tamper → FAIL exit=1; restore → OK exit=0). License-boundary-lint re-run post `pnpm -r build`: OK across source + dist.
- Skill CLI rendering regression re-verified: s3 scenario output has 0 `v0.2+` hits for SecureBucket + HulumiHardeningPack; DriftClassifier retains its `v0.4+` forward-reference (correct).
- Verify report: [docs/slo/verify/hulumi-m2.md](../verify/hulumi-m2.md).
- Self-Review Gate: all 10 checkboxes pass. No TODO/FIXME/XXX in production src; no debug console.log; no test mocks leaked into src/; forbidden shortcuts from Contract Block verified absent (a)-(g).
- Milestone Tracker confirmed `done` with 2026-04-24 completion date and pointers to this doc + the lessons file.
