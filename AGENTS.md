# AGENTS.md

> Optional repo-root entrypoint for multi-tool coding-agent hosts that consume `AGENTS.md`. Claude Code reads `skills/<name>/SKILL.md` directly; this file is sugar for Cursor, Copilot, and agentskills.io-compliant tools that also understand `AGENTS.md`.

## Skills in this repo

- [`/hulumi-threat-model`](./skills/hulumi-threat-model/SKILL.md) — interactive cloud threat modeling for AWS. Produces a scenario-specific threat-model markdown citing CSA CCM, NIST 800-53 Rev 5, NIST 800-218A, MITRE ATLAS v5.1, and CIS AWS Foundations v5.0.0 IDs (no verbatim prose). Invocation: `/hulumi-threat-model <scenario-id>`.

## License posture for agents

When this skill pack is invoked, the agent MUST:

- Cite CCM / AICM / CIS control IDs only. **Never** emit verbatim CCM, AICM, CAIQ, or CIS control text into any output file or message. See [`docs/mappings/licensing.md`](./docs/mappings/licensing.md).
- Never `eval`, `exec`, or spawn a shell with an interpolated user-supplied string.
- Never write outside the user's current working directory or `~/.claude/` without explicit permission.

## Version

See [package.json](./package.json) (`version` field) and [README.md](./README.md) roadmap for shipped capabilities.
