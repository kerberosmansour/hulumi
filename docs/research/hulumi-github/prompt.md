# Research brief — Hulumi for GitHub

## Wedge (one sentence)
Ship `@hulumi/baseline.github.SecureRepository` + `OrgFoundation` + a `HulumiGithubHardeningPack` (mirroring the existing AWS pattern at `kerberosmansour/hulumi`), under a hard infra-only scope contract that explicitly excludes appsec rule authoring (no CodeQL queries, no Semgrep rules, no alert triage).

## Target user (one sentence)
A platform engineer who has already adopted Hulumi v1.0 for AWS (and now has hardened S3 / account foundation / drift classifier / threat-model skill working), but their company's GitHub orgs and ~30 repos remain hand-configured with branch-protection drift, classic-PAT auth, and a stale CIS GitHub Benchmark spreadsheet from a 2025 consulting engagement.

## Five research questions

Today is 2026-04-25. Cite sources accessed on or near this date. Do not pad lists — if only three real entries exist for any question, return three.

### 1. Pulumi GitHub provider — current coverage, gaps, and auth (2026)

Find the current published version of the `pulumi-github` provider as of 2026-04-25. Enumerate which GitHub resources it covers as first-class resource types, with a particular focus on whether the following are supported:

- Repository rulesets (the modern replacement for legacy branch protection)
- GitHub Advanced Security (GHAS) security-configuration scoping objects
- OIDC / federated identity provider declarations (so a Pulumi program can declare GitHub-as-IdP for AWS / Azure / GCP)
- Organization-level secrets and environments
- Actions allowlists (org and enterprise tier)
- Push protection / secret scanning / Dependabot enablement (settings, not custom rules)
- Audit-log streaming configuration
- Code-security configurations attachment to repositories

Then enumerate where the provider has gaps that force escape hatches to `local.command`, REST, or GraphQL (concrete API surfaces missing). Finally: what authentication modes does the provider support in 2026 — classic PAT, fine-grained PAT, GitHub App installation token? Which does the provider's docs steer toward as the "least-privilege-by-default IaC execution role" choice today, and what's the rationale?

Compare succinctly to the Terraform `integrations/github` provider's coverage of the same resources — anything Terraform supports that Pulumi GitHub doesn't (or vice versa) by 2026.

### 2. Direct competitors and adjacent prior art for "hardened-by-default GitHub IaC"

For each of the following projects, provide: current 2026 status (active / dormant / deprecated), maintainer, license, what they treat as in-scope, where they explicitly stop, and one concrete feature difference vs a Pulumi-component-based hardened-by-default approach mirroring Hulumi's AWS components.

- `mineiros-io/terraform-github-repository`
- `philips-labs/terraform-github-repository`
- `cloudposse/terraform-github-repository`
- GitHub's own `github/safe-settings` Probot
- OpenSSF `ossf/allstar`
- `step-security/secure-repo`
- `chainguard-dev/octo-sts`

If any of those is no longer maintained, say so. Also identify any new (2025–2026) entrants in this space that are not in the list above. Then take a position: is there a "Hulumi for GitHub"-shaped gap (hardened defaults + CrossGuard policy pack + drift classifier + threat-model skill, all infra-only), or is this space adequately served? Justify with evidence from the survey.

### 3. The infrastructure-vs-appsec boundary in GitHub-as-IaC — published guidance

Identify which 2026 published frameworks and standards already draw a line between "GitHub as infrastructure" (declarable, drift-detectable platform configuration) and "GitHub as appsec workflow" (per-PR / per-finding triage, lives alongside source code). Look at:

- CIS GitHub Benchmark (current version 2026), section structure, scope statements
- NIST SP 800-218 SSDF practice mappings to GitHub controls
- SLSA Source Track L1 / L2 / L3 requirements
- OpenSSF Scorecard checks (which are configuration-driven vs analysis-driven)
- GitHub's own published "Securing your enterprise" / Security Lab guidance
- MITRE ATT&CK techniques for source-code-management or DevOps platforms (does this exist in 2026? if not, say so)

Then take a position on each of the following contested cases — for each, state whether it belongs in "Hulumi for GitHub" infra scope, in appsec scope (out of scope), or split — and cite the framework that supports the position:

- a. Enabling CodeQL / Dependabot / secret scanning / push protection at the repo or org level
- b. Authoring CodeQL queries / Semgrep rulesets / custom secret-scanning patterns
- c. Pinning Actions to SHAs (org-level enforcement vs per-workflow source review)
- d. Required workflows / org-level required status checks
- e. GHAS security-configuration objects (the new scoping feature)
- f. Triaging Dependabot / CodeQL alerts

### 4. GitHub audit-log API access tier (2026) and drift-detection feasibility

For Hulumi's drift classifier (which on AWS uses CloudTrail LookupEvents to distinguish "human in console" from "Pulumi run" from "AWS provider rename" from "real out-of-band drift"), determine the GitHub-side analogue.

Specifically:

- Which GitHub plan tier (Free / Team / GitHub Enterprise Cloud / GitHub Enterprise Server) gates programmatic audit-log API access in 2026?
- What does that API surface look like — endpoint, retention, payload schema, the action types that capture configuration changes (`repo.update`, `org.update_default_repo_permission`, etc.)?
- Are audit-log streaming destinations (Splunk / Datadog / S3 / Azure Event Hubs) configurable as IaC, and at which tier?
- Does GitHub publish a machine-readable changelog of API / setting changes (the equivalent of `@pulumi/aws` provider release notes for the AWS side)? If not, what is the best proxy (REST API spec diff, Public Roadmap RSS, GitHub Changelog blog tag feed, etc.)?

Take a position: is a Hulumi-style drift classifier feasible across all GitHub tiers, or only for Enterprise Cloud customers? If only Enterprise, what's the degraded experience for Team-tier users that the design must own honestly?

### 5. CIS GitHub Benchmark license + threat-model scenario demand (2026)

Two parts.

First: confirm the redistribution license for CIS GitHub Benchmark as of 2026. Hulumi's existing AWS rule (citation by ID and upstream URL only, no embedded control text) is driven by CIS Benchmarks' license terms. Does this carry over to CIS GitHub Benchmark with the same constraints, or has CIS changed posture? Confirm Apache-2.0 remains compatible with CIS Benchmark ID-only citation. Note any divergence from the AWS Foundations Benchmark.

Second: among GitHub-platform threat-model scenarios in 2026, which 3–5 are most-demanded by practitioners but least-saturated by existing public guidance? Validate or replace this candidate list (each should get a "demand: high/med/low" and "supply: high/med/low"):

- a. Org bootstrap baseline (tenant onboarding)
- b. Repository hardening (per-repo posture)
- c. Actions supply-chain risk (third-party action ingestion, pwn-request, cache poisoning)
- d. OIDC trust to cloud accounts (GitHub-as-IdP for AWS/Azure/GCP)
- e. Self-hosted runner risk
- f. GitHub App / installation token exposure
- g. GHAS configuration risk (misconfiguration of secret-scanning / push-protection / advanced security)

Pick the 3–5 with highest (demand minus supply) — those are candidates for the `/hulumi-threat-model` GitHub skill scenarios.

## Output expectations

The dossier (`dossier.md`) and sources (`sources.md`) MUST include:

- ≥ 3 sourced competitor comparisons with name, maintainer, license, and one concrete feature difference each.
- ≥ 1 technical prior-art reference (a project, a paper, or a published framework section).
- At least one regulatory / legal flag (CIS license terms, GitHub ToS for audit-log access, etc.) OR an explicit "none apply because …".
- Every claim in `dossier.md` backed by a URL with retrieval date in `sources.md`.

The synthesis (`synthesis.md`) must end each paragraph with "the design must handle <X> because <source>." Anything that cannot be written that way belongs in open-questions, not synthesis.

Do not produce architecture, design, or milestone breakdown — that is `/slo-plan`'s job.
