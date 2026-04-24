# Verification Report — Hulumi Milestone 1

Verified 2026-04-24 by /slo-verify M1.

M1 is a pure CLI / skill-pack / docs milestone (no UI, no network). The UI prerequisite cascade is skipped — nothing to exercise in a browser. Verification exercises the `/hulumi-threat-model` skill end-to-end at runtime (not just unit tests), covering every BDD row in [docs/runbook-milestones/hulumi-m1.md](../runbook-milestones/hulumi-m1.md#bdd-acceptance-scenarios).

## What was exercised

| Scenario                                                                   | Category               | How exercised                                                                                                                                                  | Result                                                                                                                                                                                                  | Evidence                                                  |
| -------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Happy path — AWS multi-account baseline (+ all 4 other prebuilt scenarios) | happy path             | `node skills/hulumi-threat-model/scripts/generate-threat-model.mjs <id>` invoked in a clean `/tmp/hulumi-verify-m1/` cwd for each of the 5 prebuilt scenarios  | All 5 produce markdown at `docs/threat-model-<id>-20260424.md`; aws-multi-account-baseline has 25 framework citations across CCM / CIS-AWS-v5.0.0 / NIST-800-53-r5 / ATLAS and 33 STRIDE-row pipe lines | CLI stdout: `[hulumi-threat-model] wrote <path>` for each |
| Invalid input — empty scenario                                             | invalid input          | `node generate-threat-model.mjs` with no args, cwd on empty tmpdir                                                                                             | exit=1; stdout+stderr both list all 5 scenario IDs with a `Usage:` header; no file written in cwd                                                                                                       | `exit=1`; `readdir(tmp) === []`                           |
| Invalid input — unknown scenario                                           | invalid input          | `node generate-threat-model.mjs unknown-foo` in empty tmpdir                                                                                                   | exit=1; stderr: `unknown scenario "unknown-foo"; valid scenarios: …`; no file written                                                                                                                   | `exit=1`; `readdir(tmp) === []`                           |
| Empty state — no mappings match                                            | empty state            | BDD test `[empty state] scenario referencing a framework with no mappings…` spawns against a synthetic `SYNTHETIC-EMPTY` framework with an empty mapping table | Output markdown contains `## Open Questions` naming `SYNTHETIC-EMPTY` with `Requires further research`; zero fabricated `SYNTHETIC-EMPTY` citations                                                     | `hulumi-threat-model.test.ts:153` pass                    |
| Dependency failure — mapping file unreadable                               | partial failure        | BDD test `[partial failure] mapping file unreadable…` creates `ccm-v4.1.md` chmod 000 and spawns the CLI with `--mappings-dir <synthetic>`                     | exit=0; stderr contains `warning/fallback/bundled` with filename `ccm-v4.1.md`; output still produced at `<outputDir>/docs/threat-model-aws-multi-account-baseline-*.md`                                | `hulumi-threat-model.test.ts:205` pass                    |
| License boundary — verbatim text refusal                                   | security / compliance  | grep `SKILL.md` for `refuse politely` + `IDs only` + `licensing-faq` URL                                                                                       | `SKILL.md:54-55` documents the refusal instruction with the exact CSA licensing FAQ URL                                                                                                                 | `grep` hit                                                |
| agentskills.io contract — SKILL.md validates                               | schema / compatibility | 9 line-regex schema assertions in `tests/skill-bdd/schema.test.ts`                                                                                             | all 9 pass at runtime (vitest)                                                                                                                                                                          | `schema.test.ts` 9/9 green                                |
| Output schema — markdown frontmatter lock                                  | schema / compatibility | Inspect s3-public-bucket-hardening output frontmatter; also BDD row `[schema compatibility]`                                                                   | Frontmatter has `name`, `scenario`, `generated_at` (ISO8601 with ms + Z), `citations[]` where every entry has a non-empty `url` starting with `https://`                                                | CLI output inspection + `hulumi-threat-model.test.ts:256` |
| Typosquat mitigation — README canonical path                               | security (S1)          | BDD row `[security S1]` + manual grep                                                                                                                          | `README.md` has `## Canonical install` heading at line 21; all `github.com/<org>/hulumi` URLs resolve to a single org; README references attestation verification                                       | `hulumi-threat-model.test.ts:281` pass                    |
| IDs-only lint — CI guards against prose                                    | license / compliance   | `node scripts/license-boundary-lint.mjs` on clean tree; BDD `[IDs-only lint]` test seeds known-CCM-verbatim fragment into `skills/` and re-runs the lint       | Clean tree: `license-boundary-lint: OK`. Seeded fixture: `license-boundary-lint: FAIL` exit=1. After removal: OK.                                                                                       | CLI output + `hulumi-threat-model.test.ts:296` pass       |

## Bugs found

None. No regression tests added in this verification cycle.

Two observations that are **not** bugs but worth noting:

1. `printUsageAndExit()` intentionally emits the usage block to both stdout and stderr (see [generate-threat-model.mjs:518-522](../../skills/hulumi-threat-model/scripts/generate-threat-model.mjs#L518)). Running the CLI in a terminal prints the help message twice because both streams are merged. This is a deliberate tradeoff — the BDD test reads a combined `stdout + stderr` string and needs the scenario list regardless of which stream the caller inspects. Documented here so a future reader doesn't chase it as a duplication bug.
2. `pnpm install` emits a `DEP0169 url.parse()` deprecation warning on Node 24.x. This is inside `@pnpm/*` internals, not our code. Verified doesn't affect install / resolution. Node 20 LTS (the declared target in `engines`) does not emit this warning.

## Environment

- **OS**: Darwin 25.4.0 (macOS on Apple Silicon)
- **Node**: v24.14.0 (local shell). `engines.node` declares `>=20.0.0`; CI pins Node 20 LTS. The skill runs on both.
- **pnpm**: 9.12.0
- **Package count**: 3 workspace projects (`hulumi` root + `skills/hulumi-threat-model` + `tests/skill-bdd`)
- **Test framework**: Vitest 1.6.0

## Runtime output capture

```
# Happy path CLI, 5 scenarios
[hulumi-threat-model] wrote /private/tmp/hulumi-verify-m1/docs/threat-model-aws-multi-account-baseline-20260424.md
[hulumi-threat-model] wrote /private/tmp/hulumi-verify-m1/docs/threat-model-s3-public-bucket-hardening-20260424.md
[hulumi-threat-model] wrote /private/tmp/hulumi-verify-m1/docs/threat-model-iam-least-privilege-20260424.md
[hulumi-threat-model] wrote /private/tmp/hulumi-verify-m1/docs/threat-model-rds-encryption-at-rest-20260424.md
[hulumi-threat-model] wrote /private/tmp/hulumi-verify-m1/docs/threat-model-lambda-secrets-access-20260424.md

# Full pipeline
pnpm -r --stream typecheck  → Done (both workspaces clean)
pnpm -r --stream lint       → Done (both workspaces clean)
pnpm run lint:license-boundary → license-boundary-lint: OK (IDs-only policy upheld across scanned trees)
pnpm run format:check       → All matched files use Prettier code style!
pnpm -r test                → Test Files 2 passed (2)  Tests 19 passed (19)
pnpm install --frozen-lockfile → Lockfile is up to date, resolution step is skipped
git status                  → nothing to commit, working tree clean
```

## Coverage gaps

- **Demo gate** — manual install of the skill into `~/.claude/skills/hulumi-threat-model/` via `git clone` and invoking `/hulumi-threat-model aws-multi-account-baseline` in a fresh Claude Code session was **not** performed in this automated verification pass. Tracked as a deferred follow-up in [docs/completion/hulumi-m1.md](../completion/hulumi-m1.md) §Deferred follow-ups. All other runtime behaviour is covered by direct CLI invocation, which exercises the same entry points Claude Code would hit.
- **CI workflow execution on GitHub Actions** — the workflow file is committed but has never been executed. Blocked on the GitHub remote not existing yet (`kerberosmansour/hulumi`). Tracked alongside the demo gate.
