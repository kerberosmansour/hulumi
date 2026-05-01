# [Runbook Title] — [Project Name] (AI-First Runbook v4)

> **Purpose**: [One-sentence description of what this runbook accomplishes end-to-end.]
> **Audience**: AI coding agents first, humans second. The template is designed to reduce ambiguity, suppress scope drift, and force the same code-quality discipline from any capable agent.
> **Core philosophy**: Prefer automated guardrails over developer intention. Prefer direct inspection over guessing. Prefer executable assumptions over comments. Prefer bounded design over silent growth. Prefer evidence over claims.
> **How to use**: Work through milestones sequentially. Before each milestone, complete the Global Entry Protocol. After each, complete the Global Exit Protocol. Never skip ahead. Never silently widen scope. Treat this document as an execution contract, not as guidance that can be loosely interpreted.
> **Prerequisite reading**: [ARCHITECTURE.md](../ARCHITECTURE.md), [README.md](../README.md), [docs/LOOPS-ENGINEERING.md](LOOPS-ENGINEERING.md), [docs/LOOPS-BUSINESS.md](LOOPS-BUSINESS.md), [relevant design docs].

> **What's new in v4 vs v3**: explicit Carmack-style reliability rules (debugger-first inspection, mandatory static analysis, assertion-driven invariants, bounded resource design, "make invalid states unrepresentable"); extended Contract Block with resource bounds + invariants + debugger expectation + static-analysis gates; richer Lessons / Completion / Self-Review templates capturing assumptions, invariants, and resource-bound evidence. v3's Carry-forward from prior retros section is preserved verbatim.

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

| Field | Value |
|---|---|
| Runbook ID | `[short-id]` |
| Project name | `[project]` |
| Primary stack | `[e.g., Rust + Tauri + React + TypeScript]` |
| Primary package/app names | `[package names]` |
| Prefix for tests and lesson files | `[prefix]` |
| Default unit test command | `[command]` |
| Default integration/BDD test command | `[command]` |
| Default E2E/runtime validation command | `[command]` |
| Default build/boot command | `[command]` |
| Default formatter command | `[command]` |
| Default static analysis / lint command | `[command]` |
| Default dependency / security audit command | `[command]` |
| Default debugger or state-inspection tool | `[debugger / IDE / command]` |
| Allowed new dependencies by default | `none` |
| Schema/config migration allowed by default | `no` |
| Public interfaces stable by default | `yes` |

### Public interfaces that must remain stable unless explicitly listed otherwise

- `[API / command / event / route / public type / state file / config key]`
- `[API / command / event / route / public type / state file / config key]`

---

## 2. Milestone Tracker

This is the single source of truth for progress. Update as each milestone completes.

| # | Milestone | Status | Started | Completed | Lessons File | Completion Summary |
|---|---|---|---|---|---|---|
| 1 | `[Milestone title]` | `not_started` | | | | |
| 2 | `[Milestone title]` | `not_started` | | | | |
| 3 | `[Milestone title]` | `not_started` | | | | |

<!-- Status values: not_started | in_progress | blocked | done -->
<!-- Lessons files go in docs/lessons/<prefix>-m<N>.md -->
<!-- Completion summaries go in docs/completion/<prefix>-m<N>.md -->

---

## 3. End-to-End Architecture Diagram

Provide a complete architecture diagram of the proposed end state after all milestones are complete. This diagram should be understandable at a glance and serve as the north star for every milestone.

### Diagram Requirements

- Show all major actors, components, services, and processes.
- Show data flow direction with labeled arrows.
- Show persistence boundaries (databases, file systems, caches).
- Show trust boundaries and external integration points.
- Show API, IPC, event, queue, and file boundaries.
- Distinguish between what exists today (solid lines) and what will be built (dashed lines).
- Include a legend.

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        [System Name]                                │
│                                                                     │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────┐              │
│  │  [Actor] │───▶│  [Component] │───▶│  [Component]  │              │
│  └──────────┘    └──────────────┘    └───────────────┘              │
│                                                                     │
│  Legend:  ─── existing   - - - new   ═══ external   ▶ data flow     │
│           ║ trust boundary                                          │
└─────────────────────────────────────────────────────────────────────┘
```

[Replace the above with the actual architecture diagram for this runbook. Use ASCII art or Mermaid syntax.]

### Component Summary Table

| Component | Responsibility | Existing/New/Changed | Milestone | Key Interfaces |
|---|---|---|---|---|
| `[Component name]` | `[What it does]` | `[existing/new/changed]` | M[N] | `[APIs, events, commands]` |
| `[Component name]` | `[What it does]` | `[existing/new/changed]` | M[N] | `[APIs, events, commands]` |

### Data Flow Summary

| Flow | From | To | Protocol/Mechanism | Bounded? | Failure Mode | Milestone |
|---|---|---|---|---|---|---|
| `[Flow name]` | `[Source]` | `[Target]` | `[IPC/HTTP/event/file]` | `[yes/no]` | `[behavior on failure]` | M[N] |

---

## 4. Carmack-Style Development Best Practices

These rules apply to every language and every milestone. They are how we get the same code-quality discipline from every capable agent.

### 4.1 Inspect State, Do Not Guess

Logging is useful for production observability, but it is not a substitute for interactive debugging and state inspection.

| Requirement | Project-Specific Tool/Command | Evidence Required |
|---|---|---|
| Interactive debugger available | `[debugger / IDE / command]` | `[how verified]` |
| Breakpoints can be set in changed code | `[how]` | `[note if needed]` |
| Runtime state can be inspected | `[how]` | `[what was inspected]` |
| Tests can be debugged | `[how]` | `[test/debug command]` |

Agent rules:

- If a failure is not explained by compiler, test assertion, or stack trace, use a debugger or equivalent state-inspection tool before making speculative changes.
- Do not add permanent print/debug statements to production paths.
- If logging is added, it must be structured, intentional, and useful in production.
- Remove temporary debug output before completing the milestone.

### 4.2 Static Analysis Is Mandatory

Every milestone must run the project's static-analysis and lint tools. Treat tool findings as design feedback, not personal criticism.

| Check | Command | Required Level | Notes |
|---|---|---|---|
| Formatter | `[formatter command]` | must pass | No style-only churn outside changed files unless allowed |
| Type check / compile check | `[typecheck command]` | must pass | Must include all changed targets |
| Static analyzer / linter | `[lint command]` | must pass | Warnings fail CI unless explicitly waived |
| Security/dependency audit | `[audit command]` | must pass or documented exception | Required if dependency graph changes |

Waiver rule: a static-analysis waiver must be local, minimal, and justified in code or the Evidence Log. Global disables are forbidden unless explicitly approved in the milestone contract.

### 4.3 Assertions Are Executable Comments

Assertions document and enforce assumptions. Use them to catch incorrect mental models early.

Use assertions for:

- internal invariants
- unreachable states that should be impossible by design
- size and capacity assumptions
- ordering assumptions
- preconditions inside internal APIs
- postconditions after transformations

Do **not** use assertions for:

- normal user-input validation
- expected network, filesystem, or external service failures
- recoverable business-rule failures

Assertion policy:

| Assertion Type | Use For | Production Behavior |
|---|---|---|
| Development-only assertion | Expensive or diagnostic invariant checks | Disabled or lower-cost in production if the language supports it |
| Runtime assertion | Invariants that must never be violated | Active in production |
| Contract validation | Public boundary checks | Return structured errors, not crashes |

### 4.4 Prefer Bounded Resources Over Silent Growth

Unbounded collections, queues, retries, caches, recursion, and concurrency hide architectural failures until production. Every milestone must identify newly introduced or modified resource growth.

| Resource | Expected Bound | Hard Limit | Behavior At Limit | Evidence/Test |
|---|---:|---:|---|---|
| `[queue/cache/list/etc.]` | `[N]` | `[N]` | `[reject/backpressure/error]` | `[test]` |

Rules:

- If a maximum is known, encode it.
- If a maximum is not known, document why and add observability around growth.
- Dynamic collections must have explicit expected-size assumptions in tests or assertions.
- Retries must be bounded.
- Queues must have backpressure, rejection, or shedding behavior.
- Caches must have eviction or explicit lifecycle rules.

### 4.5 Make Invalid States Unrepresentable

Use the language's strongest available mechanisms to encode domain constraints.

| Concept | Prefer | Avoid |
|---|---|---|
| Domain IDs | dedicated ID type / value object | raw string/int everywhere |
| State machines | enum / sum type / tagged union / classes with restricted transitions | loose string states |
| Optional data | explicit optional / maybe type | sentinel values |
| Validated strings | constrained constructor | free-form string reuse |
| Units | unit-specific type | raw numbers without unit |
| Protocol messages | schema-validated typed messages | ad hoc maps/dictionaries |

Agent rule: before implementing a feature, identify at least one invalid state the design should prevent. If none exists, state why.

### 4.6 Preserve Compatibility Until Explicitly Broken

Compatibility checks are part of correctness. Must verify:

- public APIs
- CLI / commands / events / routes
- persisted state and migration behavior
- configuration keys and defaults
- user-facing behavior
- integration contracts

A milestone may break compatibility only if the contract block explicitly says so and includes migration, documentation, and tests.

### 4.7 Prefer Small, Local, Reviewable Changes

Optimize for the minimal safe change.

- Change only allowed files.
- Prefer extending existing patterns over inventing new abstractions.
- Do not rewrite subsystems unless the contract explicitly permits it.
- Do not rename public symbols for style reasons.
- Do not combine refactor and feature work unless the refactor is required and listed.

### 4.8 No Silent Failure

The following are forbidden in production paths unless explicitly permitted:

- swallowed exceptions / errors
- silent fallbacks that hide broken behavior
- default values that mask corruption
- fake implementations after tests pass
- temporary mocks in real code paths
- TODO / placeholder logic
- commented-out dead code
- hard-coded secrets or unsafe defaults

All failure modes must be visible through one or more of:

- returned structured error
- user-visible error state
- structured log / event / metric
- retry with bounded policy
- explicit degraded-mode behavior

---

## 5. High-Level Design for State Modeling / Formal Verification

Fill this section before implementation when the system includes concurrency, distributed state, resource ownership, ordering guarantees, retries, queues, idempotency, persistence recovery, or irreversible actions.

For simple CRUD with no meaningful concurrency or failure-recovery risk, mark `N/A` and explain why. TLA+ is one option for formal verification (`/slo-tla` is the SLO skill that drives it); state-machine modeling, property-based testing, and contract tests are equally valid substitutes for simpler systems.

### 5.1 System Goal

[One paragraph: correctness-focused goal, not implementation detail.]

### 5.2 Main Components

| Component | Protocol Role | Key State (durable / volatile) | Visible Actions |
|---|---|---|---|
| `[component]` | `[role]` | `[state]` | `[actions]` |

### 5.3 Abstract State

The minimum set of state variables needed to capture correctness. Flag anything likely to cause state explosion.

| Variable | Abstract Type | Why Needed | Bound | Explosion Risk |
|---|---|---|---|---|
| `[var]` | `[type]` | `[property]` | `[N]` | `[low/medium/high]` |

### 5.4 Actions / Transitions

| Action | Preconditions | State Updates | Failure / Interleaving Notes |
|---|---|---|---|
| `[action]` | `[preconditions]` | `[updates]` | `[notes]` |

### 5.5 Safety Properties

- **No duplicate ownership**: `[specific invariant]`
- **No lost accepted work**: `[specific invariant]`
- **No invalid persisted state**: `[specific invariant]`
- **Bound never exceeded silently**: `[specific invariant]`

### 5.6 Liveness / Progress Assumptions

- **Eventual completion or visible rejection**: `[fairness assumption]`
- **Bounded retry exhaustion**: `[fairness assumption]`

### 5.7 Simplifications

| Simplification | Why It Still Catches Relevant Bugs |
|---|---|
| `[simplification]` | `[reason]` |

---

## 6. Global Execution Rules

These rules apply to every milestone without exception.

### 6.1 Stay inside scope

- Only change files listed in the current milestone unless a listed step explicitly requires one additional file.
- Do not refactor unrelated code.
- Do not rename public APIs, commands, routes, events, persisted-state shapes, or config keys unless the milestone explicitly says so.
- Do not introduce a new dependency unless the milestone explicitly allows it.
- Do not change database schema, file formats, or migration behavior unless the milestone explicitly includes migration work and migration tests.

### 6.2 Tests define the contract

- Write BDD tests before production code.
- Write E2E runtime validation stubs before production code.
- Confirm new tests fail for the right reason before implementing.
- A milestone is not done when code compiles. It is done when the declared contract is satisfied and evidence is recorded.

### 6.3 Assertions and invariants are mandatory where assumptions matter

- Every milestone that introduces or modifies internal invariants, ordering assumptions, preconditions, or postconditions must encode them as assertions per §4.3.
- Every milestone must list the invariants/assertions added or strengthened in its Contract Block and in the lessons file.

### 6.4 Resource bounds are mandatory where growth is possible

- Every milestone that introduces or modifies a queue, cache, list, retry policy, recursive call, or concurrent-task pool must declare expected bound, hard limit, and behavior-at-limit per §4.4.
- Unbounded growth is allowed only if explicitly justified in the Contract Block and observability is added in the same milestone.

### 6.5 Static analysis must pass

- Every milestone must run formatter, typecheck/compile check, static analyzer/linter, and (if dependencies changed) security/dependency audit before close-out.
- Waivers must be local, minimal, and justified in code or the Evidence Log.

### 6.6 Debugger over guessing

- If a failure is not fully explained by compiler, test assertion, or stack trace, use the project's debugger (Section 4.1) before making speculative changes.
- Document non-obvious state inspections in the lessons file under "Debugging/inspection notes".

### 6.7 No placeholders in production paths

The following are not allowed unless explicitly permitted in the milestone:

- TODO or placeholder logic in production code
- silent fallbacks that hide errors
- swallowed errors without structured logging or user-visible handling
- fake implementations left in place after tests pass
- commented-out dead code
- temporary mocks in production paths
- hard-coded secrets, test keys, or unsafe defaults

### 6.8 Preserve backwards compatibility

Every milestone must explicitly verify that previously working user flows, commands, routes, persisted state, and public interfaces still work unless the milestone explicitly replaces them.

### 6.9 Prefer the smallest safe change

- Prefer narrow, local modifications over broad rewrites.
- Prefer extending existing patterns over inventing new abstractions.
- Prefer deleting complexity over adding new layers.
- If a refactor is required, keep it minimal and directly justified by the milestone goal.

### 6.10 Record evidence, not claims

All meaningful checks must be recorded in the milestone Evidence Log:

- command run
- relevant file or test
- expected result
- actual result
- pass/fail
- notes

Never claim a command passed unless it ran or the limitation is explicitly stated.

### 6.11 Keep .gitignore current and clean up test artifacts

- If a milestone introduces new build outputs, generated files, test fixtures, scratch directories, or tool-specific caches, add matching patterns to `.gitignore` before committing.
- Review `.gitignore` at the end of every milestone for staleness — remove patterns that no longer apply.
- Never commit test output data, temporary fixtures, scratch files, or generated artifacts to source control.
- Every test that creates files on disk must clean up after itself (`tempdir`, `tempfile`, `afterEach`, equivalent). Tests must not leave residual data in the working tree.
- Record the `.gitignore` review in the Evidence Log.

---

## 7. Global Entry Rules (Pre-Milestone Protocol)

Do this before every milestone.

1. Read the lessons file from the previous milestone, if one exists. Apply any design corrections, naming rules, test-strategy improvements, and failure-mode coverage it calls for before writing new code.
2. **(v4 carry-forward)** If `/slo-execute` is the driver, run pre-flight Step 1.5 — read open prior-retro issues filtered by this runbook's prefix and surface them as scope candidates with a suggested lane (`micro | milestone | fresh-runbook`). Carry-forward never auto-extends the allow-list.
3. Read the current milestone fully: goal, context, contract block, out-of-scope, file list, BDD scenarios, regression tests, E2E tests, smoke tests, definition of done.
4. Run the full existing test suite and confirm it passes. Record the baseline in the Evidence Log.
   ```
   [unit test command]
   [integration/BDD test command]
   [E2E test command]
   ```
   If any tests fail before you start, stop and fix the baseline first. Do not begin a milestone on a red baseline.
5. Read the files listed in "Files Allowed To Change" and "Files To Read Before Changing Anything". Understand their current shape before editing.
6. Update the Milestone Tracker: set the current milestone status to `in_progress` and record the Started date.
7. Create BDD test files first.
8. Create E2E runtime validation test stubs first.
9. Copy the milestone's Evidence Log template into working notes and begin filling it as work happens.
10. Re-state the milestone constraints in your own words before coding:
    - goal
    - allowed files
    - forbidden changes
    - compatibility requirements
    - dependency / migration rules
    - resource bounds (per §4.4)
    - invariants/assertions required (per §4.3)
    - static-analysis gates (per §4.2)
    - tests that must pass
    - Definition of Done

---

## 8. Global Exit Rules (Post-Milestone Protocol)

Do this after every milestone.

1. Run formatter.
2. Run typecheck / build check.
3. Run static analyzer / linter (warnings fail unless waived per §4.2).
4. If the dependency graph changed, run the security/dependency audit.
5. Run the full test suite. Every pre-existing test must still pass. Every new BDD scenario must pass.
6. Run the milestone's E2E runtime validation tests.
7. Verify the app builds and boots to a usable state.
8. Run the smoke tests listed in the milestone. Check off each item in the runbook.
9. Verify backward compatibility for all items listed in the milestone Compatibility Checklist.
10. Verify resource bounds (§4.4) and assertion/invariant additions (§4.3) are encoded as documented.
11. Complete the Self-Review Gate (Section 14).
12. Remove temporary debug code, mocks, placeholders, and commented-out dead code.
13. **Clean up test artifacts**: run `git status` and confirm no untracked test artifacts.
14. **Review .gitignore**: ensure new outputs have patterns; remove stale entries.
15. Update [ARCHITECTURE.md](ARCHITECTURE.md) following the Documentation Update Table.
16. Update [README.md](../README.md) if user-facing capabilities changed.
17. Write a lessons-learned file at `docs/lessons/<prefix>-m<N>.md`.
18. Write a completion summary at `docs/completion/<prefix>-m<N>.md`.
19. Update the Milestone Tracker: set status to `done`, record Completed date, fill in the lessons and completion summary paths.
20. **(v4 lessons loop)** If `/slo-retro` is the driver, run the issue-filing flow per [skills/slo-retro/references/issue-filing-discipline.md](../skills/slo-retro/references/issue-filing-discipline.md). Always write the lessons file first; issue filing is strictly additive.
21. Re-read the next milestone with fresh eyes and record any assumption changes in the lessons file.

---

## 9. Background Context

### Current State

[Describe the current state of the system. What exists today? What works? List major subsystems and their capabilities. Be specific — reference file paths, module names, major entry points, and concrete data where relevant.]

### Problem

[List the specific gaps this runbook addresses. Number each gap and describe it concretely — reference specific code, UI behavior, test gaps, and user impact. Avoid vague generalities.]

1. **[Gap title]**: [Description referencing concrete code and behavior.]
2. **[Gap title]**: [Description.]

### Target Architecture

```
[ASCII diagram or description of the target end state after all milestones are complete.
Show major components, data flow, boundaries, persistence, and integration points.]
```

### Key Design Principles

These are system-wide rules the AI agent must follow when making implementation decisions.

1. **[Principle name]**: [Explanation.]
2. **[Principle name]**: [Explanation.]
3. **[Principle name]**: [Explanation.]

### What to Keep

Explicitly list existing subsystems, patterns, and code that must not be changed or broken.

- [Subsystem / module / pattern to preserve]
- [Subsystem / module / pattern to preserve]

### What to Change

List the specific files, modules, or behaviors that will be modified across milestones.

- **[File or module]** — [summary of change]
- **[File or module]** — [summary of change]

### Global Red Lines

These are forbidden unless explicitly overridden inside a milestone.

- No unrelated refactors
- No new dependencies
- No schema migrations
- No config key renames
- No public API/event/route renames
- No production placeholders
- No silent error swallowing
- No secrets in source control
- No test output data committed to source control
- No unbounded resource growth without justification (§4.4)
- No new public boundary without input validation and structured error returns (§4.8)

---

## 10. Carry-forward from prior retros

> **Optional section.** Existing runbooks without this section remain valid; `/slo-execute` Step 1.5 falls back to a live `gh issue list --label retro-derived` query. Authors of new runbooks SHOULD include this section once `/slo-retro` files at least one retro-derived issue against this runbook's prefix.
>
> **What this section is**: a table of open prior-retro issues (filed by `/slo-retro` for this runbook's prefix) that should be considered as scope candidates at each milestone start. Each row has a suggested **lane** so small follow-ups stay small and large follow-ups do not silently widen scope.
>
> **What this section is NOT**: an auto-extension of any milestone's allow-list. The user decides each milestone's bounds. Carry-forward is informational input to that decision, not a substitute for it.

| Issue | Title | Suggested lane | Suggested milestone | Status |
|---|---|---|---|---|
| (e.g., #42) | (one-line summary) | `micro` \| `milestone` \| `fresh-runbook` | (M3 \| M4 \| next runbook) | (open \| closed-via-PR-pending \| transferred) |

### Lane vocabulary

- **`micro`** — safe, bounded follow-up. Can be folded into the current or immediate next milestone without widening scope (typical: doc polish, small test gap, naming-convention drift).
- **`milestone`** — real milestone-sized work. Warrants its own milestone in this runbook or the next; do not bolt onto an unrelated milestone.
- **`fresh-runbook`** — material scope or risk shift. Do NOT widen the current runbook silently; spin a separate runbook (typical: new architecture work, regulated-domain question, multi-week effort).

### How `/slo-execute` reads this section

`/slo-execute M<N>` pre-flight Step 1.5 prefers rows from this section over a live `gh` query when the rows are fresh. Rows with `status: closed-via-PR-pending` or `transferred` surface with annotation; the user decides whether to track. Inline output caps at the top 3 items.

### How `/slo-resume` reads this section

`/slo-resume` reads the milestone tracker plus this section to emit one next action with a lane. Top-3 inline cap; remainder summarized as `... N more`.

### Backward compat

Runbooks without this section continue to work; `/slo-execute` and `/slo-resume` fall back to the live `gh` query and the tracker-only orientation respectively.

---

## 11. BDD and Runtime Validation Rules

Every milestone follows these rules.

### 11.1 Write Tests Before Production Code

For each milestone:

1. Read the BDD acceptance table.
2. Create the test file(s) first.
3. Confirm the tests fail for the expected reason.
4. Write production code to make the tests pass.
5. Re-run tests after any refactor.

### 11.2 Required Test Coverage Categories

Every milestone must explicitly cover the categories that apply:

- happy path
- invalid input
- empty / first-run state
- dependency failure / partial failure
- retry or rollback behavior
- concurrency / race behavior
- resource-limit behavior (§4.4)
- assertion/invariant violation (§4.3)
- persistence / restore behavior
- backward compatibility behavior
- abuse case (security-relevant milestones — see threat model)

If a category does not apply, state why.

### 11.3 Scenario Format

```text
Scenario: [name]
Given [precondition]
When [action]
Then [observable outcome]
And [failure/resource/compatibility expectation if relevant]
```

In code:

```rust
#[test]
fn descriptive_test_name() {
    // Given: [precondition]
    // When: [action]
    // Then: [expected outcome]
}
```

```typescript
it("descriptive test name", () => {
  // Given: [precondition]
  // When: [action]
  // Then: [expected outcome]
});
```

### 11.4 Test File Naming

| Layer | Convention | Location |
|---|---|---|
| Backend unit tests | `#[cfg(test)] mod tests` inside the source file | Same file as production code |
| Backend integration/BDD tests | `tests/<prefix>_<feature>.rs` | `src-tauri/tests/` (or equivalent) |
| Frontend unit tests | `<module>.test.ts` | Co-located with source file |
| Frontend page tests | `<Page>.test.tsx` | Co-located with component |
| Scenario / e2e tests | `tests/scenarios/<prefix>_scenario_<name>.rs` | `src-tauri/tests/scenarios/` (or equivalent) |
| E2E runtime validation (backend) | `tests/e2e_<prefix>_m<N>.rs` | `src-tauri/tests/` (or equivalent) |
| E2E runtime validation (frontend) | `e2e/<feature>.e2e.test.tsx` | `src/e2e/` |

### 11.5 Test Artifact Cleanup Rules

Every test that creates files, directories, or temporary data on disk must follow these rules:

1. **Use temporary directories**: prefer `tempdir()`, `tempfile::TempDir`, `tmp` from the test framework, or OS-provided temp locations. Never write test output into the source tree.
2. **Clean up on completion and failure**: use RAII (`Drop`), `afterEach`/`afterAll` hooks, or `defer` statements to ensure cleanup runs even when tests fail.
3. **No residual state**: after the full test suite runs, `git status` must show no untracked files from test execution.
4. **Dedicated output directories**: if a test must write to a project-relative path, that directory must be in `.gitignore` and tests must clean it between runs.
5. **CI parity**: cleanup behavior must be identical locally and in CI.

### 11.6 End-to-End Runtime Validation

Every milestone must include E2E tests that go beyond compilation and verify the system works correctly at runtime. These tests prove:

1. the app boots without errors
2. runtime contracts are met across IPC/API boundaries
3. BDD scenarios work at runtime, not just in isolation
4. there are no runtime panics, unhandled rejections, or silent failures
5. degraded states behave safely and visibly
6. resource bounds (§4.4) hold under stress paths exercised in tests

### 11.7 E2E Test Design Rules

1. Test runtime behavior, not just types.
2. Test the full stack where possible.
3. Test degraded and failure states, not just the happy path.
4. Assert against observable behavior.
5. Prefer at least one test that crosses the backend/frontend boundary when both layers changed.
6. Prefer at least one test that exercises a resource-bound boundary when one was introduced or modified.

---

## 12. Dependency, Migration, and Refactor Policy

### 12.1 Dependency policy

A new dependency is allowed only if the milestone explicitly includes:

- package/crate name
- version/range if known
- why existing code/tools are insufficient
- security and maintenance rationale
- license rationale if applicable
- build/runtime cost rationale
- tests covering the integration
- rollback/removal path if the dependency proves unsuitable

### 12.2 Migration policy

Any schema, config, or persisted-state change requires:

- migration plan
- backward compatibility strategy
- migration tests
- rollback strategy if relevant
- documentation updates
- old-version fixture or compatibility test where possible

### 12.3 Refactor budget

Each milestone must state exactly one of the following:

- `No refactor permitted beyond direct implementation`
- `Minimal local refactor permitted in listed files only`
- `Targeted refactor permitted for [specific reason]`

---

## 13. Evidence Log Template

Copy this table into each milestone section and fill it in during execution.

| Step | Command / Check | Expected Result | Actual Result | Pass/Fail | Notes |
|---|---|---|---|---|---|
| Baseline tests | `[command]` | all pre-existing tests green | | | |
| BDD tests created | `[files]` | fail for expected reason | | | |
| E2E stubs created | `[files]` | fail for expected reason | | | |
| Implementation | `[summary]` | contract satisfied | | | |
| Formatter | `[command]` | clean | | | |
| Typecheck / build check | `[command]` | clean | | | |
| Static analyzer / linter | `[command]` | clean (no new warnings) | | | |
| Dependency audit (if deps changed) | `[command]` | pass or documented exception | | | |
| Full tests | `[command]` | green | | | |
| E2E runtime | `[command]` | green | | | |
| Build/boot | `[command]` | boots cleanly | | | |
| Smoke tests | `[steps]` | all checked | | | |
| Resource-bound verification | `[bound + test]` | bound encoded; test exercises near-limit behavior | | | |
| Invariant/assertion verification | `[invariant + test]` | encoded; test triggers under fault injection if applicable | | | |
| Debugger / state inspection | `[what was inspected]` | hypothesis confirmed before code change | | | |
| Test artifact cleanup | `git status` | no untracked test artifacts | | | |
| .gitignore review | review `.gitignore` | patterns current, no stale entries | | | |
| Compatibility checks | `[checks]` | no regressions | | | |

---

## 14. Self-Review Gate

Before marking a milestone done, answer every question.

- Did I change only allowed files?
- Did I avoid unrelated refactors?
- Did I preserve all listed public interfaces and compatibility requirements?
- Did I add tests for failure modes, not just happy paths?
- Did I add or update assertions/invariants where assumptions matter?
- Did I bound new resource growth or document why it cannot be bounded?
- Did I run formatter, typecheck, and static analysis to a clean result (or document a local minimal waiver)?
- Did I use a debugger or state-inspection tool when failures were not explained by compiler/test/stack-trace?
- Did I remove temporary debug code, mocks, placeholders, and commented-out dead code?
- Did I update documentation to match the implementation?
- Is every assumption either verified or explicitly documented as unresolved?
- Do all tests clean up their output artifacts? Does `git status` show a clean working tree?
- Is `.gitignore` up to date with any new generated files or build outputs?
- Is the milestone truly done according to its Definition of Done?

If any answer is "no", the milestone is not complete.

---

## 15. Lessons-Learned File Template

Path: `docs/lessons/<prefix>-m<N>.md`

```md
# Lessons Learned — <prefix> Milestone <N>

## What changed
- [summary]

## Design decisions and why
- [decision] — [reason]

## Assumptions verified
- [assumption] — [evidence]

## Assumptions still unresolved
- [assumption] — [risk / follow-up]

## Mistakes made
- [mistake]

## Root causes
- [root cause]

## What was harder than expected
- [note]

## Invariants/assertions added or strengthened
- [invariant]

## Resource bounds established or verified
- [bound]

## Debugging / inspection notes
- [what was inspected and what it revealed]

## Naming conventions established
- [types, files, tests, events, commands]

## Test patterns that worked well
- [pattern]

## Missing tests that should exist now
- [test]

## Rules for the next milestone
- [rule]

## Template improvements suggested
- [improvement]
```

---

## 16. Completion Summary Template

Path: `docs/completion/<prefix>-m<N>.md`

```md
# Completion Summary — <prefix> Milestone <N>

## Goal completed
- [what capability now exists]

## Files changed
- [file]

## Tests added
- [test file]

## Runtime validations added
- [e2e file]

## Static analysis and formatter evidence
- [command and result]

## Compatibility checks performed
- [check]

## Invariants/assertions added
- [invariant]

## Resource bounds added or verified
- [bound]

## Documentation updated
- [doc and section]

## .gitignore changes
- [patterns added or removed]

## Test artifact cleanup verified
- [confirmation that git status is clean after test run]

## Deferred follow-ups
- [follow-up]

## Known non-blocking limitations
- [limitation]
```

---

## 17. Milestone Plan

<!-- Copy the milestone template below for each milestone. -->

### Milestone N — `[Title]`

**Goal**: [One-sentence description of what this milestone accomplishes. What capability exists at the end that did not exist before?]

**Context**: [2–4 sentences describing the current state relevant to this milestone. Reference specific files, comments, interfaces, and why this change is needed.]

**Carmack-style reliability goal**: [Which guardrail is strengthened — debugger visibility, static analysis, assertions, bounded resources, type/schema safety, compatibility, etc.]

**Important design rule**: [One key design decision that must guide implementation.]

**Refactor budget**: `[No refactor permitted beyond direct implementation | Minimal local refactor permitted in listed files only | Targeted refactor permitted for ...]`

#### Contract Block

| Field | Value |
|---|---|
| Inputs | [user input, command input, event input, state input] |
| Outputs | [UI state, return values, persisted state, events] |
| Interfaces touched | [commands, APIs, routes, events, structs, files] |
| Files allowed to change | [explicit list] |
| Files to read before changing anything | [explicit list] |
| New files allowed | [explicit list or `none`] |
| New dependencies allowed | [explicit list or `none`] |
| Migration allowed | [`yes` or `no`] |
| Compatibility commitments | [what must still work] |
| Resource bounds introduced/changed | [bounds and behavior at limit, per §4.4] |
| Invariants/assertions required | [list, per §4.3] |
| Debugger / inspection expectation | [what must be inspectable, per §4.1] |
| Static analysis gates | [formatter / typecheck / linter / audit commands, per §4.2] |
| Forbidden shortcuts | [mocks in prod, TODOs, silent fallbacks, broad refactor, etc.] |
| Data classification (optional) | [Public / Internal / Confidential / Restricted — per project threat-model conventions] |
| Proactive controls in play (optional) | [OWASP Proactive Controls citations, e.g., C1, C5, C9] |
| Abuse acceptance scenarios (optional) | [`tm-<feature>-abuse-N: <description>` — mitigation noted in BDD] |

#### Out of Scope / Must Not Do

- [Explicit non-goal]
- [Explicit non-goal]

#### Pre-Flight

1. Complete the Global Entry Rules (Section 7).
2. Read `docs/lessons/<prefix>-m<N-1>.md` and apply relevant corrections.
3. Read the allowed files before editing.
4. Copy the Evidence Log template into this milestone section or working notes.
5. Re-state the milestone constraints before coding (include resource bounds, invariants, static-analysis gates).

#### Files Allowed To Change

| File | Planned Change |
|---|---|
| `[existing file path]` | [summary of change] |
| `[new file path if allowed]` | NEW: [what this file does] |
| `.gitignore` | Add patterns for any new generated files, build outputs, or test artifacts |

#### Step-by-Step

1. Write BDD test stubs first for all scenarios below.
2. Write E2E runtime validation stubs first for all tests below.
3. Encode declared invariants/assertions (§4.3) and resource bounds (§4.4) in tests or production code.
4. Implement the smallest safe change that satisfies the contract.
5. Make all BDD tests pass.
6. Run formatter, typecheck, static analyzer.
7. Run the full test suite.
8. Run E2E runtime validation.
9. **Verify test artifact cleanup**: `git status` confirms no untracked test output remains.
10. **Update .gitignore**: add patterns for any new generated files; remove stale ones.
11. Run smoke tests.
12. Complete the Self-Review Gate.

#### BDD Acceptance Scenarios

**Feature: [feature name]**

| Scenario | Category | Given | When | Then |
|---|---|---|---|---|
| [Scenario name] | happy path | [Precondition] | [Action] | [Expected outcome] |
| [Scenario name] | invalid input | [Precondition] | [Action] | [Expected outcome] |
| [Scenario name] | empty state | [Precondition] | [Action] | [Expected outcome] |
| [Scenario name] | partial failure | [Precondition] | [Action] | [Expected outcome] |
| [Scenario name] | resource bound | [Near limit] | [Operation] | [Bounded behavior] |
| [Scenario name] | assertion violation | [Invalid invariant state] | [Operation] | [Visible failure / contract error] |
| [Scenario name] | compatibility | [Old behavior/state] | [Operation] | [Still works] |

Add more rows as needed. If a category does not apply, state why under Notes.

#### Regression Tests

- [Existing test suite or feature that must still pass]
- [Specific edge case to verify]
- [Backward compatibility check]
- [Persistence/config/state compatibility check if relevant]

#### Compatibility Checklist

- [ ] [Public API/command still behaves the same]
- [ ] [Existing route/page still renders correctly]
- [ ] [Persisted state remains readable]
- [ ] [Existing tests for related features still pass]

#### E2E Runtime Validation

**File**: `[backend E2E test file path]`

| E2E Test | What It Proves | Pass Criteria |
|---|---|---|
| `[test_function_name]` | [Runtime behavior validated] | [Specific assertion criteria] |
| `[test_function_name]` | [Runtime behavior validated] | [Specific assertion criteria] |

**File**: `[frontend E2E test file path]`

| E2E Test | What It Proves | Pass Criteria |
|---|---|---|
| `[test name]` | [Runtime behavior validated] | [Specific assertion criteria] |

#### Smoke Tests

- [ ] [Manual verification step — what to do and what to observe]
- [ ] [Manual verification step]
- [ ] `[test command]` passes
- [ ] App launches without errors
- [ ] Static analysis passes
- [ ] `git status` shows no untracked test artifacts
- [ ] `.gitignore` covers all new generated files and build outputs

#### Evidence Log

| Step | Command / Check | Expected Result | Actual Result | Pass/Fail | Notes |
|---|---|---|---|---|---|
| Baseline tests | `[command]` | all green | | | |
| BDD tests created | `[files]` | fail for expected reason | | | |
| E2E stubs created | `[files]` | fail for expected reason | | | |
| Implementation | `[summary]` | contract satisfied | | | |
| Formatter | `[command]` | clean | | | |
| Typecheck / build check | `[command]` | clean | | | |
| Static analyzer / linter | `[command]` | clean | | | |
| Dependency audit (if deps changed) | `[command]` | pass or documented exception | | | |
| Full tests | `[command]` | green | | | |
| E2E runtime | `[command]` | green | | | |
| Build/boot | `[command]` | boots cleanly | | | |
| Smoke tests | `[steps]` | all checked | | | |
| Resource-bound verification | `[bound + test]` | bound encoded; test exercises near-limit | | | |
| Invariant/assertion verification | `[invariant + test]` | encoded; test triggers under fault injection if applicable | | | |
| Debugger / state inspection | `[what was inspected]` | hypothesis confirmed before code change | | | |
| Test artifact cleanup | `git status` | no untracked test artifacts | | | |
| .gitignore review | review `.gitignore` | patterns current, no stale entries | | | |
| Compatibility checks | `[checks]` | no regressions | | | |

#### Definition of Done

The milestone is done only when all of the following are true:

- all listed BDD scenarios pass
- all listed E2E runtime validations pass
- full existing test suite remains green
- formatter, typecheck, and static analyzer pass (or local minimal waiver justified)
- dependency audit passes if dependencies changed
- smoke tests are checked off
- compatibility checklist is complete
- declared resource bounds (§4.4) are encoded and tested
- declared invariants/assertions (§4.3) are encoded and tested
- no forbidden shortcuts remain in production code
- all tests clean up their output artifacts — `git status` is clean
- `.gitignore` is up to date with any new generated files or build outputs
- docs are updated to match implementation
- lessons file is written (including assumptions verified / unresolved, invariants, resource bounds, debugging notes)
- completion summary is written
- Milestone Tracker is updated

#### Post-Flight

Complete the Global Exit Rules above. Key documentation updates:

- **ARCHITECTURE.md**: [What to document]
- **README.md**: [What to update]
- **Other docs**: [What to update]

#### Notes

- [Why certain coverage categories do not apply]
- [Any explicit deferred work for future milestone]

---

<!-- Repeat the "### Milestone N" template for each subsequent milestone. -->

---

## 18. Documentation Update Table

Track which documents need updating per milestone.

| Milestone | ARCHITECTURE.md Update | README.md Update | .gitignore Update | Other Docs |
|---|---|---|---|---|
| 1 | [Section to add/update] | [Section to add/update] | [Patterns to add/remove] | [Section/file] |
| 2 | [Section to add/update] | [Section to add/update] | [Patterns to add/remove] | [Section/file] |
| 3 | [Section to add/update] | [Section to add/update] | [Patterns to add/remove] | [Section/file] |

---

## 19. Optional Fast-Fail Review Prompt for Agents

Use this before writing production code:

> Restate the milestone goal, allowed files, forbidden changes, compatibility requirements, dependency/migration rules, required tests, required runtime validation, resource bounds, invariants/assertions, static-analysis gates, debugger expectation, and the exact Definition of Done. Then list the smallest implementation approach that satisfies the contract without widening scope, and explain how the user-facing result reduces user decisions or reviewer work.

---

## 20. Source Basis

This template is the v4 evolution of `docs/runbook-template_v_3_template.md`. It folds in language-independent Carmack-style reliability controls (debugger-first inspection, mandatory static analysis, assertion-driven invariants, bounded resource design, "make invalid states unrepresentable", stricter evidence capture) on top of v3's SunLit-specific structure (carry-forward from prior retros, abuse-acceptance scenarios, Data classification + Proactive controls + threat-model integration). v3 remains in place as a historical artifact for runbooks already authored against it; v4 is the canonical going-forward template that `/slo-plan` produces.
