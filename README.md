# Hulumi — hardened Pulumi for the AI-agent era

> Apache-2.0. v1.0.0 ships the complete library, CrossGuard pack, drift classifier, and SLSA Build L3 attestation.

Hulumi is a set of hardened-by-default Pulumi `ComponentResource`s, a CrossGuard policy pack, a local-first drift classifier (TLA+-verified), and a Claude Code skill pack — all shipped together under a single Apache-2.0 license.

The ambition is that **a platform engineer authoring AWS infrastructure with Claude Code should be able to stand up a defensible cloud account on day one**, without hand-rolling the controls every time, without embedding a CSA commercial license, and without a hosted-service dependency.

## Documentation

The docs are organised by what you're trying to do. The full index lives at [docs/README.md](./docs/README.md).

| Start here if you…                                                 | Doc                                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Want to understand what Hulumi is and whether it fits your project | [Why Hulumi](./docs/why-hulumi.md)                                  |
| Want a hands-on `SecureBucket` deployed in 10 minutes              | [Getting started](./docs/getting-started.md)                        |
| Want copy-pasteable recipes for common tasks                       | [Cookbooks](./docs/cookbooks/README.md)                             |
| Need a per-component reference (args, outputs, tags)               | [Component reference](./docs/components/README.md)                  |
| Are bootstrapping a fresh AWS account                              | [Account bootstrap cookbook](./docs/cookbooks/account-bootstrap.md) |
| Want a controls-aligned threat model before writing IaC            | [Threat-modeling cookbook](./docs/cookbooks/threat-modeling.md)     |
| Are wiring drift detection into CI                                 | [Drift detection cookbook](./docs/cookbooks/drift-detection.md)     |
| Want to hack on Hulumi itself                                      | [Development guide](./docs/development.md)                          |

## What's in the box (v1.0.0)

| Package                                  | What it gives you                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| `@hulumi/baseline`                       | `SecureBucket` + `AccountFoundation` — Sandbox / Startup-Hardened tiers, hardened defaults. |
| `@hulumi/policies`                       | `HulumiHardeningPack` (H1–H4) + full `CisV5Pack` sections 1–3 + `Suppression` API.          |
| `@hulumi/drift`                          | `DriftClassifier` with 4 pluggable adapters; verdict matrix mirrors TLA+ spec exactly.      |
| `/hulumi-threat-model` Claude Code skill | 5 prebuilt AWS scenarios; writes a structured, citation-only threat-model markdown.         |

The full v1.0 changelog lives in [CHANGELOG.md](./CHANGELOG.md). Every published tarball ships with SLSA Build L3 provenance — see [verify-provenance.md](./docs/cookbooks/verify-provenance.md).

## Roadmap snapshot

| Milestone | What you got                                                                                         | Status  |
| --------- | ---------------------------------------------------------------------------------------------------- | ------- |
| M1        | `/hulumi-threat-model` Claude Code skill + repo bootstrap                                            | shipped |
| M2        | `@hulumi/baseline.aws.SecureBucket` + `HulumiHardeningPack` + tier matrix                            | shipped |
| M3        | `@hulumi/baseline.aws.AccountFoundation` + full CIS v5.0 (sections 1–3) + weekly sandbox integration | shipped |
| M4        | `@hulumi/drift` with 4 pluggable adapters, TLA+-bound verdict matrix                                 | shipped |
| M5        | SLSA-L3 release (v1.0.0) + SCP template + launch readiness                                           | shipped |

Per-milestone specs live in [`docs/runbook-milestones/`](./docs/runbook-milestones/) and lessons-learned in [`docs/lessons/`](./docs/lessons/). The master runbook is [`docs/RUNBOOK-hulumi.md`](./docs/RUNBOOK-hulumi.md).

## Install

### Pulumi packages (npm)

```bash
pnpm add @hulumi/baseline @pulumi/aws@7.27.0 @pulumi/pulumi@3.232.0
# Optional, recommended:
pnpm add -D @hulumi/policies @pulumi/policy@1.20.0
pnpm add @hulumi/drift   # if you want the drift classifier
```

The exact `@pulumi/*` versions match Hulumi's `peerDependencies` pins. Bumps go through a 72h/24h cooling-off CI gate — see [development.md § Supply-chain conventions](./docs/development.md#supply-chain-conventions).

### Claude Code skill (`/hulumi-threat-model`)

Hulumi lives at a single canonical GitHub path: **`kerberosmansour/hulumi`**. Any other path is unofficial; see [SECURITY.md](./SECURITY.md) for typosquat reporting.

```bash
git clone https://github.com/kerberosmansour/hulumi ~/.claude/skills/hulumi-threat-model-src
ln -s ~/.claude/skills/hulumi-threat-model-src/skills/hulumi-threat-model \
      ~/.claude/skills/hulumi-threat-model
```

Restart Claude Code. The skill registers via its `SKILL.md` frontmatter and becomes invokable as `/hulumi-threat-model <scenario-id>`.

```bash
/hulumi-threat-model aws-multi-account-baseline
```

The skill writes `docs/threat-model-aws-multi-account-baseline-<YYYYMMDD>.md` in your working directory with a structured threat model citing CSA CCM, NIST 800-53 r5, NIST 800-218A, MITRE ATLAS v5.1, and CIS AWS Foundations v5.0.0 — IDs only, with upstream URLs.

Prebuilt scenarios shipped in v1.0:

- `aws-multi-account-baseline`
- `s3-public-bucket-hardening`
- `iam-least-privilege`
- `rds-encryption-at-rest`
- `lambda-secrets-access`

See [`docs/threat-model-examples/`](./docs/threat-model-examples/) for example outputs.

## Design principles

- Apache-2.0 throughout.
- **IDs only** — no verbatim CCM / AICM / CIS / CAIQ control text in source. See [docs/mappings/licensing.md](./docs/mappings/licensing.md).
- No hosted-service runtime dependency.
- `@pulumi/*` deps exact-pinned with integrity hashes; bumps go through a 72h/24h cooling-off gate.
- SLSA Build L3 attestation on every npm release.
- CIS AWS Foundations v5.0.0 primary rule-ID set; v7.0.0 staged.
- `SKILL.md` per folder (agentskills.io cross-tool standard).
- `hulumi:iac-role=true` tag required on IaC execution roles (mandatory at v1.0).
- No telemetry phone-home.
- TypeScript-first public API.

The longer version of "why these principles, not others" is in [docs/why-hulumi.md](./docs/why-hulumi.md).

## Getting involved

- [CONTRIBUTING.md](./CONTRIBUTING.md) — DCO sign-off, license-boundary discipline, development commands.
- [docs/development.md](./docs/development.md) — repo layout, testing strategy, supply-chain conventions.
- [docs/issue-candidates.md](./docs/issue-candidates.md) — running list of "things noticed in lessons-learned that should become GitHub issues."
- [SECURITY.md](./SECURITY.md) — responsible-disclosure channel, canonical install paths.
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) — Contributor Covenant v2.1.

## License

Apache License 2.0 — see [LICENSE](./LICENSE).
