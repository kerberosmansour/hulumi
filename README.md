# Hulumi

> Hardened-by-default AWS + GitHub infrastructure-as-code for Pulumi. Apache-2.0. v1.1.0.

## What is Hulumi?

Hulumi is an open-source toolkit that ships secure-by-default AWS infrastructure components for [Pulumi](https://www.pulumi.com/), so platform engineers (and the AI agents helping them) can stand up a defensible cloud account on day one instead of re-deriving the same hardening checklist on every project.

It bundles four things under a single Apache-2.0 license:

- **Hardened components** — drop-in replacements for raw AWS resources (`SecureBucket`, `AccountFoundation`) with public-access blocks, SSE-KMS, TLS-only policies, CloudTrail, GuardDuty, Security Hub, etc. all wired up correctly out of the box.
- **A policy pack** — Pulumi CrossGuard rules that catch the things the components can't (e.g. a PR that bypasses `SecureBucket` and reaches for raw `aws.s3.BucketV2`, or a state backend pointed at `file://`).
- **A local-first drift classifier** — distinguishes "a teammate clicked in the AWS console" from "the `@pulumi/aws` provider released a renamed field" from "real out-of-band drift," with a TLA+-verified verdict matrix.
- **A Claude Code skill** — `/hulumi-threat-model` writes a structured, framework-cited AWS threat model into your project before you write any IaC.

## What problem does it solve?

Provisioning a defensible AWS account today usually means one of:

- **Hand-rolling the same hardening boilerplate on every project.** Bucket public-access blocks, SSE-KMS keys, CloudTrail multi-region with log-file validation, GuardDuty extended features, Security Hub standards subscriptions, IAM password policies, KMS rotation… the list is long, and you re-discover the gotchas every time.
- **Bolting on a SaaS scanner after the fact.** CSPMs catch misconfigurations _after_ they hit your account. Hulumi's components are misconfiguration-resistant _at IaC authoring time_.
- **Quoting framework prose you can't legally redistribute.** CSA's CCM/AICM/CAIQ and CIS's Benchmarks all forbid embedding control text without a commercial license. Hulumi cites framework controls **by ID only** (with upstream URLs), so the whole stack — components, policies, skill outputs — stays Apache-2.0 across the board.
- **Drift detection that conflates console clicks with provider releases.** Generic drift checks tell you something changed; Hulumi tells you _who_ changed it and how much you should trust the verdict.

The pain compounds when an AI coding agent is in the loop — it'll happily generate plausible-looking but unhardened IaC unless something opinionated stops it. Hulumi is that opinionated thing.

For the longer "why" with design tradeoffs and when _not_ to use Hulumi, see [docs/why-hulumi.md](./docs/why-hulumi.md).

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

## What's in the box (v1.1.0)

| Package                                  | What it gives you                                                                                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@hulumi/baseline`                       | **AWS**: `SecureBucket` + `AccountFoundation`. **GitHub** (new in v1.1): `SecureRepository` (with `acknowledgePublic` opt-in) + `OrgFoundation` (with switchable Code Security Configurations backend). Sandbox / Startup-Hardened tiers throughout. |
| `@hulumi/policies`                       | **AWS**: `HulumiHardeningPack` (H1–H4) + `CisV5Pack` sections 1–3. **GitHub** (new in v1.1): `HulumiGithubHardeningPack` (H1+H2+`G_OIDC_1`) + `CisGithubV1Pack` (placeholder pending CIS WorkBench access). `Suppression` API.                            |
| `@hulumi/drift`                          | `DriftClassifier` with 5 pluggable adapters (4 AWS + 1 GitHub webhook fallback). Verdict matrix mirrors TLA+ spec exactly. v1.1 adds `tierDegraded` + `featureNotLicensed` non-suppressible verdict fields. Cache schema v2 with explicit migration. |
| `@hulumi/k8s-baseline` (pre-release)     | **Kubernetes / EKS**: `HardenedHelmRelease`, `EksSubnetTagger`, `IstioFoundation`, `AlbMeshedHttpEntrypoint`, `KubernetesSecretFromAwsSecretsManager`, `RdsCredentialSecret`, `GitHubAppCredential`. Ships with the same SLSA Build L3 attestation path as the other three packages. Currently `1.0.0-pre.1`; first stable release lands with the v1.2 train. |
| `/hulumi-threat-model` Claude Code skill | 5 prebuilt AWS scenarios + 4 prebuilt GitHub scenarios (v1.1: OIDC trust, Actions supply-chain, App tokens, self-hosted runners). Citation-only threat-model markdown.                                                                                |

For the GitHub variant: see [`docs/slo/completed/RUNBOOK-hulumi-github.md`](./docs/slo/completed/RUNBOOK-hulumi-github.md), [`docs/cookbooks/github-webhook-drift.md`](./docs/cookbooks/github-webhook-drift.md), and [`examples/secure-repository-smoke/`](./examples/secure-repository-smoke/) for the wedge surface. The Hulumi-for-GitHub project lives under a hard infra-only scope contract — see Global Execution Rule 0 in the runbook for the boundary.

The full v1.0 changelog lives in [CHANGELOG.md](./CHANGELOG.md). Every published tarball ships with SLSA Build L3 provenance — see [verify-provenance.md](./docs/cookbooks/verify-provenance.md).

## Roadmap snapshot

| Milestone | What you got                                                                                         | Status  |
| --------- | ---------------------------------------------------------------------------------------------------- | ------- |
| M1        | `/hulumi-threat-model` Claude Code skill + repo bootstrap                                            | shipped |
| M2        | `@hulumi/baseline.aws.SecureBucket` + `HulumiHardeningPack` + tier matrix                            | shipped |
| M3        | `@hulumi/baseline.aws.AccountFoundation` + full CIS v5.0 (sections 1–3) + weekly sandbox integration | shipped |
| M4        | `@hulumi/drift` with 4 pluggable adapters, TLA+-bound verdict matrix                                 | shipped |
| M5        | SLSA-L3 release (v1.0.0) + SCP template + launch readiness                                           | shipped |

Per-milestone specs live in [`docs/slo/runbook-milestones/`](./docs/slo/runbook-milestones/) and lessons-learned in [`docs/slo/lessons/`](./docs/slo/lessons/). The master runbook is [`docs/slo/completed/RUNBOOK-hulumi.md`](./docs/slo/completed/RUNBOOK-hulumi.md).

## Canonical install

Hulumi lives at a single canonical GitHub path: **`kerberosmansour/hulumi`**. Any other path is unofficial; see [SECURITY.md](./SECURITY.md) for typosquat reporting. Every published `@hulumi/*` tarball ships with SLSA Build L3 attestation — verify before installing per [verify-provenance.md](./docs/cookbooks/verify-provenance.md) (`gh attestation verify ...`).

### Pulumi packages (npm)

```bash
pnpm add @hulumi/baseline @pulumi/aws@7.27.0 @pulumi/pulumi@3.232.0
# Optional, recommended:
pnpm add -D @hulumi/policies @pulumi/policy@1.20.0
pnpm add @hulumi/drift   # if you want the drift classifier
# Kubernetes / EKS surface (pre-release):
pnpm add @hulumi/k8s-baseline @pulumi/kubernetes@4.30.0
```

The exact `@pulumi/*` versions match Hulumi's `peerDependencies` pins. Bumps go through a 72h/24h cooling-off CI gate — see [development.md § Supply-chain conventions](./docs/development.md#supply-chain-conventions).

### Claude Code skill (`/hulumi-threat-model`)

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

## Project layout

- `packages/` — publishable npm packages (`@hulumi/baseline`, `@hulumi/policies`, `@hulumi/drift`, `@hulumi/k8s-baseline`).
- `skills/` — `/hulumi-threat-model` Claude Code skill pack.
- `examples/` — runnable smoke examples per component (consumed by CI).
- `tests/skill-bdd/` — repo-wide BDD + license-boundary lint enforcement.
- `docs/` — code-level documentation (`ARCHITECTURE.md`, `getting-started.md`, `cookbooks/`, `components/`, `mappings/`, `tiers.md`, etc.).
- `docs/slo/` — runbooks, milestone artifacts (lessons / completion / critique / design / research / verify / templates) produced by the [SunLitOrchestrate](https://github.com/kerberosmansour/SunLitOrchestrate) `/slo-*` skill pack. See [docs/slo/README.md](./docs/slo/README.md) for the layout convention.
- `scripts/` — `license-boundary-lint.mjs`, `exact-pin-guard.mjs`, `cooling-off-diff.mjs`.
- `.github/workflows/` — CI, release, weekly-integration, and Pulumi cooling-off pipelines.

## Getting involved

- [CONTRIBUTING.md](./CONTRIBUTING.md) — DCO sign-off, license-boundary discipline, development commands.
- [docs/development.md](./docs/development.md) — repo layout, testing strategy, supply-chain conventions.
- [docs/issue-candidates.md](./docs/issue-candidates.md) — running list of "things noticed in lessons-learned that should become GitHub issues."
- [SECURITY.md](./SECURITY.md) — responsible-disclosure channel, canonical install paths.
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) — Contributor Covenant v2.1.
- [TRADEMARKS.md](./TRADEMARKS.md) — what permission you do and do not need before using the Hulumi name in a fork or downstream product.

### Code of conduct

This project adopts the [Contributor Covenant 2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) for the full text and how to report unacceptable behavior.

## License

Copyright 2026 Sherif Mansour. An open-source project by Sherif Mansour.

Licensed under the [Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0) — see [LICENSE](./LICENSE) for the full text and [NOTICE](./NOTICE) for the project-level copyright notice.

Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in the work by you, as defined in the Apache 2.0 license, shall be licensed as above, without any additional terms or conditions. Contributions require a Developer Certificate of Origin sign-off — see [CONTRIBUTING.md](./CONTRIBUTING.md#dco-sign-off-required).

## Trade-marks

**Hulumi** and the associated logo are unregistered trade-marks of Sherif Mansour. The Apache-2.0 licence grants rights in the code, not in the name or logo — see [TRADEMARKS.md](./TRADEMARKS.md) for what permission you do and do not need. The `@hulumi/*` npm scope is owned by Sherif Mansour.

## Acknowledgements

- The [Pulumi](https://www.pulumi.com/) project for the Component Resource model, CrossGuard policy framework, and provider ecosystem Hulumi builds on top of.
- The [Cloud Security Alliance](https://cloudsecurityalliance.org/) (CCM, AICM, CAIQ), the [Center for Internet Security](https://www.cisecurity.org/) (CIS Benchmarks), [NIST](https://www.nist.gov/) (SP 800-53 r5, SP 800-218A SSDF), and [MITRE](https://atlas.mitre.org/) (ATLAS) for publishing the framework IDs Hulumi cites in components, policy rules, and threat-model outputs.
- The [SLSA](https://slsa.dev/) project for the Build L3 attestation model `/hulumi-threat-model` consumers verify against every published tarball.
- The [SunLitOrchestrate](https://github.com/kerberosmansour/SunLitOrchestrate) `/slo-*` skill pack for the runbook + milestone discipline driving the `docs/slo/` layout.
