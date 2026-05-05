# Lessons Learned — hulumi-pre-public-launch Milestone 3

## What changed

Closed the audit's "stubbed integration tests masquerading as coverage" finding by either implementing real coverage (#26 cooling-off-diff, #30 SCP teardown) or making the gap explicit and contracted (#21 + #24 → `it.todo` + roadmap doc).

- **`tests/skill-bdd/cooling-off-diff.test.ts`** — NEW. Subprocess-runs `scripts/cooling-off-diff.mjs` against 4 synthetic lockfile fixtures. 5 test cases: 2 always-on (no-bump + invocation-hygiene), 2 network-gated (aged-bump + nonexistent-version), 1 always-on (no-`@pulumi/*` packages → exit 0). Network gate via `HULUMI_NETWORK_TESTS=1` (mirrors existing `HULUMI_INTEGRATION` convention).
- **`tests/skill-bdd/fixtures/cooling-off-diff/`** — NEW directory: `baseline.lock.yaml`, `aged-pulumi-bump.lock.yaml`, `nonexistent-version.lock.yaml`, `no-pulumi-packages.lock.yaml`.
- **`tests/skill-bdd/scp-teardown-harness.ts`** — NEW. Pure-function 5-state phase machine (Idle / AttachedDetectable / DetachInFlight / Detached / Failed) derived from `docs/deployment/scp-guide.md`'s manual procedure. Imports no AWS SDK; tests inject a typed `AwsOrganizationsResponder` interface. Bounded poll loop (default 10, hard cap 12). Illegal transitions throw with diagnostic.
- **`tests/skill-bdd/scp-teardown.test.ts`** — NEW. 9 test cases: happy path, no-op path, detach-error fail-closed, poll-exhaustion, hard-cap rejection, 4 illegal-transition assertions.
- **`packages/baseline/tests/integration/account-foundation.integration.test.ts`** — converted 3 `expect(RUN_INTEGRATION).toBe(true)` slots → `it.todo()` with explicit roadmap pointers.
- **`packages/drift/tests/integration/drift-classify.integration.test.ts`** — converted 4 slots → `it.todo()`.
- **`docs/integration-testing-roadmap.md`** — NEW. Captures what each `it.todo` slot should verify: pre-conditions, stack shape, expected sub-resources, polling pattern, cleanup invariant, wall-clock estimate. Acceptance criteria for the follow-up runbook (`hulumi-integration-real-aws`).
- **`.prettierignore`** — added `tests/skill-bdd/fixtures/cooling-off-diff/` (real pnpm-lock.yaml uses single-quoted keys; prettier rewriting to double quotes broke the regex match).
- **`CHANGELOG.md`** — entry under [1.2.0] "Changed".
- **`docs/ARCHITECTURE.md`** — Test Architecture section noted (no edit needed; the existing description still holds).

## Design decisions and why

- **`it.todo` over deletion-then-defer for #21 + #24.** Deleting the stubs would hide the gap; `it.todo` reports as `todo` in vitest output, which a reader scanning `pnpm -r test` cannot miss. A future regression that re-introduces a tautological body without filling in the implementation also gets caught at code review (the test file's purpose is now explicit).
- **Roadmap doc is the contract for a future runbook.** Each `it.todo` slot has a `(see docs/integration-testing-roadmap.md#section)` pointer. The roadmap doc itself has acceptance criteria; the future runbook reads against those criteria.
- **Subprocess testing for cooling-off-diff (not unit testing of internals).** The script's `extractVersions`, `classifyBump`, `fetchPublishTime` are not exported — testing them via unit tests would require a script refactor (out of M3 allow-list). Subprocess testing exercises the real I/O behavior end-to-end; the internals are tested by their observable effects.
- **Network gate for the 2 cooling-off scenarios that hit npm.** Without the gate, every `pnpm test` would round-trip to npm twice — slow, flaky, and CI-budget-hostile. The gate (`HULUMI_NETWORK_TESTS=1`) mirrors the existing `HULUMI_INTEGRATION` convention; opt-in only.
- **SCP teardown as a pure-function phase machine.** The original procedure is documented prose; a phase machine encodes the legal transitions as types + assertions, making refactor-induced regressions catchable. The harness imports no AWS SDK, so tests stay fast and don't require `requires-aws-org-write` permissions.
- **Hard cap (12) vs default (10) on poll budget.** The default is the documented procedure's expected behavior; the hard cap is the runtime safety net that prevents a future caller from bypassing the cooling-off principle by passing `maxPolls: 1000`.
- **Five-state machine, not four.** Initially I considered Idle / Attached / Detaching / Detached. Adding `Failed` as a distinct state preserves the failure-mode information (which stage failed?) — important for the SCP-teardown test scenarios that exercise both detach-error and poll-exhaustion paths.
- **The `aged-pulumi-bump` fixture is a _downgrade_ of the baseline; tests pass it in reverse.** Initial fixture pair (baseline=3.232.0, head=3.100.0) silently passed cooling-off-diff because `classifyBump` treats version downgrades as `noop`. Caught when the network test produced no output. Fixed by passing `aged → baseline` (upgrade direction) in the test invocation.
- **Prettier ignore for the cooling-off fixtures.** Cooling-off-diff's regex requires single-quoted version keys (matching real pnpm-lock.yaml format); prettier rewrites YAML to double quotes. Added the fixtures dir to `.prettierignore` rather than weaken the regex (the regex's tightness is the script's parser-input contract).

## Assumptions verified

- `it.todo()` reports as `todo` in vitest, distinct from `pass` and `skip`. Verified — `Tests 99 passed | 5 skipped | 3 todo (107)` in baseline output.
- `spawnSync(process.execPath, ...)` is the right shape for testing a `.mjs` script (mirrors how CI invokes it). Verified.
- `cooling-off-diff.mjs`'s exit-2 semantics fire on registry-no-entry. Verified by `nonexistent-version.lock.yaml` test.
- The 5-state phase machine cleanly models the SCP teardown procedure documented in `scp-guide.md`. Verified by happy / no-op / failure / exhaustion paths all tested.
- The network gate `HULUMI_NETWORK_TESTS=1` is independent of `HULUMI_INTEGRATION=1`. Verified — both can be set independently.

## Assumptions still unresolved

- **`cooling-off-diff.mjs` silently passes on malformed lockfiles.** A PR could submit a deliberately broken `pnpm-lock.yaml` (e.g. corrupted indentation) so `extractVersions` returns `{}` → no bumps detected → exit 0. This is a real fail-open bug but fixing it is out of M3's allow-list. Filed as a follow-up.
- **`cooling-off-diff.mjs` silently passes on version downgrades.** Same root cause — `classifyBump` returns `noop` for any non-increase, and the script doesn't print or exit with a non-zero code. Documented in the M3 BDD's "no-bump" test (which exercises base = head; the downgrade case is conceptually identical).
- **The phase machine harness is a model, not the production code.** A future production `teardownScp` that lands in `packages/baseline/src/...` should use the same phase model; the test-side harness will need cross-referencing. Not enforced by lint today.
- **`HULUMI_NETWORK_TESTS=1` is not exercised in CI today.** The cooling-off-diff network tests are opt-in; a future workflow change should run them at least weekly to catch upstream npm registry changes.

## Mistakes made

- **Initial fixture pair was a downgrade.** Spent a debug round-trip figuring out why `cooling-off-diff` exited 0 silently. Root cause: `classifyBump` returns `noop` for downgrades. Lesson: when test fixtures encode "baseline" and "bump", make sure the bump direction is _increase_.
- **Initial BDD regex required `registry-url` in `ci.yml`.** Caught immediately — `ci.yml` doesn't publish, doesn't need it. (Same class of mistake as M2's NPM_TOKEN comment-match — over-strict assertion.)
- **Initial fixture YAML used double-quoted keys after prettier ran.** Prettier rewrote single quotes to double quotes; cooling-off-diff's regex requires single quotes. Fixed by adding the fixtures dir to `.prettierignore`. Lesson: if a fixture file's exact bytes are part of the contract, it belongs in `.prettierignore` from the start.

## Root causes

- **Test-side regex strictness vs production parser shape.** Both M2's NPM*TOKEN and M3's lockfile-quote issues stem from the same class — author a regex against intended state, ship it without exercising real fixtures, get bitten by an irrelevant string match. Mitigation: always run the BDD against the \_target end-state*'s real bytes, not against a synthesized version.
- **Prettier reformat as a hidden state mutation.** Prettier ran in a different shell turn from the test run; the rewritten quotes weren't visible until I re-ran tests. Mitigation: when testing a fixture, run the test _and_ `pnpm run format` _and_ the test again before declaring the fixture stable.

## What was harder than expected

- **Cooling-off-diff is hard to unit-test.** The script's logic is internal (extractVersions, classifyBump, fetchPublishTime not exported). Subprocess testing was the only allow-list-respecting path; that brought network-flakiness concerns + the network-gate workaround.
- **Documenting the `cooling-off-diff` malformed-lockfile bug without fixing it.** The right answer is to file it as a follow-up issue, but I haven't done that mechanically — it's recorded in lessons + the no-pulumi-packages.lock.yaml comment + the integration-testing-roadmap-adjacent gap notes.

## Invariants/assertions added or strengthened

- `cooling-off-diff.mjs` exit-code semantics: 0 on no-bump, 0 on aged bump, 2 on registry failure, 2 on usage error.
- SCP teardown phase machine: 5 states, 4 legal transitions from Idle, 2 from AttachedDetectable, 2 from DetachInFlight; Detached and Failed are terminal.
- SCP teardown: hard cap of 12 polls; bound enforced at runtime, exceeding it throws (programming-time invariant).
- `it.todo` count discipline: 3 todo for account-foundation integration, 4 todo for drift integration. Visible in `pnpm test` output for baseline; drift's are excluded from default test glob (existing convention) but visible via `HULUMI_INTEGRATION=1 pnpm test:integration`.

## Resource bounds established or verified

- SCP teardown poll budget: default 10, hard cap 12. Encoded as `HARD_CAP_POLLS` const + runtime check.
- Cooling-off-diff fixture set: 4 fixtures today; well under any soft cap. (The "≤ 50 fixtures" bound from the M3 contract was never approached.)

## Debugging / inspection notes

- `node --input-type=module -e '...'` is the right shape for ad-hoc replication of script regex behavior in this repo's stack.
- `> /tmp/out.txt 2> /tmp/err.txt; echo "exit=$?"; cat /tmp/out.txt /tmp/err.txt` — useful pattern for debugging subprocess silence (the Bash tool sometimes truncates inline output for empty stdout, which can be confused for "the script ran silently").
- For the SCP teardown harness, the `onPhase` callback in `TeardownInput` was the right inspection point — capture the full transition log per test, then compare against expected sequence.

## Naming conventions established

- `tests/skill-bdd/<feature>.test.ts` for cross-cutting BDD tests (matches existing convention).
- `tests/skill-bdd/<feature>-harness.ts` for typed pure-function harnesses imported by sibling tests.
- `tests/skill-bdd/fixtures/<feature>/` for inert fixture data.
- Network-gated tests use `HULUMI_NETWORK_TESTS=1` (parallel to `HULUMI_INTEGRATION=1`).

## Test patterns that worked well

- `it.todo("description (see docs/<roadmap>#section)")` cleanly captures gaps without making the source file pretend to be coverage.
- Pure-function harness + injected responder for AWS-shaped operations. The same pattern would work for any "manual procedure deserves an executable invariant" gap.
- Subprocess + fixture-replay for `.mjs` scripts whose internals aren't exported.

## Missing tests that should exist now

- Vitest test for `cooling-off-diff.mjs` malformed-lockfile fail-closed behavior (depends on script change — out of M3 allow-list, follow-up).
- Vitest test for `cooling-off-diff.mjs` version-downgrade detection (depends on `classifyBump` exposing more granular result; same — follow-up).
- Vitest test that grep-walks `packages/{baseline,drift}/tests/integration/*.test.ts` and asserts `it.todo` count = 7 across the two files (the lock-step regression test for the audit finding). Considered for M3, deferred — vitest's default reporters already surface the count.

## Rules for the next milestone (M4)

- **Add new fixture dirs to `.prettierignore` from the start** when their bytes are part of a parser-input contract.
- **Run BDDs against the _target end-state_'s real bytes** before treating them as stable. Synthesized assertions are a smell.
- **`it.todo` is a real shape** — use it for honest gap-flagging, not just `it.skip`.
- **Pin-guard extension (M4) should detect malformed lockfiles fail-closed** — M3 surfaced the gap in cooling-off-diff; M4 is the right place to enforce it across the supply-chain pipeline.
- **`scp-teardown-harness.ts` is reusable** for any other "manual procedure deserves an executable invariant" gap.

## Template improvements suggested

- **`/slo-execute` should warn when a fixture file lives in a directory not in `.prettierignore`.** The "prettier rewrites my fixture bytes" failure mode is recurring.
- **The v4 template's "Resource bounds" section could include a "fixture set bound" example.** M3 had a fixture set bound (≤ 50) but no place to record it cleanly; ended up in lessons.
