# AGENTS.md

> Optional repo-root entrypoint for multi-tool coding-agent hosts that consume `AGENTS.md`. Claude Code reads `skills/<name>/SKILL.md` directly; this file is sugar for Cursor, Copilot, and agentskills.io-compliant tools that also understand `AGENTS.md`.

## Skills in this repo

- [`/hulumi-threat-model`](./skills/hulumi-threat-model/SKILL.md) — interactive AWS + GitHub threat modeling. Produces scenario-specific threat-model markdown citing CSA CCM, NIST 800-53 Rev 5, NIST 800-218A, NIST SSDF v1.1, MITRE ATLAS v5.1, MITRE ATT&CK T1195, CIS AWS Foundations v5.0.0, CIS GitHub Benchmark v1.2.0 (placeholder pending WorkBench), OpenSSF Scorecard, and GitHub Well-Architected SSDF IDs (no verbatim prose). Invocation: `/hulumi-threat-model <scenario-id>` — 5 AWS scenarios + 4 GitHub scenarios.

## Runbooks in this repo

- [`docs/slo/completed/RUNBOOK-hulumi.md`](./docs/slo/completed/RUNBOOK-hulumi.md) — AWS Hulumi v1.0.0 (shipped 2026-04-25).
- [`docs/slo/completed/RUNBOOK-hulumi-github.md`](./docs/slo/completed/RUNBOOK-hulumi-github.md) — Hulumi-for-GitHub v1.1.0 (shipped 2026-04-26). Hard infra-only scope contract (Rule 0).

## License posture for agents

When this skill pack is invoked, the agent MUST:

- Cite CCM / AICM / CIS / NIST SSDF / Scorecard control IDs only. **Never** emit verbatim CCM, AICM, CAIQ, CIS Benchmark (AWS Foundations or GitHub), or NIST SSDF control text into any output file or message. See [`docs/mappings/licensing.md`](./docs/mappings/licensing.md).
- Never `eval`, `exec`, or spawn a shell with an interpolated user-supplied string.
- Never write outside the user's current working directory or `~/.claude/` without explicit permission.
- For Hulumi-for-GitHub work: respect the infra-only scope contract — never author CodeQL queries, Semgrep rules, or custom secret-scanning patterns. See [`docs/slo/completed/RUNBOOK-hulumi-github.md`](./docs/slo/completed/RUNBOOK-hulumi-github.md) Global Execution Rule 0 for the full boundary.

## Version

See [package.json](./package.json) (`version` field) and [README.md](./README.md) roadmap for shipped capabilities.

<!-- dependency-admission-osv:v1 -->

## Dependency admission: OSV is required

Before introducing or updating a direct or transitive dependency, resolve the
candidate lockfile without lifecycle scripts or builds, then run the repository's
`python3 scripts/osv-dependency-gate.py`. Stage any new nested lockfiles so the gate
can discover them. Scan every resolved production/toolchain lockfile; fixture-only
vulnerable locks must remain isolated and must never be installed. Keep the exact
scan report, command, lockfile diff and disposition with the change.

A complete scan with no known malware is required before dependency installation with scripts,
building/testing the candidate, merge or publication. OSV queries known advisories
including known malicious-package reports; it does not detect all unknown malware
or prove package safety. Review publisher/source provenance, integrity checksums,
transitive changes, install scripts and unexpected network/native behavior too.
Use `--ignore-scripts` when inspecting npm candidates; do not run an unknown Cargo
build.rs/procedural macro before admission. Use official pinned/checksummed scanner
binaries, never a floating installer. No install/build credentials enter the scan.

Scanner/network/parsing failure is a failed admission check, not a clean result.
Never allow-list a known malicious package (`MAL-*` IDs or aliases); remove it and
investigate affected direct/transitive paths. Ordinary vulnerability findings are
non-blocking in the OSV gate, but remain in the full JSON report, summary and CI
warning. Review and remediate them; record exact versions, reachability, an owner
and a target date for deferred fixes. Do not describe report-only admission as a
vulnerability-free result. No scanner suppressions or severity filters. Preserve
cargo-vet audits, source/provenance checks and version holds; their independent
policies are unchanged.

Both Codex and Claude must follow this rule. Dependency changes use reviewed PRs;
scan jobs remain read-only and do not remediate or merge automatically.
<!-- /dependency-admission-osv:v1 -->
