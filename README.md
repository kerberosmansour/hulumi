# Hulumi

[![CI](https://github.com/kerberosmansour/hulumi/actions/workflows/ci.yml/badge.svg)](https://github.com/kerberosmansour/hulumi/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)
[![SLSA Level 3](https://slsa.dev/images/gh-badge-level3.svg)](https://slsa.dev)
[![npm @hulumi/baseline](https://img.shields.io/npm/v/@hulumi/baseline.svg)](https://www.npmjs.com/package/@hulumi/baseline)

> Hardened-by-default AWS, GitHub, Kubernetes, and Cloudflare edge infrastructure-as-code for [Pulumi](https://www.pulumi.com/). Apache-2.0. v1.4.0.

## Table of contents

- [Overview](#overview)
  - [What is Hulumi?](#what-is-hulumi)
  - [What problem does it solve?](#what-problem-does-it-solve)
  - [Project goals](#project-goals)
  - [Non-goals](#non-goals)
- [Quick start](#quick-start)
- [What's in the box](#whats-in-the-box-v140)
- [Canonical install](#canonical-install)
  - [Pulumi packages (npm)](#pulumi-packages-npm)
  - [Claude Code skill (`/hulumi-threat-model`)](#claude-code-skill-hulumi-threat-model)
- [Documentation](#documentation)
- [Release history](#release-history)
- [Design principles](#design-principles)
- [Project layout](#project-layout)
- [Getting involved](#getting-involved)
- [License](#license)
- [Trade-marks](#trade-marks)
- [Acknowledgements](#acknowledgements)

## Overview

### What is Hulumi?

Hulumi is an open-source toolkit that ships secure-by-default cloud and platform infrastructure components for Pulumi, so platform engineers (and the AI agents helping them) can stand up defensible AWS, GitHub, Kubernetes, and Cloudflare edge foundations instead of re-deriving the same hardening checklist on every project.

It bundles four things under a single Apache-2.0 license:

- **Hardened components** — drop-in replacements and platform foundations for raw AWS, GitHub, Kubernetes, and Cloudflare resources (`SecureBucket`, `AccountFoundation`, `SecureRepository`, `ProtectedAdminHostname`, `CloudflareOriginIngress`) with public-access blocks, SSE-KMS, TLS-only policies, CloudTrail, GuardDuty, Security Hub, Cloudflare proxy defaults, and OIDC trust shaping wired up correctly out of the box.
- **A policy pack** — Pulumi CrossGuard rules that catch the things the components can't (e.g. a PR that bypasses `SecureBucket` and reaches for raw `aws.s3.BucketV2`, or a state backend pointed at `file://`).
- **A local-first drift classifier** — distinguishes "a teammate clicked in the AWS console" from "the `@pulumi/aws` provider released a renamed field" from "real out-of-band drift," with a TLA+-verified verdict matrix.
- **A Claude Code skill** — `/hulumi-threat-model` writes a structured, framework-cited threat model into your project before you write any IaC.

### What problem does it solve?

Provisioning a defensible cloud account today usually means one of:

- **Hand-rolling the same hardening boilerplate on every project.** Bucket public-access blocks, SSE-KMS keys, CloudTrail multi-region with log-file validation, GuardDuty extended features, Security Hub standards subscriptions, IAM password policies, KMS rotation… the list is long, and you re-discover the gotchas every time.
- **Bolting on a SaaS scanner after the fact.** CSPMs catch misconfigurations _after_ they hit your account. Hulumi's components are misconfiguration-resistant _at IaC authoring time_.
- **Quoting framework prose you can't legally redistribute.** CSA's CCM/AICM/CAIQ and CIS's Benchmarks all forbid embedding control text without a commercial license. Hulumi cites framework controls **by ID only** (with upstream URLs), so the whole stack — components, policies, skill outputs — stays Apache-2.0 across the board.
- **Drift detection that conflates console clicks with provider releases.** Generic drift checks tell you something changed; Hulumi tells you _who_ changed it and how much you should trust the verdict.

The pain compounds when an AI coding agent is in the loop — it'll happily generate plausible-looking but unhardened IaC unless something opinionated stops it. Hulumi is that opinionated thing.

For the longer "why" with design tradeoffs and when _not_ to use Hulumi, see [docs/why-hulumi.md](./docs/why-hulumi.md).

### Project goals

1. **Misconfiguration-resistant at authoring time.** A wrong default should be hard to express in the first place — not flagged by a scanner after it ships.
2. **Apache-2.0 across the board.** Components, policies, and skill outputs cite control frameworks **by ID only**, so nothing — including generated threat models — is encumbered by CCM / CIS / CAIQ licensing.
3. **Local-first, no phone-home.** No hosted service, no telemetry, no runtime dependency on Hulumi infrastructure.
4. **Safe in an AI-agent loop.** Opinionated defaults and a CrossGuard policy pack so an agent authoring IaC can't quietly ship an unhardened resource.

### Non-goals

Hulumi is deliberately _not_ these things ([full rationale](./docs/why-hulumi.md#what-hulumi-explicitly-is-not)):

- **Not a CSPM or hosted SaaS** — it prevents misconfiguration at IaC time; pair it with your runtime scanner, don't replace one.
- **Not a multi-cloud abstraction** — AWS-first by design; GitHub, Kubernetes, and Cloudflare edge are supported, other clouds are not (yet).
- **Not a CIS Benchmark / framework-text distribution** — IDs and upstream links only; buy the Benchmark from CIS for the prose.
- **Not a replacement for code review or threat modeling** — it makes both cheaper, not unnecessary.
- **Not Terraform / CDK / OpenTofu** — Pulumi (TypeScript) only for v1.x.

## Quick start

Add the baseline package and Pulumi's provider, then use a hardened component instead of the raw resource:

```bash
pnpm add @hulumi/baseline @pulumi/aws@7.27.0 @pulumi/pulumi@3.232.0
```

```ts
import { SecureBucket } from "@hulumi/baseline/aws";

// Sandbox tier — for local experimentation, PR previews, scratch stacks.
export const scratch = new SecureBucket("scratch", { tier: "sandbox" });

export const scratchArn = scratch.arn;
```

That single line gets you a bucket with public access blocked, SSE-KMS, a TLS-only bucket policy, and the right ownership controls — no checklist to re-derive. Switch `tier: "startup-hardened"` when you graduate the stack to a real account. The full walkthrough (including `AccountFoundation` and the policy pack) is in [docs/getting-started.md](./docs/getting-started.md).

To threat-model **before** writing IaC, install the Claude Code skill (see [Canonical install](#canonical-install)) and run:

```bash
/hulumi-threat-model aws-multi-account-baseline
```

## What's in the box (v1.4.0)

| Package                                  | What it gives you                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@hulumi/baseline`                       | **AWS — foundations**: `SecureBucket`, `AccountFoundation`. **AWS — operations** (v1.2): `Ec2PatchBaseline` + `Ec2PatchWaves` (SSM patch-management orchestration with tier-aware reboot waves), `DetectiveServicesEnable` (IAM Access Analyzer + **Amazon Inspector v2** vulnerability scanning for EC2/ECR/Lambda), `AuditTrail` (multi-region CloudTrail with log-file validation), `IdentityAlarms`, `MonitoringFoundation`. **GitHub**: `SecureRepository` (with `acknowledgePublic` opt-in and existing-repo / ruleset adoption) + `OrgFoundation`. Sandbox / Startup-Hardened tiers throughout. |
| `@hulumi/policies`                       | **AWS**: `HulumiHardeningPack` (H1–H5) + `CisV5Pack` sections 1–3 + `HulumiOperationsHardeningPack` (patch-group, CloudTrail posture, log-group KMS, Inspector v2 coverage). **GitHub**: `HulumiGithubHardeningPack` (H1+H2+`G_OIDC_1`) + `CisGithubV1Pack`. **K8s / Edge**: Kubernetes, Cloudflare, origin-bypass, deployment-governance, and workflow-governance packs. `Suppression` API.                                                                                                                                                                                                           |
| `@hulumi/drift`                          | `DriftClassifier` with 5 pluggable adapters (4 AWS + 1 GitHub webhook fallback). Verdict matrix mirrors the TLA+ spec exactly, with non-suppressible `tierDegraded` / `featureNotLicensed` verdicts.                                                                                                                                                                                                                                                                                                                                                                                                   |
| `@hulumi/k8s-baseline`                   | **Kubernetes / EKS**: `HardenedHelmRelease`, `MetricsServer`, `EksSubnetTagger`, `IstioFoundation`, `AlbMeshedHttpEntrypoint`, `KubernetesSecretFromAwsSecretsManager`, `RdsCredentialSecret`, `GitHubAppCredential`, plus runtime-detection, backup, and add-on foundations.                                                                                                                                                                                                                                                                                                                          |
| `@hulumi/cloudflare-baseline`            | **Cloudflare edge**: `ZoneFoundation`, `PublicHostname`, `EdgeWafBaseline`, `BotProtectionBaseline`, and `ProtectedAdminHostname`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `@hulumi/platform-patterns`              | **Cross-provider edge patterns**: `CloudflareOriginIngress`, `GitHubAwsOidcDeploymentRole`, `DeploymentRepositoryFoundation`, and `BuildProvenanceFoundation`.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `/hulumi-threat-model` Claude Code skill | 14 prebuilt scenarios — AWS (5), GitHub (4), EKS (2), and Operations (3) — producing citation-only threat-model markdown.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

The GitHub-as-Infrastructure surface lives under a hard infra-only scope contract — see [`docs/slo/completed/RUNBOOK-hulumi-github.md`](./docs/slo/completed/RUNBOOK-hulumi-github.md) Global Execution Rule 0 for the boundary, plus the [GitHub webhook drift cookbook](./docs/cookbooks/github-webhook-drift.md) and the [`secure-repository-smoke`](./examples/secure-repository-smoke/) wedge surface.

Every published `@hulumi/*` tarball ships with SLSA Build L3 provenance — see [verify-provenance.md](./docs/cookbooks/verify-provenance.md). The full changelog lives in [CHANGELOG.md](./CHANGELOG.md).

## Canonical install

Hulumi lives at a single canonical GitHub path: **`kerberosmansour/hulumi`**. Any other path is unofficial — see [SECURITY.md](./SECURITY.md) for typosquat reporting. Every published `@hulumi/*` tarball ships with SLSA Build L3 attestation; verify before installing per [verify-provenance.md](./docs/cookbooks/verify-provenance.md) (`gh attestation verify ...`).

### Pulumi packages (npm)

```bash
pnpm add @hulumi/baseline @pulumi/aws@7.27.0 @pulumi/pulumi@3.232.0
# Optional, recommended:
pnpm add -D @hulumi/policies @pulumi/policy@1.20.0
pnpm add @hulumi/drift   # if you want the drift classifier
# Kubernetes / EKS surface:
pnpm add @hulumi/k8s-baseline @pulumi/kubernetes@4.30.0
# Cloudflare edge + cross-provider deployment patterns:
pnpm add @hulumi/cloudflare-baseline @hulumi/platform-patterns @pulumi/cloudflare@6.15.0 @pulumi/github@6.13.1
```

The exact `@pulumi/*` versions match Hulumi's `peerDependencies` pins. Bumps go through a 72h/24h cooling-off CI gate — see [development.md § Supply-chain conventions](./docs/development.md#supply-chain-conventions).

### Claude Code skill (`/hulumi-threat-model`)

```bash
git clone https://github.com/kerberosmansour/hulumi ~/.claude/skills/hulumi-threat-model-src
ln -s ~/.claude/skills/hulumi-threat-model-src/skills/hulumi-threat-model \
      ~/.claude/skills/hulumi-threat-model
```

Restart Claude Code. The skill registers via its `SKILL.md` frontmatter and becomes invokable as `/hulumi-threat-model <scenario-id>`. It writes `docs/threat-model-<scenario-id>-<YYYYMMDD>.md` in your working directory with a structured threat model citing CSA CCM, NIST 800-53 r5, NIST 800-218A, MITRE ATLAS v5.1, and CIS AWS Foundations v5.0.0 — IDs only, with upstream URLs.

Prebuilt scenarios:

| Domain     | Scenario IDs                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| AWS        | `aws-multi-account-baseline`, `s3-public-bucket-hardening`, `iam-least-privilege`, `rds-encryption-at-rest`, `lambda-secrets-access` |
| GitHub     | `github-oidc-trust-cloud-account`, `github-actions-supply-chain`, `github-app-token-exposure`, `github-self-hosted-runner`           |
| EKS        | `eks-cluster-baseline`, `eks-runtime-and-backup`                                                                                     |
| Operations | `operations-audit-pipeline-broken`, `operations-detective-services-disabled`, `operations-patch-compliance-lapse`                    |

See [`docs/threat-model-examples/`](./docs/threat-model-examples/) for example outputs.

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
| Hit a recurring gotcha and want a quick answer                     | [FAQ](./docs/faq.md)                                                |

## Release history

| Version | Date       | What landed                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1.0.0  | 2026-04-25 | AWS baseline (`SecureBucket`, `AccountFoundation`), `HulumiHardeningPack` + CIS v5 §1–3, drift classifier, threat-model skill — all SLSA-L3.                                                                                                                                                                                                                                                                                                                                 |
| v1.1.0  | 2026-04-26 | GitHub-as-Infrastructure surface (`SecureRepository`, `OrgFoundation`, GitHub policy + drift, GitHub scenarios).                                                                                                                                                                                                                                                                                                                                                             |
| v1.2.0  | 2026-05-01 | Kubernetes / EKS baseline (`@hulumi/k8s-baseline`) **plus the AWS Operations suite**: `Ec2PatchBaseline`/`Ec2PatchWaves` patch management, `DetectiveServicesEnable` (Inspector v2), `AuditTrail`, `HulumiOperationsHardeningPack`, and the Operations threat-model scenarios.                                                                                                                                                                                               |
| v1.3.2  | 2026-05-15 | Hulumi Edge Platform — `@hulumi/cloudflare-baseline` + `@hulumi/platform-patterns`, edge policy coverage.                                                                                                                                                                                                                                                                                                                                                                    |
| v1.4.0  | 2026-05-20 | Security-hardening release — closes 19 Codex findings (4 HIGH + 15 MEDIUM) + 5 unreported instances of the same root causes. Adds shared anchored-URN helper (`@hulumi/policies/urn`), function-keyed audit-bucket invariant in `SecureBucket`, drift fail-closed classifier, kubelet-flag + CIDR-union validators, and the `WF_ENV_1` workflow-governance lint. 6 GHSAs — see [`docs/release/v1.4.0-security-advisories.md`](./docs/release/v1.4.0-security-advisories.md). |

Per-milestone specs live in [`docs/slo/runbook-milestones/`](./docs/slo/runbook-milestones/) and lessons-learned in [`docs/slo/lessons/`](./docs/slo/lessons/). The master runbook is [`docs/slo/completed/RUNBOOK-hulumi.md`](./docs/slo/completed/RUNBOOK-hulumi.md). For what's next, watch the [issue tracker](https://github.com/kerberosmansour/hulumi/issues) and [CHANGELOG.md](./CHANGELOG.md).

## Design principles

- Apache-2.0 throughout.
- **IDs only** — no verbatim CCM / AICM / CIS / CAIQ control text in source. See [docs/mappings/licensing.md](./docs/mappings/licensing.md).
- No hosted-service runtime dependency; no telemetry phone-home.
- `@pulumi/*` deps exact-pinned with integrity hashes; bumps go through a 72h/24h cooling-off gate.
- SLSA Build L3 attestation on every npm release.
- CIS AWS Foundations v5.0.0 primary rule-ID set; v7.0.0 staged.
- `SKILL.md` per folder (agentskills.io cross-tool standard).
- `hulumi:iac-role=true` tag required on IaC execution roles (mandatory at v1.0).
- TypeScript-first public API.

The longer version of "why these principles, not others" is in [docs/why-hulumi.md](./docs/why-hulumi.md).

## Project layout

- `packages/` — publishable npm packages (`@hulumi/baseline`, `@hulumi/policies`, `@hulumi/drift`, `@hulumi/k8s-baseline`, `@hulumi/cloudflare-baseline`, `@hulumi/platform-patterns`).
- `skills/` — `/hulumi-threat-model` Claude Code skill pack.
- `declarations/` — machine-readable [CycloneDX 1.6](https://cyclonedx.org/) secure-execution capability declaration (`cyclonedx-1.6-capabilities.json`) describing per-package controls and capabilities.
- `examples/` — runnable smoke examples per component (consumed by CI).
- `tests/` — repo-wide BDD + license-boundary lint enforcement.
- `docs/` — code-level documentation (`ARCHITECTURE.md`, `getting-started.md`, `cookbooks/`, `components/`, `mappings/`, `tiers.md`, etc.).
- `docs/slo/` — development-only runbooks and milestone artifacts produced by the [SunLitOrchestrate](https://github.com/kerberosmansour/SunLitOrchestrate) `/slo-*` skill pack. New SLO planning files are intentionally gitignored so they do not become published user artifacts.
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
