---
name: hulumi-github
created: 2026-04-25
status: ideation
tla_required: false
---

# Hulumi for GitHub — extending the Hulumi pattern from AWS to GitHub-as-IaC

> **Note on origin**: This doc was synthesized from a single conversation turn rather than a full `/slo-ideate` interrogation, because the requester (kerberosmansour) had already specified the wedge tightly: "create hulumi for github like we did for AWS, but the I in IaC is for infrastructure — don't drift into appsec." The slo-ideate skill says do not run on a well-specified feature where the user already knows the what and the how. The doc still follows the v3 idea-doc shape so `/slo-research` and `/slo-plan` can consume it. Please red-pen before research dispatches.

## The pain

A platform engineer at a Series B startup adopts Hulumi v1.0 in week one and gets `SecureBucket` + `AccountFoundation` + `HulumiHardeningPack` + the drift classifier across 80% of their AWS surface. Week three, they open `github.com/<org>/settings` and realize the GitHub side of the platform — 30+ repos, three orgs, OIDC trust to the AWS accounts they just hardened — is still hand-configured. Branch protection drift between repos. Two repos still allow classic-PAT auth. The CIS GitHub Benchmark spreadsheet from a 2025 consulting engagement is in someone's Google Drive. They want the same Hulumi posture (declarative-by-default, hardened-by-default, drift-classifiable, threat-modeled-before-IaC) for GitHub. Hulumi v1.0 is AWS-only and there is no pattern in the repo for adding a second target.

The pain compounds when an AI agent writes the first cut of `index.ts` against `@pulumi/github` directly — it'll happily generate plausible-looking but unhardened repo declarations (public visibility, no push protection, no required signed commits, classic PAT for the run) unless something opinionated stops it. Same shape as the AWS pain Hulumi already addresses; different surface.

## Five capabilities the user described without realizing

- Declare a GitHub repo with secure-by-default settings — visibility, branch protection / repository ruleset, push protection, secret scanning, signed commits, vulnerability reporting, default workflow permissions, fork-PR approval — without re-deriving the CIS GitHub Benchmark every time.
- Stop hand-applying the same org-level baseline (Actions allowlist, OIDC provider trust roots, default workflow permissions, classic-PAT disablement, IP allowlist) across orgs.
- Catch the PR that bypasses the hardened component and reaches for raw `github.Repository` (CrossGuard policy pack — same shape as `HulumiHardeningPack`).
- Classify drift between "an admin clicked in github.com" / "GitHub renamed a setting in last week's platform release" / "real out-of-band drift" — same verdict matrix as the AWS drift classifier, different audit-log source.
- Generate a structured, framework-cited threat model for the most-asked GitHub scenarios (org bootstrap, repo hardening, Actions supply-chain, OIDC trust to cloud, GitHub App / PAT exposure) before any IaC is written — same `/hulumi-threat-model` skill, new scenarios.

## Top risks

- **Breach** (scope leak, not platform breach): Project scope creeps from infrastructure into appsec. `@hulumi/policies-github` ships custom CodeQL queries or Semgrep rulesets, then maintains rule logic that triages real findings in users' code. A downstream user assumes the Hulumi-blessed ruleset is exhaustive, ships vulnerable code, blames Hulumi. **Adversary**: the next contributor who PRs "let's add a CodeQL pack to be helpful." **Surface**: maintainer review discipline, runbook in-scope/out-of-scope contract.
- **Compliance fine**: A contributor pastes verbatim CIS GitHub Benchmark control text into a policy comment or markdown. CIS Benchmarks license forbids embedding control text; redistribution under Apache-2.0 is incompatible. CIS revokes Hulumi's right to cite Benchmark IDs across the entire project (AWS pack included). **Regulation**: CIS Benchmarks license terms (Creative Commons Attribution-NonCommercial-NoDerivatives, with member-only commercial-redistribution exception). **Data class**: third-party copyrighted control text. **Scale**: project-wide license clean-room rebuild.
- **Prolonged outage** (named user defection): GitHub audit-log API access for the drift classifier turns out to require Enterprise Cloud tier. Free / Team users get a degraded "drift detected, source unknown" verdict for >50% of changes. They defect to plain `terraform-github-provider` (no drift classifier, but no false promises either) within one rotation. **Who notices first**: the platform engineer who pitched Hulumi internally and now has to explain why the demo works on the founders' Enterprise org but not on the test Team org. **Time to defection**: one sprint.

## Approach A — conservative (thin wrapper, components only)

- **Effort**: 2 person-weeks
- **Wedge week 1**: `@hulumi/baseline.github.SecureRepository` wrapping `pulumi-github`'s `Repository` + `RepositoryRuleset` (or `BranchProtectionV2`) + push-protection / secret-scanning / signed-commits / vulnerability-reporting toggles, with hardened defaults baked in. Nothing org-level, no policies pack, no drift, no skill scenarios.
- **Risks**: under-delivers on the "Hulumi pattern" — user might walk away thinking "this is just a Pulumi component, what's the value-add over copy-pasting the args into my own component?" Doesn't validate the appsec-vs-infra boundary discipline (no policy pack means no test of "what stays in / what stays out").

## Approach B — full feature parity with AWS variant, infra-only

- **Effort**: 5–6 person-weeks
- **Wedge week 1**: `@hulumi/baseline.github.SecureRepository` + skeleton `@hulumi/baseline.github.OrgFoundation` (org-level Actions allowlist + default workflow permissions + OIDC provider trust + classic-PAT disablement) + draft `HulumiGithubHardeningPack` (H1–H4) mirroring the AWS pack. By end of M5: full CIS GitHub Benchmark sections that Pulumi can declaratively reach + drift classifier (or explicit "dropped, here's why" decision) + `/hulumi-threat-model` GitHub scenarios + SLSA-L3 release.
- **Risks**: largest scope. Drift classifier is the long-pole and is conditional on research answer about audit-log access tier. CIS GitHub Benchmark coverage may force more escape hatches to REST/GraphQL custom resources than the AWS variant needed (provider parity is research-blocked). 5–6 weeks fits the M1–M5 (5-milestone) cap of slo-plan.

## Approach C — local / desktop (skill-first)

- **Effort**: 1–2 person-weeks
- **Wedge week 1**: ship five `/hulumi-threat-model` GitHub scenarios (org bootstrap, repo hardening, Actions supply chain, OIDC trust to cloud, self-hosted runner risk) with no components, no policies, no drift. The skill outputs become design briefs the user takes to whatever IaC tool they already use.
- **Risks**: positions Hulumi-for-GitHub as a thinking tool rather than an IaC product line extension. Misses the wedge the user actually pitched ("hulumi for github like we did for AWS"). The skill alone is week-one usable but not the project's strategic value.

## Recommendation

**Approach B**, with a hard scope contract pinned in the runbook's Global Execution Rules: **the I in IaC is Infrastructure**. The runbook will treat as in-scope: anything declarable through Pulumi / GitHub REST / GraphQL that configures the GitHub platform itself (repo settings, ruleset, org settings, GHAS configuration object, OIDC trust, secret-scanning *enablement*, push-protection *enablement*, Dependabot *enablement*, security-config attachment, Actions allowlist, environments, deploy keys). Out of scope and explicitly non-goals: authoring CodeQL queries, authoring Semgrep rules, triaging Dependabot/CodeQL findings, per-PR scanning workflows, custom secret-scanning patterns that imply rule maintenance, anything that requires reading users' source code to function.

The week-one wedge is `SecureRepository` shipped behind an integration test that creates and destroys a real repo in a sandbox GitHub org, mirroring the M2 AWS sandbox pattern from the existing runbook.

### Tier decision (resolved 2026-04-26 after `/slo-research`)

The wedge persona is **Team / Pro tier (no GitHub Enterprise Cloud)**, confirmed by the requester. This collapses the architecture choice cleanly:

- **Drift adapter strategy**: webhook-fallback adapter (push-model, six confirmed event types: `branch_protection_rule`, `repository_ruleset`, `secret_scanning_alert`, `dependabot_alert`, `code_scanning_alert` (GHAS-licensed only on private), `member`, plus org-only `organization`) is **in M1 scope**. The classic-PAT-authed audit-log REST adapter is **deferred to v1.1** because (a) the API is GHEC-only and the wedge persona has no GHEC, and (b) the auth-mode constraint (classic PAT only, no GitHub App, no fine-grained PAT) forces an unusual two-provider configuration that earns no value at the wedge tier.
- **Verdict matrix**: drift classifier exposes `tier-degraded: true` and `feature-not-licensed` as first-class verdicts (e.g., private-repo `code_scanning_alert` requires GHAS, and Hulumi must say so honestly rather than emit a `no-drift` false negative).
- **`OrgFoundation` audit-log streaming**: not implemented in v1; the audit-log streams REST escape hatch is documented as a v1.1 follow-up. `EnterpriseSecurityAnalysisSettings` is similarly out of scope at the wedge tier.
- **`OrganizationSettings`-based hardening**: in scope, with the GitHub-flagged "endpoint closing down notice" on the flat `*_enabled_for_new_repositories` fields treated as a known forward risk — `OrgFoundation` encapsulates org-level security defaults behind an internal abstraction so the Code Security Configurations REST escape hatch can flip in as a backend without a public API break.

This is consistent with `docs/slo/research/hulumi-github/synthesis.md`'s Option B + Option C composition recommendation.

## Open questions for /slo-research

These cannot be answered from the codebase or from training. Each must be answered with a 2026-04-25-current source.

### A. Pulumi + GitHub provider feasibility

1. Does Pulumi have a first-class `pulumi-github` provider, what is its current 2026 version, and what GitHub resources does it cover today (repos, branch protection v2, repository rulesets, org settings, teams, organization secrets, environments, deploy keys, codeowners, code-security configurations object, Actions allowlists, push protection, secret-scanning custom patterns, Dependabot config, OIDC / federated identity to AWS/Azure/GCP, GitHub App installation tokens)?
2. What does the provider NOT cover (gaps that will force escape hatches to `local.command` or REST/GraphQL custom resources)? Specifically: repository rulesets vs legacy branch protection, the GHAS security-configurations scoping object, enterprise-tier-only resources, audit-log streaming.
3. Authentication options for the Pulumi GitHub provider — classic PAT vs fine-grained PAT vs GitHub App. Which auth mode does the provider's docs steer toward in 2026, and which is most "least-privilege-by-default" for the IaC execution role (analogue of `hulumi:iac-role=true` AWS tag)?
4. Comparable Terraform `integrations/github` provider feature parity — anything Terraform covers that Pulumi GitHub doesn't (or vice versa)? This question gates the runbook's "why not just use Terraform" framing.

### B. The infrastructure-vs-appsec boundary in GitHub-as-IaC

5. Survey: what do existing hardened GitHub IaC modules treat as in-scope? At minimum: `mineiros-io/terraform-github-repository`, `philips-labs/terraform-github-repository`, `cloudposse/terraform-github-repository`, GitHub's own `safe-settings` Probot, OpenSSF `allstar`, `step-security/secure-repo`, `chainguard-dev/octo-sts`. For each, list what's in scope and where they explicitly stop. Pad-list of "let me add three more I've never used" is rejected — only confirmed projects.
6. Working definition: which GitHub controls are **infrastructure** (declarable, drift-detectable platform configuration) vs **appsec** (per-PR / per-finding workflow that requires human triage and lives alongside the source code)? Propose a defensible boundary and cite who else has drawn it. The dossier must take a position on each of:
   - Enabling CodeQL / Dependabot / secret scanning / push protection (infra: yes, almost certainly).
   - Authoring CodeQL queries / Semgrep rulesets / custom secret-scanning patterns (appsec: yes, almost certainly).
   - Pinning Actions to SHAs — infra (org-level ruleset enforcement) or appsec (per-workflow source review)?
   - Required workflows / org-level required status checks — infra or appsec?
   - Branch protection / repository rulesets — infra (yes, obvious).
   - GitHub Advanced Security configuration objects — infra (yes; they're scoped enablement) but nuance the answer.
   - Triaging Dependabot/CodeQL alerts — appsec (yes, obvious; out of scope).
7. Are there published frameworks that already draw this line? CIS GitHub Benchmark sections, NIST 800-218 SSDF practice→GitHub-control mappings, SLSA Source Track L1–L4, OpenSSF Scorecard checks, MITRE ATT&CK for SCM (if it exists in 2026).

### C. Hardening framework / control coverage

8. CIS GitHub Benchmark — current 2026 version, section structure, which sections map to org-level vs repo-level vs enterprise-level. License/redistribution: confirm Hulumi's existing rule (cite by ID only, never embed control text) carries over from CIS AWS Foundations to CIS GitHub Benchmark, or note divergence.
9. SLSA Source Track requirements (L1/L2/L3) and which of them are GitHub-configurable as IaC (vs build-time controls already covered by Hulumi's existing AWS provenance work in M5).
10. OpenSSF Scorecard checks → GitHub-IaC mapping. Which Scorecard checks could be enforced declaratively by a hardened component or policy rather than only measured?
11. GitHub's own published 2026 security baselines: GitHub Security Lab guidance, "Securing your enterprise" docs, security-configurations feature defaults. What's GitHub-the-vendor's recommended posture in 2026?

### D. Drift detection on GitHub

12. GitHub audit-log API access — which tier required (Free / Team / Enterprise Cloud) in 2026, what the API surface looks like, retention, streaming destinations. The Hulumi drift classifier verdict matrix needs an analogue: "human in GitHub UI" vs "Pulumi run" vs "GitHub product change" vs "real out-of-band drift." If audit log requires Enterprise Cloud, the recommendation is to defer the drift classifier from M1 scope to a v1.1 follow-up.
13. Does GitHub publish a machine-readable changelog of API/setting changes (the equivalent of `@pulumi/aws` provider release notes for the AWS side)? If not, what's the best proxy?

### E. Threat-model skill scenarios

14. What are the 3–5 most-asked-for GitHub threat-model scenarios in 2026? Validate or replace this candidate list: (a) org bootstrap baseline, (b) repository hardening, (c) Actions supply-chain risk, (d) OIDC trust to cloud accounts, (e) self-hosted runner risk, (f) GitHub App / installation token exposure, (g) GHAS configuration. Demand-rank them; flag any that are oversaturated by existing public guidance.

### F. Competitive / prior-art landscape

15. Closest commercial / OSS competitors specifically positioned as "hardened-by-default GitHub IaC" — list with one-line each on what they are and where they fall short. Do not pad. If only three exist, say three.
16. Is there a "Hulumi for GitHub"-shaped gap in the market in 2026, or is this space adequately served? Take a position; justify with evidence from the survey.

### G. Licensing / redistribution

17. Confirm Apache-2.0 remains the right license (Hulumi's existing posture). Confirm CIS GitHub Benchmark redistribution rules match CIS AWS Foundations rules (IDs only, upstream URL, no embedded control text). Note any divergence.

### H. Naming / packaging

18. Pulumi component package naming convention used by `@hulumi/baseline` is provider-prefixed (`@hulumi/baseline.aws.SecureBucket`). Confirm the right shape for GitHub: `@hulumi/baseline.github.SecureRepository` under the existing `@hulumi/baseline` package, or split package `@hulumi/baseline-github`? What does Pulumi's own ecosystem precedent suggest in 2026?

---

**Next step**: `/slo-research hulumi-github` (the open questions above all require external data). After research lands, skip `/slo-architect` and `/slo-tla` (this is a feature addition to an already-designed workspace, not a new design; no new concurrency surface introduced) and go directly to `/slo-plan hulumi-github`.
