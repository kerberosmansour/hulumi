# Completion — Milestone 1 (Hulumi skill + repo bootstrap)

Completed 2026-04-24.

## Goal completed

Achieved. Hulumi repo bootstrapped at `~/Documents/Dev/GitHub/Hulumi/` (Apache-2.0, TypeScript 5.5, Node 20 LTS, pnpm workspaces). `/hulumi-threat-model` Claude Code skill produces a valid scenario-specific threat-model markdown citing CSA CCM v4.1, CIS AWS v5.0.0, NIST 800-53 Rev 5, NIST 800-218/218A, and MITRE ATLAS v5.1 IDs (no verbatim prose) for 5 prebuilt AWS scenarios. Runbook + milestone files migrated from the upstream TauriMobile planning corpus.

**Local verification**: skill end-to-end run via `node scripts/generate-threat-model.mjs aws-multi-account-baseline` produces the expected output markdown. All 19 BDD + schema tests pass locally.

**Remote-blocked (not achievable in this session, requires manual follow-up)**:

- Pushing to a real GitHub remote at `kerberosmansour/hulumi` (no `gh repo create` was issued in this session).
- Running the CI workflow on GitHub Actions (the workflow file is committed; the first run requires the push).
- The demo gate requires installing the skill via `git clone` into `~/.claude/skills/hulumi-threat-model/` AND restarting Claude Code — this is a post-session user action.

## Files changed

### Hulumi repo (all new)

- Root: `LICENSE`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CODEOWNERS`, `AGENTS.md`, `.gitignore`, `.editorconfig`, `.prettierrc.json`, `.prettierignore`, `eslint.config.mjs`, `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`
- `.github/`: `workflows/ci.yml`, `dependabot.yml`
- `scripts/license-boundary-lint.mjs`
- `skills/hulumi-threat-model/`: `package.json`, `tsconfig.json`, `SKILL.md`, `scripts/list-scenarios.mjs`, `scripts/generate-threat-model.mjs`, `templates/threat-model.template.md`, `scenarios/{aws-multi-account-baseline,s3-public-bucket-hardening,iam-least-privilege,rds-encryption-at-rest,lambda-secrets-access}.json`
- `tests/skill-bdd/`: `package.json`, `tsconfig.json`, `vitest.config.ts`, `hulumi-threat-model.test.ts`, `schema.test.ts`, `_fixtures/known-ccm-verbatim.md`
- `docs/mappings/`: `README.md`, `ccm-v4.1.md`, `cis-aws-v5.0.md`, `nist-800-53-r5.md`, `nist-800-218a.md`, `atlas-v5.1.md`, `licensing.md`
- `docs/threat-model-examples/`: `aws-multi-account-baseline.md`, `s3-public-bucket-hardening.md`
- `docs/licensing.md`
- `docs/RUNBOOK-hulumi.md` (migrated from TauriMobile, prereq-reading section annotated)
- `docs/runbook-milestones/hulumi-m{1,2,3,4,5}.md` (migrated from TauriMobile)
- `docs/lessons/hulumi-m1.md` (this run)
- `docs/completion/hulumi-m1.md` (this file)

### TauriMobile repo (deletions)

- `docs/RUNBOOK-hulumi.md` deleted.
- `docs/runbook-milestones/` directory deleted.

## Tests added

**Unit / BDD** — `tests/skill-bdd/hulumi-threat-model.test.ts` (10 tests):

1. Happy path — AWS multi-account baseline output schema + citation counts + verbatim-absence.
2. Invalid input — empty scenario exits 1 + lists scenarios.
3. Invalid input — unknown scenario exits 1.
4. Empty state — synthetic scenario with framework missing from mappings emits open-questions section; does not fabricate IDs.
5. Partial failure — mapping file unreadable falls back to bundled stubs, warns on stderr, output still produced.
6. License boundary — SKILL.md documents IDs-only refusal + CSA licensing FAQ URL.
7. Output schema — frontmatter has `name`, `scenario`, `generated_at` (ISO8601), `citations[]` with non-empty URLs.
8. Security (S1) — README has "Canonical install" section with single GitHub org and attestation-verify reference.
9. IDs-only lint — seeded CCM-fragment fixture in `skills/` fails the lint; removing passes.
10. Happy path — `listScenarios()` returns the 5 IDs in declared order.

**Schema** — `tests/skill-bdd/schema.test.ts` (9 tests): SKILL.md frontmatter starts with `---`, has kebab-case `name`, non-empty `description`, `allowed-tools`, `scenario` required argument, `paths` globs, closing `---`; skill folder has `SKILL.md`/`scripts/`/`templates/`/`scenarios/`; scenarios folder has all 5 prebuilt JSONs.

Total: **19 tests, all green.**

## Runtime validations added

- Vitest BDD suite, run via `pnpm -r test`.
- License-boundary lint via `node scripts/license-boundary-lint.mjs` (and `pnpm run lint:license-boundary`) — scans `skills/` + `packages/` for known-distinctive CCM/CIS prose, fails on any match.
- CI workflow `.github/workflows/ci.yml` runs typecheck + test + eslint + license-boundary-lint + prettier format:check + DCO sign-off guard on every PR and on push to main.

## Compatibility checks performed

- N/A — greenfield; no prior milestone to regress against.
- Baseline for future milestones: `pnpm install && pnpm -r build && pnpm -r test && pnpm -r lint && pnpm -r typecheck && pnpm run lint:license-boundary && pnpm run format:check` is the M1 green state.

## Documentation updated

- `README.md` (root) — v0.1 scope, roadmap table, canonical install instructions, quick-start.
- `CONTRIBUTING.md` — DCO-only, licence-boundary discipline, dev commands.
- `SECURITY.md` (M1 stub) — disclosure channel, canonical install, `@pulumi/*` transitive-provenance disclosure, pre-release caveat.
- `docs/mappings/README.md` — mapping-table index.
- `docs/mappings/licensing.md` — IDs-only policy with rationale per-framework.
- `docs/licensing.md` — top-level licence overview.
- `AGENTS.md` — multi-tool-host entrypoint pointing at the skill.
- Migrated `docs/RUNBOOK-hulumi.md` — prereq-reading section annotated to point at upstream planning corpus (not in this repo yet).
- Milestone Tracker in the runbook flipped M1 → `done`.

## `.gitignore` changes

- TLA+ scratch patterns (`**/states/`, `**/*_TTrace_*.{tla,bin}`, `*-run.log`, `MC.out`, `MC.cfg`, `*.dot`, `*.toolbox/`).
- SLSA attestation staging (`.attestations/`, `*.intoto.jsonl`, `*.sigstore`) — forward-referenced for M5.
- Drift-classifier cache (`.hulumi/`) — forward-referenced for M4.
- Standard Node / pnpm / TS / Vitest / dist / coverage entries.

## Test artifact cleanup verified

`git status` clean in Hulumi repo (all new files are intentional initial-commit material). `git status` clean in TauriMobile after the two deletions land on the working copy (pending user's commit in that repo).

## Deferred follow-ups

- **Demo gate** — requires fresh Claude Code session + manual install into `~/.claude/skills/` + invocation. Documented in the completion section above. Screenshot/recording capture is a post-session user task.
- **Publish the Hulumi repo to GitHub** at `kerberosmansour/hulumi`. `gh repo create` + `git push` is a post-session action.
- **First CI run on GitHub Actions** — triggered by the first push.
- **Pin the README's "Canonical install" commit SHA to the first tagged release.** Currently references v1.0.0 which lands in M5; M1 points at the initial-commit SHA implicitly.
- **Import the planning corpus** (idea, research, design, TLA+, critique) into this repo as a historical `docs/planning/` tree, or publish as a separate archive. M5 follow-up.

## Known non-blocking limitations

- **`SKILL.md` frontmatter schema validation** is line-regex-based, not full YAML-parsed. If Claude Code's SKILL spec evolves in ways that can't be captured by simple line regexes (e.g. nested schemas), we'll need to pull a YAML parser as a dev dep. Out of scope for M1.
- **License-boundary lint fixture list is short** (7 entries). Maintenance discipline in `CONTRIBUTING.md` — add only small, highly-distinctive fragments with documented rationale. We accept that a determined adversary could paraphrase just enough to evade, but the lint's goal is to catch inadvertent copy-paste, not adversarial evasion.
- **Partial-failure fallback** (mapping file unreadable) uses minimal bundled stubs — citations in fallback mode have the framework's default URL, not the per-ID URL. The output remains valid but less precise. Documented in the output's Open Questions section when fallback fires.
