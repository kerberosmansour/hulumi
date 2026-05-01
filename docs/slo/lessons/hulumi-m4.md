# Lessons — Milestone 4 (Drift classifier + 4 adapters + TLA+-bound verdict matrix + 6 security BDDs)

Completed 2026-04-25.

## What changed

- **`@hulumi/drift`** new package: `DriftClassifier` orchestrates 4 pluggable adapters (`AutomationApiAdapter`, `CloudTrailAdapter`, `ProviderVersionAdapter`, `GitLogAdapter`) behind a single `classify(stack, resource, options)` call. Verdict logic in `src/verdict.ts` mirrors TLA+ `HardenedVerdict` from `HulumiDrift.tla` (upstream planning corpus); 5-row matrix walked by `tests/verdict-matrix.feature.test.ts`.
- **6 security BDDs** all green: `cache-permissions.test.ts` (S2 — 0o600 + UID check), `shell-injection.test.ts` (S3 — URN validation refuses `$()`/backticks/pipes), `shallow-clone.test.ts` (E5 — `--depth=1` → degraded), `probe-timeout.test.ts` (E1 — `p-timeout` + AbortSignal), `namespace-rejection.test.ts` (E4 — bare `iac-role` rejected, `hulumi:iac-role` accepted), `rate-limit.test.ts` (S7 — within-TTL cache hit, zero adapter re-invocations).
- **Forbidden-shortcut lint** in `tests/no-shell-exec.test.ts` — scans `packages/drift/src/` for `child_process` imports + `exec()`/`spawn()` call sites, plus `setTimeout`/`sleep` outside `src/probe.ts`. Strips comments before scanning so prose mentioning the forbidden APIs doesn't false-positive.
- **TLA+ alignment meta-test** asserts `verdict.ts` cites `HulumiDrift.tla` + `HulumiDrift-verified.md` and that `DriftSource` enum exactly matches the upstream `Source` set.
- **`examples/drift-classify-smoke/`** — minimal runner exercising both drift sources under stubs.
- **`docs/components/drift-classifier.md`** + **`docs/drift-classifier-deployment.md`** — full per-component doc + deployment runbook (auth, probe sentinel, cache TTL, SCP pointer, failure modes).
- **CI**: new `drift-mocks` job; `examples-typecheck` extended to cover the drift smoke; weekly workflow appends a drift-classify integration stage.
- **Skill scenarios**: appended live-reference suffix on DriftClassifier mentions in `aws-multi-account-baseline.json` + `s3-public-bucket-hardening.json` (`v0.4+` → `v0.4`, "Shipped in M4").
- **runbook re-scope** committed alongside as a precursor commit: M5's "cross-repo UDM binding" deliverable removed; sunlit-guardian dogfood adoption is owned by that repo on its own timeline.

## Design decisions and why

- **Vendored a copy of the trace matrix** at `tests/_utils/trace-matrix.ts` instead of parsing `HulumiDrift.trace.md` from the upstream corpus. The corpus lives in a separate repo (TauriMobile docs/); the verdict-matrix BDD needs a deterministic data source on every PR run. The vendored copy has a top-of-file note that the upstream is authoritative — any TLA+ trace edit must be reflected here AND `HulumiDrift-verified.md`'s `verified_at` timestamp re-stamped before re-merge.
- **Direct `dependsOn` not dynamic.Resource** for the probe — same workaround as M3. The probe is implemented as a pure function (`src/probe.ts:runProbe`) with `p-timeout` + `AbortSignal`. No Pulumi dynamic machinery; works fine in vitest workers.
- **URN validation as defense-in-depth** even though `simple-git`'s argv form is the primary S3 guard. The `urn-sanitize.ts` regex `[A-Za-z0-9:/$._\-+]+` rejects shell metacharacters; if a future drift adapter slips a `child_process` call in, the URN guard catches malicious inputs first.
- **Constructor-injected adapters** (each adapter accepts a function/object dependency) so tests inject stubs without touching AWS, git, npm registry, or Pulumi engines. The ProviderVersion `pinned()`/`latest()` split lets tests trivially set up the comparison.
- **Cache promotes ConsoleBreakGlass when CloudTrail surfaces events even if probe is offline** — handled in `classifier.ts` after `hardenedVerdict()` returns. The TLA+ matrix assumes a working probe; in practice the long-window CloudTrail lookup can surface events the probe missed. Documented in lessons (this file).
- **`runtimeFactoryFunction` not used** for the probe — vitest's `pulumi.dynamic.Resource` issue from M3 doesn't bite here because we never reach `pulumi.dynamic.Resource` in the drift package. The probe is plain async/await TypeScript.

## Mistakes made

- **First-pass smoke had cross-resource cloudTrail leak**: the smoke index instantiated one classifier with one CloudTrail mock returning a console event for ALL resources. Both `classify` calls came back as `ConsoleBreakGlass/high`. Fix: split into two classifier instances with scoped mocks.
- **First-pass `no-shell-exec.test.ts` matched comments**: the regex `/child_process/` fired on `urn-sanitize.ts`'s prose comment that said "child_process slip-up". Fix: strip line + block comments before scanning, and use call-site patterns (`\bexec\(`, etc.) rather than bare keywords.
- **Forgot AbortController/AbortSignal in eslint globals**: lint complained `'AbortSignal' is not defined`. Added them to the TS globals block alongside `setImmediate` etc.
- **Forgot `require` in eslint globals**: `index.ts` of the smoke example uses `require.main` to detect direct execution. Added `require` to the globals.

## Root causes

- **Comment-naive grep** — the no-shell-exec lint exists because we genuinely want to ban subprocess use. Banning by string match catches genuine usage but also catches descriptions of "what we ban" in comments. Stripping comments before scanning is the standard workaround. Documented inline.
- **Adapter sharing across resources** — the smoke test's first iteration assumed each `classify()` call would scope its CloudTrail lookup to the resource. That's true for the lookup function (`{ resourceArn }` parameter), but the stub I wrote ignored the parameter and returned the same event for any resource. Cleanest fix: scope mocks correctly. Real adapters will scope via the lookup arg.

## What was harder than expected

- **`pnpm view` returning a single line vs. multi-line output for older lock pins**: when checking `@aws-sdk/client-cloudtrail` etc. for hash candidates, the version listed (`3.1037.0`) was current. No issue, just noting the speed at which AWS SDK v3 ships releases.
- **`p-timeout` v7 ESM-only**: had to verify it works with `"module": "commonjs"` package in the drift workspace. It does — TypeScript's `esModuleInterop` handles the import shape, and the runtime CJS-wrapped reexports work. If a future Pulumi user lands on a pure-ESM consumer, their bundler handles it.
- **TLA+ trace fidelity vs. test pragmatism**: the trace markdown file lives in an upstream repo that this project doesn't pull from. The BDD-row spec wanted parsing the actual file; we vendor the matrix and rely on the alignment meta-test plus a documented manual-sync convention. Acceptable for v1; refine if the planning corpus gets imported in M5.

## Naming conventions established

- **`probes/` subdir** in `packages/drift/src/` — sanctioned escape hatch for `setTimeout` in M3 baseline. The drift package follows the same convention; `src/probe.ts` is the only file allowed to use `setTimeout`/`sleep` per the no-shell-exec lint.
- **Adapter classes** end in `Adapter` (plural-class form via the dist `aws/` namespace would be confusing here — drift adapters are flat under `src/adapters/`).
- **`*.feature.test.ts`** suffix for BDD feature-table walks (matches the M4 spec's `verdict-matrix.feature.test.ts` naming). Other tests follow the existing `*.test.ts` convention.
- **`PULUMI_ACCESS_TOKEN` is a SECRET** in the GitHub repo, not a variable — cannot be referenced as `vars.X`. Documented in `weekly-integration.yml` as a `secrets.X` and in `docs/integration-testing.md`.

## Test patterns that worked well

- **Class-based counting adapters** for the rate-limit test — each call increments a counter; the test asserts the second `classify()` call leaves the counters unchanged.
- **`Object.defineProperty(process, 'getuid', ...)` to stub UID checks** in the cache-permissions test (we can't actually `chown` without root).
- **Trace-matrix-as-data**: keeping the 5-row matrix as a `readonly TraceRow[]` lets one test iterate the rows AND a meta-test assert `length === 5 && ids.toEqual([1..5])`.
- **`compareSemver` as a pure function** in the provider-version adapter — testable in isolation; no version-sorting heuristic needed.

## Missing tests that should exist now

- **Real-AWS integration test body** — placeholder file at `tests/integration/drift-classify.integration.test.ts` asserts only `HULUMI_INTEGRATION=1`. The body lands when the user sets up `PULUMI_ACCESS_TOKEN` (M3 deferral; same gating).
- **Mixed source verdict** — TLA+ allows `Mixed` as a `DriftSource`. The current `hardenedVerdict()` doesn't emit it; would surface when MULTIPLE adapters report drift simultaneously. M4.x or M5 follow-up.
- **CloudTrail lookup retry semantics** — the contract forbids retry-on-failure exceeding probe timeout. The current adapter doesn't retry at all. If we add bounded retry in v1.1+, a test should assert the retry budget bounds.

## Rules for the next milestone (M5)

- **H3 advisory→mandatory** in `packages/policies/src/aws/hulumi-hardening-pack.ts` is a one-field edit (`H3_ENFORCEMENT_LEVEL`). Update `tests/hulumi-hardening-pack.test.ts` accordingly + add a CHANGELOG entry under "Breaking changes" with migration steps. The test that asserts `H3_ENFORCEMENT_LEVEL === "advisory"` flips to `=== "mandatory"`.
- **SLSA-L3 release workflow** uses `slsa-framework/slsa-github-generator` reusable workflow pinned to an exact SHA. The exact-pin-guard already enforces `@pulumi/*` pins; it does NOT yet enforce the GitHub Actions reusable workflow pins. Either extend `exact-pin-guard.mjs` OR add a separate `actions-pin-guard.mjs` for that.
- **`PULUMI_ACCESS_TOKEN` is needed for the release-workflow's npm trusted publishing path too** (Pulumi Cloud sometimes orchestrates publish; verify in dry-run). Document in `docs/deployment/sandbox-account.md` § 8 if scope expands.
- **Pulumi cooling-off CI**: M5's `pulumi-cooling-off.yml` should call npm registry to fetch `@pulumi/aws@<version>`'s publish timestamp and compare against now. Use `https://registry.npmjs.org/@pulumi/aws` (no auth needed).
- **The drift package's runtime deps** (`@aws-sdk/*`, `simple-git`, `p-timeout`) are now exact-pinned in `pnpm-lock.yaml` but NOT in `scripts/exact-pin-guard.mjs`. M5 should extend the guard's allowlist to cover them, OR document why they're acceptable to bump (less load-bearing than `@pulumi/*` since they're pure-runtime libraries).
- **Skill scenario edits in M5** are likely just version-string flips (`v0.4` → `v0.4` no-op since drift already shipped). Don't widen scope.
- **No cross-repo edits** — runbook re-scoped accordingly. M5 ships standalone.

## Template improvements suggested

- **The runbook's "Files to read before changing anything" row for M4** lists files from the TauriMobile planning corpus (`HulumiDrift.tla`, `HulumiDrift.trace.md`, `HulumiDrift-verified.md`, `interfaces.md`, `critique.md`). Same observation as M1/M2/M3 lessons. Template should distinguish in-repo vs. upstream-corpus files explicitly.
- **The verdict-matrix BDD's "parse trace-md at test time" requirement** is impractical when the trace file lives in another repo. Template should allow either a parsed-from-source OR a vendored-with-doc-pointer pattern. M4 uses the second.
- **The integration-test stub pattern** (placeholder `it.skip`-by-default) is now used in M3 + M4. Template should document it as the official pattern for "real-AWS test that requires user-side setup before running."
- **The forbidden-shortcut lint pattern** (scan src/ for forbidden symbol references) was repeated across M3 (no-sleep) and M4 (no-shell-exec). The template could provide a reusable helper that takes (dir, deny-patterns, exclude-paths).
- **`PULUMI_ACCESS_TOKEN` setup note in sandbox-account.md § 8** — M3 lessons mentioned this; M4's weekly workflow extension still depends on it. Confirm in M5 that the docs section reads cleanly for a new user.
