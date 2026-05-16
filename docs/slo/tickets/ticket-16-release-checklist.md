# Release Checklist Demo Gate - SLO Ticket Contract v1

> **Purpose**: Execute one issue-sized change with v4 SLO rigor, without requiring a full multi-milestone runbook.
> **Audience**: AI coding agents first, humans second.
> **Source template**: Derived from `docs/slo/templates/runbook-template_v_4_template.md`. Use the full v4 runbook when this contract cannot stay issue-sized.

---

## 1. Ticket Metadata

| Field                                       | Value                                                                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Ticket Contract ID                          | `ticket-16-release-checklist`                                                                                                              |
| Source tracker                              | `GitHub Issues`                                                                                                                            |
| Source issue                                | [#16](https://github.com/kerberosmansour/hulumi/issues/16)                                                                                 |
| Issue title                                 | `chore(skill): add a manual demo-gate checklist for fresh Claude Code session install + invoke`                                            |
| Labels                                      | `documentation`, `skill`, `release`                                                                                                        |
| Assignee / owner                            | `kerberosmansour`                                                                                                                          |
| Target branch                               | `ticket/16-release-checklist`                                                                                                              |
| Primary stack                               | Markdown docs, Node 20 CLI smoke, GitHub CLI attestation verification                                                                       |
| Default formatter command                   | `pnpm run format:check`                                                                                                                    |
| Default typecheck / build command           | `N/A - docs-only change; no TypeScript or package build surface changed`                                                                   |
| Default static analysis / lint command      | `pnpm run lint:license-boundary`                                                                                                           |
| Default unit / BDD command                  | `test -f docs/release-checklist.md && rg -n --fixed-strings "[release-checklist.md](./release-checklist.md)" docs/development.md`         |
| Default runtime validation command          | `rg -n "fresh Claude Code session|/hulumi-threat-model aws-multi-account-baseline|gh attestation verify" docs/release-checklist.md`        |
| Default dependency / security audit command | `N/A - no dependency changes`                                                                                                              |
| Default debugger or state-inspection tool   | `N/A - markdown-only release checklist; shell probes are sufficient`                                                                       |
| Public interfaces stable by default         | `yes - docs-only release process guidance`                                                                                                 |
| Allowed new dependencies by default         | `none`                                                                                                                                     |
| Schema/config migration allowed by default  | `no`                                                                                                                                       |

### Public interfaces that must remain stable unless explicitly listed otherwise

- Package names and atomic six-package release set stay unchanged.
- `release:verify-attestations` command semantics stay unchanged.
- `/hulumi-threat-model <scenario-id>` skill invocation stays unchanged.

---

## 2. Sizing Gate

| Check                                          | Answer                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| User-visible outcome fits in one sentence      | yes - add a manual pre-tag release checklist covering the skill demo gate and provenance verification |
| Expected changed files <= 8                    | yes                                                                 |
| New public surfaces <= 1                       | yes - one new docs page                                             |
| No schema migration unless explicitly approved | yes                                                                 |
| No cross-subsystem rewrite                     | yes                                                                 |
| Can be reviewed as one PR                      | yes                                                                 |
| Requires full v4 runbook instead               | no - docs-only checklist ticket                                     |

---

## 3. Issue Context

### Problem

Issue #16 asks for a maintainer-facing release checklist because the M1 verification path did not exercise the exact fresh Claude Code install-and-invoke flow before release. The repo has CLI-level skill tests and release attestation commands, but no single pre-tag manual gate tying together the fresh skill install, CLI smoke, and six-package tarball provenance verification.

Issue excerpt, fenced as tracker input:

~~~text
Add a docs/release-checklist.md with manual-gate items the maintainer should run before tagging a release.
~~~

### Acceptance Criteria From Issue

- [ ] `docs/release-checklist.md` exists and is referenced from `docs/development.md` Releasing.
- [ ] The checklist includes the install-and-invoke-in-fresh-session step.
- [ ] The checklist includes a CLI smoke.
- [ ] The checklist includes `gh attestation verify` for each tarball.

### Non-Goals

- Do not automate Claude Code session testing in CI.
- Do not change release workflow YAML, npm package contents, package versions, or attestation implementation.
- Do not add dependencies or alter the existing `release:verify-attestations` script.
- Do not emit licensed framework control prose; this ticket is release-process documentation only.

### Reproduction / Current Signal

| Signal                         | Evidence                                                                 |
| ------------------------------ | ------------------------------------------------------------------------ |
| Missing checklist file          | `test -f docs/release-checklist.md` fails before implementation          |
| Missing releasing-section link  | `rg -n --fixed-strings "release-checklist" docs/development.md` fails   |
| Expected result                 | Checklist exists, is linked from Releasing, and covers the three gates   |

---

## 4. Compact Architecture Delta

N/A - no architecture delta. This ticket documents an existing release gate and does not alter package, workflow, or runtime behavior.

### Data Flow Delta

```text
Maintainer before tag
  -> docs/development.md Releasing
  -> docs/release-checklist.md
  -> manual skill install/invoke, CLI smoke, tarball attestation checks
```

---

## 5. Contract Block

| Contract Row                       | Value                                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inputs                             | GitHub issue #16, `docs/development.md`, `skills/hulumi-threat-model/SKILL.md`, `package.json`, M1 lessons note                                  |
| Outputs                            | `docs/release-checklist.md`, releasing-section reference, ticket evidence, PR handoff                                                             |
| Interfaces touched                 | Public docs only                                                                                                                                  |
| Files allowed to change            | `docs/release-checklist.md`, `docs/development.md`, `docs/slo/tickets/ticket-16-release-checklist.md`                                             |
| Files to read before changing      | `docs/development.md`, `docs/ARCHITECTURE.md`, `docs/issue-candidates.md`, `docs/slo/lessons/hulumi-m1.md`, `skills/hulumi-threat-model/SKILL.md`, `package.json`, `docs/cookbooks/verify-provenance.md` |
| New files allowed                  | `docs/release-checklist.md`, this ticket contract                                                                                                 |
| New dependencies allowed           | none                                                                                                                                              |
| Migration allowed                  | no                                                                                                                                                |
| Compatibility commitments          | Existing release commands, package names, skill scenario IDs, and attestation workflow stay unchanged                                             |
| Data classification                | Public                                                                                                                                            |
| Proactive controls in play         | Supply-chain release hygiene; IDs-only license posture remains unchanged                                                                          |
| Abuse acceptance scenarios         | BDD rows below cover no automation overclaim, no secret-handling expansion, and all six tarballs listed                                           |
| Resource bounds introduced/changed | N/A - no resource allocation, retry, queue, cache, or persisted state                                                                              |
| Invariants/assertions required     | Checklist must name all six publishable packages; checklist must keep Claude Code session gate manual                                             |
| Debugger / inspection expectation  | N/A - docs-only probes are deterministic                                                                                                          |
| Static analysis gates              | Prettier format check, license-boundary lint, `git diff --check`                                                                                  |
| Reversibility / rollback path      | Remove the new checklist and the single releasing-section link; no runtime rollback                                                               |
| Exemplar code to copy              | `package.json` `release:verify-attestations` package loop and `docs/cookbooks/verify-provenance.md` attestation wording pattern                  |
| Anti-exemplar code not to copy     | Do not invent a CI Claude Code harness or ask maintainers to publish unverified tarballs                                                          |
| Refactoring discipline             | N/A - no refactor allowed                                                                                                |
| AI tolerance contract              | N/A - no AI component introduced or evaluated                                                                                                     |
| Forbidden shortcuts                | No vague "run smoke tests" without commands; no partial package list; no workflow changes; no secret values in docs                              |

---

## 6. Implementation Plan

1. Record repo hygiene on `ticket/16-release-checklist`.
2. Record red-first docs probes for the missing checklist and missing release-doc link.
3. Add `docs/release-checklist.md` with manual pre-tag gates.
4. Link the checklist from `docs/development.md` Releasing.
5. Run targeted docs probes for file existence, link, fresh-session step, CLI smoke, and six-package attestation coverage.
6. Run `pnpm run format:check`, `pnpm run lint:license-boundary`, and `git diff --check`.
7. Fill this ticket evidence and update the issue workpad.
8. Commit with DCO sign-off, push, and open a PR.

---

## 7. BDD Acceptance Scenarios

| Scenario                              | Category               | Given                         | When                         | Then                                                                 | Evidence |
| ------------------------------------- | ---------------------- | ----------------------------- | ---------------------------- | -------------------------------------------------------------------- | -------- |
| Release checklist is discoverable      | happy path             | Maintainer reads Releasing    | They follow docs link        | `docs/release-checklist.md` exists and is linked from `docs/development.md` | shell probes |
| Fresh skill session is manually gated  | happy path             | A release is about to be tagged | Maintainer follows checklist | Checklist requires install into `~/.claude/skills/hulumi-threat-model/` and fresh `/hulumi-threat-model` invocation | `rg` probe |
| CLI smoke remains available            | degraded state         | Claude Code harness is unavailable | Maintainer follows checklist | Checklist includes direct `node skills/hulumi-threat-model/scripts/...` smoke commands | `rg` probe |
| Provenance covers every tarball        | abuse case             | A package could be missed     | Maintainer follows checklist | All six package names appear with `gh attestation verify` guidance    | `rg` probe |
| No automation overclaim                | invalid input          | Manual gate cannot run in CI  | Maintainer reads checklist   | Checklist says Claude Code session gate is manual and pre-tag         | `rg` probe |

---

## 8. Validation Plan

| Check                            | Command / Action                                                                                                                                 | Expected Result                                    | Actual Result | Status  | Notes |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | ------------- | ------- | ----- |
| Repo hygiene                     | `git status --short --branch && git rev-parse --abbrev-ref HEAD && git symbolic-ref --short refs/remotes/origin/HEAD`                            | branch is ticket branch; no unrelated dirt         | branch `ticket/16-release-checklist`; origin default `main`; no dirty files before edits | pass | branch-name probe was rerun sequentially after one parallel race captured stale output |
| Baseline before change           | `test -f docs/release-checklist.md` and `rg -n --fixed-strings "release-checklist" docs/development.md`                                           | both fail before implementation                    | both failed before edits                           | pass    |       |
| New docs probes fail first       | `test -f docs/release-checklist.md`                                                                                                               | fails for missing checklist                        | failed before implementation                       | pass    |       |
| Formatter                        | `pnpm run format:check`                                                                                                                          | passes                                             | passed: all matched files use Prettier code style | pass |       |
| Typecheck / build                | N/A                                                                                                                                              | docs-only skip recorded                            | N/A - no TypeScript, package, or workflow surface changed | pass |       |
| Static analysis / lint           | `pnpm run lint:license-boundary`                                                                                                                 | passes                                             | passed: IDs-only policy upheld across scanned trees | pass |       |
| Unit / BDD tests                 | `test -f docs/release-checklist.md && rg -n --fixed-strings "[release-checklist.md](./release-checklist.md)" docs/development.md`                 | passes                                             | passed: checklist exists and Releasing links to it | pass |       |
| Runtime validation               | `rg -n "fresh Claude Code session|/hulumi-threat-model aws-multi-account-baseline|gh attestation verify" docs/release-checklist.md`               | passes                                             | passed: fresh-session step, CLI scenario, and six `gh attestation verify` commands found | pass |       |
| Dependency / security audit      | `pnpm run lint:exact-pin-guard`                                                                                                                  | no dependency drift                                | passed: 13 pinned deps match expected integrity hashes | pass | no dependencies changed |
| Resource bound / invariant check | `rg -n "baseline|policies|drift|k8s-baseline|cloudflare-baseline|platform-patterns" docs/release-checklist.md`                                    | all six packages named                             | passed: all six atomic-release packages named in checklist | pass |       |
| Compatibility check              | `rg -n --fixed-strings "release:verify-attestations" docs/release-checklist.md docs/development.md`                                               | existing verification script remains documented    | passed: script remains referenced in checklist and Releasing section | pass |       |
| `.gitignore` / artifact cleanup  | `git status --short`                                                                                                                             | no stray artifacts outside scoped docs             | scoped changes only: `docs/development.md`, `docs/release-checklist.md`, and ignored ticket file | pass | ticket file is ignored by repo policy and must be force-added if committed |
| Diff whitespace                  | `git diff --check`                                                                                                                               | passes                                             | passed                                             | pass |       |

---

## 9. Workpad / Tracker Updates

Workpad comment: https://github.com/kerberosmansour/hulumi/issues/16#issuecomment-4464541115

---

## 10. Self-Review Gate

- [x] Did I stay inside the file allow-list?
- [x] Did I write or update BDD tests before production code?
- [x] Did I confirm new tests/probes failed for the right reason before implementing?
- [x] Did I preserve public interfaces unless explicitly allowed to change them?
- [x] Did I add or strengthen assertions/invariants where the contract required them?
- [x] Did I bound new resource growth or document why no bound applies?
- [x] Did I run formatter, typecheck/build, and static analysis?
- [x] Did I use a debugger or state-inspection tool when failure evidence was ambiguous?
- [x] Did I remove temporary proof edits, debug output, and placeholder logic?
- [x] Did I record evidence rather than claims?
- [ ] Did I update the issue workpad and PR handoff notes?

---

## 11. Closure Summary

### Completed

- Added `docs/release-checklist.md` with the fresh Claude Code session install-and-invoke gate, installed-skill CLI smoke, and six explicit tarball attestation checks.
- Linked the checklist from `docs/development.md` Releasing.

### Tests And Validation

- `test -f docs/release-checklist.md` and release-doc link probe passed after failing before implementation.
- `rg` probes confirmed fresh-session language, `/hulumi-threat-model aws-multi-account-baseline`, all six package names, and all six `gh attestation verify` commands.
- `pnpm run format:check` passed.
- `pnpm run lint:license-boundary` passed.
- `pnpm run lint:exact-pin-guard` passed.
- `git diff --check` passed.

### Lessons / Follow-Ups

- The issue body points at `docs/lessons/hulumi-m1.md`; the repo source path is `docs/slo/lessons/hulumi-m1.md`. No follow-up needed.

### PR / Issue Links

- PR: pending
- Issue: https://github.com/kerberosmansour/hulumi/issues/16
