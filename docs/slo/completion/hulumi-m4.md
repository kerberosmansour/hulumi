# Completion — Milestone 4 (Drift classifier + 4 adapters + TLA+-bound verdict matrix + 6 security BDDs)

Completed 2026-04-25.

## Goal completed

Achieved (with the same Pulumi-Cloud-token deferral as M3 for the real-AWS integration body). `@hulumi/drift` ships with `DriftClassifier` composing four pluggable adapters (`AutomationApiAdapter`, `CloudTrailAdapter`, `ProviderVersionAdapter`, `GitLogAdapter`). Verdict logic in `src/verdict.ts` mirrors TLA+ `HardenedVerdict` from `HulumiDrift.tla` (upstream planning corpus); the 5-row matrix is walked verbatim by `tests/verdict-matrix.feature.test.ts` from a vendored copy of `HulumiDrift.trace.md`. The 6 security BDDs (S2 cache-perms, S3 shell-injection, S7 rate-limit, E1 probe-timeout, E4 namespace-rejection, E5 shallow-clone) all pass. The forbidden-shortcut AST lint enforces `child_process`-free + sleep-free `packages/drift/src/` outside `probes/`.

124 tests pass + 7 skipped (3 baseline integration + 4 drift integration). Pipeline green: `pnpm -r build`, `pnpm -r typecheck`, `pnpm -r test`, `pnpm -r lint`, `pnpm run lint:license-boundary`, `pnpm run lint:exact-pin-guard`, `pnpm run format:check`.

**Deferred sub-criterion**: ≥1 weekly scheduled drift integration run completed against the sandbox is satisfied in CONTRACT-ONLY mode (mocks-only path). The full real-AWS drift cycle requires `PULUMI_ACCESS_TOKEN` configuration — same gating as M3.

## Files changed

### New `@hulumi/drift` package

- `packages/drift/package.json` — peer-pinned `@pulumi/pulumi`, runtime deps `@aws-sdk/client-cloudtrail`, `@aws-sdk/client-sts`, `@aws-sdk/credential-providers`, `simple-git`, `p-timeout`.
- `packages/drift/{tsconfig,tsconfig.build,vitest.config}.{json,ts}`.
- `packages/drift/src/types.ts` — public types + `DRIFT_SOURCES` const array; locked to TLA+ `Source` set.
- `packages/drift/src/verdict.ts` — `hardenedVerdict()` TS mirror of TLA+ spec.
- `packages/drift/src/monotonicity.ts` — `checkMonotonicity()`.
- `packages/drift/src/cache.ts` — on-disk cache with mode 0o600 + UID check + TTL.
- `packages/drift/src/probe.ts` — `runProbe()` + `p-timeout` + AbortSignal (only file with `setTimeout` in src/).
- `packages/drift/src/urn-sanitize.ts` — `validateUrn()` + `UnsafeUrnError` defense-in-depth guard.
- `packages/drift/src/classifier.ts` — `DriftClassifier` orchestrator.
- `packages/drift/src/adapters/{automation-api,cloudtrail,provider-version,git-log}.ts`.
- `packages/drift/src/index.ts` — re-exports.
- `packages/drift/README.md`.
- `packages/drift/tests/{verdict-matrix.feature,monotonicity,cache-permissions,shell-injection,shallow-clone,probe-timeout,namespace-rejection,rate-limit,tla-alignment,no-shell-exec}.test.ts`.
- `packages/drift/tests/_utils/trace-matrix.ts` — vendored 5-row trace from `HulumiDrift.trace.md`.
- `packages/drift/tests/integration/drift-classify.integration.test.ts` — placeholder skipped suite.

### New example

- `examples/drift-classify-smoke/{Pulumi.yaml,package.json,tsconfig.json,vitest.config.ts,index.ts,README.md}`.
- `examples/drift-classify-smoke/tests/smoke.test.ts` — both verdicts asserted (`ConsoleBreakGlass/high` + `ProviderApiChurn/medium`).

### New docs

- `docs/components/drift-classifier.md` — per-component doc.
- `docs/drift-classifier-deployment.md` — auth, probe sentinel, cache TTL, SCP pointer, failure modes.

### Edits

- `docs/RUNBOOK-hulumi.md` — Milestone Tracker M4 → `done`.
- `docs/components/README.md` — DriftClassifier link from "arriving in M4" → `drift-classifier.md`.
- `skills/hulumi-threat-model/scenarios/aws-multi-account-baseline.json` + `s3-public-bucket-hardening.json` — DriftClassifier availability `v0.4+` → `v0.4` (with "Shipped in M4" suffix).
- `.github/workflows/ci.yml` — new `drift-mocks` job; `examples-typecheck` extended to cover drift smoke.
- `.github/workflows/weekly-integration.yml` — appended drift-classify integration stage after AccountFoundation.
- Root `package.json` — `test:drift`, `test:drift:integration` scripts; updated `test:integration` to chain baseline + drift.
- `.gitignore` — `.hulumi/drift-cache/`.
- `eslint.config.mjs` — added `AbortController`, `AbortSignal`, `require` to TS globals.

### Precursor commit (this branch)

- `docs/RUNBOOK-hulumi.md` — purpose tagline, M5 Tracker row, mermaid Dogfood subgraph, Component Summary, Global Execution Rules, M5 section heading, Documentation Update Table — all de-scope cross-repo UDM binding.
- `docs/runbook-milestones/hulumi-m{1,3,4,5}.md` — UDM-binding mentions reframed as sunlit-guardian's own deliverable.

## Tests added

### `@hulumi/drift` (37 mock tests, 4 skipped integration)

- Verdict-matrix 5 rows + meta `row_count_matches_trace_md` + Row-4-never-high invariant.
- Monotonicity: 5 cases (no-prior, non-decreasing, demote-refused × 2, same-confidence-allow).
- Cache permissions: 0o600 mode, UID-mismatch absence, TTL-expired absence, schema-mismatch absence.
- Shell injection: `$(...)`, backtick, pipe / semicolon / space — all refused; normal URN reaches git via argv.
- Shallow clone: `--is-shallow-repository=true` → `available()=false` + remediation hint.
- Probe timeout: aborts after `timeoutMs`; resolves before timeout when probe is fast.
- Namespace rejection: `hulumi:iac-role=true` accepted; bare `iac-role`, wrong-namespace variants, non-`true` values all flow through as console events.
- Rate-limit: first call invokes 4 adapters + probe; second within TTL invokes none.
- TLA+ alignment: `verdict.ts` cites `HulumiDrift.tla` + `HulumiDrift-verified.md`; `DRIFT_SOURCES` matches TLA+ `Source` set.
- No-shell-exec: zero `child_process` imports / `exec()` / `spawn()`; zero `setTimeout`/`sleep`/`await new Promise` outside `src/probe.ts`.

### Smoke (1 test)

- `examples/drift-classify-smoke/tests/smoke.test.ts` — both verdicts come back as expected.

## Runtime validations added

- 124 mock tests + 7 skipped (3 M3 integration + 4 M4 integration).
- New CI jobs `drift-mocks` runs on every PR; `examples-typecheck` extended.
- Weekly workflow's drift-classify stage runs after AccountFoundation in CONTRACT-ONLY mode (mocks); flips to real-AWS when `PULUMI_ACCESS_TOKEN` is set.

## Compatibility checks performed

- Full M1+M2+M3 BDD suites (87 tests) still pass post-M4.
- `SecureBucket` + `AccountFoundation` snapshots unchanged.
- `HulumiHardeningPack` H1–H4 unchanged; `H3_ENFORCEMENT_LEVEL` still `advisory` (M5 flips it).
- `Tier` union, `CisV5Pack` rule IDs unchanged.
- AWS tag schema stable.
- `@pulumi/*` exact pins unchanged from M3.
- Skill invocation on all 5 prebuilt scenarios still produces valid output; frontmatter schema unchanged.

## Documentation updated

- `docs/components/drift-classifier.md` (new).
- `docs/drift-classifier-deployment.md` (new).
- `docs/components/README.md` — DriftClassifier link updated.
- `docs/RUNBOOK-hulumi.md` Milestone Tracker M4 → `done`.

## .gitignore changes

- `.hulumi/drift-cache/` (explicit; the existing `.hulumi/` line already covered it but the explicit pattern is documented).

## Test artifact cleanup verified

`git status` clean after the M4 commit. Drift cache files written by tests live in OS tmpdir (`mkdtempSync(tmpdir(), …)`) and are removed in `afterEach`.

## Deferred follow-ups

- **Real-AWS drift integration test body** — placeholder file `tests/integration/drift-classify.integration.test.ts` asserts only `HULUMI_INTEGRATION=1`. Body (Pulumi Automation API + AWS-SDK polling + deliberate console drift fixture + teardown) lands alongside `PULUMI_ACCESS_TOKEN` configuration. M5 or post-release.
- **Probe sentinel deployment** — `docs/drift-classifier-deployment.md` documents the one-time sentinel-bucket setup. The Pulumi snippet uses M2's `SecureBucket`; we don't ship a turnkey deployment program in M4.
- **Mixed verdict source emission** — TLA+ allows `Mixed`. Current `hardenedVerdict()` only emits `None`/`ProviderApiChurn`/`ConsoleBreakGlass`/`Unknown`. `Mixed` becomes useful when multiple adapters report drift simultaneously; v1.1+ refinement.
- **CloudTrail lookup bounded retry** — currently no retry. The M4 contract forbids retries exceeding probe timeout, so a small bounded retry is in-scope but deferred. Track for v1.1+.
- **`exact-pin-guard.mjs` extension** — currently only checks `@pulumi/*`. The new drift runtime deps (`@aws-sdk/*`, `simple-git`, `p-timeout`) are exact-pinned in `pnpm-lock.yaml` but not in the guard. M5 should decide whether to broaden the guard.

## Known non-blocking limitations

- **`pulumi.dynamic.Resource` still incompatible with vitest**: same constraint as M3. M4 avoids dynamic.Resource entirely; the probe is a plain async function. Documented at length in M3 lessons.
- **Trace matrix is vendored, not parsed live**: `tests/_utils/trace-matrix.ts` carries a hand-mirrored copy of `HulumiDrift.trace.md`. The TLA+ alignment meta-test catches the `verdict.ts` citation drifting; trace edits in the upstream corpus require a deliberate sync to this file. Documented in lessons.
- **`PULUMI_ACCESS_TOKEN` not yet configured**: weekly drift integration runs in CONTRACT-ONLY mode. Same gating as M3.
- **Forbidden-shortcut lint strips comments before scanning**: a determined adversary could obfuscate `child_process` references through string concatenation or computed property access. The lint catches inadvertent / direct usage; deeper static analysis is M5 follow-up.
- **`Pulumi V2 deprecation warnings`** carried over from M2. Cosmetic; documented under M5 interface-lock review.
