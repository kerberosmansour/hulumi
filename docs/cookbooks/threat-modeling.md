---
title: Threat-model an AWS scenario before writing IaC
description: Use /hulumi-threat-model to produce a controls-aligned design doc — STRIDE, framework citations, recommended Hulumi components — in under a minute.
---

# Threat-model an AWS scenario before writing IaC

## When to use this recipe

You're about to author IaC for an AWS pattern (a multi-account baseline, an S3 sharing surface, an RDS instance, a Lambda calling Secrets Manager) and want a structured design document grounded in CCM / NIST / CIS / ATLAS controls _first_. The skill produces a markdown threat model in seconds; you read it, decide which Hulumi components to use, and adjust the scope before writing a single line of Pulumi.

Use this recipe instead of "ask the LLM in chat" when:

- You want consistent STRIDE coverage every time.
- You need framework citations by ID (because the prose is licensed and your team can't include it).
- You want a record on disk you can paste into a design review or compliance evidence packet.

## Preconditions

- The skill installed at `~/.claude/skills/hulumi-threat-model` — see [getting-started.md § install the skill](../getting-started.md#2-install-the-hulumi-threat-model-skill-optional-but-recommended).
- Claude Code restarted since install.
- Your current working directory is the project where you want the threat-model file to land. The skill writes to `docs/threat-model-<scenario>-<YYYYMMDD>.md` relative to `cwd`.

## Steps

### 1. Pick a scenario

| Scenario ID                  | Use when                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `aws-multi-account-baseline` | Day-zero AWS account foundation (CloudTrail, Config, GuardDuty, etc.).       |
| `s3-public-bucket-hardening` | Any S3 surface that touches the public internet, or that _could_ by mistake. |
| `iam-least-privilege`        | New IAM design (roles, password policy, Access Analyzer, role-assumption).   |
| `rds-encryption-at-rest`     | Any RDS instance that holds non-trivial data.                                |
| `lambda-secrets-access`      | Lambda execution roles + Secrets Manager + KMS.                              |

If your scenario doesn't fit one of these, see [Adding a new scenario](#adding-a-new-scenario) below.

### 2. Invoke

In Claude Code:

```
/hulumi-threat-model s3-public-bucket-hardening
```

Or directly via the script (no Claude Code dependency):

```bash
node ~/.claude/skills/hulumi-threat-model/scripts/generate-threat-model.mjs s3-public-bucket-hardening
```

### 3. Read the output

The skill writes `docs/threat-model-s3-public-bucket-hardening-YYYYMMDD.md` containing:

- **Scenario** — verbatim from the bundled JSON.
- **Actors** — the human and machine identities in scope.
- **Assets** — the resources at risk.
- **Threats (STRIDE)** — each threat with a citation column.
- **Control Citations** — every framework ID referenced, with upstream URL.
- **Recommended Hulumi Components** — which `@hulumi/baseline.aws.*` to reach for, with milestone availability.
- **Open Questions** — design questions the threat model surfaces but doesn't answer.

The frontmatter includes a `citations:` block listing every (framework, id, url) triple. This is the machine-readable bit your compliance evidence pipeline can consume.

### 4. Convert into a design

The "Recommended Hulumi Components" section is the bridge. For S3, you'll see `SecureBucket` recommended at the Startup-Hardened tier. Open [components/secure-bucket.md](../components/secure-bucket.md), copy the Startup-Hardened snippet, paste, and adjust.

The threat model is also good fuel for code review: paste the STRIDE table into the PR description so reviewers see what was considered.

## Verify

- The output file exists at `docs/threat-model-<scenario>-<YYYYMMDD>.md`.
- The frontmatter `citations:` array has at least one entry per framework named in the scenario JSON.
- Every recommended Hulumi component links to a real component doc.
- No verbatim CCM / AICM / CAIQ / CIS prose appears in the body. The `license-boundary-lint` job in CI enforces this on the skill's templates and shipped scenarios.

## Adding a new scenario

The scenario format is JSON under `skills/hulumi-threat-model/scenarios/<id>.json`. The agent must:

1. Cite framework IDs only — never embed verbatim control text. The `license-boundary-lint` script in CI fails on known-distinctive prose.
2. Use the existing schema — fields are exercised by `tests/hulumi-threat-model.test.ts`.
3. Update the `prebuilt scenarios` table in [SKILL.md](../../skills/hulumi-threat-model/SKILL.md) and the README.

PRs adding scenarios are welcome. See [issue-candidates.md](../issue-candidates.md) for the running list of "scenarios users have asked for."

## Troubleshooting

**`Unknown scenario` printed by the skill.** The argument doesn't match a bundled scenario ID. Run `node ~/.claude/skills/hulumi-threat-model/scripts/list-scenarios.mjs` for the canonical list. The CLI deliberately prints the help block to _both_ stdout and stderr so the BDD test can read either stream — running in a terminal makes the help visible twice.

**Output file references components marked `available in Hulumi v0.x+`.** Forward references are deliberate in the M1-shipped scenario JSONs; per-milestone passes refresh them as components ship. At v1.0, almost all references are `Shipped in M<N>` — the few `v0.x+` lines are tracked in [issue-candidates.md](../issue-candidates.md) for a v1.1 sweep.

**The agent emits verbatim CCM / CIS text.** That's a bug — please open an issue with the prompt that triggered it. The skill's `SKILL.md` has explicit "refuse to embed" instructions and the lint catches known fragments, but the lint is fragment-based (not semantic), so a cleverly paraphrased near-quote can slip through. Reports help us extend the deny list.

## See also

- [skills/hulumi-threat-model/SKILL.md](../../skills/hulumi-threat-model/SKILL.md) — the full skill contract.
- [docs/threat-model-examples/](../threat-model-examples/) — hand-reviewed example outputs.
- [mappings/licensing.md](../mappings/licensing.md) — why this skill cites IDs only.
- [why-hulumi.md § Three answers](../why-hulumi.md#hulumis-three-answers) — where the threat-model skill fits in the bigger picture.
