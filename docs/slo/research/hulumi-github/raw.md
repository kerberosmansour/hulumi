---
topic: # Research brief — Hulumi for GitHub  ## Wedge (one sentence) Ship `@hulumi/baseline.github.SecureRepository` + `OrgFoundation` + a `HulumiGithubHardeningPack` (mirroring the existing AWS pattern at `…
generated_on: 2026-04-26 00:07:54 +0100
source_prompt_bytes: 8335
generator: sldo-research
---

# Research Dossier

This dossier is a structured research artifact produced by `sldo-research`. It is intended as the `prompt_file` input to `sldo-plan`.

## Repository Context

I have enough context. Let me write the report.

## Tech Stack

- **Language:** TypeScript 5.9.3 (strict, `target: es2022`, ESLint 9 flat config). Skill scripts use `.mjs` + JSDoc (no TS runtime dep in `skills/`).
- **Runtime:** Node ≥ 20.0.0 (`engines.node`), pnpm ≥ 9.0.0 (workspace pinned to `pnpm@9.12.0`).
- **Test runner:** Vitest 1.6.1 across all three publishable packages.
- **Domain frameworks:** Pulumi — `@pulumi/pulumi@3.232.0`, `@pulumi/aws@7.27.0`, `@pulumi/policy@1.20.0` (exact-pinned peer deps, integrity-hash guarded).
- **AWS SDK:** `@aws-sdk/client-cloudtrail`, `@aws-sdk/client-sts`, `@aws-sdk/credential-providers` (all `3.1037.0`) — only in `@hulumi/drift`.
- **Other runtime deps:** `simple-git@3.36.0`, `p-timeout@7.0.1` (drift adapters); `memfs@4.57.2` (drift dev only).
- **Tooling:** Prettier 3.8.3, ESLint 9.39.4 + `@typescript-eslint` 8.59.0, `act` for local CI dry-runs, `gh attestation verify` for SLSA L3 verification.

## Project Structure

Top level (one level deep):

- `packages/` — three publishable npm packages (CommonJS, `dist/`-shipped):
  - `baseline/` — `@hulumi/baseline`: `SecureBucket`, `AccountFoundation`, framework-ID mappings.
  - `policies/` — `@hulumi/policies`: CrossGuard `HulumiHardeningPack`, `CisV5Pack`, `Suppression` API, plus `PulumiPolicy.yaml`.
  - `drift/` — `@hulumi/drift`: `DriftClassifier`, 4 adapters (`automation-api`, `cloudtrail`, `git-log`, `provider-version`), cache, probe, TLA+-mirrored verdict.
- `skills/hulumi-threat-model/` — Claude Code skill: `SKILL.md`, `scenarios/*.json` (5 scenarios), `scripts/*.mjs`, `templates/`.
- `tests/skill-bdd/` — repo-wide BDD + lint tests (a workspace package).
- `examples/` — three smoke examples (`secure-bucket-smoke`, `account-foundation-smoke`, `drift-classify-smoke`) consumed in CI.
- `scripts/` — `license-boundary-lint.mjs`, `exact-pin-guard.mjs`, `cooling-off-diff.mjs` (supply-chain guards).
- `docs/` — extensive: `RUNBOOK-hulumi.md`, `runbook-milestones/` (M1–M5), `lessons/`, `cookbooks/`, `components/`, `mappings/`, `deployment/`, `verify/`, `completion/`, `launch/`, `threat-model-examples/`, plus untracked `idea/` and `research/` dirs.
- `.github/workflows/` — `ci.yml`, `release.yml`, `weekly-integration.yml`, `pulumi-cooling-off.yml`.
- Root configs: `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.mjs`, `.prettierrc.json`, `.editorconfig`, `AGENTS.md`, `CODEOWNERS`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `CHANGELOG.md`.

No Rust / Go / Python detected — single TS/Node monorepo. No `Makefile`. The workspace globs include `packages/*`, `skills/*`, `examples/*`, `tests/*`.

## Build & Test

From `package.json` scripts and `docs/development.md`:

```bash
pnpm install
pnpm -r build              # required before tests (examples import from dist/)
pnpm -r typecheck
pnpm -r test               # vitest in each package
pnpm -r lint               # eslint per package
pnpm run lint:license-boundary    # CCM/CIS/NIST verbatim-prose guard
pnpm run lint:exact-pin-guard     # @pulumi/* integrity-hash drift guard
pnpm run format:check             # prettier
```

Per-package convenience: `pnpm run test:baseline | test:policies | test:drift`.
Integration (real AWS, gated): `HULUMI_INTEGRATION=1 pnpm test:integration`; mocks-only equivalent via `pnpm test:integration` without the flag.
Release dry-run: `pnpm run release:dry` (uses `act`); attestation verify: `pnpm run release:verify-attestations`.

CI (`.github/workflows/ci.yml`) runs all of the above plus `pulumi-cooling-off`, `attestation-dry-run` (SLSA), and a `dco` Signed-off-by check.

## Existing Patterns

- **Pulumi ComponentResource pattern:** each component (e.g. `packages/baseline/src/aws/secure-bucket.ts:27`) extends `pulumi.ComponentResource`, registers child resources with `{ parent: this }`, validates `tier` via `assertValidTier`, throws plain `Error` for tier-input violations, and sets a `hulumi:component / hulumi:tier / hulumi:controls` tag triple on every taggable child.
- **Strict TS everywhere:** `tsconfig.base.json` enables `strict`, `noImplicitOverride`, `noUnusedLocals/Parameters`, `exactOptionalPropertyTypes`, `useUnknownInCatchVariables`, `forceConsistentCasingInFileNames`. Packages override `module: commonjs` + `moduleResolution: node` for publishable shape.
- **Mock-runtime BDD:** `pulumi.runtime.setMocks()` per package; tests use a `settlePulumi()` helper (40 `setImmediate` ticks) — see `packages/baseline/tests/setup.ts`.
- **TLA+-aligned drift verdict:** `packages/drift/src/verdict.ts` is a hand-mirrored 5-row matrix from `HulumiDrift.tla`; a `tla-alignment.test.ts` meta-test enforces lockstep, and the classifier (`classifier.ts:41`) orchestrates 4 adapters via `Promise.allSettled` with on-disk cache (mode 0600) for rate-limiting.
- **Forbidden-shortcut lints as tests:** `tests/no-shell-exec.test.ts`, `tests/no-sleep.test.ts`, plus `scripts/license-boundary-lint.mjs` and `scripts/exact-pin-guard.mjs` enforce "we don't do X" rules at PR time rather than in prose.
- **Async style:** `async/await` throughout; `Promise.allSettled` for parallel adapter fanout; `p-timeout` for bounded probes; no `child_process` in `packages/*/src/` (lint-enforced).
- **No telemetry / no shell exec / no eval:** ESLint `no-eval` + `no-implied-eval`, repo-wide `no-shell-exec` test, AGENTS.md "never `eval`/`exec` interpolated input" rule.
- **Skill scripts** are runtime-dep-free `.mjs` with JSDoc — installable by clone, no build step.
- **License-boundary discipline:** all CCM/AICM/CAIQ/CIS/NIST references are by ID + URL only, never verbatim prose; centralised `packages/baseline/src/mappings/` tables exported via `./mappings` subpath.

## Constraints

- **Hard runtime floor:** Node ≥ 20.0.0, pnpm ≥ 9.0.0.
- **License:** Apache-2.0 throughout. Cannot embed verbatim CCM, AICM, CAIQ, or CIS Benchmark control text in source, comments, or `dist/` — `license-boundary-lint` blocks PRs.
- **Pulumi pins are exact + integrity-hash-guarded:** `@pulumi/pulumi@3.232.0`, `@pulumi/aws@7.27.0`, `@pulumi/policy@1.20.0` declared as both peer and dev. Bumps go through a 72h (minor/major) / 24h (patch) cooling-off CI gate based on upstream npm publish time.
- **Publishable packages are CommonJS** (`type: "commonjs"`) with `exports` subpath maps; ESM-only deps consumed via `esModuleInterop`. `moduleResolution: "node"` for packages, `"bundler"` for examples.
- **SLSA Build L3 attestation required** on every npm release (`actions/attest-build-provenance` + `slsa-framework/slsa-github-generator` pinned by SHA); npm trusted publishing via OIDC, no `NPM_TOKEN`.
- **DCO sign-off required** on every commit in a PR (CI-enforced).
- **No telemetry, no hosted-service runtime dep, no shell-exec, no eval, no `setTimeout`/sleep outside sanctioned probe paths** (test-enforced).
- **No new runtime deps** to publishable packages without a GitHub Discussion first (per `docs/development.md`).
- **Atomic three-package release:** `@hulumi/baseline`, `@hulumi/policies`, `@hulumi/drift` ship the same version on the same day.
- **Target platform:** AWS only at v1.0.0 (mappings, components, drift adapters all AWS-scoped). CIS AWS Foundations v5.0.0 is the primary rule-ID set (v7.0.0 staged).
- **Mandatory IaC tag:** `hulumi:iac-role=true` required on IaC execution roles at v1.0.
- **`pulumi.dynamic.Resource` does NOT work under vitest's worker pool** — use `dependsOn` instead (documented gotcha; escape hatch preserved at `packages/baseline/src/aws/probes/poll.ts`).
- **`pnpm -r build` MUST run before `pnpm -r test`** — example tests import from `dist/` via the `exports` map.

## Executive Summary

The "Hulumi for GitHub" wedge — `@hulumi/baseline.github.SecureRepository` + `OrgFoundation` + `HulumiGithubHardeningPack`, mirroring the existing AWS pattern under a hard infra-only scope contract — is not served by any single competitor as of 2026-04-25. The closest declarative-settings competitor (`github/safe-settings` 2.1.20-rc.3, ISC) is YAML-only with no policy pack, no drift classifier, and no threat-model artifact; `ossf/allstar` v4.5 is detective-only; `step-security/secure-repo` v1.12.0 is AGPL-3.0 and rewrites workflow text rather than declaring org IaC; the Terraform repo modules cover repo-level resources but skip the OrgFoundation/policy-pack pairing.

`pulumi-github` v6.13.0 (released 2026-04-24, a thin wrapper over terraform-provider-github v6.12.0) is mandatory and sufficient for the baseline, exposing first-class `RepositoryRuleset`, `OrganizationRuleset` (with `requiredCodeScanning`), `OrganizationSettings` (org-level security defaults at all tiers), `ActionsOrganizationPermissions` (allowlist + SHA-pin), `ActionsOrganizationOidcSubjectClaimCustomizationTemplate` (UNC6426 mitigation surface), and `EnterpriseSecurityAnalysisSettings` (enterprise-only knobs). Two structural IaC gaps remain — _Code Security Configurations_ attach/detach objects and audit-log streaming destinations — and Terraform has the same gaps, so they are platform-wide REST escape hatches, not Pulumi-specific deficits.

The drift classifier inherits an unavoidable tier story: GitHub's enterprise audit-log REST endpoints are gated to GHEC and accept only classic PATs (no GitHub App, no fine-grained PAT, no OAuth-app token), so a Pulumi program managing audit-log streams or polling them needs a second `github.Provider` instance authed with a classic PAT. Free/Pro/Team customers have no programmatic audit-log API; the Team-tier fallback is repository and organization webhooks (push-model), which deliver `branch_protection_rule`, `repository_ruleset`, `secret_scanning_*`, `dependabot_alert`, `code_scanning_alert` (GHAS-licensed only on private), and `member` events. The classifier verdict taxonomy must therefore expose `tier-degraded` and `feature-not-licensed` as first-class outcomes.

CIS GitHub Benchmark v1.2.0 (March 2026 cohort) carries the same CC BY-NC-SA 4.0 posture as CIS AWS Foundations: ID-only citation is compatible with Apache-2.0; control text must never be embedded. NIST SSDF v1.2 (SP 800-218 Rev. 1) remains in IPD with no second draft, so v1.1 is the safe mapping target. The threat-model skill's highest demand-minus-supply scenarios are (d) OIDC trust to cloud accounts, (c) Actions supply-chain, (f) GitHub App / installation-token exposure, and (e) self-hosted runners; (a) org bootstrap and (b) repo hardening are saturated by existing modules and should be the _components_ the skill leverages, not its scenarios.

## Topic Decomposition

The five research questions decompose along four axes the dossier must keep separate:

1. **Provider capability surface (Q1).** Which GitHub IaC primitives are first-class in `pulumi-github` v6.13.0; which require REST escape hatches; what auth modes the provider supports and which it endorses.
2. **Competitive landscape (Q2).** Maintenance status, license, scope, and one concrete differentiator for each candidate competitor; whether a "Hulumi for GitHub"-shaped gap exists.
3. **Boundary frameworks (Q3, Q5-license).** What 2026 frameworks (CIS, NIST SSDF, SLSA, Scorecard, GitHub's own docs, MITRE ATT&CK) say about the infra-vs-appsec line; six contested cases (a–f) and where each lands; redistribution license posture.
4. **Drift-detection feasibility and threat-model demand (Q4, Q5-threats).** Audit-log API tier gating, retention, schema, streaming destinations, auth-mode constraints, change-feed proxies; tier-degraded design implications; ranked threat-model scenarios.

These axes are independent: a provider-side gap (axis 1) does not change the framework boundary (axis 3); a tier constraint (axis 4) does not change the competitive landscape (axis 2). The synthesis preserves that independence.

## Key Findings

**Provider state.** `pulumi-github` v6.13.0 (2026-04-24) supersedes v6.12.2 (2026-04-10); its only material change is "Upgrade terraform-provider-github to v6.12.0" (2026-04-23). The provider exposes two mutually exclusive auth modes on `github.Provider` — `token` (used for both classic and fine-grained PATs; the provider does not distinguish) and `appAuth` (`{id, installationId, pemFile}`). The docs do not endorse `appAuth` as the recommended IaC role; the only example uses `GITHUB_TOKEN`, so any "use a GitHub App" stance is Hulumi-owned, not Pulumi-derived.

**Confirmed first-class IaC resources.** `RepositoryRuleset` and `OrganizationRuleset` (with the `requiredCodeScanning` rule that ties code-scanning enforcement into rulesets), `OrganizationSettings` (covers `advancedSecurityEnabledForNewRepositories`, `dependabotAlertsEnabledForNewRepositories`, `dependabotSecurityUpdatesEnabledForNewRepositories`, `dependencyGraphEnabledForNewRepositories`, `secretScanningEnabledForNewRepositories`, `secretScanningPushProtectionEnabledForNewRepositories`, `defaultRepositoryPermission`, `membersCanForkPrivateRepositories`, `webCommitSignoffRequired`), `ActionsOrganizationPermissions` (Actions allowlist + the SHA-pin enforcement that GA'd at GitHub on 2025-08-15), `ActionsOrganizationOidcSubjectClaimCustomizationTemplate` (sub-claim shape — the surface that determines UNC6426 exposure), `ActionsOrganizationSecret` / `ActionsOrganizationSecretRepositories`, `ActionsRunnerGroup`, `DependabotOrganizationSecret*`, `RepositoryDependabotSecurityUpdates`, and `EnterpriseSecurityAnalysisSettings` (enterprise-defaults-for-new-repos with two extra knobs `OrganizationSettings` lacks: `secretScanningValidityChecksEnabled`, `secretScanningPushProtectionCustomLink`).

**Two confirmed structural IaC gaps.** (1) The new GHAS _Code Security Configurations_ objects (`/orgs/{org}/code-security/configurations` and `/enterprises/{enterprise}/code-security/configurations` with `/attach`, `/detach`, `/defaults`, `/repositories` sub-paths) have no IaC binding in either pulumi-github v6.13.0 or terraform-provider-github v6.12.0. (2) Audit-log streaming destinations (`/enterprises/{enterprise}/audit-log/streams`) have no IaC binding in either provider. Both are platform-wide gaps, not Pulumi-specific. GitHub has additionally marked the `PATCH /orgs/{org}` flat `*_enabled_for_new_repositories` fields with an "endpoint closing down notice. Please use code security configurations instead" — a forward-looking risk to `OrganizationSettings`-based components at all tiers.

**Audit-log REST auth-mode constraint.** The enterprise audit-log REST endpoint family — read (`GET /enterprises/{enterprise}/audit-log`), stream listing/create/update/delete (`POST/PUT/DELETE .../streams/{stream_id}`), and `stream-key` — supports authentication only with a classic PAT carrying `read:audit_log`. GitHub App installation tokens, GitHub App user tokens, fine-grained PATs, and OAuth-app tokens are all rejected. There is no programmatic audit-log API on Free/Pro/Team at all; the endpoint family is enterprise-only.

**Audit-log surface.** Retention is 180 days for non-Git events and 7 days for Git events. Streaming destinations are Amazon S3, Azure Blob Storage, Azure Event Hubs, Datadog, Google Cloud Storage, and Splunk. API-request audit-log streaming GA'd 2025-01-13 (after a 2023 private/public beta). GHES 3.14 mirrors the streaming surface for self-hosted.

**Webhook fallback feasibility.** Webhook events at non-GHEC tiers cover `branch_protection_rule`, `repository_ruleset` (created/edited/deleted), `secret_scanning_alert` and `_alert_location` (private repos: GA on Team since 2024-03; public: free), `dependabot_alert` (free at all tiers since 2022), `code_scanning_alert` (public: free; private: GHAS-licensed only), `member`, and org-only `organization`. Push-model delivery sidesteps the classic-PAT-only constraint on the audit-log endpoints, so a Team-tier fallback adapter is structurally sound. Two named carve-outs: org-level events require a separate org-scoped webhook (not just per-repo subscriptions), and private-repo `code_scanning_alert` requires GHAS so the classifier verdict must distinguish `feature-not-licensed` from `no-drift`.

**Roadmap / change-feed.** There is no machine-readable platform changelog equivalent to `@pulumi/aws` provider release notes. Best proxies, in order: REST API spec diffs at `github/rest-api-description` (versioned `2026-03-10` etc.), the GitHub Changelog blog RSS filtered by labels (Actions, Audit log, Security), and the GitHub Public Roadmap. The 2025-08-15 SHA-pin policy GA and the 2026-roadmap workflow-level `dependencies:` lockfile (not GA) are recent inflection points.

**Competitor status (primary-fetched).** `ossf/allstar` v4.5 (2025-10-01, Apache-2.0) — active, 724 commits, detective-only (files issues on policy violations). `github/safe-settings` 2.1.20-rc.3 (2026-03-31, ISC) — active, 1,202 commits on `main-enterprise`, YAML-only DSL with mandatory central admin repo, ships rulesets coverage but no policy pack, drift classifier, or threat-model story. `step-security/secure-repo` v1.12.0 (2026-04-17, **AGPL-3.0**) — active, 1,408 commits, 32 releases, per-workflow rewriter for token-permissions/SHA-pin/Harden-Runner; AGPL is a strict copyleft flag for any Hulumi vendoring. `cloudposse/terraform-github-repository` v1.6.0 (2026-04-16, Apache-2.0) — active, comprehensive repo-level coverage (rulesets, environments, custom properties, webhooks) but repo-only, no org foundation. `mineiros-io/terraform-github-repository` — issues activity through April 2025, `branch_protections` and `defaults` variables deprecated. `philips-labs/terraform-github-repository` — does not exist; the brief conflates it with `philips-labs/terraform-aws-github-runner` (archived 2025-01-16). `octo-sts/app` (Chainguard, formerly `chainguard-dev/octo-sts`) — active GitHub App acting as an STS, replaces classic PATs and installation tokens with OIDC-exchanged short-lived tokens; complementary to declarative org IaC, not competitive.

**Frameworks landscape.** GitHub's published Well-Architected SSDF mapping is the cleanest infra-vs-workflow split available: PO.2/PO.3/PO.4/PO.5/PS.1/PW.4/PW.5/PW.6/PW.7/RV.1 = Infrastructure-as-Code; PS.2/PW.1/PW.2/PW.8/RV.2/RV.3 = Workflow. SLSA Source Track v1.2: L1–L3 are repo/org configuration; L4 mixes config (require-N-reviewers) with per-PR review behavior. OpenSSF Scorecard: `Branch-Protection`, `Pinned-Dependencies`, `Token-Permissions`, `Webhooks` are configuration-driven; `Code-Review`, `Maintained`, `SAST`, `Vulnerabilities` are analysis-driven. GitHub Docs itself splits "Managing security and analysis settings" (configuration plane) from "Quickstart for securing your repository" (workflow plane). MITRE ATT&CK has no SCM-specific matrix in 2026; T1195 (Supply Chain Compromise) and sub-techniques are the canonical anchors.

**Six boundary cases (a–f).** (a) Enabling CodeQL/Dependabot/secret-scanning/push-protection at repo or org level — **infra scope** (SSDF PO.3 / PW.5 IaC; GitHub Docs configuration plane). (b) Authoring CodeQL queries / Semgrep rulesets / custom secret-scanning patterns — **out-of-scope** (workflow plane; SSDF PW.5/PW.7 review behavior). (c) Pinning Actions to SHAs — **split**: org-level enforcement is infra (the 2025-08-15 GitHub Actions org policy); per-workflow source review is workflow. (d) Required workflows / org-required status checks — **infra scope** (rulesets + ActionsOrganizationPermissions; SSDF PW.7 IaC). (e) GHAS security-configuration objects — **infra scope** but currently a Pulumi/Terraform gap (REST escape hatch needed). (f) Triaging Dependabot/CodeQL alerts — **out-of-scope** (SSDF RV.2 Workflow).

**CIS license.** CIS Benchmark PDFs are released under CC BY-NC-SA 4.0; CIS Terms of Use for Non-Member Products forbid posting, sublicensing, or commercial redistribution. The same posture as CIS AWS Foundations Benchmark — no divergence. Apache-2.0 outbound license remains compatible because Hulumi cites by ID and upstream URL only and never embeds control text. CIS GitHub Benchmark v1.2.0 covers GitHub up to v3.18 (March 2026 cohort); the section numbering remains gated behind CIS WorkBench membership and was not retrieved. `aquasecurity/chain-bench` implements the CIS _Software Supply Chain Security Guide_, not the CIS GitHub Benchmark, so it cannot be used to reverse-engineer GitHub-Benchmark IDs.

**NIST SSDF status.** SP 800-218 v1.1 (2022-02-03) remains the only finalized SSDF version. SP 800-218r1 IPD (covering SSDF v1.2) was published 2025-12-17 and the comment period closed 2026-01-30 with no second draft published as of 2026-04-25. v1.1 is the safe mapping target.

**Threat-model demand-vs-supply.** Triangulating from 2025–2026 incidents: (a) org bootstrap baseline — High demand, High supply (saturated by safe-settings/cloudposse/mineiros). (b) Repository hardening — High/High (saturated). (c) Actions supply-chain (third-party action ingestion, pwn-request, cache poisoning) — Very High demand, Med supply, **HIGH gap**, motivated by trivy-action March 2026 (75/76 tags compromised), tj-actions/changed-files (23k repos), prt-scan, hackerbot-claw, Sysdig Shai-Hulud worm Nov 2025. (d) OIDC trust to cloud accounts — Very High demand, Low supply, **HIGHEST gap**, motivated by UNC6426 March 2026 (~500 vulnerable role ARNs across 275 AWS accounts), Unit 42 OH-MY-DC, Tinder Tech Blog write-up. (e) Self-hosted runner risk — High demand, Med supply, med-high gap, Praetorian TensorFlow report + Sysdig Shai-Hulud. (f) GitHub App / installation-token exposure — Med-High demand, Low supply, HIGH gap, motivated by OpenAI Codex token-stealing branch-name injection (patched Feb 2026) and Vercel April 2026 compromise. (g) GHAS configuration risk — Med/Low, med gap. Top four by demand-minus-supply: (d), (c), (f), (e).

**OIDC sub-claim safe defaults.** AWS, Azure, GCP, and GitHub all converge on three scoping axes (increasing strictness): repo identity → ref/environment → `job_workflow_ref`. AWS guidance is `StringEquals` (not `StringLike`) on `sub`. Azure federated credentials require environment-scoped subject without wildcards. GCP recommends `attribute.repository` + `attribute.ref`/`attribute.environment`, with `attribute.job_workflow_ref` for highest assurance. GitHub itself recommends `job_workflow_ref` + `environment` or `ref` in the org template. The default `repo:{org}/{repo}:*` shape Pulumi accepts is the exact UNC6426-vulnerable shape.

**Repository grounding.** AWS pattern: `packages/baseline/src/aws/` contains the canonical 7 sub-component files plus `account-foundation.ts`, `tier.ts`, args/outputs splits, and `probes/`. Component type strings: `hulumi:baseline:aws:SecureBucket`, `hulumi:baseline:aws:AccountFoundation`. Tag triple: `hulumi:component`, `hulumi:tier`, `hulumi:controls=...`. `packages/policies/src/index.ts` documents the one-PolicyPack-per-process invariant, so any GitHub policy pack must ship as a separate module. Drift adapters at `packages/drift/src/adapters/`: `automation-api.ts`, `cloudtrail.ts`, `git-log.ts`, `provider-version.ts` (4-adapter quorum). Mappings module pattern at `packages/baseline/src/mappings/` (cis-aws.ts is 14 lines of `as const` IDs only).

## Library & Tool Evaluations

**`pulumi-github` v6.13.0 (2026-04-24) — Apache-2.0 — MANDATORY.** Pros: first-class rulesets, `OrganizationSettings`, Actions allowlist + SHA-pin enforcement, OIDC sub-claim customization, `EnterpriseSecurityAnalysisSettings`, built-in `appAuth` block. Cons: two structural REST escape hatches required (Code Security Configurations attach, audit-log streams); fine-grained PAT distinction is implicit (same `token` field); provider docs do not endorse `appAuth` as the recommended IaC role; audit-log streams require a second classic-PAT-authed provider instance because of the GHEC API constraint.

**`terraform-provider-github` v6.12.0 (2026-04-23) — MPL-2.0.** Coverage parity with Pulumi at v6.12.x. Same two structural gaps. No vendoring; pure parity reference for resource-list completeness.

**`octo-sts/app` (Chainguard) — Apache-2.0 (per Chainguard convention).** Active under the `octo-sts` org with active issues stream; canonical URL migrated from `chainguard-dev/octo-sts` to `octo-sts/app`. STS-style OIDC token exchange replaces classic PATs and installation tokens with short-lived tokens; directly attacks scenario (f). Operational dependency, not a Pulumi resource. Cannot solve the audit-log-streaming classic-PAT-only constraint (octo-sts cannot mint classic PATs). Reference / cookbook entry; do not vendor.

**`ossf/allstar` v4.5 (2025-10-01) — Apache-2.0.** Active, 724 commits; OpenSSF-maintained; configuration in an org-level `.allstar` repo. Detective only (issues filed on violation), not preventive or declarative. Complementary as a second-line defense; do not vendor.

**`github/safe-settings` 2.1.20-rc.3 (2026-03-31) — ISC.** Active, 1,202 commits on `main-enterprise`, GitHub-published, ships rulesets coverage. YAML-only DSL with mandatory central admin repo. No policy pack, no drift classifier, no threat-model story; cannot share state with Pulumi-managed cloud resources. Most direct competitor on the bare "settings as code" axis but stops there.

**`step-security/secure-repo` v1.12.0 (2026-04-17) — AGPL-3.0.** Active, 1,408 commits, 32 releases. Workflow hardening (token permissions, Harden-Runner, SHA-pin, Dependabot, CodeQL, Scorecard wiring). AGPL is a copyleft flag — Apache-2.0 Hulumi packages cannot vendor. Cite as the workflow side of the boundary Hulumi-for-GitHub explicitly excludes.

**`cloudposse/terraform-github-repository` v1.6.0 (2026-04-16) — Apache-2.0.** Active, comprehensive repo-level coverage (rulesets, environments, deploy keys, secrets, variables, custom properties, webhooks, autolinks, labels, collaborators). Repo-only — no org foundation, no OIDC sub-claim template, no GHAS config attach. Coverage-completeness reference for SecureRepository's input-arg surface.

**`mineiros-io/terraform-github-repository`.** Issues activity through April 2025; `branch_protections` deprecated (use `_v3`); `defaults` variable deprecated. Reference only.

**`philips-labs/terraform-github-repository`.** Does not exist. The brief conflates with `philips-labs/terraform-aws-github-runner` (archived 2025-01-16). Drop from comparison set.

**StepSecurity Maintained Actions.** Marketed as hardened drop-in replacements for third-party actions; commercial + OSS. Positioned around Actions supply-chain risk, not org IaC.

**Probot framework.** Underlying engine for `safe-settings`. No direct relevance beyond identifying the platform-app substrate.

**`github.OrganizationSettings` (Pulumi resource).** Covers six security defaults (advanced-security, secret-scanning + push-protection, Dependabot alerts/security-updates, dependency-graph) for new repos plus billing/profile/repo-creation/forking knobs. Terraform `github_organization_settings` is exact parity. Risk: GitHub has marked the underlying flat `PATCH /orgs/{org}` `*_enabled_for_new_repositories` fields "endpoint closing down notice."

**`github.EnterpriseSecurityAnalysisSettings` (Pulumi resource).** Enterprise-scoped, adds `secretScanningValidityChecksEnabled` and `secretScanningPushProtectionCustomLink`. Requires "GitHub Enterprise account and enterprise admin permissions." Not a Team-tier story.

**CIS GitHub Benchmark v1.2.0 (March 2026 cohort) — CC BY-NC-SA 4.0.** Established mapping target; same license posture as CIS AWS Foundations. Mirror `packages/baseline/src/mappings/cis-aws.ts` exactly: IDs only, no embedded text, URL pointer per ID-set. Section numbering gated behind CIS WorkBench member access.

**NIST SSDF v1.1 (SP 800-218, final 2022-02-03) — public domain (US Govt work).** Use as canonical SSDF mapping target. Annotate v1.2-draft awareness on individual practices but do not bind to v1.2 IDs until final.

**`M-Davies/cis-github-benchmark`.** Self-described as "a CIS benchmark audit tool for GitHub environments, because it somehow doesn't seem to exist yet." Signal of demand; not usable as a structural reference.

**`aquasecurity/chain-bench`.** Implements CIS Software Supply Chain Security Guide, not CIS GitHub Benchmark. Cannot be used to reverse-engineer CIS GitHub check IDs.

## Architecture Options

**Option A — Mirror the AWS three-package pattern (1:1).** Add `packages/baseline/src/github/` with `secure-repository.ts(+args+outputs)`, `org-foundation.ts(+args+outputs)`, sub-components (`org-rulesets.ts`, `org-actions.ts`, `org-oidc-template.ts`, `enterprise-security-analysis.ts`, `audit-log-streaming.ts`); `mappings/cis-github.ts`, `mappings/nist-ssdf-v1.1.ts`. Reuse `tier.ts` enum unchanged. Policy pack at `packages/policies/src/github/packs/hulumi-hardening.ts` as a separate module satisfying the one-PolicyPack-per-process invariant. Drift adapter at `packages/drift/src/adapters/github-audit-log.ts`. Trade-offs: highest internal consistency with AWS; OrgFoundation owns both REST escape hatches (code-security-configurations attach + audit-log-streams) as sub-resources with explicit "uses REST escape hatch" tagging. The audit-log-streaming sub-component requires `OrgFoundation` to accept _two_ `github.Provider` instances (one GitHub-App-authed, one classic-PAT-authed) — unusual but explicit. Best fit: a GHEC customer who already runs Hulumi-AWS and wants idiomatic parity.

**Option B — Tier-aware split with first-class degraded path.** Same package layout as A, but drift adapters explicitly split into `github-audit-log-ghec.ts` (full fidelity, classic-PAT-authed, 4-adapter quorum equivalent) and `github-webhook-fallback.ts` (Team/Pro tier; subscribes to the six confirmed-deliverable event types via push). The classifier verdict carries a first-class `tier-degraded: true` field for non-GHEC customers and a `feature-not-licensed` outcome for GHAS-only events. `OrgFoundation`'s audit-log-streaming sub-component refuses to materialize at non-GHEC tier rather than silently no-op'ing. `OrgFoundation` provisions both org-level and per-repo webhook subscriptions. Trade-offs: one additional adapter and a more complex tier-decision tree in exchange for honestly owning the wedge persona's likely tier; the webhook fallback sidesteps the classic-PAT-only constraint entirely on the read path.

**Option C — Thin baseline + heavy policy pack.** SecureRepository is minimal (rulesets + security-and-analysis + Actions allowlist); the `HulumiGithubHardeningPack` does the enforcement: rejects raw `github.Repository` without `securityAndAnalysis`; rejects providers with classic-PAT smell-tested at config inspection (best-effort because `token` doesn't distinguish); rejects rulesets without required-status-checks; requires `ActionsOrganizationOidcSubjectClaimCustomizationTemplate` to declare a non-default sub shape (UNC6426 enforced at preview-time); ships rule **G-OIDC-1** rejecting any IAM/Entra/GCP-WIF trust whose `sub` condition uses `StringLike` or contains `*`. Threat-model skill scenarios (d), (c), (f), (e) bind directly to policy IDs in the H1/H2/H3/H4 idiom. Trade-offs: strongest preview-time enforcement story but increases pull on Hulumi-tagged exemptions for legitimate edge cases; classic-PAT detection is best-effort, not surgical.

**Composition note.** The raw findings consolidate to a recommended composition of **B + C** (B owns the tier reality of the wedge persona; C owns the threat-model-skill→policy-rule binding); A's dual-credential audit-log story folds into B as a GHEC-only sub-feature.

## API & SDK Documentation

**Pulumi GitHub provider (v6.13.0, 2026-04-24).** Registry hub: https://www.pulumi.com/registry/packages/github/. Provider auth schema: https://www.pulumi.com/registry/packages/github/api-docs/provider/. Installation & configuration: https://www.pulumi.com/registry/packages/github/installation-configuration/. Source: https://github.com/pulumi/pulumi-github. Releases: https://github.com/pulumi/pulumi-github/releases. Pulumi GitHub App (VCS integration, distinct from provider auth): https://www.pulumi.com/docs/version-control/github-app/. Pulumi Version Control Integrations: https://www.pulumi.com/docs/integrations/version-control/. Continuous-delivery via GitHub Actions: https://www.pulumi.com/docs/iac/guides/continuous-delivery/github-actions/.

Resource API docs:

- `github.Repository` — https://www.pulumi.com/registry/packages/github/api-docs/repository/
- `github.RepositoryRuleset` (with `requiredCodeScanning`, `requiredCodeScanningTools`, alert/severity thresholds) — https://www.pulumi.com/registry/packages/github/api-docs/repositoryruleset/
- `github.OrganizationRuleset` — https://www.pulumi.com/registry/packages/github/api-docs/organizationruleset/
- `github.OrganizationSettings` (org-level security defaults at all tiers) — https://www.pulumi.com/registry/packages/github/api-docs/organizationsettings/
- `github.ActionsOrganizationOidcSubjectClaimCustomizationTemplate` — https://www.pulumi.com/registry/packages/github/api-docs/actionsorganizationoidcsubjectclaimcustomizationtemplate/
- `github.EnterpriseSecurityAnalysisSettings` (enterprise defaults: validity-checks, custom-link) — https://www.pulumi.com/registry/packages/github/api-docs/enterprisesecurityanalysissettings/

**GitHub REST API surfaces.**

- Enterprise audit log REST endpoints (classic-PAT-only, `read:audit_log`): https://docs.github.com/en/enterprise-cloud@latest/rest/enterprise-admin/audit-log (versioned `apiVersion=2026-03-10`).
- Using the audit log API for your enterprise (retention 180d non-Git / 7d Git): https://docs.github.com/en/enterprise-cloud@latest/admin/monitoring-activity-in-your-enterprise/reviewing-audit-logs-for-your-enterprise/using-the-audit-log-api-for-your-enterprise.
- Streaming the audit log for your enterprise (S3, Azure Blob, Azure Event Hubs, Datadog, GCS, Splunk): https://docs.github.com/en/enterprise-cloud@latest/admin/monitoring-activity-in-your-enterprise/reviewing-audit-logs-for-your-enterprise/streaming-the-audit-log-for-your-enterprise.
- GHES 3.14 streaming: https://docs.github.com/en/enterprise-server@3.14/admin/monitoring-activity-in-your-enterprise/reviewing-audit-logs-for-your-enterprise/streaming-the-audit-log-for-your-enterprise.
- Reviewing the audit log for your organization (GHEC org-level API): https://docs.github.com/en/enterprise-cloud@latest/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/reviewing-the-audit-log-for-your-organization.
- Webhook events and payloads: https://docs.github.com/en/webhooks/webhook-events-and-payloads.
- Managing security and analysis settings for your repository (configuration plane): https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-security-and-analysis-settings-for-your-repository.
- Quickstart for securing your repository (workflow plane): https://docs.github.com/en/code-security/getting-started/quickstart-for-securing-your-repository.
- GitHub security features overview: https://docs.github.com/en/code-security/getting-started/github-security-features.
- Actions secure-use reference (OIDC, SHA pinning): https://docs.github.com/en/actions/reference/security/secure-use.
- Security hardening with OIDC (job_workflow_ref / environment / ref guidance): https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect.

**Cloud OIDC trust documentation.**

- AWS — Creating OIDC IdP for GitHub: https://docs.aws.amazon.com/IAM/latest/UserGuide/id_jwt_creating_oidc_provider_github.html.
- Azure — Workload identity federation: https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation-create-trust.
- GCP — Workload identity federation with deployment pipelines: https://cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines.

**Frameworks and standards.**

- NIST SSDF on GitHub (Well-Architected mapping): https://wellarchitected.github.com/library/scenarios/nist-ssdf-implementation/.
- NIST SP 800-218: https://csrc.nist.gov/pubs/sp/800/218/final.
- NIST SSDF project: https://csrc.nist.gov/Projects/ssdf.
- NIST SP 800-218 v1.2 IPD notice: https://csrc.nist.gov/News/2025/draft-ssdf-version-1-2.
- NIST CSRC publications index: https://csrc.nist.gov/publications/sp.
- SLSA v1.2 source-track requirements: https://slsa.dev/spec/v1.2/source-requirements.
- OpenSSF Scorecard: https://scorecard.dev/.
- MITRE ATT&CK T1195 (Supply Chain Compromise): https://attack.mitre.org/techniques/T1195/.

**CIS license / posture.**

- CIS Benchmarks index: https://www.cisecurity.org/cis-benchmarks.
- CIS Terms of Use for Non-Member Products: https://www.cisecurity.org/terms-of-use-for-non-member-cis-products.
- CIS Benchmarks March 2026 update: https://www.cisecurity.org/insights/blog/cis-benchmarks-march-2026-update.
- Microsoft Learn — CIS Benchmark offering: https://learn.microsoft.com/en-us/compliance/regulatory/offering-cis-benchmark.

**GitHub platform changelog (best-proxy roadmap signal).**

- GitHub Changelog (filter by Actions/Audit log/Security): https://github.blog/changelog/.
- 2026 Actions security roadmap: https://github.blog/news-insights/product-news/whats-coming-to-our-github-actions-2026-security-roadmap/.
- Actions org policy SHA-pin GA (2025-08-15): https://github.blog/changelog/2025-08-15-github-actions-policy-now-supports-blocking-and-sha-pinning-actions/.
- Audit-log streaming of API requests GA (2025-01-13): https://github.blog/changelog/2025-01-13-audit-log-streaming-of-api-requests-is-generally-available/.
- API-requests audit-log streaming private beta (2023-02-01): https://github.blog/changelog/2023-02-01-api-requests-are-available-via-audit-log-streaming-private-beta/.
- API-requests audit-log streaming public beta (2023-04-03): https://github.blog/changelog/2023-04-03-api-requests-are-available-via-audit-log-streaming-public-beta/.
- Securing the open source supply chain across GitHub: https://github.blog/security/supply-chain-security/securing-the-open-source-supply-chain-across-github/.

## Design Recommendations

1. **Adopt `pulumi-github` v6.13.0 as the mandatory baseline.** _(confidence: high)_ Provider exposes the rulesets, OIDC sub-claim template, Actions allowlist, and org-level security defaults required for SecureRepository / OrgFoundation. Two structural gaps (Code Security Configurations attach, audit-log streams) are platform-wide REST escape hatches present in Terraform too — they shape OrgFoundation's internal escape-hatch surface but do not block the wedge.

2. **Treat `OrganizationSettings` as the all-tier org-security-defaults surface and `EnterpriseSecurityAnalysisSettings` as the GHEC-only superset.** _(confidence: high)_ Mirrors the documented Pulumi resources directly; the only escape-hatch list that needs REST is then exactly two (configurations-attach + audit-log streams).

3. **Recommend Option B (tier-aware split with first-class degraded path) as the default architecture.** _(confidence: medium)_ Confirmed feasible by the webhook-events table at all six event types relevant to drift, and aligned with the wedge persona's likely non-GHEC tier. Confidence is medium because the persona's actual tier (GHEC vs Team vs Pro) is the highest-priority open question; if the user confirms GHEC, Option A becomes the default.

4. **Compose Option C (heavy policy pack) alongside Option B.** _(confidence: medium)_ Threat-model-skill→policy-rule binding (G-OIDC-1 plus G-1..G-4) gives the `/hulumi-threat-model` skill scenarios concrete, enforced policy IDs in the H1/H2/H3/H4 idiom. Confidence is medium because some rules (classic-PAT smell test) are best-effort given the provider's implicit fine-grained-PAT distinction.

5. **Design the drift classifier verdict to expose `tier-degraded` and `feature-not-licensed` as first-class outcomes.** _(confidence: high)_ Directly required by the GHEC-only audit-log API gate, the classic-PAT-only auth constraint, and the GHAS licensing requirement on private-repo `code_scanning_alert` webhooks. Hiding either truth in an internal hedge would be dishonest about the tier reality.

6. **When `OrgFoundation` configures audit-log streaming, accept two `github.Provider` instances — one GitHub-App-authed for everything else, one classic-PAT-authed exclusively for the streams escape hatch.** _(confidence: high)_ The classic-PAT-only constraint on the audit-log endpoint family is documented and uniform across all seven endpoints; sharing auth is impossible.

7. **Adopt `repo:{org}/{repo}:job_workflow_ref:{org}/{repo}/.github/workflows/{workflow}@{ref}:environment:{environment}` (with documented `:ref:refs/heads/main` fallback) as the Hulumi default for `ActionsOrganizationOidcSubjectClaimCustomizationTemplate`, and ship policy rule G-OIDC-1 rejecting `StringLike` / wildcard `sub` conditions on AWS/Azure/GCP trust policies.** _(confidence: high)_ AWS, Azure, GCP, and GitHub guidance converge on the three-axis `repository → ref/environment → job_workflow_ref` scoping; UNC6426 weaponized exactly the wildcard shape Pulumi accepts as a non-Hulumi default.

8. **Mirror `packages/baseline/src/mappings/cis-aws.ts` exactly for `cis-github.ts`: IDs-only `as const` export, URL pointer per ID-set, never embed CIS Benchmark control text.** _(confidence: high)_ CC BY-NC-SA 4.0 + CIS Non-Member Terms forbid posting/redistribution; the Apache-2.0 + ID-only-citation pattern is identical to the existing AWS posture.

9. **Target NIST SSDF v1.1 (SP 800-218 final, 2022-02-03) as the canonical mapping baseline; annotate v1.2-draft awareness on practices that materially shift, but do not bind to v1.2 IDs until final.** _(confidence: high)_ SSDF v1.2 IPD comment period closed 2026-01-30 and no second draft has been published; binding to a moving baseline risks renumbering on final.

10. **Headline the threat-model skill scenarios as (d) OIDC trust to cloud, (c) Actions supply-chain, (f) GitHub App / installation-token exposure, and (e) self-hosted runners; treat (a) and (b) as components the skill leverages, not scenarios it highlights.** _(confidence: medium)_ Demand-vs-supply ranking is anchored in 2025–2026 incidents (UNC6426, trivy-action, tj-actions, Shai-Hulud, OpenAI Codex, Vercel) rather than a practitioner survey; confidence rises to high if a survey-side signal corroborates.

11. **Cite `step-security/secure-repo` as "the workflow side of the boundary Hulumi-for-GitHub explicitly excludes" in scope-contract documentation; do not vendor.** _(confidence: high)_ AGPL-3.0 makes vendoring impossible under Apache-2.0 outbound; using it as the canonical example of out-of-scope reinforces the infra-only contract.

12. **Document `octo-sts/app` as a recommended companion auth pattern in cookbooks; do not depend on it.** _(confidence: medium)_ Directly attacks scenario (f) but is an operational dependency rather than a Pulumi resource; binding `OrgFoundation` to it would over-couple the wedge.

## Risks & Open Questions

1. **Wedge persona's GitHub plan tier (GHEC, Team, or Pro) is unconfirmed.** _(highest priority — blocks default architecture choice)_ The brief says "company's GitHub orgs and ~30 repos" without committing to a tier. Determines whether Option A or Option B is the headline path and whether the drift classifier's tier-degraded experience is the default or the fallback. Should be surfaced as a user-prompt rather than guessed.

2. **CIS GitHub Benchmark v1.2.0 section numbering is gated behind CIS WorkBench member access.** Public proxies do not work — `aquasecurity/chain-bench` implements the CIS Software Supply Chain Security Guide (sections 1–4), not the CIS GitHub Benchmark; `M-Davies/cis-github-benchmark` self-describes as "doesn't seem to exist yet." Blocks `mappings/cis-github.ts` authoring with confident IDs until WorkBench access is obtained.

3. **GitHub has marked the `PATCH /orgs/{org}` flat `*_enabled_for_new_repositories` fields with an "endpoint closing down notice. Please use code security configurations instead."** If the flat fields are removed before Hulumi-for-GitHub ships, `OrganizationSettings`-based components break at all tiers and the configurations-attach REST escape hatch becomes mandatory rather than optional. Deprecation timeline not yet sourced.

4. **Empirical demand signal for the threat-model scenarios is incident-anchored, not survey-anchored.** Snyk State of Software Supply Chain 2026 / GitHub Octoverse 2026 / HN/Reddit/r/devops aggregation was not run. The d > c > f > e ordering could shift with practitioner-survey corroboration.

5. **The `terraform-provider-github` v6.12.0 vs `pulumi-github` v6.13.0 resource-list diff was not exhaustively run.** While both were observed to have the same two structural gaps (configurations-attach, audit-log streams), a property-by-property diff (e.g. `github_organization_settings` vs `OrganizationSettings`, `github_repository.security_and_analysis` vs `Repository.securityAndAnalysis`) was not performed. A latent Terraform-only resource would weaken Recommendation 1.

6. **NIST SSDF v1.2 final timing risk.** SP 800-218r1 IPD closed comments 2026-01-30; no second draft as of 2026-04-25. If NIST publishes v1.2 final between now and Hulumi-for-GitHub ship, the mappings module either targets a moving baseline or stays on v1.1 — decision pending.

7. **The `repository_ruleset` event tier-gating was checked at the docs level but not against a live non-GHEC org.** Webhook-event documentation supports delivery at Team, but a live confirmation that `repository_ruleset.edited` actually fires on a Team-tier repo would close the residual risk in Option B's webhook fallback.

8. **OIDC `job_workflow_ref` template ergonomics for N×M workflow×env matrices are not specified.** The recommended three-axis default works for one-workflow-per-env patterns; customers with multiple reusable workflows × multiple envs need a sourced exemption-cookbook strategy rather than an opinion.

9. **Pulumi provider docs do not endorse `appAuth` as the recommended IaC role.** The "use a GitHub App" stance is Hulumi-owned, not Pulumi-derived. If Pulumi later publishes a different opinion (e.g. fine-grained PAT first), Hulumi guidance may need to re-anchor.

10. **`pulumi-github` v6.13.0 release date precision.** One WebFetch slice returned a "2024" date string for the release that contradicts the 2026 timeline. Surrounding evidence (today is 2026-04-25; terraform-provider-github v6.12.0 dated 2026-04-23; v6.12.2 from 2026-04-10) makes 2026 the consistent reading, but the contradiction was not fully resolved.

11. **MITRE ATT&CK has no SCM-specific matrix in 2026.** T1195 + sub-techniques are the canonical anchor used in the dossier, but the absence of a dedicated SCM/DevOps technique cluster means threat-model scenario binding to ATT&CK IDs will be lossy. Whether this matters for the wedge audience is unconfirmed.

12. **Auth-mode constraint on audit-log streaming-management endpoints was sourced explicitly for `/enterprises/{enterprise}/audit-log` but the streaming-specific docs page in iter-2 did not requote the constraint.** Confidence remains high (the REST docs apply uniformly) but a recheck against the streaming-management endpoint family before locking design is warranted.

## References

- [Github Provider | Pulumi Registry](https://www.pulumi.com/registry/packages/github/)
- [github.Provider | Pulumi Registry](https://www.pulumi.com/registry/packages/github/api-docs/provider/)
- [Pulumi GitHub Installation & Configuration](https://www.pulumi.com/registry/packages/github/installation-configuration/)
- [github.Repository | Pulumi Registry](https://www.pulumi.com/registry/packages/github/api-docs/repository/)
- [github.RepositoryRuleset | Pulumi Registry](https://www.pulumi.com/registry/packages/github/api-docs/repositoryruleset/)
- [github.OrganizationRuleset | Pulumi Registry](https://www.pulumi.com/registry/packages/github/api-docs/organizationruleset/)
- [github.OrganizationSettings | Pulumi Registry](https://www.pulumi.com/registry/packages/github/api-docs/organizationsettings/)
- [github.ActionsOrganizationOidcSubjectClaimCustomizationTemplate | Pulumi Registry](https://www.pulumi.com/registry/packages/github/api-docs/actionsorganizationoidcsubjectclaimcustomizationtemplate/)
- [github.EnterpriseSecurityAnalysisSettings | Pulumi Registry](https://www.pulumi.com/registry/packages/github/api-docs/enterprisesecurityanalysissettings/)
- [pulumi/pulumi-github (source)](https://github.com/pulumi/pulumi-github)
- [Releases · pulumi/pulumi-github](https://github.com/pulumi/pulumi-github/releases)
- [pulumi/registry](https://github.com/pulumi/registry)
- [Pulumi GitHub App | Pulumi Docs](https://www.pulumi.com/docs/version-control/github-app/)
- [Pulumi Version Control Integrations | Pulumi Docs](https://www.pulumi.com/docs/integrations/version-control/)
- [Using Pulumi GitHub Actions | Pulumi Docs](https://www.pulumi.com/docs/iac/guides/continuous-delivery/github-actions/)
- [REST API endpoints for enterprise audit logs — GHEC](https://docs.github.com/en/enterprise-cloud@latest/rest/enterprise-admin/audit-log)
- [REST API endpoints for enterprise audit logs — GHEC (versioned)](https://docs.github.com/en/enterprise-cloud@latest/rest/enterprise-admin/audit-log?apiVersion=2026-03-10)
- [Using the audit log API for your enterprise — GHEC](https://docs.github.com/en/enterprise-cloud@latest/admin/monitoring-activity-in-your-enterprise/reviewing-audit-logs-for-your-enterprise/using-the-audit-log-api-for-your-enterprise)
- [Streaming the audit log for your enterprise — GHEC](https://docs.github.com/en/enterprise-cloud@latest/admin/monitoring-activity-in-your-enterprise/reviewing-audit-logs-for-your-enterprise/streaming-the-audit-log-for-your-enterprise)
- [Streaming the audit log — GHES 3.14](https://docs.github.com/en/enterprise-server@3.14/admin/monitoring-activity-in-your-enterprise/reviewing-audit-logs-for-your-enterprise/streaming-the-audit-log-for-your-enterprise)
- [Reviewing the audit log for your organization — GHEC](https://docs.github.com/en/enterprise-cloud@latest/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/reviewing-the-audit-log-for-your-organization)
- [Webhook events and payloads — GitHub Docs](https://docs.github.com/en/webhooks/webhook-events-and-payloads)
- [Managing security and analysis settings for your repository — GitHub Docs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-security-and-analysis-settings-for-your-repository)
- [Quickstart for securing your repository — GitHub Docs](https://docs.github.com/en/code-security/getting-started/quickstart-for-securing-your-repository)
- [GitHub security features — GitHub Docs](https://docs.github.com/en/code-security/getting-started/github-security-features)
- [GitHub Docs — Actions secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)
- [Security hardening with OpenID Connect — GitHub Docs](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
- [AWS — Creating OIDC IdP for GitHub](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_jwt_creating_oidc_provider_github.html)
- [Azure — Workload identity federation create trust](https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation-create-trust)
- [GCP — Workload identity federation with deployment pipelines](https://cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines)
- [GitHub Advanced Security overview](https://github.com/security/advanced-security)
- [GitHub Changelog](https://github.blog/changelog/)
- [What's coming to our GitHub Actions 2026 security roadmap (GitHub Blog)](https://github.blog/news-insights/product-news/whats-coming-to-our-github-actions-2026-security-roadmap/)
- [GitHub Actions policy now supports blocking and SHA-pinning actions (Changelog 2025-08-15)](https://github.blog/changelog/2025-08-15-github-actions-policy-now-supports-blocking-and-sha-pinning-actions/)
- [Audit log streaming of API requests is generally available (Changelog 2025-01-13)](https://github.blog/changelog/2025-01-13-audit-log-streaming-of-api-requests-is-generally-available/)
- [API requests in audit-log streaming Private Beta (Changelog 2023-02-01)](https://github.blog/changelog/2023-02-01-api-requests-are-available-via-audit-log-streaming-private-beta/)
- [API requests are available via audit log streaming Public Beta (Changelog 2023-04-03)](https://github.blog/changelog/2023-04-03-api-requests-are-available-via-audit-log-streaming-public-beta/)
- [Securing the open source supply chain across GitHub](https://github.blog/security/supply-chain-security/securing-the-open-source-supply-chain-across-github/)
- [ossf/allstar](https://github.com/ossf/allstar)
- [Introducing the Allstar GitHub App — OpenSSF Blog](https://openssf.org/blog/2021/08/11/introducing-the-allstar-github-app/)
- [Google open-sources Allstar — The Record](https://therecord.media/google-open-sources-allstar-a-tool-to-protect-github-repos)
- [github/safe-settings](https://github.com/github/safe-settings)
- [github/safe-settings Discussion #644](https://github.com/github/safe-settings/discussions/644)
- [Settings app — Probot](https://probot.github.io/apps/settings/)
- [Probot Documentation](https://probot.github.io/docs/)
- [step-security/secure-repo](https://github.com/step-security/secure-repo)
- [StepSecurity (vendor site)](https://www.stepsecurity.io/)
- [StepSecurity — GitHub Actions Security](https://www.stepsecurity.io/github-actions-and-stepsecurity)
- [StepSecurity App](https://app.stepsecurity.io/)
- [StepSecurity Action Advisor — octo-sts](https://app.stepsecurity.io/action-advisor/octo-sts/action)
- [StepSecurity (org)](https://github.com/step-security)
- [octo-sts/app](https://github.com/octo-sts/app)
- [octo-sts/app releases](https://github.com/octo-sts/app/releases)
- [Octo STS org](https://github.com/octo-sts)
- [Octo STS FAQ — Chainguard Academy](https://edu.chainguard.dev/open-source/octo-sts/faq/)
- [philips-labs (org)](https://github.com/philips-labs)
- [GitHub Repository Settings as Code — wicksipedia](https://wicksipedia.com/blog/github-settings-as-code/)
- [Wiz — Hardening GitHub Actions](https://www.wiz.io/blog/github-actions-security-guide)
- [Wiz — prt-scan supply chain campaign](https://www.wiz.io/blog/six-accounts-one-actor-inside-the-prt-scan-supply-chain-campaign)
- [OpenSSF — Maintainers' guide after tj-actions/reviewdog](https://openssf.org/blog/2025/06/11/maintainers-guide-securing-ci-cd-pipelines-after-the-tj-actions-and-reviewdog-supply-chain-attacks/)
- [Snyk — Trivy GitHub Actions supply-chain compromise](https://snyk.io/articles/trivy-github-actions-supply-chain-compromise/)
- [Sysdig — Self-hosted GitHub Actions runners as backdoors](https://www.sysdig.com/blog/how-threat-actors-are-using-self-hosted-github-actions-runners-as-backdoors)
- [CSA Labs — OIDC trust chain abuse cloud takeover](https://labs.cloudsecurityalliance.org/research/briefing-csa-research-note-oidc-trust-chain-abuse-cloud-take/)
- [Unit 42 — OH-MY-DC: OIDC misconfigurations in CI/CD](https://unit42.paloaltonetworks.com/oidc-misconfigurations-in-ci-cd/)
- [The Hacker News — OpenAI patches ChatGPT data exposure](https://thehackernews.com/2026/03/openai-patches-chatgpt-data.html)
- [BlockSentient — GitHub Enterprise 2026 review](https://blocksentient.com/review/github-enterprise/)
- [SOCFortress — Secure Use of GitHub CIS-aligned Part VII (Medium)](https://socfortress.medium.com/secure-use-of-github-cis-aligned-technical-guide-part-vii-c3f03db9205e)
- [CIS Benchmarks (index)](https://www.cisecurity.org/cis-benchmarks)
- [CIS Terms of Use for Non-Member CIS Products](https://www.cisecurity.org/terms-of-use-for-non-member-cis-products)
- [CIS Benchmarks March 2026 Update](https://www.cisecurity.org/insights/blog/cis-benchmarks-march-2026-update)
- [Microsoft Learn — CIS Benchmark offering](https://learn.microsoft.com/en-us/compliance/regulatory/offering-cis-benchmark)
- [M-Davies/cis-github-benchmark](https://github.com/M-Davies/cis-github-benchmark)
- [dev-sec/cis-dil-benchmark](https://github.com/dev-sec/cis-dil-benchmark)
- [dev-sec/cis-docker-benchmark](https://github.com/dev-sec/cis-docker-benchmark)
- [dev-sec/cis-kubernetes-benchmark](https://github.com/dev-sec/cis-kubernetes-benchmark)
- [mitre/cis-bench (CIS WorkBench CLI)](https://github.com/mitre/cis-bench)
- [NIST SSDF on GitHub — Well-Architected](https://wellarchitected.github.com/library/scenarios/nist-ssdf-implementation/)
- [NIST SP 800-218 (final)](https://csrc.nist.gov/pubs/sp/800/218/final)
- [NIST SSDF Project page](https://csrc.nist.gov/Projects/ssdf)
- [Draft SSDF version 1.2 (CSRC News, 2025-12-17)](https://csrc.nist.gov/News/2025/draft-ssdf-version-1-2)
- [NIST CSRC publications — SP](https://csrc.nist.gov/publications/sp)
- [SLSA v1.2 source-track requirements](https://slsa.dev/spec/v1.2/source-requirements)
- [OpenSSF Scorecard](https://scorecard.dev/)
- [MITRE ATT&CK — T1195 Supply Chain Compromise](https://attack.mitre.org/techniques/T1195/)
