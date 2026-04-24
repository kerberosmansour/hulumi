# Hulumi — hardened Pulumi for the AI-agent era

> Apache-2.0 licensed. Pre-release (v0.x). v1.0.0 ships with the complete library, CrossGuard pack, drift classifier, and SLSA Build L3 attestation.

Hulumi is a set of hardened-by-default Pulumi ComponentResources, a CrossGuard policy pack, a local-first drift classifier (TLA+-verified), and a Claude Code skill pack — all shipped together under a single Apache-2.0 license.

The ambition is that **a platform engineer authoring AWS infrastructure with Claude Code should be able to stand up a defensible cloud account on day one**, without hand-rolling the controls every time, without embedding a CSA commercial license, and without a hosted service dependency.

## What ships when (roadmap)

| Milestone | What you get                                                                                         | Status          |
| --------- | ---------------------------------------------------------------------------------------------------- | --------------- |
| **M1**    | `/hulumi-threat-model` Claude Code skill + repo bootstrap                                            | **in progress** |
| M2        | `@hulumi/baseline.aws.SecureBucket` + `HulumiHardeningPack` + tier matrix                            | planned         |
| M3        | `@hulumi/baseline.aws.AccountFoundation` + full CIS v5.0 (sections 1–3) + weekly sandbox integration | planned         |
| M4        | `@hulumi/drift` with 4 pluggable adapters, TLA+-bound verdict matrix                                 | planned         |
| M5        | SLSA-L3 release (v1.0.0) + SCP template + launch readiness + UDM dogfood                             | planned         |

Milestone specs live in [`docs/runbook-milestones/`](./docs/runbook-milestones/) (migrated from the parent project during M1). The master runbook is [`docs/RUNBOOK-hulumi.md`](./docs/RUNBOOK-hulumi.md).

## Canonical install

Hulumi lives at a single canonical GitHub path:

- **GitHub: `kerberosmansour/hulumi`** — the only authoritative repo. Any other path is unofficial; see [SECURITY.md](./SECURITY.md) for typosquat reporting.

### Install the `/hulumi-threat-model` Claude Code skill (M1)

```bash
git clone https://github.com/kerberosmansour/hulumi ~/.claude/skills/hulumi-threat-model-src
ln -s ~/.claude/skills/hulumi-threat-model-src/skills/hulumi-threat-model ~/.claude/skills/hulumi-threat-model
# or, when `gh skill` is available in your environment:
gh skill install kerberosmansour/hulumi --path skills/hulumi-threat-model
```

Restart Claude Code. The skill registers itself via its `SKILL.md` frontmatter (`name: hulumi-threat-model`) and becomes invokable as `/hulumi-threat-model <scenario-id>`. Pinned v1.0.0 commit SHA lands in the README when v1.0.0 tags (see M5).

### Quick start

```bash
# In a Claude Code session, with the skill installed:
/hulumi-threat-model aws-multi-account-baseline
```

The skill writes `docs/threat-model-aws-multi-account-baseline-<YYYYMMDD>.md` in your current working directory with a structured, citation-only threat model for that scenario.

Prebuilt scenarios shipped in M1:

- `aws-multi-account-baseline`
- `s3-public-bucket-hardening`
- `iam-least-privilege`
- `rds-encryption-at-rest`
- `lambda-secrets-access`

See [`docs/threat-model-examples/`](./docs/threat-model-examples/) for example outputs.

## Design principles

- Apache-2.0 throughout.
- **IDs only** — no verbatim CCM / AICM / CIS / CAIQ control text in source. See [`docs/mappings/licensing.md`](./docs/mappings/licensing.md).
- No hosted-service runtime dependency.
- `@pulumi/*` deps exact-pinned with integrity hashes (from M2 onward).
- SLSA Build L3 on npm releases (from M5).
- CIS AWS Foundations v5.0.0 primary rule-ID set; v7.0.0 staged.
- `SKILL.md` per folder (agentskills.io cross-tool standard).
- `hulumi:iac-role=true` tag required on IaC execution roles (from M3).
- No telemetry phone-home.
- TypeScript-first public API.

## Getting involved

- [CONTRIBUTING.md](./CONTRIBUTING.md) — DCO sign-off, license-boundary discipline, development commands.
- [SECURITY.md](./SECURITY.md) — responsible-disclosure channel, canonical install paths.
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) — Contributor Covenant v2.1.

## License

Apache License 2.0 — see [LICENSE](./LICENSE).
