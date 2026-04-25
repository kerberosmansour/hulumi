---
title: Hulumi documentation
description: Index of every doc shipped in this repo, organised by reader.
---

# Hulumi documentation

Welcome. This index is the single jumping-off point for every doc in the repo. Pick your starting point by what you're trying to do.

## I'm new here — where do I start?

| You want to…                                                           | Read this                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------ |
| Understand what Hulumi is and whether it's for you                     | [Why Hulumi](./why-hulumi.md)                          |
| Stand up a hardened S3 bucket in 10 minutes                            | [Getting started](./getting-started.md)                |
| See a worked threat model before writing any IaC                       | [Threat-model examples](./threat-model-examples/)      |
| Browse practical recipes ("how do I do X?")                            | [Cookbooks](./cookbooks/README.md)                     |
| Look up a component's args, outputs, and tier matrix                   | [Component reference](./components/README.md)          |
| Check what each tier (`sandbox` vs. `startup-hardened`) actually emits | [Tier matrix](./tiers.md)                              |
| Understand Hulumi's stance on framework licensing (CCM, CIS, NIST)     | [Licensing & IDs-only policy](./mappings/licensing.md) |

## I'm an operator — I need to deploy this in my org

| You want to…                                                 | Read this                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------ |
| Bootstrap a sandbox AWS account for Hulumi integration tests | [Sandbox account guide](./deployment/sandbox-account.md)           |
| Apply the v1.0 SCP that protects the `hulumi:iac-role` tag   | [SCP guide](./deployment/scp-guide.md) · [scp.json](./deployment/) |
| Wire the drift classifier into your CI                       | [Drift classifier deployment](./drift-classifier-deployment.md)    |
| Run the weekly real-AWS integration job                      | [Integration testing](./integration-testing.md)                    |
| Verify SLSA provenance on a published `@hulumi/*` tarball    | [Cookbook: verifying provenance](./cookbooks/verify-provenance.md) |

## I'm a contributor — I want to develop on Hulumi

| You want to…                                                          | Read this                                 |
| --------------------------------------------------------------------- | ----------------------------------------- |
| Get the local dev loop running (build, test, lint)                    | [Development guide](./development.md)     |
| Understand the PR conventions (DCO, conventional commits, CODEOWNERS) | [CONTRIBUTING.md](../CONTRIBUTING.md)     |
| Read the engineering runbook driving v0.x → v1.0 work                 | [RUNBOOK-hulumi.md](./RUNBOOK-hulumi.md)  |
| See what lessons came out of each milestone                           | [docs/lessons/](./lessons/)               |
| Find candidate issues / improvements for the project                  | [Issue candidates](./issue-candidates.md) |

## Reference

- [Components](./components/README.md) — `SecureBucket`, `AccountFoundation`, `DriftClassifier`.
- [Framework mappings](./mappings/) — CCM v4.1, CIS AWS v5.0.0, NIST 800-53 r5, NIST 800-218A, MITRE ATLAS v5.1.
- [Tier matrix](./tiers.md) — what differs between Sandbox and Startup-Hardened, by component.
- [Threat-model examples](./threat-model-examples/) — sample outputs from `/hulumi-threat-model`.
- [Lessons learned](./lessons/) — per-milestone notes capturing design decisions and surprises.
- [Launch artifacts](./launch/) — outreach drafts, blog pitches, CFP submissions.

## Conventions used in these docs

- **IDs only.** Every reference to CCM, AICM, CIS, CAIQ, NIST, or ATLAS controls is by ID with a link to the upstream. We never embed verbatim control text in `skills/` or `packages/` source. See [licensing.md](./mappings/licensing.md) for the rationale.
- **Code samples are the contract.** TypeScript snippets in component docs and cookbooks are kept in sync with `packages/*/tests/` BDD suites. If a snippet here drifts from the test, the test wins — please open an issue.
- **`v0.x` is pre-release.** The roadmap in [README.md](../README.md#what-ships-when-roadmap) tells you which milestone shipped what. If a doc references something marked `planned`, treat it as a forward reference, not a present-tense API.
