# AGENTS.md

> Optional repo-root entrypoint for multi-tool coding-agent hosts that consume `AGENTS.md`. Claude Code reads `skills/<name>/SKILL.md` directly; this file is sugar for Cursor, Copilot, and agentskills.io-compliant tools that also understand `AGENTS.md`.

## Skills in this repo

- [`/hulumi-threat-model`](./skills/hulumi-threat-model/SKILL.md) — interactive AWS + GitHub threat modeling. Produces scenario-specific threat-model markdown citing CSA CCM, NIST 800-53 Rev 5, NIST 800-218A, NIST SSDF v1.1, MITRE ATLAS v5.1, MITRE ATT&CK T1195, CIS AWS Foundations v5.0.0, CIS GitHub Benchmark v1.2.0 (placeholder pending WorkBench), OpenSSF Scorecard, and GitHub Well-Architected SSDF IDs (no verbatim prose). Invocation: `/hulumi-threat-model <scenario-id>` — 5 AWS scenarios + 4 GitHub scenarios.

## Runbooks in this repo

- [`docs/RUNBOOK-hulumi.md`](./docs/RUNBOOK-hulumi.md) — AWS Hulumi v1.0.0 (shipped 2026-04-25).
- [`docs/RUNBOOK-hulumi-github.md`](./docs/RUNBOOK-hulumi-github.md) — Hulumi-for-GitHub v1.1.0 (shipped 2026-04-26). Hard infra-only scope contract (Rule 0).

## License posture for agents

When this skill pack is invoked, the agent MUST:

- Cite CCM / AICM / CIS / NIST SSDF / Scorecard control IDs only. **Never** emit verbatim CCM, AICM, CAIQ, CIS Benchmark (AWS Foundations or GitHub), or NIST SSDF control text into any output file or message. See [`docs/mappings/licensing.md`](./docs/mappings/licensing.md).
- Never `eval`, `exec`, or spawn a shell with an interpolated user-supplied string.
- Never write outside the user's current working directory or `~/.claude/` without explicit permission.
- For Hulumi-for-GitHub work: respect the infra-only scope contract — never author CodeQL queries, Semgrep rules, or custom secret-scanning patterns. See [`docs/RUNBOOK-hulumi-github.md`](./docs/RUNBOOK-hulumi-github.md) Global Execution Rule 0 for the full boundary.

## Version

See [package.json](./package.json) (`version` field) and [README.md](./README.md) roadmap for shipped capabilities.
