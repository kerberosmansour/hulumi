# Milestone 1 — `/hulumi-threat-model` Claude Code skill + Hulumi repo bootstrap

Parent runbook: [docs/RUNBOOK-hulumi.md](../RUNBOOK-hulumi.md). Read the runbook's Global Execution Rules + Global Entry Rules before starting.

**Goal**: After M1, the Hulumi repo exists as an Apache-2.0 TypeScript monorepo at `~/Documents/Dev/GitHub/Hulumi/`, and the `/hulumi-threat-model` Claude Code skill is installable via `git clone` into `~/.claude/skills/hulumi-threat-model/`, invokable in any Claude Code session, and produces a scenario-specific threat-model markdown citing CCM v4.1 / NIST 800-53 Rev 5 / NIST 800-218A / MITRE ATLAS v5.1 / CIS AWS Foundations v5.0 **IDs only** (no verbatim framework text) for at least five prebuilt AWS scenarios.

**Context**: The idea doc names the skill as the v1 wedge's demo-forward artifact ([docs/idea/hulumi.md](../idea/hulumi.md) §Recommendation). Research [synthesis §1, §5, §10](../research/hulumi/synthesis.md) establishes the AI-agent threat landscape, the CCM/AICM/CIS licensing boundary (IDs only — no prose in Apache-2.0 source), and the `SKILL.md`/agentskills.io cross-tool standard. Critique C1 committed to skill-first ordering. The Hulumi repo does not yet exist; M1 bootstraps it. The Pulumi components referenced by the skill's recommendations ship in M2 and M3; M1's skill points forward to them as "arriving in v0.2+".

**Important design rule**: The skill emits CCM / AICM / CIS / NIST / ATLAS **identifiers only** — never verbatim control text, CAIQ question text, or Implementation Guidelines prose. IDs are factual identifiers; verbatim prose requires a CSA commercial license per [CCM & AICM Licensing FAQ 2026-03-13](https://cloudsecurityalliance.org/artifacts/ccm-aicm-licensing-faq). This boundary is enforced by a lint step in CI and by a BDD scenario that explicitly asks the skill to quote CCC-01 and asserts refusal.

**Refactor budget**: `No refactor permitted — greenfield bootstrap only. Every file in M1 is new.`

## Contract Block

| Field                                  | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inputs                                 | User's scenario prompt to Claude Code: `/hulumi-threat-model <scenario-id>` where `scenario-id ∈ {aws-multi-account-baseline, s3-public-bucket-hardening, iam-least-privilege, rds-encryption-at-rest, lambda-secrets-access}`. Claude Code reads `SKILL.md` frontmatter and invokes the skill's scripts.                                                                                                                                                                                                                                                                                                                                                                              |
| Outputs                                | Markdown file at `docs/threat-model-<scenario-id>-<YYYYMMDD>.md` in the user's current working directory. Structure: scenario, actors, assets, STRIDE rows, control-ID citations (CCM/NIST/ATLAS/CIS/SSDF), recommended Hulumi components (even if v0.2+ forward-referenced), open questions.                                                                                                                                                                                                                                                                                                                                                                                          |
| Interfaces touched                     | `skills/hulumi-threat-model/SKILL.md` (public, agentskills.io schema); CLI invocation `/hulumi-threat-model`; output markdown frontmatter schema (`name`, `scenario`, `generated_at`, `citations[]`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Files allowed to change                | Hulumi-repo-relative: `LICENSE`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CODEOWNERS`, `AGENTS.md`, `.gitignore`, `.editorconfig`, `.prettierrc.json`, `.eslintrc.cjs`, `package.json` (root), `pnpm-workspace.yaml`, `tsconfig.base.json`, `.github/workflows/ci.yml`, `.github/dependabot.yml` (stub), `skills/hulumi-threat-model/**`, `docs/mappings/**`, `docs/threat-model-examples/**`, `docs/licensing.md`, `docs/RUNBOOK-hulumi.md` + `docs/runbook-milestones/**` (migrated from TauriMobile), `tests/skill-bdd/**`. TauriMobile-relative: `docs/RUNBOOK-hulumi.md` + `docs/runbook-milestones/` (delete after successful migration in step 9). |
| Files to read before changing anything | `docs/idea/hulumi.md`, `docs/research/hulumi/synthesis.md`, `docs/design/hulumi/stack-decision.md`, `docs/design/hulumi/interfaces.md`, `docs/TLAdocs/hulumi/HulumiDrift-verified.md`, `docs/critique/hulumi.md`, the v3 runbook template.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| New files allowed                      | All files listed above. Every Hulumi-repo file is new by definition.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| New dependencies allowed               | Dev-only: `typescript@5.x`, `@types/node@20.x`, `vitest@1.x`, `eslint@9.x`, `@typescript-eslint/*`, `prettier@3.x`, `pnpm@9.x` (as dev manager). **Zero runtime deps in M1** — the skill is markdown + shell/TS scripts with bundled mappings. No `@pulumi/*` deps until M2.                                                                                                                                                                                                                                                                                                                                                                                                           |
| Migration allowed                      | `no` — greenfield, no existing state. Exception: the runbook + milestone files migrate from TauriMobile to Hulumi at step 9 (explicit, one-time, tracked).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Compatibility commitments              | `SKILL.md` frontmatter must validate against the agentskills.io schema as of 2026-04-24. Skill name `/hulumi-threat-model` is locked (cannot rename in v1.x). Output markdown frontmatter schema (`name`, `scenario`, `generated_at`, `citations[]`) is locked.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Forbidden shortcuts                    | (a) **NEVER** embed verbatim CCM/AICM/CIS/CAIQ/Implementation-Guidelines text in source — IDs only. (b) **NEVER** skip DCO sign-off in CI. (c) **NEVER** publish to npm in M1 (release pipeline is M5). (d) **NEVER** hardcode "CSA-sanctioned" language about Hulumi's recommendations — we cite, we don't claim endorsement. (e) **NEVER** TODO-mark the IDs file; every cited ID traces to a URL in `docs/mappings/<framework>.md`. (f) No `exec` / `eval` in the skill's scripts; no shell interpolation of user-supplied scenario strings without argv-based spawning.                                                                                                            |

## Out of Scope / Must Not Do

- No Pulumi components (`SecureBucket`, `AccountFoundation`) — M2 and M3.
- No CrossGuard policy pack — M2.
- No drift classifier, no AWS adapters — M4.
- No SLSA release pipeline, no npm publish — M5.
- No SCP template — M5.
- No TauriMobile UDM binding edits — M5.
- No CLI tool — v1.1+.
- No dashboard, no web UI — not in v1 at all.

## Pre-Flight

1. Complete the Global Entry Rules.
2. No `docs/lessons/hulumi-m0.md` exists. Skip the "read prior lessons" step with a note in the Evidence Log.
3. Read files listed in `Files to read before changing anything`.
4. Copy the Evidence Log template into this milestone section.
5. Re-state three load-bearing constraints: (i) IDs only, no verbatim prose; (ii) zero runtime deps; (iii) skill installable via `git clone` into `~/.claude/skills/`, invocable and demo-able end-to-end.

## Files Allowed To Change

| File                                                                                         | Planned Change                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `~/Documents/Dev/GitHub/Hulumi/`                                                             | NEW directory: `git init`, `main` branch, DCO sign-off configured                                                                                                                                                                    |
| `LICENSE`                                                                                    | NEW: Apache License 2.0 verbatim                                                                                                                                                                                                     |
| `README.md`                                                                                  | NEW: one-paragraph intro, **canonical install path** section with pinned commit SHA (S1 typosquat mitigation), quick-start for the skill, links to the 5 prebuilt scenarios, forward-pointers to M2+ components, SECURITY.md pointer |
| `CONTRIBUTING.md`                                                                            | NEW: DCO sign-off required, PR template, contributor guidelines, test commands                                                                                                                                                       |
| `SECURITY.md`                                                                                | NEW stub: disclosure channel, responsible-disclosure window, typosquat-reporting guidance (S1), transitive `@pulumi/*` SLSA-provenance gap disclosed, patch-ingestion-policy forward-reference (M5)                                  |
| `CODE_OF_CONDUCT.md`                                                                         | NEW: Contributor Covenant v2.1 verbatim                                                                                                                                                                                              |
| `CODEOWNERS`                                                                                 | NEW: owners for `/skills/`, `/docs/mappings/`, `/tests/`                                                                                                                                                                             |
| `AGENTS.md`                                                                                  | NEW (optional): pointer to `skills/hulumi-threat-model/SKILL.md`                                                                                                                                                                     |
| `.gitignore`                                                                                 | NEW: Node/TS/pnpm/Vitest artifacts, SLSA attestation staging paths, TLA+ scratch from `/slo-tla` skill §5                                                                                                                            |
| `.editorconfig`, `.prettierrc.json`, `.eslintrc.cjs`                                         | NEW: TS formatting + lint config                                                                                                                                                                                                     |
| `package.json` (root)                                                                        | NEW: `"private": true`, `"workspaces"`, engines `"node": ">=20"`, `"pnpm": ">=9"`, dev deps listed above                                                                                                                             |
| `pnpm-workspace.yaml`                                                                        | NEW: packages list (`skills/*`, eventually `packages/*`)                                                                                                                                                                             |
| `tsconfig.base.json`                                                                         | NEW: `strict: true`, `target: es2022`                                                                                                                                                                                                |
| `.github/workflows/ci.yml`                                                                   | NEW: on-PR — `pnpm install`, `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test`, license header check, DCO sign-off action, **licensing-boundary lint**                                                                             |
| `.github/dependabot.yml`                                                                     | NEW stub for dev-deps                                                                                                                                                                                                                |
| `skills/hulumi-threat-model/SKILL.md`                                                        | NEW: agentskills.io-compatible frontmatter                                                                                                                                                                                           |
| `skills/hulumi-threat-model/scripts/generate-threat-model.ts`                                | NEW: reads scenario ID → selects mapping subset → fills template → writes markdown. Argv-based spawn only.                                                                                                                           |
| `skills/hulumi-threat-model/scripts/list-scenarios.ts`                                       | NEW: prints prebuilt scenario IDs                                                                                                                                                                                                    |
| `skills/hulumi-threat-model/templates/threat-model.template.md`                              | NEW: markdown template with named sections                                                                                                                                                                                           |
| `skills/hulumi-threat-model/scenarios/*.json`                                                | NEW: 5 prebuilt scenarios                                                                                                                                                                                                            |
| `docs/mappings/{ccm-v4.1,cis-aws-v5.0,nist-800-53-r5,nist-800-218a,atlas-v5.1,licensing}.md` | NEW: ID-only tables with URLs                                                                                                                                                                                                        |
| `docs/threat-model-examples/{aws-multi-account-baseline,s3-public-bucket-hardening}.md`      | NEW: exemplars                                                                                                                                                                                                                       |
| `docs/RUNBOOK-hulumi.md` + `docs/runbook-milestones/*.md`                                    | MIGRATED from TauriMobile at step 9                                                                                                                                                                                                  |
| `tests/skill-bdd/hulumi-threat-model.test.ts`                                                | NEW: Vitest BDD                                                                                                                                                                                                                      |
| TauriMobile: `docs/RUNBOOK-hulumi.md` + `docs/runbook-milestones/`                           | DELETE at step 9 after successful migration                                                                                                                                                                                          |

## Step-by-Step

1. Write BDD test stubs first for all scenarios in the BDD Acceptance Scenarios table.
2. Write E2E runtime validation stubs (manual-invocation checklist).
3. Implement the repo bootstrap: `git init` + LICENSE + CODE_OF_CONDUCT + CONTRIBUTING + CODEOWNERS + README + SECURITY + pnpm-workspace + TS config + CI workflow. Commit with DCO sign-off.
4. Implement the skill: `SKILL.md`, the 5 scenario JSONs, the template, the TS script that composes them. No runtime deps.
5. Implement the mappings: the 5 `docs/mappings/*.md` ID-only tables + `docs/mappings/licensing.md` boundary statement.
6. Write the two example threat-model outputs to prove the skill's target shape.
7. Make all BDD tests pass. Run CI workflow locally via `act` to catch issues before push.
8. **Verify test-artifact cleanup**: `git status` shows no untracked test output.
9. Migrate `docs/RUNBOOK-hulumi.md` + `docs/runbook-milestones/*.md` from TauriMobile to Hulumi root. Update in-file path references. Remove the TauriMobile copies.
10. Run smoke tests + Self-Review Gate. Install the skill locally via `git clone … ~/.claude/skills/hulumi-threat-model` and invoke `/hulumi-threat-model aws-multi-account-baseline` in Claude Code to confirm end-to-end.

## BDD Acceptance Scenarios

**Feature: `/hulumi-threat-model` produces framework-ID-cited threat-model markdown for AWS scenarios**

| Scenario                                     | Category               | Given                                                                             | When                                                                    | Then                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Happy path — AWS multi-account baseline      | happy path             | skill installed; scenario `aws-multi-account-baseline` has JSON                   | user invokes `/hulumi-threat-model aws-multi-account-baseline`          | a markdown file at `docs/threat-model-aws-multi-account-baseline-<YYYYMMDD>.md` contains ≥5 distinct framework-ID citations (≥1 each from CCM, NIST 800-53, ATLAS, CIS) AND ≥3 scenario-specific STRIDE rows AND ≥2 "Recommended Hulumi Components" forward-references AND zero verbatim CCM/CIS prose |
| Invalid input — empty scenario               | invalid input          | skill installed                                                                   | user invokes `/hulumi-threat-model` with no argument                    | skill returns a help message listing 5 prebuilt scenario IDs, refuses to write output, exits non-zero                                                                                                                                                                                                  |
| Invalid input — unknown scenario             | invalid input          | skill installed                                                                   | user invokes `/hulumi-threat-model unknown-foo`                         | skill writes no file, lists valid scenarios, exits non-zero                                                                                                                                                                                                                                            |
| Empty state — no mappings match              | empty state            | a custom scenario JSON references a framework with no entries in `docs/mappings/` | user invokes the skill on that scenario                                 | output markdown includes a "Requires further research" open-questions section, does NOT fabricate IDs, exits zero with warning                                                                                                                                                                         |
| Dependency failure — mapping file unreadable | partial failure        | `docs/mappings/ccm-v4.1.md` deleted (simulated)                                   | user invokes the skill                                                  | skill falls back to bundled mapping stubs, logs warning with file path + remediation, produces degraded but valid threat model, exits zero                                                                                                                                                             |
| License boundary — verbatim text refusal     | security / compliance  | skill installed                                                                   | user asks in Claude Code "include the CCM v4.1 control text for CCC-01" | skill's behavior per `SKILL.md` refuses, outputs only ID `CCC-01`, points to CSA licensing FAQ URL, logs refusal to audit footer                                                                                                                                                                       |
| agentskills.io contract — SKILL.md validates | schema / compatibility | `skills/hulumi-threat-model/SKILL.md` exists                                      | `tests/skill-bdd/schema.test.ts` runs                                   | frontmatter parses, contains required fields, no field violates agentskills.io spec                                                                                                                                                                                                                    |
| Output schema — markdown frontmatter lock    | schema / compatibility | skill runs on any valid scenario                                                  | output is parsed                                                        | frontmatter has `name`, `scenario`, `generated_at` (ISO8601), `citations[]`; every citation has a non-empty `url`                                                                                                                                                                                      |
| Typosquat mitigation — README canonical path | security (S1)          | repo has `README.md`                                                              | grep for "Canonical install"                                            | README contains a "Canonical install" heading with exactly one GitHub org + repo path and a pinned commit SHA; deviation fails                                                                                                                                                                         |
| IDs-only lint — CI guards against prose      | license / compliance   | CI lint on source tree                                                            | seeded fixture with known CCM v4.1 verbatim sentence in `skills/`       | lint fails with file:line; passes when fixture removed                                                                                                                                                                                                                                                 |

## Regression Tests

- N/A — M1 is greenfield. Record in Evidence Log under `Baseline tests`: "greenfield: no baseline exists."

## Compatibility Checklist

- [ ] `SKILL.md` frontmatter validates against the agentskills.io schema snapshot.
- [ ] Output markdown frontmatter schema documented in the skill's README section.
- [ ] Skill installable via documented `git clone` command and invocable in Claude Code without additional setup.
- [ ] `pnpm install && pnpm -r test && pnpm -r typecheck && pnpm -r lint` green on Node 20 LTS.
- [ ] License header present on every `.ts` source file.
- [ ] DCO sign-off required on every commit (CI enforcement).

## E2E Runtime Validation

**File**: `tests/skill-bdd/hulumi-threat-model.test.ts` (Vitest)

| E2E Test                                         | What It Proves                    | Pass Criteria                                                                                           |
| ------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `runs_happy_path_on_all_five_prebuilt_scenarios` | Skill's happy path is not brittle | For each of 5 prebuilt scenarios, running the skill produces a markdown matching the happy-path BDD row |
| `refuses_empty_scenario_argument`                | Input validation                  | No argument → no file, exits non-zero, prints scenario list                                             |
| `refuses_unknown_scenario`                       | Input validation                  | Unknown ID → no file, exits non-zero                                                                    |
| `ids_only_lint_catches_seeded_prose`             | License boundary enforcement      | CI lint fails on seeded fixture, passes when removed                                                    |
| `output_contains_no_verbatim_control_prose`      | License boundary — positive       | Output for any scenario contains zero known-distinctive-CCM-prose substrings                            |

## Smoke Tests

- [ ] `cd ~/Documents/Dev/GitHub/Hulumi && pnpm install && pnpm -r test && pnpm -r typecheck && pnpm -r lint` → all green.
- [ ] `git clone ~/Documents/Dev/GitHub/Hulumi/skills/hulumi-threat-model ~/.claude/skills/hulumi-threat-model` → skill dir present.
- [ ] In a fresh Claude Code session, invoke `/hulumi-threat-model aws-multi-account-baseline` → output markdown appears in cwd with citations + STRIDE rows + forward-references.
- [ ] `git status` in both repos shows no untracked test artifacts.
- [ ] `.gitignore` covers Node/TS/pnpm/Vitest/TLA+ artifacts.
- [ ] LICENSE file present, Apache 2.0 verbatim, NOT modified.
- [ ] README's "Canonical install" section has pinned commit SHA.

## Evidence Log

| Step                     | Command / Check                                                                               | Expected Result                  | Actual Result | Pass/Fail | Notes |
| ------------------------ | --------------------------------------------------------------------------------------------- | -------------------------------- | ------------- | --------- | ----- |
| Baseline tests           | N/A — greenfield                                                                              | "greenfield: no baseline exists" |               |           |       |
| BDD tests created        | `tests/skill-bdd/hulumi-threat-model.test.ts`                                                 | fail for expected reason         |               |           |       |
| E2E stubs                | same                                                                                          | fail                             |               |           |       |
| Implementation           | repo bootstrap + skill scripts + mappings + 5 scenarios                                       | contract satisfied               |               |           |       |
| Full tests               | `pnpm -r test`                                                                                | green                            |               |           |       |
| E2E runtime              | manual Claude Code invocation on 5 scenarios                                                  | all 5 produce valid markdown     |               |           |       |
| Build / lint / typecheck | `pnpm -r build && pnpm -r lint && pnpm -r typecheck`                                          | green                            |               |           |       |
| Smoke tests              | manual                                                                                        | all checked                      |               |           |       |
| Test artifact cleanup    | `git status` (both repos)                                                                     | no untracked                     |               |           |       |
| .gitignore review        | Hulumi `.gitignore`                                                                           | covers expected patterns         |               |           |       |
| Compatibility            | agentskills.io + output schema                                                                | no violations                    |               |           |       |
| License-boundary lint    | seeded fixtures                                                                               | fails on fixture, passes without |               |           |       |
| Runbook migration        | `test -f ~/…/Hulumi/docs/RUNBOOK-hulumi.md && ! test -f …/TauriMobile/docs/RUNBOOK-hulumi.md` | complete                         |               |           |       |

## Definition of Done

- All 10 BDD scenarios pass.
- All 5 E2E runtime validation tests pass.
- `pnpm -r test` green.
- Smoke tests checked off.
- Compatibility checklist complete.
- No forbidden shortcuts present (IDs-only lint + CI).
- `git status` clean in both repos.
- `.gitignore` covers all new generated files.
- Runbook + milestone files migrated from TauriMobile to Hulumi.
- `docs/lessons/hulumi-m1.md` + `docs/completion/hulumi-m1.md` written.
- Milestone Tracker in `docs/RUNBOOK-hulumi.md` (now in Hulumi repo) updated to `done`.
- **Demo gate**: recording or screenshot of Claude Code invoking the skill end-to-end attached to the completion summary.

## Post-Flight

- **ARCHITECTURE.md** (Hulumi repo — create fresh): one paragraph describing "currently a skill pack + documentation; Pulumi components land in M2."
- **README.md**: verify `Canonical install` pinned SHA points at a real release-m1 tag.
- **Other docs**: `docs/mappings/README.md` one-line index.

## Notes

- This milestone ships **no** Pulumi code. The skill's output references forthcoming components with "available in Hulumi v0.2+ — see M2/M3" markers. Deliberate and documented.
- Prior-lessons coverage category does not apply.
- Backward-compatibility coverage category does not apply.
