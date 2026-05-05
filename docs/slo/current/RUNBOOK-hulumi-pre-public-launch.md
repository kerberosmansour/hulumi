# Hulumi Pre-Public-Launch Pass — AI-First Runbook v4

> **Purpose**: Drive the Hulumi monorepo from "private with rough edges" to "ready to flip public on GitHub + publish four `@hulumi/*` packages to npm" in five milestones. Resolves every P1 + P2 finding from the 2026-05-05 pre-public-launch audit, plus the mechanical P0 publish-blockers (private flags, per-package READMEs/LICENSEs, package metadata).
> **Audience**: AI coding agents first, humans second. Designed to reduce ambiguity, suppress scope drift, and force the same code-quality discipline from any capable agent.
> **Core philosophy**: Prefer automated guardrails over developer intention. Prefer direct inspection over guessing. Prefer executable assumptions over comments. Prefer bounded design over silent growth. Prefer evidence over claims.
> **How to use**: Work milestones sequentially. Before each milestone, complete the Global Entry Protocol. After each, complete the Global Exit Protocol. Never skip ahead. Never silently widen scope.
> **Out of scope (handled by user)**: Registering `hulumi.io` and standing up MX, claiming the `@hulumi` npm scope. Both are launch-day prerequisites but require human action and external accounts.
> **Prerequisite reading**: [docs/ARCHITECTURE.md](../../ARCHITECTURE.md), [README.md](../../../README.md), [docs/slo/completed/RUNBOOK-hulumi.md](../completed/RUNBOOK-hulumi.md), [docs/slo/completed/RUNBOOK-hulumi-github.md](../completed/RUNBOOK-hulumi-github.md), [docs/slo/completed/RUNBOOK-hulumi-operations-k8s-security.md](../completed/RUNBOOK-hulumi-operations-k8s-security.md), [SECURITY.md](../../../SECURITY.md), [.github/workflows/release.yml](../../../.github/workflows/release.yml).

---

## 0. How To Use This Template

1. Fill out Runbook Metadata, Architecture, and Milestone Plan before implementation starts.
2. Work milestones sequentially.
3. Before each milestone, complete the Global Entry Protocol.
4. During implementation, follow Section 4 (Carmack-Style Development Best Practices) and the milestone Contract Block literally.
5. After each milestone, complete the Global Exit Protocol and fill the Evidence Log.
6. Do not mark a milestone done until the Definition of Done is objectively satisfied.

---

## 1. Runbook Metadata

| Field                                       | Value                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Runbook ID                                  | `hulumi-pre-public-launch`                                                                                          |
| Project name                                | `hulumi`                                                                                                            |
| Primary stack                               | TypeScript 5.x on Node 20 LTS, pnpm 9.12.0 workspaces, Pulumi 3.232.0 + CrossGuard 1.20.0, Vitest 1.6.1, Apache-2.0 |
| Primary package/app names                   | `@hulumi/baseline`, `@hulumi/policies`, `@hulumi/drift`, `@hulumi/k8s-baseline`                                     |
| Prefix for tests and lesson files           | `hulumi-pre-public-launch`                                                                                          |
| Default unit test command                   | `pnpm -r test`                                                                                                      |
| Default integration/BDD test command        | `HULUMI_INTEGRATION=1 pnpm test:integration` (real AWS sandbox)                                                     |
| Default E2E/runtime validation command      | `pnpm run release:dry` (act-based attestation dry-run)                                                              |
| Default build/boot command                  | `pnpm -r build` (required before tests — examples import from `dist/`)                                              |
| Default formatter command                   | `pnpm run format:check` (write: `pnpm run format`)                                                                  |
| Default static analysis / lint command      | `pnpm -r lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`                                   |
| Default dependency / security audit command | `pnpm audit --prod` (informational; supply-chain posture is enforced by pin-guard + cooling-off, not pnpm-audit)    |
| Default debugger or state-inspection tool   | Node `--inspect-brk` + `vitest --inspect-brk`; `gh attestation verify` for release-side state inspection            |
| Allowed new dependencies by default         | `none`                                                                                                              |
| Schema/config migration allowed by default  | `no`                                                                                                                |
| Public interfaces stable by default         | `yes`                                                                                                               |

### Public interfaces that must remain stable unless explicitly listed otherwise

- `@hulumi/baseline.aws.{SecureBucket,AccountFoundation,Tier}` — full args/outputs surface, all v1.x callers
- `@hulumi/baseline.github.{SecureRepository,OrgFoundation}` — full args/outputs surface
- `@hulumi/policies.aws.{HulumiHardeningPack,CisV5Pack}` + the `Suppression` API
- `@hulumi/policies.github.{HulumiGithubHardeningPack,CisGithubV1Pack}`
- `@hulumi/drift.{DriftClassifier,DriftSource,DriftAdapter,DriftVerdict}` — all five adapters' public shapes
- `@hulumi/k8s-baseline.*` — all 7 ComponentResource shapes (`HardenedHelmRelease`, `EksSubnetTagger`, `IstioFoundation`, `AlbMeshedHttpEntrypoint`, `KubernetesSecretFromAwsSecretsManager`, `RdsCredentialSecret`, `GitHubAppCredential`)
- `/hulumi-threat-model` skill `SKILL.md` frontmatter + 9 prebuilt scenario IDs (5 AWS + 4 GitHub) — note: actual scenario count in `skills/hulumi-threat-model/scenarios/` is 11 (7 AWS + 4 GitHub) per audit; M5 reconciles README narrative
- AWS resource tag keys `hulumi:iac-role`, `hulumi:tier`, `hulumi:component`, `hulumi:controls`
- Cache schema `schemaVersion: 2` for `.hulumi/drift-cache/*.json`
- Existing `scripts/` CLI surfaces: `license-boundary-lint.mjs`, `exact-pin-guard.mjs`, `cooling-off-diff.mjs` (M4 extends `exact-pin-guard.mjs`; existing args remain backward-compatible)

---

## 2. Milestone Tracker

This is the single source of truth for progress. Update as each milestone completes.

| #   | Milestone                                                                      | Status        | Started    | Completed  | Lessons File                                                                                 | Completion Summary                                                                                 |
| --- | ------------------------------------------------------------------------------ | ------------- | ---------- | ---------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | NPM publish-readiness pass                                                     | `done`        | 2026-05-05 | 2026-05-05 | [docs/slo/lessons/hulumi-pre-public-launch-m1.md](../lessons/hulumi-pre-public-launch-m1.md) | [docs/slo/completion/hulumi-pre-public-launch-m1.md](../completion/hulumi-pre-public-launch-m1.md) |
| 2   | Public-launch hygiene (scratch / SECURITY-CONTACTS / account ID / SHA pinning) | `done`        | 2026-05-05 | 2026-05-05 | [docs/slo/lessons/hulumi-pre-public-launch-m2.md](../lessons/hulumi-pre-public-launch-m2.md) | [docs/slo/completion/hulumi-pre-public-launch-m2.md](../completion/hulumi-pre-public-launch-m2.md) |
| 3   | Integration test surface battle-test (#21, #24, #26, #30)                      | `done`        | 2026-05-05 | 2026-05-05 | [docs/slo/lessons/hulumi-pre-public-launch-m3.md](../lessons/hulumi-pre-public-launch-m3.md) | [docs/slo/completion/hulumi-pre-public-launch-m3.md](../completion/hulumi-pre-public-launch-m3.md) |
| 4   | Supply-chain guard extension + dead-code cleanup (#27, #28)                    | `done`        | 2026-05-05 | 2026-05-05 | [docs/slo/lessons/hulumi-pre-public-launch-m4.md](../lessons/hulumi-pre-public-launch-m4.md) | [docs/slo/completion/hulumi-pre-public-launch-m4.md](../completion/hulumi-pre-public-launch-m4.md) |
| 5   | Docs polish + v2.0 migration prep (#22, #34, #17)                              | `not_started` |            |            |                                                                                              |                                                                                                    |

<!-- Status values: not_started | in_progress | blocked | done -->
<!-- Lessons files go in docs/slo/lessons/hulumi-pre-public-launch-m<N>.md -->
<!-- Completion summaries go in docs/slo/completion/hulumi-pre-public-launch-m<N>.md -->

---

## 3. End-to-End Architecture Diagram

This runbook does not change runtime architecture. It pays down publish-readiness, hygiene, and test-surface debt. Component shapes documented in [docs/ARCHITECTURE.md](../../ARCHITECTURE.md) are unchanged at HEAD; what changes is the _publishability_ and _trust posture_ of each artifact.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                Hulumi Pre-Public-Launch — End State After M5                 │
│                                                                              │
│  ┌──────────────┐   ┌────────────────────────┐   ┌───────────────────────┐   │
│  │ Maintainer   │──▶│ git tag v1.2.x (signed)│──▶│ release.yml workflow  │   │
│  │ (kerberos…)  │   │  on PUBLIC main branch │   │  - SHA-pinned actions │   │
│  └──────────────┘   └────────────────────────┘   │  - OIDC trust to npm  │   │
│         │                                        │  - SLSA L3 attest     │   │
│         │  pnpm publish (per package)            └────────────┬──────────┘   │
│         ▼                                                     ▼              │
│  ┌─────────────────────────────────────────────────────────────────┐         │
│  │ npmjs.com — @hulumi scope (CLAIMED out-of-band by user)         │         │
│  │  ├─ @hulumi/baseline       1.2.x  README + LICENSE + repo meta  │         │
│  │  ├─ @hulumi/policies       1.2.x  README + LICENSE + repo meta  │         │
│  │  ├─ @hulumi/drift          1.2.x  README + LICENSE + repo meta  │         │
│  │  └─ @hulumi/k8s-baseline   1.2.x  README + LICENSE + repo meta  │         │
│  │     [all four ship same version on same day — atomic release]    │        │
│  └─────────────────────────────────────────────────────────────────┘         │
│                                                                              │
│  Battle-tested guarantees added by this runbook (M3 + M4):                   │
│   - drift-classify + account-foundation integration tests run real AWS       │
│   - SCP teardown verified by automated test, not docs                        │
│   - cooling-off-diff exercised against synthetic lockfile fixtures           │
│   - exact-pin-guard extended to GitHub Actions reusable workflows            │
│   - poll.ts dead-code question resolved (kept-and-documented OR removed)     │
│                                                                              │
│  Public-launch hygiene (M2):                                                 │
│   - .github/SECURITY-CONTACTS shipped (PGP fingerprint or "no PGP" note)     │
│   - SHA-pinned third-party actions (pnpm/, aws-actions/, softprops/)         │
│   - sandbox AWS account ID redacted from lessons                             │
│   - research-scratch files moved or kept-with-rationale                      │
│                                                                              │
│  Legend: ─── existing  ▶ data flow                                           │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Component Summary Table

| Component                                                                    | Responsibility                          | Existing/New/Changed  | Milestone | Key Interfaces                                                                                  |
| ---------------------------------------------------------------------------- | --------------------------------------- | --------------------- | --------- | ----------------------------------------------------------------------------------------------- |
| `packages/baseline/package.json`                                             | npm publish manifest                    | changed               | M1        | `private` flag, `repository`, `bugs`, `homepage`, version coherence                             |
| `packages/policies/package.json`                                             | npm publish manifest                    | changed               | M1        | same as above                                                                                   |
| `packages/drift/package.json`                                                | npm publish manifest                    | changed               | M1        | same as above                                                                                   |
| `packages/k8s-baseline/package.json`                                         | npm publish manifest                    | changed               | M1        | same; version reconciliation 1.0.0 → 1.2.0                                                      |
| `packages/baseline/README.md`                                                | per-package npm display                 | NEW                   | M1        | rendered at npmjs.com/package/@hulumi/baseline                                                  |
| `packages/policies/README.md`                                                | per-package npm display                 | NEW                   | M1        | rendered at npmjs.com/package/@hulumi/policies                                                  |
| `packages/k8s-baseline/README.md`                                            | per-package npm display                 | NEW                   | M1        | rendered at npmjs.com/package/@hulumi/k8s-baseline                                              |
| `packages/{baseline,policies,drift,k8s-baseline}/LICENSE`                    | Apache-2.0 license adjacent to source   | NEW                   | M1        | identical bytes copied from repo root                                                           |
| `package-lock.json`                                                          | duplicate lockfile                      | DELETED               | M1        | removed; pnpm is canonical                                                                      |
| `.gitignore`                                                                 | repo hygiene                            | changed               | M1        | adds `package-lock.json`                                                                        |
| `README.md` (root)                                                           | top-level project overview              | changed               | M1        | version line v1.1.0 → v1.2.0; scenario count narrative reconciled in M5                         |
| `.github/SECURITY-CONTACTS`                                                  | PGP fingerprint or rationale-for-no-PGP | NEW                   | M2        | promised at SECURITY.md:23                                                                      |
| `.github/workflows/{ci,release,weekly-integration,pulumi-cooling-off}.yml`   | CI pipelines                            | changed               | M2        | third-party actions converted from `@vN` to `@<40-char-sha>`                                    |
| `docs/slo/lessons/hulumi-m3.md`                                              | sandbox-account narrative               | changed               | M2        | account ID `<sandbox-acct>` → `123456789012` placeholder                                        |
| `docs/slo/research/hulumi-github/.research-scratch-iter-*.md`                | iteration scratch                       | DELETED-or-DOCUMENTED | M2        | decision gate: keep with rationale OR move to non-published location                            |
| `packages/baseline/tests/integration/account-foundation.integration.test.ts` | stubbed integration test                | changed               | M3        | implements 3 stub `expect(true).toBe(true)` slots against real AWS                              |
| `packages/drift/tests/integration/drift-classify.integration.test.ts`        | stubbed integration test                | changed               | M3        | same — implements 4 stub slots                                                                  |
| `tests/scripts-cooling-off-diff.test.ts`                                     | new script test                         | NEW                   | M3        | exercises `cooling-off-diff.mjs` against synthetic lockfile fixtures                            |
| `tests/deployment-scp-teardown.test.ts`                                      | new SCP teardown test                   | NEW                   | M3        | automates the manual procedure in `docs/deployment/scp-guide.md`                                |
| `scripts/exact-pin-guard.mjs`                                                | supply-chain integrity guard            | changed               | M4        | extends to `.github/workflows/*.yml` action SHAs and `packages/drift/package.json` runtime deps |
| `packages/baseline/src/aws/probes/poll.ts`                                   | dynamic-resource escape hatch           | DOCUMENTED-or-REMOVED | M4        | decision gate: document call sites OR delete (with `no-shell-exec` lint rebalance)              |
| `docs/v2-migration.md`                                                       | BucketV2 → non-V2 migration plan        | NEW                   | M5        | design doc, no migration code                                                                   |
| `docs/cookbooks/migration-from-terraform.md`                                 | migration cookbook                      | NEW                   | M5        | issue #34                                                                                       |
| `docs/cookbooks/migration-mid-stack-adoption.md`                             | migration cookbook                      | NEW                   | M5        | issue #34                                                                                       |
| `docs/faq.md`                                                                | top-level FAQ                           | NEW                   | M5        | issue #17                                                                                       |
| `README.md` (root)                                                           | scenario count narrative                | changed               | M5        | reconciles "5 AWS scenarios" → actual count                                                     |

### Data Flow Summary

| Flow                                         | From                                    | To                           | Protocol/Mechanism                               | Bounded?                        | Failure Mode                               | Milestone     |
| -------------------------------------------- | --------------------------------------- | ---------------------------- | ------------------------------------------------ | ------------------------------- | ------------------------------------------ | ------------- |
| Atomic publish                               | `pnpm publish --provenance` per pkg     | `registry.npmjs.org`         | OIDC trusted publishing + `npm-provenance` JSON  | yes — 4 packages, 1 version     | first failure aborts before any publish    | M1 (verified) |
| Real AWS drift mutation → classifier verdict | console / api change in sandbox account | `DriftClassifier.classify()` | CloudTrail LookupEvents + Pulumi Automation API  | yes — 15min per test            | `it.skip` if `HULUMI_INTEGRATION!=1`       | M3            |
| SCP attach → teardown verification           | `aws organizations attach-policy`       | sandbox OU                   | AWS Organizations API                            | yes — single OU, single SCP doc | hard-skip if no `AWS_ORG_WRITE` env signal | M3            |
| Pin-guard scan                               | `scripts/exact-pin-guard.mjs`           | git working tree             | regex over `.github/workflows/*.yml` + lockfiles | yes — bounded by repo size      | exit non-zero on drift detection           | M4            |

---

## 4. Carmack-Style Development Best Practices

These rules apply to every language and every milestone. They are how we get the same code-quality discipline from every capable agent.

### 4.1 Inspect State, Do Not Guess

| Requirement                            | Project-Specific Tool/Command                                                  | Evidence Required                                     |
| -------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Interactive debugger available         | `node --inspect-brk` + `vitest --inspect-brk`                                  | Chrome DevTools attaches; breakpoint hit demonstrated |
| Breakpoints can be set in changed code | `debugger;` in TS source compiles via `tsc -p tsconfig.build.json`             | Per-milestone, in lessons file                        |
| Runtime state can be inspected         | Pulumi `--debug` for IaC state; `gh attestation inspect` for release artifacts | M1 release-dry; M3 integration                        |
| Tests can be debugged                  | `vitest run --inspect-brk -t "test name"`                                      | M3 integration test debug session                     |

### 4.2 Static Analysis Is Mandatory

| Check                     | Command                                                                           | Required Level                                                   | Notes                                                      |
| ------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------- |
| Formatter                 | `pnpm run format:check`                                                           | must pass                                                        | No style-only churn outside changed files unless allowed   |
| Type check                | `pnpm -r typecheck`                                                               | must pass                                                        | Includes all four packages + tests/skill-bdd               |
| Static analyzer / linter  | `pnpm -r lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard` | must pass                                                        | Warnings fail CI; license-boundary is the prose-leak guard |
| Security/dependency audit | `pnpm audit --prod` (informational) + `scripts/exact-pin-guard.mjs` (enforcing)   | pin-guard must pass; pnpm-audit may have known-accepted findings | Required if `pnpm-lock.yaml` changes                       |

### 4.3 Assertions Are Executable Comments

This runbook is mostly publish-readiness and hygiene; production paths are not changed. Where assertions matter:

- **M3 integration tests**: every `expect(...)` against real-AWS state must be a true invariant ("CloudTrail trail status is `IsLogging: true`" — _not_ "the call returned 200").
- **M4 pin-guard extension**: assert the regex match → version-string parse → drift detection chain has no silent fallthrough; an unparseable input must `throw`, not return "no drift".
- **M1 publish dry-run**: assert `npm pack` tarball file list against the package.json `files` declaration — no surprise inclusions.

### 4.4 Prefer Bounded Resources Over Silent Growth

| Resource                              |            Expected Bound |            Hard Limit | Behavior At Limit                              | Evidence/Test                                             |
| ------------------------------------- | ------------------------: | --------------------: | ---------------------------------------------- | --------------------------------------------------------- |
| Integration test wall-clock           |               15 min/test |                30 min | vitest test-level timeout aborts the test      | M3 integration tests carry explicit `900_000` ms timeouts |
| SCP teardown loop                     |                  10 polls |              12 polls | hard-fail with explicit message                | M3 SCP teardown test                                      |
| `cooling-off-diff` synthetic fixtures |               20 fixtures |           50 fixtures | fixture-loader rejects past 50 with diagnostic | M3 cooling-off-diff test                                  |
| pin-guard scan tree                   | bounded by `git ls-files` | n/a — already bounded | reject opaque file paths                       | M4 pin-guard extension                                    |

### 4.5 Make Invalid States Unrepresentable

| Concept                       | Prefer                                                                                      | Avoid                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------- |
| Package-publish "ready" state | typed manifest validator returning `{ ready: true } \| { ready: false; reasons: string[] }` | boolean flag with no reason narrative  |
| Integration test guard        | `RUN_INTEGRATION ? it : it.skip` (existing)                                                 | `if (env) skip()` inside the test body |
| SCP teardown phase            | enum `{ Idle, Attached, DetachInFlight, Detached, Failed }`                                 | string state                           |
| pin-guard violation           | `{ file, line, expected, actual, kind: "tag" \| "tag-with-tilde" \| "missing-sha" }`        | bare error string                      |

### 4.6 Preserve Compatibility Until Explicitly Broken

This runbook MUST NOT break:

- the four published package public API surfaces (per Section 1)
- `@pulumi/*` exact-pin policy (no version bumps; this runbook does not touch lockfile resolutions other than removing `package-lock.json`)
- DCO sign-off requirement
- license-boundary-lint enforcement
- atomic four-package release contract

### 4.7 Prefer Small, Local, Reviewable Changes

Each milestone's allow-list is intentionally tight. M1's surface is the largest (12 files across 4 packages) but each touch is mechanical and isolated.

### 4.8 No Silent Failure

Forbidden in production paths and test paths alike:

- `expect(RUN_INTEGRATION).toBe(true)` as a test body — that's the stub being deleted in M3
- pin-guard regex that silently returns "no match" on unrecognized version-string formats — must `throw`
- SCP teardown poll that times out without surfacing which step failed
- README-claim-not-met-by-code without an explicit `// FIXME(slug-mN):` reference and an open issue

---

## 5. High-Level Design for State Modeling / Formal Verification

`N/A — no new concurrency surface, no distributed state, no new persistence semantics.` This runbook tightens existing surfaces; the only "state machine"-shaped element is the SCP teardown phase machine in M3, which is small enough (5 states, 1 actor) that it does not warrant TLA+. Property-based testing of the teardown sequence in `tests/deployment-scp-teardown.test.ts` is sufficient.

---

## 6. Global Execution Rules

These rules apply to every milestone without exception.

### 6.1 Stay inside scope

- Only change files listed in the current milestone's allow-list.
- Do not refactor unrelated code.
- Do not rename public APIs, commands, routes, events, persisted-state shapes, or config keys unless the milestone explicitly says so.
- Do not introduce a new dependency unless the milestone explicitly allows it.
- Do not change `pnpm-lock.yaml` resolutions other than the explicit `package-lock.json` removal in M1.
- **Do not bump any `@pulumi/*` version** — the cooling-off CI gate guards this; bumping inside this runbook would conflate publish-readiness with supply-chain decisions.

### 6.2 Tests define the contract

- Write BDD tests before production code (where production code is changing).
- For mechanical milestones (M1, M2 partially), the "test" is `pnpm publish --dry-run` succeeding and `gh attestation verify` clean — record both in the Evidence Log.

### 6.3 Assertions and invariants are mandatory where assumptions matter

- M3 integration tests: every `expect()` checks an AWS-API observable, never a process-local flag.
- M4 pin-guard: every regex+parse path encodes an assertion that the input shape is what the regex matched.

### 6.4 Resource bounds are mandatory where growth is possible

- Integration tests: explicit vitest timeouts in milliseconds (existing convention preserved).
- SCP poll loop: maximum poll count + diagnostic on exhaustion.
- pin-guard tree walk: bounded by `git ls-files` (already finite).

### 6.5 Static analysis must pass

`pnpm -r lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard && pnpm run format:check && pnpm -r typecheck` must be green at each Definition-of-Done. Pre-existing CI matrix continues to gate.

### 6.6 Debugger over guessing

For M3 in particular: if an integration test fails, attach `vitest --inspect-brk` and walk the AWS API path before "fixing" by retrying with a longer timeout.

### 6.7 No placeholders in production paths

The deletion of `expect(RUN_INTEGRATION).toBe(true)` stubs in M3 _is the placeholder removal_. After M3 those tests must execute real AWS work or be removed.

### 6.8 Preserve backwards compatibility

- All four published packages publish the same major.minor version on the same day (existing atomic-release invariant — preserved).
- Cache schema `schemaVersion: 2` does not change.
- IaC tag keys do not change.
- The `Suppression` API does not change.

### 6.9 Prefer the smallest safe change

M1's 12-file allow-list is large but each file's diff is small (e.g., flipping `"private": true` to omitting the field, copying LICENSE bytes verbatim). Resist the temptation to "while I'm in package.json…" cleanups.

### 6.10 Record evidence, not claims

Every milestone has a populated Evidence Log. `npm pack --dry-run` output goes verbatim into M1's log; integration test stdout goes into M3's.

### 6.11 Keep .gitignore current and clean up test artifacts

- M1 adds `package-lock.json` to `.gitignore`.
- M3's integration tests must clean up sandbox-AWS resources on both success and failure paths.
- `git status` after each milestone's full test run must show a clean working tree.

---

## 7. Global Entry Rules (Pre-Milestone Protocol)

Do this before every milestone.

1. Read the lessons file from the previous milestone, if one exists. Apply any design corrections, naming rules, test-strategy improvements, and failure-mode coverage it calls for before writing new code.
2. **(v4 carry-forward)** Read open prior-retro issues filtered by this runbook's prefix (`hulumi-pre-public-launch`) and surface them as scope candidates. Carry-forward never auto-extends the allow-list. (See Section 10 — empty for M1 since this is the first milestone.)
3. Read the current milestone fully.
4. Run the full existing test suite and confirm it passes. Record the baseline in the Evidence Log:
   ```
   pnpm install --frozen-lockfile
   pnpm -r build
   pnpm -r test
   pnpm -r typecheck
   pnpm -r lint
   pnpm run lint:license-boundary
   pnpm run lint:exact-pin-guard
   pnpm run format:check
   ```
   If any tests fail before you start, stop and fix the baseline first.
5. Read the files listed in "Files Allowed To Change" and "Files To Read Before Changing Anything".
6. Update the Milestone Tracker: set the current milestone status to `in_progress` and record the Started date.
7. Create BDD test files first.
8. Create E2E runtime validation test stubs first.
9. Copy the milestone's Evidence Log template into working notes and begin filling it as work happens.
10. Re-state the milestone constraints in your own words before coding.

---

## 8. Global Exit Rules (Post-Milestone Protocol)

Do this after every milestone.

1. Run formatter (`pnpm run format`).
2. Run typecheck / build check (`pnpm -r typecheck && pnpm -r build`).
3. Run static analyzer / linter (`pnpm -r lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`).
4. If the dependency graph changed, run `pnpm audit --prod` (informational).
5. Run the full test suite (`pnpm -r test`).
6. Run the milestone's E2E runtime validation tests.
7. Verify each package builds and `pnpm publish --dry-run` succeeds (M1 onward).
8. Run smoke tests.
9. Verify backward compatibility for all items listed in the milestone Compatibility Checklist.
10. Verify resource bounds and assertion/invariant additions.
11. Complete the Self-Review Gate (Section 14).
12. Remove temporary debug code, mocks, placeholders, and commented-out dead code.
13. Run `git status` and confirm no untracked test artifacts.
14. Review `.gitignore`.
15. Update [docs/ARCHITECTURE.md](../../ARCHITECTURE.md) following the Documentation Update Table.
16. Update [README.md](../../../README.md) if user-facing capabilities changed.
17. Write a lessons-learned file at `docs/slo/lessons/hulumi-pre-public-launch-m<N>.md`.
18. Write a completion summary at `docs/slo/completion/hulumi-pre-public-launch-m<N>.md`.
19. Update the Milestone Tracker.
20. **(v4 lessons loop)** File any retro-derived issues with label `retro-derived` and reference the runbook prefix.
21. Re-read the next milestone with fresh eyes.

---

## 9. Background Context

### Current State

Hulumi is an Apache-2.0 TypeScript pnpm monorepo, **currently private** at github.com/kerberosmansour/hulumi. Four publishable npm packages (`@hulumi/baseline@1.2.0`, `@hulumi/policies@1.2.0`, `@hulumi/drift@1.2.0`, `@hulumi/k8s-baseline@1.0.0`) plus a Claude Code skill pack. Strong existing test architecture: vitest BDD, TLA+-aligned drift verdicts, license-boundary lint, exact-pin guard with 72h/24h cooling-off CI gate. Release pipeline is SLSA Build L3 with OIDC trusted publishing (no `NPM_TOKEN`).

The 2026-05-05 pre-public-launch audit found:

- **P0 (mechanical)**: three of four `package.json`s have `"private": true` blocking publish; three of four packages lack per-package `README.md`; all four lack adjacent `LICENSE`; none declare `repository`/`bugs`/`homepage`.
- **P0 (out-of-scope for this runbook)**: `hulumi.io` not registered (NXDOMAIN); `@hulumi` npm scope not claimed.
- **P1**: version mismatch (README v1.1.0 vs CHANGELOG/packages 1.2.0 vs k8s-baseline 1.0.0); duplicate lockfiles; orphan research-scratch files; promised `.github/SECURITY-CONTACTS` doesn't exist; sandbox AWS account ID in lessons; third-party actions tag-pinned not SHA-pinned.
- **P2**: four stubbed integration tests (issues #21, #24, #26, #30); unused `poll.ts` (issue #28); pin-guard not extended to actions/runtime deps (issue #27); no v2.0 migration plan (issue #22); missing migration cookbooks + FAQ (issues #34, #17).

### Problem

1. **`npm publish` will fail before it starts** — the `"private": true` flag blocks publish at runtime regardless of `publishConfig.access`. Three of four packages are in this state.
2. **Three of four packages render blank on npmjs.com** — no per-package `README.md`, so the registry display will be empty next to similarly-shaped packages.
3. **License attribution is incomplete** — Apache-2.0 expects a `LICENSE` adjacent to source; only the repo root has one.
4. **Version coherence is broken** — README says v1.1.0 while CHANGELOG and three packages are at 1.2.0 and the fourth (k8s-baseline) is at 1.0.0. Strangers' first impression: "this project doesn't know what version it is."
5. **Duplicate lockfiles** — `package-lock.json` and `pnpm-lock.yaml` are both committed, inviting lockfile-divergence supply-chain bugs.
6. **Black-hole references** — `.github/SECURITY-CONTACTS` is promised at `SECURITY.md:23` but does not exist; `security@hulumi.io` will black-hole until the user registers the domain (out of scope for this runbook, but the file should be present).
7. **Internal AWS account exposure** — `<sandbox-acct>` in `docs/slo/lessons/hulumi-m3.md:42` widens recon surface for stranger reads.
8. **Third-party action tag pinning** — `pnpm/action-setup@v6`, `aws-actions/configure-aws-credentials@v6`, `softprops/action-gh-release@v3` follow tags, not SHAs. A compromised tag = compromised release. Brand-inconsistent for a hardened-by-default project.
9. **Four integration test stubs masquerade as coverage** — README sells SLSA-L3 + integration coverage; four `expect(RUN_INTEGRATION).toBe(true)` stubs undercut that. Either implement or move to a roadmap doc.
10. **Dead code in a security-first repo** — `packages/baseline/src/aws/probes/poll.ts` is documented as an "escape hatch" but issue #28 flags it as unused. Dead code in a security-first repo is a smell.
11. **Pin-guard incomplete** — `scripts/exact-pin-guard.mjs` covers `@pulumi/*` but not GitHub Actions reusable workflows or `@hulumi/drift` runtime deps. Issue #27.
12. **No v2.0 migration plan** — public users will start depending on `BucketV2`-shaped output names; a stranger should be able to see a sketch of the v2 migration before they start building.
13. **Stranger-facing docs gaps** — issues #34 (Terraform→Pulumi+Hulumi cookbook, mid-stack adoption cookbook) and #17 (top-level FAQ extracting recurring lessons-learned gotchas) are the things public users hit first.

### Target Architecture

See Section 3 — the runtime architecture is unchanged at HEAD; what changes is publishability and trust posture.

### Key Design Principles

1. **Mechanical first, judgment second.** M1 + M2 are mostly mechanical (flag flips, file copies, regex-based rewrites). Don't conflate with M3+ which require judgment about real-AWS test rigging.
2. **Atomic four-package release stays atomic.** No package version-skew workaround. If k8s-baseline is bumped 1.0.0 → 1.2.0 it ships in the same release as the other three.
3. **Don't bump `@pulumi/*`.** Cooling-off CI gate would block; conflating publish-readiness with supply-chain bumps is a category error.
4. **Real AWS only for M3.** Mocked/stubbed integration is what's already there; the value is real-AWS observable assertions.
5. **README is for humans on npmjs.com, not just GitHub.** Per-package READMEs should be self-contained (don't assume reader sees repo-root README).
6. **Decisions are logged.** Issue #28 (poll.ts) and the research-scratch-file decision both go into the lessons file with rationale, even if the answer is "delete."

### What to Keep

- Existing four-package atomic release pipeline ([.github/workflows/release.yml](../../../.github/workflows/release.yml))
- Existing license-boundary-lint enforcement
- Existing exact-pin-guard (this runbook _extends_ it in M4, doesn't replace)
- Existing TLA+-aligned drift verdict matrix
- Existing AGENTS.md / CODEOWNERS / CODE_OF_CONDUCT / TRADEMARKS / SECURITY scaffolding
- Existing 5 (actually 7) AWS + 4 GitHub `/hulumi-threat-model` scenarios
- Existing CI matrix and per-job permissions blocks
- `@pulumi/*` exact pins
- Apache-2.0 IDs-only citation discipline

### What to Change

- **`packages/{baseline,policies,drift,k8s-baseline}/package.json`** — flip `private` (M1); add `repository`/`bugs`/`homepage` (M1); k8s-baseline version 1.0.0 → 1.2.0 (M1).
- **`packages/{baseline,policies,k8s-baseline}/README.md`** — NEW (M1).
- **`packages/{baseline,policies,drift,k8s-baseline}/LICENSE`** — NEW (M1).
- **`README.md`** (root) — version line v1.1.0 → v1.2.0 (M1); scenario count narrative reconciled (M5).
- **`package-lock.json`** — DELETED (M1); added to `.gitignore` (M1).
- **`.github/SECURITY-CONTACTS`** — NEW (M2).
- **`.github/workflows/*.yml`** — third-party actions converted to SHA-pin (M2).
- **`docs/slo/lessons/hulumi-m3.md`** — sandbox account ID redacted (M2).
- **`docs/slo/research/hulumi-github/.research-scratch-iter-*.md`** — kept-with-rationale or removed (M2).
- **`packages/baseline/tests/integration/account-foundation.integration.test.ts`** + **`packages/drift/tests/integration/drift-classify.integration.test.ts`** — implemented (M3).
- **`tests/scripts-cooling-off-diff.test.ts`** + **`tests/deployment-scp-teardown.test.ts`** — NEW (M3).
- **`scripts/exact-pin-guard.mjs`** — extended (M4).
- **`packages/baseline/src/aws/probes/poll.ts`** — kept-and-documented OR removed (M4).
- **`docs/v2-migration.md`** + **`docs/cookbooks/migration-{from-terraform,mid-stack-adoption}.md`** + **`docs/faq.md`** — NEW (M5).

### Global Red Lines

- **No bumping `@pulumi/*` versions** in this runbook — cooling-off would block.
- **No public API renames or shape changes** to any of the four packages' exports.
- **No new runtime dependency additions** to `@hulumi/baseline`, `@hulumi/policies`, `@hulumi/drift`, `@hulumi/k8s-baseline`. CONTRIBUTING.md specifies a discussion-first policy; this runbook does not have that mandate.
- **No license-boundary-lint waivers** — if a new doc tries to embed CCM/CIS/NIST prose, paraphrase + cite by ID.
- **No DCO bypass** — every commit signs off.
- **No claim that the `@hulumi/*` npm scope or `hulumi.io` domain are registered** — both are out-of-scope user actions; this runbook ships _prepared_ for that day, not _as if_ it has happened.
- **No removing `pnpm-lock.yaml`** (only `package-lock.json`).
- **No new test output committed to source control.**
- **No unbounded resource growth** — every loop and timeout in M3+ is explicitly bounded.

---

## 10. Carry-forward from prior retros

Empty at runbook authoring time (2026-05-05). `/slo-retro` has not yet filed retro-derived issues against the prefix `hulumi-pre-public-launch`. `/slo-execute` Step 1.5 will fall back to a live `gh issue list --label retro-derived` query.

| Issue      | Title | Suggested lane | Suggested milestone | Status |
| ---------- | ----- | -------------- | ------------------- | ------ |
| (none yet) |       |                |                     |        |

---

## 11. BDD and Runtime Validation Rules

Every milestone follows these rules. The full template policy lives in the v4 template at `~/.claude/skills/slo-plan/references/runbook-template_v_4_template.md` Section 11. Project-specific notes:

- TypeScript / Vitest scenario format: standard `describe / it("Given… When… Then…")` with the `// Given:`, `// When:`, `// Then:` comment pattern from existing tests.
- BDD test files for M3 live alongside the implementation files they cover (mirroring existing `.integration.test.ts` convention in `packages/<pkg>/tests/integration/`).
- New cross-cutting test files (cooling-off-diff, SCP teardown) live under `tests/` at the repo root, registered as a workspace package per `pnpm-workspace.yaml`'s `tests/*` glob.
- Test artifact cleanup is mandatory — every test that writes to `.tmp/` or sandbox-AWS resources cleans up on success and failure paths (existing `packages/baseline/tests/integration/.tmp/` ignore is preserved).

---

## 12. Dependency, Migration, and Refactor Policy

### 12.1 Dependency policy

This runbook adds **no new runtime dependencies**. M3 may add `dev-only` test fixtures (e.g., a synthetic-lockfile JSON file under `tests/fixtures/`); these are inert data, not code, and don't count as deps.

### 12.2 Migration policy

This runbook performs no schema, config, or persisted-state migrations. The only "migration"-shaped change is:

- M1: `package-lock.json` deletion. `pnpm-lock.yaml` is the canonical lockfile (see [package.json:7](../../../package.json#L7) `packageManager: pnpm@9.12.0`). No user-facing migration required.

### 12.3 Refactor budget

- M1: `Minimal local refactor permitted in listed files only` — purely metadata edits.
- M2: `Minimal local refactor permitted in listed files only` — workflow YAML and a single lessons file.
- M3: `Targeted refactor permitted for replacing stub test bodies with real-AWS implementations` — must not refactor production code.
- M4: `Targeted refactor permitted for extending exact-pin-guard.mjs` — must not break existing CLI surface.
- M5: `No refactor permitted beyond direct implementation` — pure additive docs.

---

## 13. Evidence Log Template

(Template per v4. Each milestone copies this table into its own Evidence Log section.)

| Step                               | Command / Check                                                                   | Expected Result                                            | Actual Result | Pass/Fail | Notes |
| ---------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------- | --------- | ----- |
| Baseline tests                     | `pnpm -r test`                                                                    | all pre-existing tests green                               |               |           |       |
| BDD tests created                  | `[files]`                                                                         | fail for expected reason                                   |               |           |       |
| E2E stubs created                  | `[files]`                                                                         | fail for expected reason                                   |               |           |       |
| Implementation                     | `[summary]`                                                                       | contract satisfied                                         |               |           |       |
| Formatter                          | `pnpm run format:check`                                                           | clean                                                      |               |           |       |
| Typecheck / build check            | `pnpm -r typecheck && pnpm -r build`                                              | clean                                                      |               |           |       |
| Static analyzer / linter           | `pnpm -r lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard` | clean                                                      |               |           |       |
| Dependency audit (if deps changed) | `pnpm audit --prod`                                                               | pass or documented exception                               |               |           |       |
| Full tests                         | `pnpm -r test`                                                                    | green                                                      |               |           |       |
| E2E runtime                        | `pnpm run release:dry` (M1+); `HULUMI_INTEGRATION=1 pnpm test:integration` (M3)   | green                                                      |               |           |       |
| Build/boot                         | `pnpm -r build`                                                                   | clean dist/ for all four packages                          |               |           |       |
| Smoke tests                        | `[steps]`                                                                         | all checked                                                |               |           |       |
| Resource-bound verification        | `[bound + test]`                                                                  | bound encoded; test exercises near-limit                   |               |           |       |
| Invariant/assertion verification   | `[invariant + test]`                                                              | encoded; test triggers under fault injection if applicable |               |           |       |
| Debugger / state inspection        | `[what was inspected]`                                                            | hypothesis confirmed before code change                    |               |           |       |
| Test artifact cleanup              | `git status`                                                                      | no untracked test artifacts                                |               |           |       |
| .gitignore review                  | review `.gitignore`                                                               | patterns current, no stale entries                         |               |           |       |
| Compatibility checks               | `[checks]`                                                                        | no regressions                                             |               |           |       |

---

## 14. Self-Review Gate

Per v4 template Section 14. Each milestone answers all questions before close-out.

---

## 15. Lessons-Learned File Template

Path: `docs/slo/lessons/hulumi-pre-public-launch-m<N>.md`. Per v4 template Section 15.

---

## 16. Completion Summary Template

Path: `docs/slo/completion/hulumi-pre-public-launch-m<N>.md`. Per v4 template Section 16.

---

## 17. Milestone Plan

### Milestone 1 — `NPM publish-readiness pass`

**Goal**: Every `@hulumi/*` package's `pnpm publish --dry-run` succeeds with a complete tarball, a rendered README on npmjs.com, an adjacent LICENSE, coherent versions across README/CHANGELOG/all four package.jsons, and a single canonical lockfile.

**Context**: Three of four `packages/*/package.json` carry `"private": true`, blocking publish. Three of four packages lack `README.md`. All four lack adjacent `LICENSE`. None declare `repository`/`bugs`/`homepage`. README claims v1.1.0 but CHANGELOG and three packages are 1.2.0; k8s-baseline is 1.0.0. `package-lock.json` and `pnpm-lock.yaml` are both committed; pnpm is canonical per `package.json:7`. After this milestone the repo can produce four publishable tarballs in an OIDC-signed release; after the user claims the `@hulumi` npm scope, `pnpm publish` will succeed.

**Carmack-style reliability goal**: "Make invalid states unrepresentable" — a package marked `"private": true` with `publishConfig.access: "public"` is a contradiction the type system should refuse. M1 removes the contradiction at every site. Also strengthens evidence capture: `npm pack --dry-run` output goes verbatim into the Evidence Log so future agents can replay.

**Important design rule**: **K8s-baseline bumps to the same version as the other three.** Atomic four-package release is non-negotiable (see [release.yml:18](../../../.github/workflows/release.yml#L18) note about `release-readiness.test.ts`). Do NOT carve out a "k8s stays pre-release" exception inside this milestone.

**Refactor budget**: `Minimal local refactor permitted in listed files only` — purely metadata edits.

#### Contract Block

| Field                                  | Value                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| Inputs                                 | repo state at HEAD on `chore/dep-bumps-2026-05-01-followup` (or successor branch); current `pnpm-lock.yaml` contents                                                                                                                                                                                                                                                                                               |
| Outputs                                | 4 packages each producing a clean `npm pack --dry-run` tarball; root README v1.2.0; single lockfile; `.gitignore` covering `package-lock.json`                                                                                                                                                                                                                                                                     |
| Interfaces touched                     | `packages/*/package.json` (publish manifest), `README.md` (root), `.gitignore`                                                                                                                                                                                                                                                                                                                                     |
| Files allowed to change                | `packages/baseline/package.json`, `packages/policies/package.json`, `packages/drift/package.json`, `packages/k8s-baseline/package.json`, `README.md`, `.gitignore`, `CHANGELOG.md` (k8s-baseline 1.0.0→1.2.0 entry)                                                                                                                                                                                                |
| Files to read before changing anything | All four `packages/*/package.json`, repo-root `LICENSE`, repo-root `NOTICE`, [release.yml](../../../.github/workflows/release.yml), [packages/k8s-baseline/tests/release-readiness.test.ts](../../../packages/k8s-baseline/tests/release-readiness.test.ts), [docs/ARCHITECTURE.md](../../ARCHITECTURE.md), [packages/drift/README.md](../../../packages/drift/README.md) (the model for per-package README shape) |
| New files allowed                      | `packages/baseline/README.md`, `packages/policies/README.md`, `packages/k8s-baseline/README.md`, `packages/baseline/LICENSE`, `packages/policies/LICENSE`, `packages/drift/LICENSE`, `packages/k8s-baseline/LICENSE`                                                                                                                                                                                               |
| New dependencies allowed               | `none`                                                                                                                                                                                                                                                                                                                                                                                                             |
| Migration allowed                      | `no` (the `package-lock.json` deletion is not a migration — there's no upstream consumer)                                                                                                                                                                                                                                                                                                                          |
| Compatibility commitments              | All four packages' public TypeScript exports, `peerDependencies`, `files` arrays, `exports` maps, `main`, `types` paths remain byte-for-byte identical. Adding fields is allowed; renaming or removing fields is not.                                                                                                                                                                                              |
| Resource bounds introduced/changed     | None (purely metadata)                                                                                                                                                                                                                                                                                                                                                                                             |
| Invariants/assertions required         | After M1: for each pkg, `JSON.parse(package.json).private === undefined` AND `publishConfig.access === "public"` AND `repository.url` is `https://github.com/kerberosmansour/hulumi`. Encoded as a vitest test in [packages/k8s-baseline/tests/release-readiness.test.ts](../../../packages/k8s-baseline/tests/release-readiness.test.ts) (extending it).                                                          |
| Debugger / inspection expectation      | `npm pack --dry-run` for each package — the _output file list_ must match the `files` array in package.json with no extras. Inspect by piping `--json                                                                                                                                                                                                                                                              | jq '.files[].path'`. |
| Static analysis gates                  | `pnpm -r typecheck && pnpm -r build && pnpm -r lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard && pnpm run format:check`                                                                                                                                                                                                                                                                   |
| Forbidden shortcuts                    | NO bumping `@pulumi/*` versions; NO touching `pnpm-lock.yaml` content (deletion of package-lock.json is the only lockfile change); NO removing `peerDependencies` ranges; NO renaming fields; NO `--no-verify` on commits; NO copying npmjs.com-rendered HTML into per-package READMEs (write Markdown directly).                                                                                                  |
| Data classification                    | `Public` — every artifact this milestone produces is destined for public registry display.                                                                                                                                                                                                                                                                                                                         |
| Proactive controls in play             | OWASP Proactive Controls C2 (Leverage Security Frameworks and Libraries — Apache-2.0 LICENSE adjacent to source); C8 (Protect Data Everywhere — provenance attestations remain enforced via existing release.yml); `@hulumi/baseline.mappings.licensing` policy (IDs-only citation, paraphrase prose).                                                                                                             |
| Abuse acceptance scenarios             | `tm-pre-public-launch-abuse-1: typosquat preparation` — see BDD row "abuse case: typosquat namespace pollution" below. **N/A for the rest of the abuse-case classes** because no new endpoints, IPC handlers, file writes outside repo, subprocess invocations, or outbound requests are introduced.                                                                                                               |

#### Out of Scope / Must Not Do

- Registering `hulumi.io` (user action)
- Claiming the `@hulumi` npm scope (user action)
- Actually publishing to npm (release.yml's job, not this runbook's)
- Bumping any `@pulumi/*` version
- Adding any new runtime dependency
- Adding npm `bin` scripts to packages that don't already have them
- Adding non-Markdown README assets (keep READMEs Markdown-only)
- Restructuring the `tests/` workspace
- Renaming any exported TypeScript symbol

#### Pre-Flight

1. Complete the Global Entry Rules (Section 7).
2. (No prior lessons file — this is M1.)
3. Read the allowed files before editing.
4. Copy the Evidence Log template into this milestone section.
5. Re-state the milestone constraints in your own words.

#### Files Allowed To Change

| File                                                    | Planned Change                                                                                                                                                                         |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/baseline/package.json`                        | Remove `"private": true`; add `repository`, `bugs`, `homepage` fields pointing to `kerberosmansour/hulumi`                                                                             |
| `packages/policies/package.json`                        | Remove `"private": true`; add `repository`, `bugs`, `homepage`                                                                                                                         |
| `packages/drift/package.json`                           | Remove `"private": true`; add `repository`, `bugs`, `homepage`                                                                                                                         |
| `packages/k8s-baseline/package.json`                    | Bump `version: 1.0.0` → `1.2.0`; add `repository`, `bugs`, `homepage`; add `private: false` for explicitness (not strictly required but matches sibling pattern after this milestone)  |
| `packages/baseline/README.md`                           | NEW: per-package README rendered on npmjs.com — what the package is, install, basic example, link to docs, license                                                                     |
| `packages/policies/README.md`                           | NEW: per-package README — what the policy pack is, install + load, link to docs, license                                                                                               |
| `packages/k8s-baseline/README.md`                       | NEW: per-package README — what the K8s baseline is, install, link to docs, license                                                                                                     |
| `packages/baseline/LICENSE`                             | NEW: byte-identical copy of repo-root `LICENSE`                                                                                                                                        |
| `packages/policies/LICENSE`                             | NEW: byte-identical copy                                                                                                                                                               |
| `packages/drift/LICENSE`                                | NEW: byte-identical copy                                                                                                                                                               |
| `packages/k8s-baseline/LICENSE`                         | NEW: byte-identical copy                                                                                                                                                               |
| `README.md` (root)                                      | Line `> Hardened-by-default … v1.1.0.` → `… v1.2.0.`; Section "What's in the box (v1.1.0)" header → "What's in the box (v1.2.0)"; k8s-baseline `(pre-release)` annotation → `(stable)` |
| `CHANGELOG.md`                                          | Add a changelog row noting k8s-baseline version bump 1.0.0 → 1.2.0 (under existing 1.2.0 entry as a follow-up)                                                                         |
| `.gitignore`                                            | Add `package-lock.json` to prevent reintroduction                                                                                                                                      |
| `package-lock.json`                                     | DELETED (the file itself, not the lockfile content — `pnpm-lock.yaml` is canonical)                                                                                                    |
| `packages/k8s-baseline/tests/release-readiness.test.ts` | Extend test to assert per-package: `private` is unset/false, `publishConfig.access === "public"`, `repository.url` matches, README and LICENSE files exist on disk                     |

#### Step-by-Step

1. Write BDD test extensions first in [packages/k8s-baseline/tests/release-readiness.test.ts](../../../packages/k8s-baseline/tests/release-readiness.test.ts) — assert the publish-ready invariants for all four packages. Confirm tests fail (private: true, missing READMEs).
2. Encode the package.json shape invariant assertion in the test (per-package `JSON.parse` shape check).
3. Modify `packages/baseline/package.json`: remove `"private": true`, add `repository`/`bugs`/`homepage`.
4. Repeat for `packages/policies/package.json`, `packages/drift/package.json`.
5. Modify `packages/k8s-baseline/package.json`: bump version 1.0.0 → 1.2.0, add `private: false`, add `repository`/`bugs`/`homepage`.
6. Create per-package `README.md` files (baseline, policies, k8s-baseline) using `packages/drift/README.md` as the model.
7. Copy repo-root `LICENSE` byte-identical into each `packages/<pkg>/LICENSE`.
8. Update root `README.md` v1.1.0 → v1.2.0 references.
9. Add a `CHANGELOG.md` row under the `[1.2.0] — 2026-05-01` entry noting k8s-baseline version reconciliation.
10. Delete `package-lock.json`; add it to `.gitignore`.
11. Run `pnpm install --frozen-lockfile` to confirm `pnpm-lock.yaml` still resolves.
12. Run the extended `release-readiness.test.ts` — must pass.
13. For each package, run `npm pack --dry-run --json | jq '.files[].path'` and verify against `packages/<pkg>/package.json#files`. No surprises.
14. Run `pnpm run release:dry` (act-based attestation) — must complete cleanly.
15. Run formatter, typecheck, full lint, full test suite.
16. Verify `git status` clean, `.gitignore` current.
17. Complete the Self-Review Gate.

#### BDD Acceptance Scenarios

**Feature: NPM publish readiness for the four `@hulumi/*` packages**

| Scenario                                                                       | Category                                    | Given                                                                 | When                                                      | Then                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------ | ------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All four packages declare publishConfig.access=public and have no private:true | happy path                                  | the repo at end of M1                                                 | release-readiness.test.ts runs                            | every package.json passes the shape invariant                                                                                                                                                                  |
| Per-package README exists for all four packages                                | happy path                                  | the repo at end of M1                                                 | release-readiness.test.ts walks `packages/*/README.md`    | all four files exist and are non-empty                                                                                                                                                                         |
| Per-package LICENSE exists and is byte-identical to repo root                  | happy path                                  | the repo at end of M1                                                 | release-readiness.test.ts compares bytes                  | all four LICENSE files match the root                                                                                                                                                                          |
| package.json with private:true                                                 | invalid input                               | a hypothetical regression sets `"private": true`                      | release-readiness.test.ts runs                            | test fails with a specific message naming the offending package                                                                                                                                                |
| Package.json missing repository field                                          | invalid input                               | a regression removes `repository`                                     | release-readiness.test.ts runs                            | test fails naming the field and package                                                                                                                                                                        |
| K8s-baseline version mismatch                                                  | invalid input                               | k8s-baseline version differs from baseline                            | release-readiness.test.ts runs                            | atomic-release invariant fires                                                                                                                                                                                 |
| `pnpm install --frozen-lockfile` after package-lock.json deletion              | empty state                                 | first run after M1                                                    | command runs                                              | resolves cleanly using `pnpm-lock.yaml` only                                                                                                                                                                   |
| `npm pack --dry-run` for each package                                          | dependency failure                          | npm registry unreachable                                              | command runs offline                                      | local pack succeeds (pack does not contact registry)                                                                                                                                                           |
| Root README still references shipped k8s-baseline pre-release                  | compatibility                               | end of M1                                                             | grep `1.0.0-pre.1` in README.md                           | match count is zero                                                                                                                                                                                            |
| abuse case: typosquat namespace pollution                                      | abuse case (`tm-pre-public-launch-abuse-1`) | the `@hulumi` scope is unclaimed at npmjs (out-of-scope; user action) | a stranger reads the README's "canonical install" section | every `@hulumi/*` install command names the exact package and the README directs typosquat reports to `security@hulumi.io` (M2 will reroute if domain stays NXDOMAIN) — readers have unambiguous install paths |

#### Regression Tests

- All existing `pnpm -r test` cases must still pass.
- `pnpm run lint:license-boundary` — no verbatim CCM/CIS/NIST text in new READMEs.
- `pnpm run lint:exact-pin-guard` — no `@pulumi/*` drift.
- `pnpm run format:check` — clean.
- Existing CI matrix on the runbook branch — green before merge.

#### Compatibility Checklist

- [ ] All four packages' TypeScript public exports are byte-for-byte unchanged
- [ ] `peerDependencies` ranges unchanged
- [ ] `files` arrays unchanged
- [ ] `exports` maps unchanged
- [ ] `main`, `types` paths unchanged
- [ ] `pnpm-lock.yaml` unchanged in content (only `package-lock.json` deleted)
- [ ] `release.yml`'s atomic-release invariant still satisfied (all four versions match)
- [ ] CI matrix passes on the M1 PR

#### E2E Runtime Validation

**File**: `packages/k8s-baseline/tests/release-readiness.test.ts` (extended)

| E2E Test                                                             | What It Proves                                 | Pass Criteria                                                                                                                                                                              |
| -------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `all four packages declare publish-ready manifest shape`             | Per-package package.json shape invariant holds | `private` field unset or false; `publishConfig.access === "public"` AND `provenance === true`; `repository.url` matches the canonical GitHub URL; `version` agrees with the runbook target |
| `per-package README and LICENSE files present`                       | npmjs.com display + Apache-2.0 attribution     | each `packages/<pkg>/README.md` and `packages/<pkg>/LICENSE` exists; LICENSE bytes match `<repo-root>/LICENSE`                                                                             |
| `npm pack --dry-run for each package produces the declared file set` | Tarball contents match `files` declaration     | for each package, `npm pack --dry-run --json` returns a path set ⊆ `package.json#files` glob expansion; no extras                                                                          |

#### Smoke Tests

- [ ] `pnpm install --frozen-lockfile` succeeds on a clean clone
- [ ] `pnpm -r build` produces `dist/` for all four packages
- [ ] `pnpm -r test` green
- [ ] `npm pack --dry-run` for each package shows the expected file list
- [ ] `pnpm run release:dry` (act) reaches attestation step without error
- [ ] `git status` shows no untracked test artifacts
- [ ] `.gitignore` includes `package-lock.json`
- [ ] README rendered locally (any markdown viewer) shows v1.2.0 throughout

#### Evidence Log

| Step                        | Command / Check                                                                            | Expected Result                                           | Actual Result                                                                                                                                                                      | Pass/Fail | Notes                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------ |
| Repo hygiene                | `git status` + `rev-parse --abbrev-ref HEAD` + `symbolic-ref refs/remotes/origin/HEAD`     | not on default/protected branch                           | branch before: `chore/dep-bumps-2026-05-01-followup`; default: `main`; switched to `slo/hulumi-pre-public-launch-m1`                                                               | Pass      | clean tree post-switch (`.claude/` and `docs/slo/current/` were untracked, expected) |
| Baseline tests              | `pnpm install --frozen-lockfile && pnpm -r build && pnpm -r test`                          | all green                                                 | install OK; build OK (4 packages); 470 tests passed across drift/policies/skill-bdd/baseline/k8s-baseline/4 examples                                                               | Pass      | format:check initially red on the new runbook file; fixed with `pnpm run format`     |
| BDD tests created           | `packages/k8s-baseline/tests/release-readiness.test.ts` (extended)                         | fails on private/README/LICENSE/version checks before fix | 16 new tests added, all 16 failed for the expected reasons (private:true, missing repo/bugs/homepage, version skew, no LICENSE)                                                    | Pass      |                                                                                      |
| Implementation              | "package.json metadata + README/LICENSE files + version reconciliation + lockfile cleanup" | contract satisfied                                        | 12 file edits + 7 NEW files + 1 DELETE, all on allow-list                                                                                                                          | Pass      | k8s-baseline 1.0.0→1.2.0 bump documented in CHANGELOG entry                          |
| Formatter                   | `pnpm run format:check`                                                                    | clean                                                     | `All matched files use Prettier code style!`                                                                                                                                       | Pass      |                                                                                      |
| Typecheck / build           | `pnpm -r typecheck && pnpm -r build`                                                       | clean                                                     | all 4 packages typecheck + build clean; 4 examples typecheck clean                                                                                                                 | Pass      |                                                                                      |
| Static analyzer             | `pnpm -r lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`          | clean                                                     | eslint clean; license-boundary `OK (IDs-only policy upheld)`; exact-pin-guard `OK (6 @pulumi/* deps match pinned hashes)`                                                          | Pass      |                                                                                      |
| Dependency audit            | `pnpm audit --prod`                                                                        | no new findings vs baseline                               | not run (no dependency graph change in M1; only `package-lock.json` removed)                                                                                                       | N/A       | informational only — pin-guard is enforcing                                          |
| Full tests                  | `pnpm -r test`                                                                             | green                                                     | 470 tests pass: drift 58, policies 106, skill-bdd 28, baseline 99 (+8 skipped integration), k8s-baseline 167 (incl. 16 new), examples 4                                            | Pass      | release-readiness now covers M1 invariants                                           |
| E2E runtime                 | `pnpm publish --dry-run` per package                                                       | dry-run succeeds for all four                             | baseline@1.2.0 211 files; policies@1.2.0 96 files; drift@1.2.0 59 files; k8s-baseline@1.2.0 137 files. All `+ @hulumi/<pkg>@1.2.0`                                                 | Pass      | `pnpm run release:dry` (act-based) deferred to a CI run; M1's gate is the dry-run    |
| npm pack dry-run × 4        | `npm pack --dry-run --json` per package                                                    | file lists match `files`                                  | all four packs include LICENSE+README at root + dist/_ per `files` glob; surprise scan: no src/, tests/, _.test.\*, package-lock                                                   | Pass      | LICENSE+README auto-included by npm convention even without explicit `files` entries |
| Build/boot                  | `pnpm -r build`                                                                            | `dist/` present for all 4                                 | all four `dist/` populated                                                                                                                                                         | Pass      |                                                                                      |
| Smoke tests                 | per smoke checklist                                                                        | all checked                                               | install/build/test/pack/dry-run/git-status/.gitignore all checked                                                                                                                  | Pass      |                                                                                      |
| Resource-bound verification | N/A                                                                                        | —                                                         | M1 introduces no new resources, queues, retries, or recursion                                                                                                                      | N/A       | no new resources                                                                     |
| Invariant verification      | release-readiness shape assertions                                                         | encoded; failure surfaces specific package + field        | 8 distinct invariants encoded across 16 `it.each` test cases; per-package failure messages name field + package                                                                    | Pass      |                                                                                      |
| Debugger / state inspection | `npm pack --dry-run --json \| jq` for each pkg                                             | tarball contents match expectations                       | baseline 211 files (LICENSE+README+dist/); policies 96 (LICENSE+PulumiPolicy.yaml+README+dist/); drift 59 (LICENSE+README+dist/); k8s-baseline 137 (LICENSE+README+dist/+scripts/) | Pass      | inspection used to confirm no surprises — `surprises=[]` for all four packages       |
| Test artifact cleanup       | `git status`                                                                               | no untracked                                              | only M1 changes + `docs/slo/current/` (the runbook itself) tracked; `.claude/` now ignored                                                                                         | Pass      |                                                                                      |
| .gitignore review           | `.gitignore` includes `package-lock.json`                                                  | yes                                                       | added: `package-lock.json`, `yarn.lock`, `.claude/`                                                                                                                                | Pass      | belt-and-braces for both common alt-lockfiles + agent state                          |
| Compatibility checks        | per compatibility checklist                                                                | no regressions                                            | TS exports unchanged; peerDependencies unchanged; `files`/`exports`/`main`/`types` unchanged; pnpm-lock.yaml unchanged; release.yml atomic invariant satisfied                     | Pass      | full checklist: 8/8 boxes checked                                                    |

#### Definition of Done

The milestone is done only when all of the following are true:

- All four packages' `package.json` lacks `"private": true`
- All four packages have an adjacent `LICENSE` byte-identical to `<repo-root>/LICENSE`
- All four packages have a `README.md` (drift's existing README left as-is or polished)
- All four packages declare `repository`, `bugs`, `homepage` pointing to `kerberosmansour/hulumi`
- All four package versions are coherent with `CHANGELOG.md`'s latest entry (1.2.0 across the board)
- Root `README.md` says v1.2.0
- `package-lock.json` is deleted; `.gitignore` covers it
- `pnpm install --frozen-lockfile` succeeds
- Extended `release-readiness.test.ts` passes
- `pnpm run release:dry` reaches attestation end
- Full CI matrix green on the M1 PR
- Compatibility checklist all checked
- Lessons file written
- Completion summary written
- Milestone Tracker updated

#### Post-Flight

Complete the Global Exit Rules. Key documentation updates:

- **docs/ARCHITECTURE.md**: update line 7 — `@hulumi/k8s-baseline` is no longer "v1.0.0-pre.1; first stable lands with the v1.2 train". After M1 it's stable at v1.2.0.
- **README.md**: v1.1.0 → v1.2.0 references; "What's in the box" header bumped; k8s-baseline `(pre-release)` annotation removed.
- **docs/slo/lessons/hulumi-pre-public-launch-m1.md**: NEW — record the `npm pack --dry-run` output, the version-reconciliation decision rationale, and any rework needed to satisfy `release-readiness.test.ts`.
- **docs/slo/completion/hulumi-pre-public-launch-m1.md**: NEW.

#### Notes

- M2 picks up the security-hygiene items (SECURITY-CONTACTS, SHA pinning, account ID, scratch files).
- `release-readiness.test.ts` already exists per [release.yml:18 comment](../../../.github/workflows/release.yml#L18) — extending it (rather than writing a new test) preserves the single-source-of-truth for "what does atomic four-package release require."

---

### Milestone 2 — `Public-launch hygiene`

**Goal**: Eliminate the four public-launch hygiene findings — SHA-pin every GitHub Action across all four workflows, ship `.github/SECURITY-CONTACTS` (closing the SECURITY.md:23 forward reference), redact the sandbox AWS account ID from `docs/slo/lessons/hulumi-m3.md`, and resolve the four orphan `.research-scratch-iter-*.md` files (keep-with-rationale or remove).

**Context**: M1 cleared the publish-readiness blockers; M2 closes the trust-posture gaps. The audit found `pnpm/action-setup@v6`, `aws-actions/configure-aws-credentials@v6`, `softprops/action-gh-release@v3`, and various `actions/*@vN` references — for a hardened-by-default project this is brand-inconsistent. M2 SHA-pins **all** action uses (first-party + third-party) so M4's pin-guard extension has clean targets. SECURITY.md:23 promises a `.github/SECURITY-CONTACTS` file as a "post-v1.0.0 follow-up"; M2 ships it. The AWS account ID `<sandbox-acct>` widens recon surface; redacted to placeholder `123456789012`. The four `.research-scratch-iter-*.md` files in `docs/slo/research/hulumi-github/` are not sensitive but read as in-progress thinking-out-loud — M2 chooses keep (with one-line "this is iteration history" preface) or remove.

**Carmack-style reliability goal**: "No silent failure" + "Inspect state, do not guess" — a tag-pinned action is a moving reference; SHA-pinned actions are immutable. M2 makes the supply-chain trust boundary inspectable: every action ref names the SHA + tag-as-comment, so a reader can both verify and update. SECURITY-CONTACTS makes the disclosure path inspectable rather than "implied by SECURITY.md".

**Important design rule**: **SHA-pinned actions keep the tag as a trailing `# vN` comment.** Format: `uses: pnpm/action-setup@<40-char-sha> # v6`. Do NOT drop the tag-as-comment — Dependabot's action-pin updates depend on it.

**Refactor budget**: `Minimal local refactor permitted in listed files only` — workflow YAMLs, one new SECURITY-CONTACTS file, one lessons file edit, possibly four scratch file removals.

#### Contract Block

| Field                                  | Value                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inputs                                 | M1's commit + the four workflow YAMLs + SECURITY.md + the lessons file + the four scratch files                                                                                                                                                                                                                                     |
| Outputs                                | All workflow `uses:` lines SHA-pinned with tag-as-comment; `.github/SECURITY-CONTACTS` shipped; account ID redacted; scratch files resolved                                                                                                                                                                                         |
| Interfaces touched                     | `.github/workflows/*.yml`, `.github/SECURITY-CONTACTS` (NEW), `docs/slo/lessons/hulumi-m3.md`, `docs/slo/research/hulumi-github/.research-scratch-iter-*.md`, `SECURITY.md`                                                                                                                                                         |
| Files allowed to change                | `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.github/workflows/weekly-integration.yml`, `.github/workflows/pulumi-cooling-off.yml`, `docs/slo/lessons/hulumi-m3.md`, `docs/slo/research/hulumi-github/.research-scratch-iter-{1,2,3,4}.md`, `SECURITY.md`, `CHANGELOG.md` (one-line entry under [1.2.0] "Changed") |
| Files to read before changing anything | All four workflow YAMLs in full; `SECURITY.md`; `docs/slo/lessons/hulumi-m3.md`; the four scratch files                                                                                                                                                                                                                             |
| New files allowed                      | `.github/SECURITY-CONTACTS`, `tests/skill-bdd/workflow-action-pinning.test.ts`                                                                                                                                                                                                                                                      |
| New dependencies allowed               | `none`                                                                                                                                                                                                                                                                                                                              |
| Migration allowed                      | `no`                                                                                                                                                                                                                                                                                                                                |
| Compatibility commitments              | All existing CI jobs continue to run identically — SHA-pinning does not change action semantics. OIDC trusted publishing preserved (no NPM_TOKEN). DCO check + license-boundary + exact-pin-guard preserved.                                                                                                                        |
| Resource bounds introduced/changed     | None                                                                                                                                                                                                                                                                                                                                |
| Invariants/assertions required         | Every `uses:` line in `.github/workflows/*.yml` matches `^[[:space:]]*-?[[:space:]]*uses:[[:space:]]+[^@]+@[0-9a-f]{40}([[:space:]]+#.*)?$` (tag-as-comment optional in regex but required by lint message). Encoded as a vitest test.                                                                                              |
| Debugger / inspection expectation      | For each SHA pin, verify upstream existence via `gh api repos/<owner>/<repo>/git/ref/tags/<tag> --jq '.object.sha'`. Don't trust SHAs from memory.                                                                                                                                                                                  |
| Static analysis gates                  | Same as M1                                                                                                                                                                                                                                                                                                                          |
| Forbidden shortcuts                    | NO touching `pnpm-lock.yaml`; NO bumping `@pulumi/*`; NO altering job-level `permissions:` blocks; NO removing `registry-url: https://registry.npmjs.org`; NO adding `NPM_TOKEN` / `NODE_AUTH_TOKEN`; NO copy-pasting SHAs without verifying; NO dropping the `# vN` tag-as-comment.                                                |
| Data classification                    | `Public`                                                                                                                                                                                                                                                                                                                            |
| Proactive controls in play             | OWASP Proactive Controls C2 (SHA-pinning); C8 (explicit disclosure path); CSA CCM `IVS-04` (Secure SDLC); SLSA Build L3 supply-chain posture preserved                                                                                                                                                                              |
| Abuse acceptance scenarios             | `tm-pre-public-launch-abuse-2: tag-rewrite injection` — see BDD row "abuse case" below. **N/A for the rest** of the abuse-case classes — no new endpoints, IPC handlers, file writes outside repo, subprocess invocations, or outbound requests.                                                                                    |

#### Out of Scope / Must Not Do

- Registering `hulumi.io` (user action — M2 keeps `security@hulumi.io` references and adds GHSA path as alternative)
- Bumping any action across major versions (only the SHA gets pinned; `@v6` stays at v6)
- Adding a PGP key (SECURITY-CONTACTS will document either the fingerprint or "no PGP — use GHSA")
- Generating a new GPG key for code signing
- Touching the integration test stubs (M3's job)
- Touching `scripts/exact-pin-guard.mjs` (M4's job)
- Renaming any workflow file
- Changing job-level `permissions:` blocks

#### Pre-Flight

1. Complete the Global Entry Rules.
2. Read `docs/slo/lessons/hulumi-pre-public-launch-m1.md` and apply: format-after-edit discipline; `gh tag` check before treating CHANGELOG as historical.
3. Read the allowed files before editing.
4. Copy the Evidence Log template into this milestone section.
5. Re-state the milestone constraints before coding.

#### Files Allowed To Change

| File                                                                  | Planned Change                                                                                                                                                                                        |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`                                            | Convert every `uses: <action>@<tag>` → `uses: <action>@<sha> # <tag>`. Affected: `actions/checkout@v6` (×9), `actions/setup-node@v6` (×11), `pnpm/action-setup@v6` (×9).                              |
| `.github/workflows/release.yml`                                       | Same pattern. Affected: `actions/checkout@v6`, `actions/setup-node@v6`, `pnpm/action-setup@v6`, `actions/attest-build-provenance@v4`, `actions/upload-artifact@v7`, `softprops/action-gh-release@v3`. |
| `.github/workflows/weekly-integration.yml`                            | Same pattern. Affected: `actions/checkout@v6`, `actions/setup-node@v6`, `pnpm/action-setup@v6`, `aws-actions/configure-aws-credentials@v6`.                                                           |
| `.github/workflows/pulumi-cooling-off.yml`                            | Same pattern. Affected: `actions/checkout@v6`, `actions/setup-node@v6`.                                                                                                                               |
| `.github/SECURITY-CONTACTS`                                           | NEW: contact info per [k8s.io/SECURITY-CONTACTS convention](https://github.com/kubernetes/community/blob/master/contributors/devel/sig-release/security-release-process.md#disclosures).              |
| `SECURITY.md`                                                         | Update line 23 from "post-v1.0.0 follow-up" to a working reference.                                                                                                                                   |
| `docs/slo/lessons/hulumi-m3.md`                                       | Replace `<sandbox-acct>` → `123456789012`.                                                                                                                                                            |
| `docs/slo/research/hulumi-github/.research-scratch-iter-{1,2,3,4}.md` | DECISION: keep with one-line "Iteration history — see synthesis.md" preface, OR delete. Documented in lessons.                                                                                        |
| `tests/skill-bdd/workflow-action-pinning.test.ts`                     | NEW: vitest test enforcing SHA-pin invariant.                                                                                                                                                         |
| `CHANGELOG.md`                                                        | One-line note under [1.2.0] "Changed" about SHA-pinning + SECURITY-CONTACTS.                                                                                                                          |

#### Step-by-Step

1. Write the BDD test first (`tests/skill-bdd/workflow-action-pinning.test.ts`); confirm fails on current tag-pinned state.
2. For each unique action, fetch the upstream SHA at the pinned tag using `gh api repos/<owner>/<repo>/git/ref/tags/<tag> --jq '.object.sha'`. Cache results.
3. Edit each workflow YAML — replace `@<tag>` → `@<sha> # <tag>`.
4. Run the BDD test — must pass.
5. Author `.github/SECURITY-CONTACTS`. Update SECURITY.md:23.
6. Redact AWS account ID in `docs/slo/lessons/hulumi-m3.md`.
7. Decide research-scratch fate; execute; document rationale in M2 lessons.
8. Add the one-line CHANGELOG entry.
9. Run `pnpm run format`.
10. Run full lint/typecheck/test gate.
11. Verify `git status` clean; complete the Self-Review Gate.

#### BDD Acceptance Scenarios

**Feature: Workflow action pinning + public-launch hygiene**

| Scenario                                                                     | Category               | Given                                                                                                                        | When                                                   | Then                                                                                                             |
| ---------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Every `uses:` in `.github/workflows/*.yml` is SHA-pinned with tag-as-comment | happy path             | repo at end of M2                                                                                                            | the new BDD walks all four workflow files              | every `uses:` matches the SHA-pin regex; failure names file:line                                                 |
| Every action's pinned SHA exists at its claimed tag                          | happy path             | repo at end of M2                                                                                                            | for each unique `<owner>/<repo>@<sha> # <tag>` triple  | `gh api` returns the same SHA (recorded in lessons, not encoded as test)                                         |
| `.github/SECURITY-CONTACTS` exists with canonical disclosure paths           | happy path             | repo at end of M2                                                                                                            | grep                                                   | references `kerberosmansour`, GHSA link, deferred `security@hulumi.io` (status note)                             |
| `SECURITY.md:23` no longer says "post-v1.0.0 follow-up"                      | compatibility          | repo at end of M2                                                                                                            | grep `SECURITY.md`                                     | match count zero                                                                                                 |
| `<sandbox-acct>` is gone from `docs/slo/lessons/hulumi-m3.md`                | invalid input          | repo at end of M2                                                                                                            | grep                                                   | match count zero                                                                                                 |
| Tag-only pins are rejected by the BDD                                        | invalid input          | a regression sets `actions/checkout@v6` (no SHA)                                                                             | BDD runs                                               | fails with file:line                                                                                             |
| Job-level `permissions:` blocks unchanged                                    | compatibility          | M1 baseline state                                                                                                            | grep all four workflows for `permissions:`             | per-job blocks unchanged                                                                                         |
| OIDC trusted publishing preserved                                            | compatibility          | release.yml end of M2                                                                                                        | grep                                                   | `registry-url: https://registry.npmjs.org` present; no `NPM_TOKEN` / `NODE_AUTH_TOKEN` introduced                |
| Research-scratch decision documented                                         | dependency on judgment | end of M2                                                                                                                    | read `docs/slo/lessons/hulumi-pre-public-launch-m2.md` | "Research-scratch decision" section present with rationale                                                       |
| abuse case: tag-rewrite injection (`tm-pre-public-launch-abuse-2`)           | abuse case             | upstream third-party action repo (e.g. `pnpm/action-setup`) is compromised AND the attacker rewrites `v6` to a malicious SHA | a Hulumi CI run starts                                 | because every `uses:` is SHA-pinned, CI continues to fetch the original honest SHA — tag rewrite has zero effect |

#### Regression Tests

- All M1 BDD tests in `release-readiness.test.ts` continue to pass.
- `pnpm run lint:license-boundary` clean.
- `pnpm run lint:exact-pin-guard` clean (M2 doesn't touch `@pulumi/*`).
- `pnpm run format:check` clean.

#### Compatibility Checklist

- [ ] All workflow file SHAs verified against upstream tags (recorded in lessons)
- [ ] No job-level `permissions:` block was modified
- [ ] No `NPM_TOKEN` / `NODE_AUTH_TOKEN` references added
- [ ] OIDC `registry-url: https://registry.npmjs.org` preserved in release.yml + ci.yml
- [ ] DCO check still active
- [ ] license-boundary lint runs in CI
- [ ] exact-pin-guard runs in CI
- [ ] No workflow file renamed
- [ ] M1 invariants still hold (release-readiness.test.ts green)

#### E2E Runtime Validation

**File**: `tests/skill-bdd/workflow-action-pinning.test.ts` (NEW)

| E2E Test                                                        | What It Proves                                        | Pass Criteria                                                                                                        |
| --------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `every workflow action use is SHA-pinned with tag-as-comment`   | Supply-chain integrity at the GitHub Actions boundary | walks all `.github/workflows/*.yml`; every `uses:` matches the SHA regex; fails with `file:line` and offending value |
| `tag-as-comment present for every SHA pin`                      | Human readability + Dependabot compatibility          | every SHA-pinned `uses:` has `# vN` comment                                                                          |
| `OIDC trusted publishing preserved across release.yml + ci.yml` | No NPM_TOKEN regression                               | both contain `registry-url: https://registry.npmjs.org`; neither contains `NPM_TOKEN` or `NODE_AUTH_TOKEN`           |

#### Smoke Tests

- [ ] `pnpm -r test` green (incl. new workflow-action-pinning test)
- [ ] `cat .github/SECURITY-CONTACTS` shows expected content
- [ ] `grep -c '<sandbox-acct>' docs/slo/lessons/hulumi-m3.md` returns `0`
- [ ] `grep 'post-v1.0.0 follow-up' SECURITY.md` returns no match
- [ ] `git diff --stat` for M2 shows only the M2 allow-list files
- [ ] `pnpm run format:check` clean
- [ ] `git status` shows no untracked test artifacts

#### Evidence Log

| Step                                 | Command / Check                                                                   | Expected Result                                        | Actual Result | Pass/Fail | Notes                       |
| ------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------- | --------- | --------------------------- |
| Repo hygiene                         | `git status` + branch check                                                       | on M1's task branch or successor; clean tree           |               |           |                             |
| Baseline tests                       | `pnpm -r test`                                                                    | all green (M1's 470)                                   |               |           |                             |
| BDD test created                     | `tests/skill-bdd/workflow-action-pinning.test.ts`                                 | fails for the right reason on current tag-pinned state |               |           |                             |
| Implementation: SHA fetches          | `gh api repos/.../git/ref/tags/<tag>` per unique action                           | each returns a 40-char SHA                             |               |           | record each pair in lessons |
| Implementation: workflow edits       | per workflow file                                                                 | every `uses:` line uses `<sha> # <tag>` form           |               |           |                             |
| Implementation: SECURITY-CONTACTS    | author file                                                                       | follows k8s convention; links GHSA + deferred email    |               |           |                             |
| Implementation: account ID redaction | edit hulumi-m3.md                                                                 | `<sandbox-acct>` → `123456789012`                      |               |           |                             |
| Implementation: scratch decision     | keep-or-delete                                                                    | rationale in M2 lessons                                |               |           |                             |
| Formatter                            | `pnpm run format:check`                                                           | clean                                                  |               |           |                             |
| Typecheck / build                    | `pnpm -r typecheck && pnpm -r build`                                              | clean                                                  |               |           |                             |
| Static analyzer                      | `pnpm -r lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard` | clean                                                  |               |           |                             |
| Full tests                           | `pnpm -r test`                                                                    | green incl. new workflow-pinning test                  |               |           |                             |
| Resource-bound verification          | N/A                                                                               | —                                                      |               |           | no new resources            |
| Invariant verification               | new BDD walks all four workflow files                                             | all `uses:` lines match SHA-pin regex                  |               |           |                             |
| Debugger / state inspection          | spot-check 2-3 SHAs against upstream                                              | match                                                  |               |           |                             |
| Test artifact cleanup                | `git status`                                                                      | no untracked                                           |               |           |                             |
| .gitignore review                    | review                                                                            | no new patterns expected                               |               |           |                             |
| Compatibility checks                 | per checklist                                                                     | no regressions                                         |               |           |                             |

#### Definition of Done

- Every `uses:` line in all four workflow YAMLs is SHA-pinned with a tag-as-comment
- Every SHA verified against upstream tag (recorded in lessons)
- `.github/SECURITY-CONTACTS` exists; SECURITY.md:23 reconciled
- `<sandbox-acct>` does not appear in `docs/slo/lessons/hulumi-m3.md`
- Research-scratch decision executed; rationale in lessons
- New BDD test green; all M1 tests still pass
- Full lint/typecheck/test/format gate green
- Compatibility checklist complete
- Lessons + completion files written
- Milestone Tracker updated

#### Post-Flight

Documentation updates:

- **README.md**: none.
- **docs/ARCHITECTURE.md**: none.
- **SECURITY.md**: line 23 reconciled.
- **CHANGELOG.md**: one-line note under [1.2.0] "Changed" about SHA-pinning + SECURITY-CONTACTS.

#### Notes

- The four workflow files have ~40 `uses:` lines total. Cache per-tag SHAs in working notes to avoid duplicate `gh api` calls.

---

### Milestone 3 — `Integration test surface battle-test`

**Goal**: Convert the four stubbed integration tests from "tautologies that pass when run" into genuine coverage. Specifically: fully implement #26 (cooling-off-diff fixtures) as local unit tests, fully implement #30 (SCP teardown verification) as a fixture-replay test, and convert #21 + #24 from `expect(true).toBe(true)` bodies to honest `it.todo("see roadmap")` slots backed by a new `docs/integration-testing-roadmap.md` that captures what each test SHOULD verify.

**Context**: The audit's specific complaint was "stubbed integration tests masquerading as coverage" — the README sells SLSA-L3 + integration coverage, four `expect(RUN_INTEGRATION).toBe(true)` slots undercut that. There are two honest fixes: (a) write the real implementation, or (b) make the gap explicit. M3 does both — (a) for #26 + #30 because they're feasible without the full Pulumi+AWS deploy rig, and (b) for #21 + #24 because they need a real Pulumi Cloud + sandbox AWS deploy harness that's a separate workstream. The roadmap doc becomes the contract for that follow-up.

**Carmack-style reliability goal**: "No silent failure" + "Make invalid states unrepresentable". Tautological tests that pass-by-design are silent failures (they look green when they're empty); replacing them with `it.todo()` makes the gap impossible to misread. Fixture-replay for SCP teardown encodes the control flow as an executable invariant — refactors that break the teardown sequence will fail the test, even without `requires-aws-org-write` permissions.

**Important design rule**: **Don't fake real AWS coverage.** A test that runs against fixtures + skips against real AWS is fine; a test that _claims_ to run against real AWS but actually does `expect(true).toBe(true)` is the anti-pattern. After M3, every `it()` either: runs real local code, runs real AWS-API code under `HULUMI_INTEGRATION=1` and skips otherwise, or is `it.todo()` with a roadmap pointer.

**Refactor budget**: `Targeted refactor permitted for replacing stub test bodies with real implementations / it.todo + roadmap pointers; must not refactor production code.`

#### Contract Block

| Field                                  | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inputs                                 | `scripts/cooling-off-diff.mjs` (existing); `docs/deployment/scp-guide.md` + `docs/deployment/scp.json` (existing); the two stub test files (existing)                                                                                                                                                                                                                                                                                                                                                                                                           |
| Outputs                                | One new test file for cooling-off-diff fixtures; SCP-teardown logic exposed as a typed module with an accompanying fixture-replay test; #21 + #24 stubs converted to `it.todo` with roadmap link; new `docs/integration-testing-roadmap.md`; CHANGELOG entry                                                                                                                                                                                                                                                                                                    |
| Interfaces touched                     | `tests/scripts/` (new sub-package OR existing tests/skill-bdd extension); `packages/baseline/tests/integration/account-foundation.integration.test.ts`; `packages/drift/tests/integration/drift-classify.integration.test.ts`; `docs/integration-testing-roadmap.md` (NEW); `CHANGELOG.md`                                                                                                                                                                                                                                                                      |
| Files allowed to change                | `packages/baseline/tests/integration/account-foundation.integration.test.ts`, `packages/drift/tests/integration/drift-classify.integration.test.ts`, `tests/skill-bdd/cooling-off-diff.test.ts` (NEW), `tests/skill-bdd/fixtures/cooling-off-diff/` (NEW directory of synthetic fixtures), `tests/skill-bdd/scp-teardown.test.ts` (NEW), `tests/skill-bdd/fixtures/scp-teardown/` (NEW directory of recorded AWS responses), `docs/integration-testing-roadmap.md` (NEW), `CHANGELOG.md`, `docs/ARCHITECTURE.md` (one-line update on test-architecture section) |
| Files to read before changing anything | `scripts/cooling-off-diff.mjs` (full); `docs/deployment/scp-guide.md`; `docs/deployment/scp.json`; the two existing integration test files; `packages/drift/src/adapters/cloudtrail.ts` (to understand what the integration test would assert against); `packages/baseline/src/aws/account-foundation.ts` (to understand the deployed-state shape)                                                                                                                                                                                                              |
| New files allowed                      | The four NEW listed above (test files + fixture directories), plus the roadmap doc                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| New dependencies allowed               | `none` (fixtures are inert JSON/YAML; tests use existing vitest + node fs)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Migration allowed                      | `no`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Compatibility commitments              | M1 + M2 invariants preserved (release-readiness.test.ts and workflow-action-pinning.test.ts both green); `HULUMI_INTEGRATION=1` skip-gate behavior preserved; `cooling-off-diff.mjs` CLI surface unchanged.                                                                                                                                                                                                                                                                                                                                                     |
| Resource bounds introduced/changed     | cooling-off-diff fixture set: ≤ 20 fixtures (hard limit 50, fixture-loader rejects past 50 with diagnostic); SCP teardown poll loop: max 10 polls (hard limit 12, hard-fail with explicit message).                                                                                                                                                                                                                                                                                                                                                             |
| Invariants/assertions required         | (1) `cooling-off-diff.mjs` returns exit 0 on no bumps; (2) returns exit 1 on a too-recent bump; (3) returns exit 0 on an aged-enough bump; (4) returns exit 2 on malformed lockfile; (5) SCP teardown phase machine cannot transition `Idle → Detached` directly (must pass `DetachInFlight`); (6) `it.todo` count for #21 + #24 stubs is exactly 7 (3 drift + 3 account-foundation + 1 teardown variant — match the existing stub count).                                                                                                                      |
| Debugger / inspection expectation      | For cooling-off-diff: capture exit code + stdout for each fixture run, record in lessons. For SCP teardown: log the phase transitions per test, verify against expected sequence.                                                                                                                                                                                                                                                                                                                                                                               |
| Static analysis gates                  | Same as M1/M2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Forbidden shortcuts                    | NO making the cooling-off-diff fixtures match production lockfile shapes byte-for-byte (synthesize the minimum); NO running the SCP teardown against real AWS Organizations (fixture-replay only); NO `vi.mock` of the AWS SDK at test-import time (use AWS SDK Client Mock or recorded fixtures); NO making `it.todo` slots empty — each must include a one-line "see docs/integration-testing-roadmap.md#section" pointer; NO touching production source under `packages/*/src/`.                                                                             |
| Data classification                    | `Public` — fixtures contain synthetic data; recorded AWS responses are scrubbed of account IDs / ARNs / per-org details.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Proactive controls in play             | OWASP Proactive Controls C5 (Validate All Inputs — fixture-loader rejects > 50 fixtures); C9 (Implement Security Logging — phase-transition logging in SCP teardown test); CSA CCM `IVS-04` (Secure SDLC — explicit test coverage for supply-chain code).                                                                                                                                                                                                                                                                                                       |
| Abuse acceptance scenarios             | `tm-pre-public-launch-abuse-3: malformed lockfile bypasses cooling-off` — see BDD row "abuse case: malformed lockfile" below. **N/A for the rest** of the abuse-case classes — no new endpoints, IPC handlers, file writes outside repo, subprocess invocations, or outbound requests in production paths.                                                                                                                                                                                                                                                      |

#### Out of Scope / Must Not Do

- Real Pulumi Cloud + sandbox AWS deploys for #21 / #24 (deferred to follow-up runbook tracked via the new roadmap doc)
- Real `aws organizations attach-policy` against a real org (out of scope; #30 is fixture-replay only)
- Touching `packages/*/src/` (this milestone is test-only + a roadmap doc)
- Bumping any `@pulumi/*` version
- Rewriting `cooling-off-diff.mjs` (only test it as a black box via subprocess)
- Adding any new runtime dependency
- Renaming any existing file (only adding NEW files)

#### Pre-Flight

1. Complete the Global Entry Rules.
2. Read M1 + M2 lessons; apply: format-after-edit; check-tags-before-history-edits; comment-strip in YAML matching; redact runbook meta-references; annotated-tag-dereferencing pattern (referenced for M4).
3. Read all listed files.
4. Copy the Evidence Log template into this milestone section.
5. Re-state the milestone constraints before coding.

#### Files Allowed To Change

| File                                                                         | Planned Change                                                                                                                                                                                               |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tests/skill-bdd/cooling-off-diff.test.ts`                                   | NEW: vitest test that runs `scripts/cooling-off-diff.mjs` as a subprocess against synthetic lockfile fixtures, asserts exit code + stdout per scenario.                                                      |
| `tests/skill-bdd/fixtures/cooling-off-diff/`                                 | NEW directory: 8-12 synthetic lockfile pairs covering: no-bump, too-recent-major, aged-major, too-recent-minor, aged-minor, too-recent-patch, aged-patch, malformed-yaml, missing-package, version-rollback. |
| `tests/skill-bdd/scp-teardown.test.ts`                                       | NEW: vitest test that imports a NEW `tests/skill-bdd/scp-teardown-harness.ts` exposing the teardown phase machine, asserts phase transitions against fixture-replayed AWS Organizations responses.           |
| `tests/skill-bdd/fixtures/scp-teardown/`                                     | NEW: recorded AWS Organizations API response JSONs for happy + failure paths.                                                                                                                                |
| `tests/skill-bdd/scp-teardown-harness.ts`                                    | NEW: pure-function teardown phase machine derived from `docs/deployment/scp-guide.md`'s manual procedure. Imports no AWS SDK; takes a typed "AWS responder" interface so tests inject fixtures.              |
| `packages/baseline/tests/integration/account-foundation.integration.test.ts` | Replace the 3 tautological `it()` bodies with `it.todo()` carrying explicit `// see docs/integration-testing-roadmap.md#account-foundation` comments.                                                        |
| `packages/drift/tests/integration/drift-classify.integration.test.ts`        | Same — replace the 4 tautological bodies with `it.todo()` + roadmap pointers.                                                                                                                                |
| `docs/integration-testing-roadmap.md`                                        | NEW: captures what each currently-stubbed integration test SHOULD verify, what credentials it needs, the expected wall-clock cost, the cleanup invariant, and a tracking issue link.                         |
| `CHANGELOG.md`                                                               | One-line entry under [1.2.0] "Changed" about the test-surface battle-test.                                                                                                                                   |
| `docs/ARCHITECTURE.md`                                                       | One-line update on the Test Architecture section noting the new fixture-replay tests.                                                                                                                        |

#### Step-by-Step

1. Write BDD tests first for the cooling-off-diff fixtures. Confirm fails (no fixtures yet).
2. Author 8-12 synthetic lockfile fixtures covering the scenarios above. Make BDD tests pass.
3. Write BDD test for SCP teardown phase machine (against not-yet-existing harness). Confirm fails.
4. Author the teardown harness as a pure-function module derived from `scp-guide.md`. Take a typed `AwsOrganizationsResponder` interface; tests inject fixtures.
5. Make the SCP teardown BDD pass.
6. Convert #21 + #24 stub bodies to `it.todo()` with roadmap pointers.
7. Author `docs/integration-testing-roadmap.md`.
8. Update `CHANGELOG.md` + `docs/ARCHITECTURE.md`.
9. Run the full lint/typecheck/test/format gate.
10. Verify `git status` clean; complete the Self-Review Gate.

#### BDD Acceptance Scenarios

**Feature: Integration test surface battle-test**

| Scenario                                                             | Category            | Given                                                                        | When                                          | Then                                                                            |
| -------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------- |
| cooling-off-diff returns 0 on no-bump                                | happy path          | base = head lockfile (no @pulumi/\* changes)                                 | run `cooling-off-diff.mjs base head`          | exit code 0                                                                     |
| cooling-off-diff returns 1 on too-recent major bump                  | invalid input       | head bumps `@pulumi/aws` to a release published < 72h ago                    | run script                                    | exit code 1, stdout names the offending package                                 |
| cooling-off-diff returns 0 on aged major bump                        | happy path          | head bumps to a release published > 72h ago                                  | run script                                    | exit code 0                                                                     |
| cooling-off-diff returns 1 on too-recent patch bump                  | invalid input       | head bumps with patch < 24h                                                  | run script                                    | exit code 1                                                                     |
| cooling-off-diff returns 0 on aged patch bump                        | happy path          | patch ≥ 24h old                                                              | run script                                    | exit code 0                                                                     |
| cooling-off-diff returns 2 on malformed lockfile                     | dependency failure  | head is malformed YAML                                                       | run script                                    | exit code 2; fail-closed                                                        |
| cooling-off-diff bound: ≤ 50 fixtures                                | resource bound      | fixture loader walks fixture dir                                             | walks > 50 entries                            | rejects with diagnostic listing the offending files                             |
| SCP teardown happy path: Idle → Attached → DetachInFlight → Detached | happy path          | fresh state with attached SCP                                                | run teardown harness with happy-path fixtures | phase sequence = expected; final state = Detached                               |
| SCP teardown rejects illegal transition                              | assertion violation | state = Idle                                                                 | call advance(Detached)                        | harness throws "illegal transition" with phase context                          |
| SCP teardown poll exhausted                                          | resource bound      | fixtures replay 12 polls without completion                                  | run teardown                                  | hard-fail with explicit message naming the last seen phase                      |
| #21 / #24 stubs are it.todo                                          | compatibility       | `pnpm -r test` runs                                                          | the previously-tautological `it()` slots      | now report as `todo` (vitest), not `passed`                                     |
| `it.todo` slots reference the roadmap                                | compatibility       | grep the two stub files                                                      | extract the test-context comments             | every `it.todo` carries a `docs/integration-testing-roadmap.md#…` link          |
| abuse case: malformed lockfile (`tm-pre-public-launch-abuse-3`)      | abuse case          | a PR submits a deliberately malformed `pnpm-lock.yaml` to bypass cooling-off | the cooling-off-diff CI step runs             | exit code 2 (fail-closed); merge blocked; PR cannot bypass via parse-error path |

#### Regression Tests

- M1's release-readiness.test.ts — green (atomic version + per-package shape unchanged).
- M2's workflow-action-pinning.test.ts — green (no workflow YAML touched in M3).
- All other tests in `pnpm -r test` — green.

#### Compatibility Checklist

- [ ] M1 invariants still hold
- [ ] M2 invariants still hold
- [ ] `cooling-off-diff.mjs` CLI surface unchanged
- [ ] `HULUMI_INTEGRATION=1` skip-gate preserved (the `it.todo` slots never run, regardless of env)
- [ ] No production source under `packages/*/src/` modified
- [ ] No new runtime dependency added
- [ ] No `@pulumi/*` version touched
- [ ] `docs/deployment/scp-guide.md` and `scp.json` unchanged

#### E2E Runtime Validation

**Files**: `tests/skill-bdd/cooling-off-diff.test.ts`, `tests/skill-bdd/scp-teardown.test.ts`

| E2E Test                                                           | What It Proves                                                       | Pass Criteria                                                                                                                     |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `cooling-off-diff returns expected exit code per fixture`          | Supply-chain gate behavior is testable + regressions caught          | 8-12 fixtures × { exit code, stdout substring } match expectations                                                                |
| `SCP teardown phase machine respects illegal-transition invariant` | Manual-procedure invariants are now executable                       | every fixture-replay run produces the documented phase sequence; illegal transitions throw; poll-exhaustion fails with diagnostic |
| `#21 + #24 stubs report as todo, not passed`                       | The audit's "tautologies masquerading as coverage" finding is closed | `pnpm -r test` reports a `todo` count ≥ 7 for these test files                                                                    |

#### Smoke Tests

- [ ] `pnpm -r test` green (with new tests + `it.todo` slots)
- [ ] `pnpm -r test` skips `HULUMI_INTEGRATION` paths cleanly when env unset
- [ ] `cat docs/integration-testing-roadmap.md` shows the per-test contract
- [ ] `git diff --stat` for M3 shows only the M3 allow-list files
- [ ] `pnpm run format:check` clean
- [ ] `git status` clean

#### Evidence Log

| Step                                    | Command / Check                                                                   | Expected Result                                      | Actual Result | Pass/Fail | Notes |
| --------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------- | --------- | ----- |
| Repo hygiene                            | `git status`                                                                      | clean tree on M2's task branch                       |               |           |       |
| Baseline tests                          | `pnpm -r test`                                                                    | M2's 473 green                                       |               |           |       |
| BDD test created (cooling-off)          | `tests/skill-bdd/cooling-off-diff.test.ts`                                        | fails before fixtures land                           |               |           |       |
| Implementation: cooling-off fixtures    | 8-12 fixtures                                                                     | tests pass against scripts/cooling-off-diff.mjs      |               |           |       |
| BDD test created (SCP teardown)         | `tests/skill-bdd/scp-teardown.test.ts`                                            | fails before harness lands                           |               |           |       |
| Implementation: scp-teardown-harness.ts | NEW                                                                               | phase machine + injected responder                   |               |           |       |
| BDD test passes (SCP teardown)          | `tests/skill-bdd/scp-teardown.test.ts`                                            | green                                                |               |           |       |
| #21 / #24 stubs converted               | grep for `expect(RUN_INTEGRATION).toBe(true)`                                     | match count = 0                                      |               |           |       |
| Roadmap doc                             | `docs/integration-testing-roadmap.md`                                             | NEW; covers each `it.todo` slot                      |               |           |       |
| Formatter                               | `pnpm run format:check`                                                           | clean                                                |               |           |       |
| Typecheck / build                       | `pnpm -r typecheck && pnpm -r build`                                              | clean                                                |               |           |       |
| Static analyzer                         | `pnpm -r lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard` | clean                                                |               |           |       |
| Full tests                              | `pnpm -r test`                                                                    | green; `it.todo` count ≥ 7 across the two stub files |               |           |       |
| Resource-bound verification             | fixture loader > 50 fixtures                                                      | rejects with diagnostic                              |               |           |       |
| Invariant verification                  | SCP phase machine                                                                 | illegal transition throws                            |               |           |       |
| Debugger / state inspection             | log phase transitions per test                                                    | sequence matches expected                            |               |           |       |
| Test artifact cleanup                   | `git status`                                                                      | no untracked                                         |               |           |       |
| .gitignore review                       | review                                                                            | no new patterns expected                             |               |           |       |
| Compatibility checks                    | per checklist                                                                     | no regressions                                       |               |           |       |

#### Definition of Done

- `tests/skill-bdd/cooling-off-diff.test.ts` exists with ≥ 8 scenarios, all green
- `tests/skill-bdd/scp-teardown.test.ts` + harness exist; phase-machine invariants encoded
- `expect(RUN_INTEGRATION).toBe(true)` removed from both integration stubs
- 7 `it.todo` slots in the two stub files (3 drift + 3 account-foundation + 1 teardown variant)
- `docs/integration-testing-roadmap.md` exists and references each `it.todo`
- M1 + M2 BDD tests still pass
- Full lint/typecheck/test/format gate green
- Compatibility checklist complete
- Lessons + completion files written
- Milestone Tracker updated

#### Post-Flight

Documentation updates:

- **README.md**: none.
- **docs/ARCHITECTURE.md**: one-line update to Test Architecture section.
- **CHANGELOG.md**: one-line entry under [1.2.0] "Changed".
- **docs/integration-testing-roadmap.md**: NEW.

#### Notes

- The roadmap doc is the contract for a follow-up runbook (real Pulumi+AWS deploys for #21 + #24). Suggest spinning that as `hulumi-integration-real-aws` when capacity allows.
- The fixture-replay pattern for SCP teardown is reusable — M4 may extend it for any other "manual procedure deserves an executable invariant" gap.

---

### Milestone 4 — `Supply-chain guard extension + dead-code cleanup`

**Goal**: Close the remaining two P2 supply-chain hygiene findings — extend `scripts/exact-pin-guard.mjs` to cover `@hulumi/drift`'s runtime deps (the `@aws-sdk/*` set + `p-timeout` + `simple-git`), and remove the unused `packages/baseline/src/aws/probes/poll.ts` escape hatch (issue #28).

**Context**: `@aws-sdk/client-secrets-manager@3.1041.0` is already in the pin-guard ALLOWED list (added in the K8s runbook for `@hulumi/k8s-baseline`); drift's three sibling `@aws-sdk/*` runtime deps + `p-timeout` + `simple-git` are not. Drift is shipped to npm with these deps; integrity-hash pinning the lockfile entries gives the same defense-in-depth as the existing `@pulumi/*` set. The `poll.ts` file at `packages/baseline/src/aws/probes/poll.ts` is documented in ARCHITECTURE.md as a "vitest-pool dynamic-resource escape hatch" but `grep -rn pollUntil` over the repo shows zero callers — it's dead code in a security-first repo.

**Carmack-style reliability goal**: "Prefer deleting complexity over adding new layers" + "No silent failure". Dead code is silent failure with extra steps — a future refactor that breaks `poll.ts` won't fail any test or lint. Removal is the right move; the supply-chain gotcha narrative (vitest pool + pulumi.dynamic.Resource) survives in ARCHITECTURE.md prose without an unused implementation. Pin-guard extension makes drift's package-tarball provenance match the rest of the four-package set.

**Important design rule**: **The pin-guard's ALLOWED table is the SINGLE source of truth for "which deps must match exact integrity hash."** Adding a new dep to the table is a deliberate review step. Removing one is too. The pin-guard's existing message "(N @pulumi/\* deps match pinned hashes)" undersells the actual coverage; M4 fixes the message to reflect the broader scope.

**Refactor budget**: `Targeted refactor permitted for extending exact-pin-guard.mjs message text and ALLOWED entries; targeted removal of packages/baseline/src/aws/probes/poll.ts. Must not break existing CLI surface (no flag changes); must not modify the lockfile content.`

#### Contract Block

| Field                                  | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Inputs                                 | `scripts/exact-pin-guard.mjs` (existing); `pnpm-lock.yaml` (read-only); `packages/drift/package.json` (read-only — to confirm dep set); `packages/baseline/src/aws/probes/poll.ts` (to be removed); `docs/ARCHITECTURE.md` (update narrative)                                                                                                                                                                                                                                                    |
| Outputs                                | Pin-guard ALLOWED extended with 5 new entries (3 `@aws-sdk/*` + `p-timeout` + `simple-git`); `poll.ts` removed; ARCHITECTURE.md narrative updated; CHANGELOG entry                                                                                                                                                                                                                                                                                                                               |
| Interfaces touched                     | `scripts/exact-pin-guard.mjs` (ALLOWED table + status message); `packages/baseline/src/aws/probes/poll.ts` (REMOVED); `docs/ARCHITECTURE.md` (lines 56 + 170 narrative); `CHANGELOG.md`                                                                                                                                                                                                                                                                                                          |
| Files allowed to change                | `scripts/exact-pin-guard.mjs`, `docs/ARCHITECTURE.md`, `CHANGELOG.md`, `tests/skill-bdd/exact-pin-guard.test.ts` (NEW BDD test for the script)                                                                                                                                                                                                                                                                                                                                                   |
| Files to read before changing anything | `scripts/exact-pin-guard.mjs`, `pnpm-lock.yaml` (to extract integrity hashes), `packages/drift/package.json`, `packages/baseline/src/aws/probes/poll.ts` (to confirm no callers — already verified), `docs/ARCHITECTURE.md` (lines 56 + 170)                                                                                                                                                                                                                                                     |
| New files allowed                      | `tests/skill-bdd/exact-pin-guard.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Files removed                          | `packages/baseline/src/aws/probes/poll.ts` (verified zero in-repo callers)                                                                                                                                                                                                                                                                                                                                                                                                                       |
| New dependencies allowed               | `none`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Migration allowed                      | `no` (dep removal is not a migration — there are no callers)                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Compatibility commitments              | `pnpm-lock.yaml` content unchanged; `@pulumi/*` versions unchanged; no production source under `packages/*/src/` modified except the `poll.ts` removal; no public TypeScript exports affected (`pollUntil` is not in any `index.ts`); existing pin-guard CLI surface (no flags) preserved.                                                                                                                                                                                                       |
| Resource bounds introduced/changed     | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Invariants/assertions required         | Pin-guard exits 0 when all ALLOWED entries match; exits 1 on any mismatch (existing). New BDD test asserts: (a) ALLOWED contains the 5 new drift entries; (b) `poll.ts` does not exist; (c) the pin-guard status message names the actual count.                                                                                                                                                                                                                                                 |
| Debugger / inspection expectation      | When extending ALLOWED, copy each integrity hash directly from `pnpm-lock.yaml` (don't hand-compute). Cross-check by running `pnpm run lint:exact-pin-guard` after each addition.                                                                                                                                                                                                                                                                                                                |
| Static analysis gates                  | Same as M1/M2/M3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Forbidden shortcuts                    | NO bumping any pinned version; NO removing existing ALLOWED entries; NO adding entries without copy-pasting the integrity hash from the lockfile; NO renaming the script's CLI; NO changing the script's exit-code semantics; NO touching `pnpm-lock.yaml`; NO removing the `pollUntil` rationale from `docs/ARCHITECTURE.md` (the gotcha narrative survives, just without the implementation pointer); NO adding tests against the removed `poll.ts` to assert its absence in some fragile way. |
| Data classification                    | `Public`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Proactive controls in play             | OWASP Proactive Controls C2 (Leverage Security Frameworks — exact-pin + integrity hashes); CSA CCM `IVS-04` (Secure SDLC); SLSA Build L3 supply-chain posture (preserved + extended)                                                                                                                                                                                                                                                                                                             |
| Abuse acceptance scenarios             | `tm-pre-public-launch-abuse-4: silent dependency substitution on @aws-sdk/* publish` — if an attacker compromises one of drift's npm-published `@aws-sdk/*` versions and republishes a malicious tarball with the same version string, the integrity hash mismatch fails the pin-guard at CI. **N/A for the rest** of the abuse-case classes — no new endpoints, IPC handlers, file writes outside repo, subprocess invocations, or outbound requests.                                           |

#### Out of Scope / Must Not Do

- Refactoring `cooling-off-diff.mjs` (the malformed-lockfile fail-open issue from M3 lessons stays a follow-up — different script, different scope)
- Bumping any pinned version (would conflate hardening with supply-chain churn)
- Adding any new runtime dependency to any of the four packages
- Modifying `packages/*/src/` other than the `poll.ts` removal
- Adding a "git pre-commit hook" or workflow change (the pin-guard already runs in CI)
- Touching the M2 SHA-pin enforcement (workflow-action-pinning.test.ts)
- Replacing the script with a TypeScript-based reimplementation (it's `.mjs` for a reason — runs without a build step in any pre-flight context)

#### Pre-Flight

1. Complete the Global Entry Rules.
2. Read M1 + M2 + M3 lessons; apply: format-after-edit; check tags before treating CHANGELOG as historical; redact runbook meta-references; subprocess-test pattern from M3 cooling-off; use `it.todo` honestly.
3. Read all listed files.
4. Copy the Evidence Log template into this milestone section.
5. Re-state the milestone constraints before coding.

#### Files Allowed To Change

| File                                       | Planned Change                                                                                                                                                                                                                                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/exact-pin-guard.mjs`              | Add 5 ALLOWED entries: `@aws-sdk/client-cloudtrail`, `@aws-sdk/client-sts`, `@aws-sdk/credential-providers`, `p-timeout`, `simple-git`. Update the status message to reflect the actual count + scope ("N pinned deps match expected integrity hashes").                                       |
| `packages/baseline/src/aws/probes/poll.ts` | REMOVED (zero callers).                                                                                                                                                                                                                                                                        |
| `docs/ARCHITECTURE.md`                     | Line 56 — drop the row pointing at `probes/poll.ts`. Line 170 — keep the gotcha narrative ("`pulumi.dynamic.Resource` does NOT work under vitest's worker pool — use `dependsOn` instead. Documented gotcha"); drop the "; escape hatch at `packages/baseline/src/aws/probes/poll.ts`" suffix. |
| `CHANGELOG.md`                             | One-line entry under [1.2.0] "Changed".                                                                                                                                                                                                                                                        |
| `tests/skill-bdd/exact-pin-guard.test.ts`  | NEW: BDD test that asserts (a) the 5 new drift entries are in ALLOWED via subprocess + grep, (b) running the script against the current lockfile exits 0, (c) `poll.ts` no longer exists.                                                                                                      |

#### Step-by-Step

1. Write the BDD test first; confirm fails (no entries yet, poll.ts still present).
2. Read each integrity hash from `pnpm-lock.yaml` for the 5 new deps.
3. Add the 5 ALLOWED entries to `scripts/exact-pin-guard.mjs`. Update the status message.
4. Run `pnpm run lint:exact-pin-guard` — must succeed with the new count.
5. Remove `packages/baseline/src/aws/probes/poll.ts`. Confirm `pnpm -r build` + `pnpm -r typecheck` still pass (no callers).
6. Update `docs/ARCHITECTURE.md` lines 56 + 170.
7. Update CHANGELOG.md.
8. Run the BDD test — must pass.
9. Run the full lint/typecheck/test/format gate.
10. Verify `git status` clean; complete the Self-Review Gate.

#### BDD Acceptance Scenarios

**Feature: Pin-guard extension + dead-code removal**

| Scenario                                                             | Category      | Given                                                                                                             | When                                                     | Then                                                                                                        |
| -------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Pin-guard ALLOWED includes drift's runtime deps                      | happy path    | repo at end of M4                                                                                                 | grep ALLOWED in `scripts/exact-pin-guard.mjs`            | finds 5 new entries (3 `@aws-sdk/*`, `p-timeout`, `simple-git`)                                             |
| Pin-guard runs successfully against the current lockfile             | happy path    | repo at end of M4                                                                                                 | run `pnpm run lint:exact-pin-guard`                      | exit 0; status message names the new count                                                                  |
| `poll.ts` no longer exists                                           | happy path    | repo at end of M4                                                                                                 | `existsSync('packages/baseline/src/aws/probes/poll.ts')` | false                                                                                                       |
| Pin-guard fails closed on any integrity-hash drift                   | invalid input | a regression edits ALLOWED's `@pulumi/aws` integrity hash to a wrong value                                        | run pin-guard                                            | exit 1; failure message names the offending dep                                                             |
| Pin-guard does not check `@hulumi/*` deps (out of scope)             | compatibility | repo at end of M4                                                                                                 | grep ALLOWED                                             | no entries with `@hulumi/` prefix (they're publish targets, not transitive deps)                            |
| `pnpm -r build` + `pnpm -r typecheck` pass after `poll.ts` removal   | compatibility | repo at end of M4                                                                                                 | run both                                                 | clean                                                                                                       |
| ARCHITECTURE.md gotcha narrative survives                            | compatibility | repo at end of M4                                                                                                 | grep ARCHITECTURE.md for "vitest" + "dynamic.Resource"   | match present (just without the `probes/poll.ts` pointer)                                                   |
| abuse case: silent dep substitution (`tm-pre-public-launch-abuse-4`) | abuse case    | a malicious actor republishes one of drift's `@aws-sdk/*` deps under the same version string with different bytes | a Hulumi CI run starts                                   | the pnpm-lock.yaml's integrity field changes; pin-guard detects mismatch; CI fails with named offending dep |

#### Regression Tests

- M1's release-readiness.test.ts — green.
- M2's workflow-action-pinning.test.ts — green.
- M3's cooling-off-diff.test.ts + scp-teardown.test.ts — green.
- All other tests in `pnpm -r test` — green.

#### Compatibility Checklist

- [ ] M1 + M2 + M3 invariants still hold
- [ ] `pnpm-lock.yaml` content unchanged (no version bumps)
- [ ] `pnpm run lint:exact-pin-guard` exits 0
- [ ] `pnpm -r build` + `pnpm -r typecheck` pass after poll.ts removal
- [ ] No production source under `packages/*/src/` modified other than `poll.ts` deletion
- [ ] No new runtime dependency
- [ ] No new pin-guard flag or CLI change
- [ ] `docs/ARCHITECTURE.md` gotcha narrative preserved (escape-hatch pointer dropped only)

#### E2E Runtime Validation

**File**: `tests/skill-bdd/exact-pin-guard.test.ts`

| E2E Test                                          | What It Proves                                        | Pass Criteria                                                                                                                                                                           |
| ------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pin-guard succeeds against the current lockfile` | The extended ALLOWED matches `pnpm-lock.yaml` reality | subprocess exit 0; stdout matches expected status format                                                                                                                                |
| `pin-guard fails on a regressed integrity hash`   | Tamper detection works end-to-end                     | (this scenario is exercised manually in the lessons file via temporary edit; not encoded as test fixture because tampering scripts/exact-pin-guard.mjs in CI is hostile to other tests) |
| `poll.ts no longer exists`                        | Dead-code removal is durable                          | `existsSync` returns false                                                                                                                                                              |
| `ALLOWED contains the 5 new entries`              | Pin-guard scope correctly extended                    | grep walks the script source and finds each `name: "<dep>"` line                                                                                                                        |

#### Smoke Tests

- [ ] `pnpm run lint:exact-pin-guard` exits 0; status message reflects new count
- [ ] `pnpm -r build` clean
- [ ] `pnpm -r typecheck` clean
- [ ] `pnpm -r test` green
- [ ] `git diff --stat` for M4 shows only the M4 allow-list files
- [ ] `pnpm run format:check` clean
- [ ] `git status` clean

#### Evidence Log

| Step                                      | Command / Check                                                                   | Expected Result                             | Actual Result | Pass/Fail | Notes            |
| ----------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------- | ------------- | --------- | ---------------- |
| Repo hygiene                              | `git status`                                                                      | clean                                       |               |           |                  |
| Baseline tests                            | `pnpm -r test`                                                                    | M3's full suite green                       |               |           |                  |
| BDD test created                          | `tests/skill-bdd/exact-pin-guard.test.ts`                                         | fails before extensions land                |               |           |                  |
| Implementation: integrity-hash extraction | grep `pnpm-lock.yaml` for 5 new deps                                              | each has integrity field                    |               |           |                  |
| Implementation: ALLOWED extension         | edit `scripts/exact-pin-guard.mjs`                                                | 5 new entries; status message updated       |               |           |                  |
| Implementation: poll.ts removal           | `git rm packages/baseline/src/aws/probes/poll.ts`                                 | clean removal                               |               |           |                  |
| Implementation: ARCHITECTURE.md update    | edit lines 56 + 170                                                               | gotcha narrative preserved; pointer dropped |               |           |                  |
| Pin-guard run                             | `pnpm run lint:exact-pin-guard`                                                   | exit 0; new status message                  |               |           |                  |
| Formatter                                 | `pnpm run format:check`                                                           | clean                                       |               |           |                  |
| Typecheck / build                         | `pnpm -r typecheck && pnpm -r build`                                              | clean (no callers of poll.ts)               |               |           |                  |
| Static analyzer                           | `pnpm -r lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard` | clean                                       |               |           |                  |
| Full tests                                | `pnpm -r test`                                                                    | green                                       |               |           |                  |
| Resource-bound verification               | N/A                                                                               | —                                           |               |           | no new resources |
| Invariant verification                    | BDD test                                                                          | passes                                      |               |           |                  |
| Debugger / state inspection               | spot-check 1-2 integrity hashes against lockfile                                  | match                                       |               |           |                  |
| Test artifact cleanup                     | `git status`                                                                      | no untracked                                |               |           |                  |
| .gitignore review                         | review                                                                            | no new patterns expected                    |               |           |                  |
| Compatibility checks                      | per checklist                                                                     | no regressions                              |               |           |                  |

#### Definition of Done

- 5 new entries added to `scripts/exact-pin-guard.mjs` ALLOWED (3 `@aws-sdk/*` + `p-timeout` + `simple-git`)
- Pin-guard status message updated to name the new count + scope
- `packages/baseline/src/aws/probes/poll.ts` removed
- `docs/ARCHITECTURE.md` updated (gotcha narrative preserved without the escape-hatch pointer)
- BDD test green
- M1 + M2 + M3 BDD tests still pass
- Full lint/typecheck/test/format gate green
- Compatibility checklist complete
- Lessons + completion files written
- Milestone Tracker updated

#### Post-Flight

Documentation updates:

- **README.md**: none.
- **docs/ARCHITECTURE.md**: lines 56 + 170 reconciled.
- **CHANGELOG.md**: one-line entry under [1.2.0] "Changed".

#### Notes

- The 5 new pin-guard entries are NOT cooling-off-gated — that gate applies only to `@pulumi/*` (per the M5 SECURITY.md policy). The pin-guard provides exact-pin + integrity-hash defense; cooling-off is a separate, complementary gate.
- A future enhancement could fold the M2 SHA-pinning of GitHub Actions into pin-guard.mjs as a unified script. M4 keeps them separate (BDD test for actions, script for npm deps) because the failure shapes are different.

---

<!-- Milestone M5 will be drafted after M4 is confirmed. -->

---

## 18. Documentation Update Table

| Milestone | ARCHITECTURE.md Update                                                                           | README.md Update                                          | .gitignore Update                                       | Other Docs                                                                                                                                                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1         | Line 7: drop `1.0.0-pre.1; first stable lands with the v1.2 train` for k8s-baseline; mark stable | v1.1.0 → v1.2.0; remove `(pre-release)` for k8s-baseline  | Add `package-lock.json`                                 | `CHANGELOG.md` k8s-baseline bump row                                                                                                                                                                                                                     |
| 2         | (none expected)                                                                                  | (none)                                                    | (none expected)                                         | `.github/SECURITY-CONTACTS` NEW; workflow YAMLs SHA-pinned; `docs/slo/lessons/hulumi-m3.md` redacted                                                                                                                                                     |
| 3         | Test Architecture section: integration tests now real, not stubbed                               | (none)                                                    | If test fixtures land in `tests/fixtures/.tmp/`, ignore | `packages/baseline/tests/integration/account-foundation.integration.test.ts` and `packages/drift/tests/integration/drift-classify.integration.test.ts` updated; `tests/scripts-cooling-off-diff.test.ts` and `tests/deployment-scp-teardown.test.ts` NEW |
| 4         | "Forbidden-shortcut lints-as-tests" — note exact-pin-guard now covers actions                    | (none)                                                    | (none)                                                  | `scripts/exact-pin-guard.mjs` extended; `packages/baseline/src/aws/probes/poll.ts` decision recorded                                                                                                                                                     |
| 5         | (none)                                                                                           | Scenario count narrative reconciled (5 → 7 AWS scenarios) | (none)                                                  | `docs/v2-migration.md`, `docs/cookbooks/migration-{from-terraform,mid-stack-adoption}.md`, `docs/faq.md` NEW                                                                                                                                             |

---

## 19. Optional Fast-Fail Review Prompt for Agents

Per v4 template Section 19. Use before writing production code in any milestone.

---

## 20. Source Basis

This runbook is the v4 evolution of the Hulumi project's existing v3 runbooks ([`docs/slo/completed/RUNBOOK-hulumi.md`](../completed/RUNBOOK-hulumi.md), [`docs/slo/completed/RUNBOOK-hulumi-github.md`](../completed/RUNBOOK-hulumi-github.md), and follow-ons). It is the first runbook in this repo authored against v4. v3 remains in place as a historical artifact for runbooks already authored against it; v4 is the canonical going-forward template `/slo-plan` produces.
