# Hulumi for GitHub — AI-First Runbook v3

> **Purpose**: Extend Hulumi's hardened-by-default IaC pattern from AWS to GitHub-as-Infrastructure, in five milestones. Hulumi v1.0.0 (AWS) is already shipped; this runbook is a feature addition to the same workspace, not a replacement. The hard scope contract — **"the I in IaC is Infrastructure"** — is pinned in the Global Execution Rules and is not negotiable per-milestone.
> **Audience**: AI coding agents first, humans second. Written to reduce ambiguity, prevent scope drift back into appsec, and ship Hulumi for GitHub at the same trust posture as the AWS variant.
> **How to use**: Work milestones sequentially. Before starting any milestone, read its full file under `docs/runbook-milestones/hulumi-github-m{N}.md`, the Global Execution Rules, and the prior milestone's lessons file. After completing it, follow the Global Exit Rules. Never skip ahead. Never silently widen scope back into appsec.
> **Prerequisite reading — Hulumi-for-GitHub planning corpus**: Authoritative pre-implementation artifacts produced by `/slo-ideate` (skipped — well-specified) and `/slo-research` are checked into this repo at `docs/idea/hulumi-github.md` and `docs/research/hulumi-github/{raw,dossier,sources,synthesis}.md`. `/slo-architect` and `/slo-tla` were skipped per the idea doc's recommendation: this is a feature addition to an already-designed workspace and introduces no new concurrency surface beyond what the AWS drift classifier already verified in `HulumiDrift.tla`. Maintainers MUST read those four research artifacts plus the existing AWS runbook ([`docs/RUNBOOK-hulumi.md`](./RUNBOOK-hulumi.md)) before opening a PR that materially changes the GitHub architecture. Each milestone file under [`docs/runbook-milestones/`](./runbook-milestones/) cites the relevant subset in its "Files to read before changing anything" row.

---

## Runbook Metadata

- **Runbook ID**: `hulumi-github-v1`
- **Prefix for test files and lessons files**: `hulumi-github`
- **Primary stack**: TypeScript 5.x on Node 20 LTS, pnpm workspaces, Pulumi CrossGuard v2+, Vitest, Apache-2.0 — same as existing AWS Hulumi workspace; this runbook adds new sub-paths under existing packages, not new packages.
- **Primary surface added by this runbook**:
  - `@hulumi/baseline.github.SecureRepository` + `Args` + `Outputs` (lands in M1)
  - `@hulumi/baseline.github.OrgFoundation` + `Args` + `Outputs` (lands in M2)
  - `@hulumi/policies.github.HulumiGithubHardeningPack` (lands in M3, separate PolicyPack module per the one-pack-per-process invariant)
  - `@hulumi/policies.github.CisGithubV1Pack` (lands in M3, IDs-only mapping; full sections deferred until CIS WorkBench access — see open question #2 in `docs/research/hulumi-github/dossier.md`)
  - `@hulumi/policies.github.G_OIDC_1` rule (lands in M3)
  - `@hulumi/drift.adapters.GithubWebhookFallbackAdapter` (lands in M4; classic-PAT-authed `GithubAuditLogAdapter` is **deferred to v1.1** per tier decision)
  - `DriftVerdict` extended with `tier-degraded: boolean` and `feature-not-licensed: string[]` (lands in M4)
  - `/hulumi-threat-model` skill extended with 4 GitHub scenarios: `github-oidc-trust-cloud-account`, `github-actions-supply-chain`, `github-app-token-exposure`, `github-self-hosted-runner` (land in M1)
- **Default test commands** (additive to existing AWS commands):
  - Unit (mocks, every PR): `pnpm -r test`
  - E2E (policy + drift): `pnpm -r test:e2e`
  - Integration (weekly, real GitHub sandbox org): `pnpm -r test:integration -- --github-sandbox`
  - Build: `pnpm -r build`
  - Lint / typecheck: `pnpm -r lint && pnpm -r typecheck`
  - License-boundary lint: `pnpm run lint:license-boundary` (existing — extends to CIS GitHub Benchmark v1.2.0 and SSDF v1.1)
  - Exact-pin guard: `pnpm run lint:exact-pin-guard` (existing — extends to `@pulumi/github`)
  - TLA+ spec re-verify: existing `HulumiDrift.tla` continues to verify the AWS adapter quorum; the GitHub webhook fallback adapter operates under the same tier-degraded extension and does **not** require new TLA+ verification (see M4 design rule).
- **Allowed new dependencies by default**: `none` (per-milestone exceptions must be explicit in the Contract Block). Anticipated allow-listed exceptions: `@pulumi/github@^6.13.0` (M1), webhook signature verification helper (M4 — vendored if minimal).
- **Schema/config migration allowed by default**: `no`
- **Public interfaces from existing AWS Hulumi v1.0.0 that MUST remain stable** (the GitHub work cannot break them):
  - `hulumi.baseline.aws.AccountFoundation` + `Args` + `Outputs`
  - `hulumi.baseline.aws.SecureBucket` + `Args` + `Outputs`
  - `hulumi.baseline.aws.Tier` string union (the `Tier` enum extends to GitHub via `hulumi.baseline.github.Tier`, sharing the same `"sandbox" | "startup-hardened"` values — no breaking change to AWS callers)
  - `hulumi.policies.aws.CisV5Pack`, `HulumiHardeningPack`
  - `hulumi.policies.PackMetadata`, `hulumi.policies.Suppression`
  - `hulumi.drift.DriftClassifier`, `DriftSource` enum (additions allowed for `github-webhook-event` and `github-product-change`; renames forbidden), `DriftAdapter` interface, the four AWS adapter classes
  - AWS resource tag keys `hulumi:iac-role`, `hulumi:tier`, `hulumi:component`, `hulumi:controls`
  - `SKILL.md` frontmatter (agentskills.io spec) + skill name `/hulumi-threat-model` (the 5 AWS scenarios remain stable; 4 GitHub scenarios are added)
  - Cache schema `schemaVersion: 1` for `.hulumi/drift-cache/*.json` (additions for GitHub fields require either a schema bump to `2` or be optional with backward-compatible defaults — M4 decides)

---

## Milestone Tracker

Update this table as each milestone is completed. This is the single source of truth for progress.

| #   | Milestone                                                                                                  | Status        | Started | Completed | Lessons File                                                              | Completion Summary                                                              |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------- | ------- | --------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | `/hulumi-threat-model` GitHub scenarios + `@hulumi/baseline.github.SecureRepository` + sandbox-org E2E     | `done`        | 2026-04-26 | 2026-04-26 | [docs/lessons/hulumi-github-m1.md](./lessons/hulumi-github-m1.md)         | [docs/completion/hulumi-github-m1.md](./completion/hulumi-github-m1.md)         |
| 2   | `@hulumi/baseline.github.OrgFoundation` + Code-Security-Configurations switchable backend                  | `done`        | 2026-04-26 | 2026-04-26 | [docs/lessons/hulumi-github-m2.md](./lessons/hulumi-github-m2.md)         | [docs/completion/hulumi-github-m2.md](./completion/hulumi-github-m2.md)         |
| 3   | `@hulumi/policies.github.HulumiGithubHardeningPack` H1–H4 + `CisGithubV1Pack` + `G_OIDC_1`                 | `done`        | 2026-04-26 | 2026-04-26 | [docs/lessons/hulumi-github-m3.md](./lessons/hulumi-github-m3.md)         | [docs/completion/hulumi-github-m3.md](./completion/hulumi-github-m3.md)         |
| 4   | `GithubWebhookFallbackAdapter` + verdict matrix (`tier-degraded`, `feature-not-licensed`) + adapter quorum | `done`        | 2026-04-26 | 2026-04-26 | [docs/lessons/hulumi-github-m4.md](./lessons/hulumi-github-m4.md)         | [docs/completion/hulumi-github-m4.md](./completion/hulumi-github-m4.md)         |
| 5   | SLSA-L3 atomic-three-package release of GitHub additions + launch readiness (cookbooks, examples, docs)    | `done`        | 2026-04-26 | 2026-04-26 | [docs/lessons/hulumi-github-m5.md](./lessons/hulumi-github-m5.md)         | [docs/completion/hulumi-github-m5.md](./completion/hulumi-github-m5.md)         |

<!-- Status values: not_started | in_progress | blocked | done -->

---

## End-to-End Architecture Diagram

Target end state after M5. Solid lines exist by end of v1; dashed lines are v1.1+ deferrals (audit-log adapter, GHEC-only sub-features).

```mermaid
%%{init: {"flowchart": {"curve": "basis"}}}%%
flowchart TB
    subgraph User["User Environment (laptop or CI)"]
        Eng[Platform Engineer]
        CC[Claude Code]
        Git[(Local git repo with Pulumi program)]
        PulumiCLI[Pulumi CLI + Automation API]
        Baseline["@hulumi/baseline (v1.x — extended .github.* surface)"]
        Policies["@hulumi/policies (v1.x — extended .github.* PolicyPack)"]
        Drift["@hulumi/drift (v1.x — extended GithubWebhookFallbackAdapter)"]
        Skill["/hulumi-threat-model skill (4 new GitHub scenarios)"]
        DriftCache[(.hulumi/drift-cache mode 0600)]
    end

    subgraph PulumiSide["Pulumi State Plane"]
        StateBackend[(State Backend — Pulumi Cloud or S3+DDB)]
    end

    subgraph GitHub["Target GitHub Org (trust boundary — Team or Pro tier)"]
        IacApp["IaC GitHub App installation token (default) or fine-grained PAT (cookbook)"]
        Repos["Repos with RepositoryRuleset, security-and-analysis, environments"]
        OrgSettings["OrganizationSettings (encapsulated; CSC backend switchable)"]
        OrgRulesets[OrganizationRuleset]
        OrgActions["ActionsOrganizationPermissions (allowlist + SHA-pin)"]
        OidcTemplate["ActionsOrganizationOidcSubjectClaimCustomizationTemplate (job_workflow_ref + environment)"]
        OrgWebhooks[("Org-level webhooks delivering branch_protection_rule, repository_ruleset, member, organization, etc.")]
        RepoWebhooks[("Per-repo webhooks delivering secret_scanning_alert, dependabot_alert, code_scanning_alert*")]
    end

    subgraph AWS_existing["Existing AWS surface (Hulumi v1.0.0 — unchanged)"]
        IacRole["IaC Role tagged hulumi:iac-role=true"]
        AwsResources[(SecureBucket / AccountFoundation / CIS-v5 hardened)]
        OidcTrust["AWS OIDC IdP for GitHub (trust policy uses StringEquals on job_workflow_ref + environment)"]
    end

    subgraph Upstream["npm + GitHub ecosystem"]
        PulumiGithub["@pulumi/github exact-pinned (^6.13.0)"]
        CrossGuard[CrossGuard SDK]
        AutomationApi[Pulumi Automation API]
        NpmRegistry[(npm registry + provenance)]
        GHReleases[(GitHub Releases + SBOMs)]
    end

    subgraph Deferred["v1.1 deferrals"]
        AuditLogAdapter["Classic-PAT GithubAuditLogAdapter (GHEC-only)"]
        AuditStreams["EnterpriseSecurityAnalysisSettings + audit-log streams"]
    end

    Eng -->|prompts| CC
    CC -->|reads SKILL.md| Skill
    Skill -. guides component choice .-> CC
    CC -->|writes Pulumi| Git
    Git -->|imports| Baseline
    Git -->|imports| Policies
    Baseline -. pins .-> PulumiGithub
    Policies -. depends on .-> CrossGuard

    Eng -->|pulumi up| PulumiCLI
    PulumiCLI -->|evaluates| Policies
    PulumiCLI -->|reads/writes| StateBackend
    PulumiCLI -->|installs| IacApp
    IacApp -->|API calls| Repos
    IacApp -->|API calls| OrgSettings
    IacApp -->|API calls| OrgRulesets
    IacApp -->|API calls| OrgActions
    IacApp -->|API calls| OidcTemplate
    IacApp -->|configures| OrgWebhooks
    IacApp -->|configures| RepoWebhooks

    OidcTemplate -. shapes sub claim .-> OidcTrust
    OidcTrust -.->|GH Actions assume| IacRole
    IacRole -->|API calls| AwsResources

    Drift -->|Automation API| AutomationApi
    Drift -->|webhook receiver| OrgWebhooks
    Drift -->|webhook receiver| RepoWebhooks
    Drift -->|git log via simple-git| Git
    Drift -->|pinned vs latest| PulumiGithub
    Drift -->|persist 0600| DriftCache

    NpmRegistry -.->|SLSA L3 attestations| Baseline
    NpmRegistry -.->|SLSA L3 attestations| Policies
    NpmRegistry -.->|SLSA L3 attestations| Drift
    GHReleases -.->|SBOMs| NpmRegistry

    AuditLogAdapter -. v1.1 .-> Drift
    AuditStreams -. v1.1 .-> IacApp

    classDef built fill:#e0f2fe,stroke:#0369a1,color:#0c4a6e
    classDef exists fill:#fef3c7,stroke:#b45309,color:#78350f
    classDef persist fill:#dcfce7,stroke:#15803d,color:#14532d
    classDef actor fill:#fae8ff,stroke:#7e22ce,color:#581c87
    classDef deferred fill:#fee2e2,stroke:#b91c1c,color:#7f1d1d

    class Eng actor
    class CC,PulumiCLI,CrossGuard,AutomationApi,PulumiGithub,NpmRegistry,GHReleases exists
    class Skill,Baseline,Policies,Drift,IacApp,Repos,OrgSettings,OrgRulesets,OrgActions,OidcTemplate,OrgWebhooks,RepoWebhooks built
    class IacRole,AwsResources,OidcTrust exists
    class Git,DriftCache,StateBackend persist
    class AuditLogAdapter,AuditStreams deferred
```

### Component Summary Table

| Component                                           | Milestone | Purpose                                                                                        |
| --------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------- |
| `/hulumi-threat-model` GitHub scenarios (4)         | M1        | Skill-driven threat models for OIDC-trust-cloud, Actions supply-chain, GitHub App tokens, self-hosted runners |
| `@hulumi/baseline.github.SecureRepository`          | M1        | Hardened repo ComponentResource: ruleset, security-and-analysis, environments, sandbox-org E2E |
| `@hulumi/baseline.github.OrgFoundation`             | M2        | Org-level: rulesets, Actions allowlist + SHA-pin, OIDC sub template, secrets, internal CSC-switchable backend for OrganizationSettings |
| `@hulumi/policies.github.HulumiGithubHardeningPack` | M3        | CrossGuard pack H1–H4 enforcing Hulumi GitHub invariants (raw `github.Repository` rejection, ruleset required-status-checks, etc.) |
| `@hulumi/policies.github.G_OIDC_1`                  | M3        | Rejects wildcard / `StringLike` `sub` conditions on AWS / Azure / GCP trust policies (UNC6426 mitigation) |
| `@hulumi/policies.github.CisGithubV1Pack`           | M3        | CIS GitHub Benchmark v1.2.0 IDs-only mapping (sections deferred until WorkBench access — open question #2) |
| `@hulumi/drift.adapters.GithubWebhookFallbackAdapter` | M4      | Push-model drift adapter: 6 webhook event types, signature verification, idempotency cache, tier-degraded verdicts |
| SLSA-L3 atomic three-package release                | M5        | Same-version, same-day release of `@hulumi/baseline` + `@hulumi/policies` + `@hulumi/drift` carrying the GitHub additions; launch readiness (cookbooks, examples, verify-provenance docs update) |

### Data Flow Summary

1. **Authoring (design-time)**: Engineer → Claude Code → `/hulumi-threat-model github-oidc-trust-cloud-account` → Claude writes Pulumi program importing `@hulumi/baseline.github.OrgFoundation` + `SecureRepository`.
2. **Plan/apply (deploy-time)**: `pulumi up` → `HulumiGithubHardeningPack` + `CisGithubV1Pack` evaluate → IaC GitHub App installation token → write GitHub org/repo configuration → state backend records.
3. **Drift classify (triage-time)**: `DriftClassifier` extended with `GithubWebhookFallbackAdapter` → push-model events from org + repo webhooks → idempotency cache (0600) → emit `DriftVerdict` with `DriftSource` + confidence + `tier-degraded` + `feature-not-licensed`.
4. **Release (v1.x.0 of the existing three packages)**: tag → existing GitHub Actions + SLSA reusable workflow → three npm packages re-released with provenance + GitHub release with SBOMs covering the new GitHub surface.

---

## High-Level Design for Formal Verification (TLA+ Section)

**TLA+ status: N/A for this runbook.**

Reasoning: The webhook-fallback adapter introduces no new concurrency surface beyond what the existing `HulumiDrift.tla` already verified. The four-adapter quorum logic is unchanged; the GitHub adapter is one of N adapters whose signal participates in the existing `HardenedVerdict` composition. Tier-degraded verdicts are a value extension to `verdict`, not a new transition. If a future change reshapes the verdict-composition rules (e.g., per-source weighting), `/slo-tla` re-verification becomes required — flagged in M4's design rule.

The SafetyRealistic and Monotonicity properties from `docs/TLAdocs/hulumi/HulumiDrift-verified.md` continue to govern: the GitHub adapter cannot label a human-in-UI mutation as `provider-product-change` at high confidence regardless of webhook delivery latency, because the same verdict-composition rules apply.

---

## Global Execution Rules

### 0) The infra-only scope contract — pinned at the top, not negotiable per-milestone

**The I in IaC is Infrastructure.** This runbook is in scope for anything declarable through Pulumi / GitHub REST / GraphQL that configures the GitHub platform itself. It is **out of scope** for anything that authors security rules against users' source code, triages findings against users' source code, or runs as a per-PR / per-finding workflow alongside users' source code.

**In scope** (Infrastructure-as-Code surface, per GitHub's Well-Architected SSDF mapping practice IDs PO.2/PO.3/PO.4/PO.5/PS.1/PW.4/PW.5/PW.6/PW.7/RV.1):
- Repository configuration: visibility, rulesets, security-and-analysis toggles, environments, deploy keys, custom properties, webhooks for drift detection.
- Organization configuration: rulesets, Actions allowlist (incl. 2025-08-15 SHA-pin enforcement), OIDC subject-claim customization template, organization secrets, default workflow permissions, fork-PR approval, classic-PAT disablement, default repository permission, web-commit signoff requirement.
- Enablement of secret scanning, push protection, Dependabot alerts/security updates, dependency graph, code scanning *as features*.
- GHAS Code Security Configurations attachment to repos (REST escape hatch behind `OrgFoundation`'s internal abstraction).
- OIDC trust shape from GitHub to AWS / Azure / GCP — the GitHub side of the trust template (sub claim shape).

**Out of scope** (workflow plane, per the same SSDF mapping practice IDs PS.2/PW.1/PW.2/PW.8/RV.2/RV.3):
- Authoring CodeQL queries, Semgrep rules, custom secret-scanning patterns.
- Triaging Dependabot alerts, CodeQL alerts, secret-scanning alerts.
- Per-PR scanning workflows, Action workflow yaml authoring.
- Anything requiring reading the contents of users' source code to function.

A PR that adds a CodeQL pack, a Semgrep ruleset, a custom secret-scanning regex, or a workflow rewriter is **rejected at review** and the rejection cites this rule. The boundary precedent is GitHub's own Well-Architected SSDF mapping (`docs/research/hulumi-github/sources.md` → frameworks).

### 1) Stay inside scope

Every change must fall inside the current milestone's Contract Block file allow-list. Changes to existing AWS Hulumi v1.0.0 files outside the explicit allow-list are forbidden — the AWS variant has shipped, its public interfaces are locked.

### 2) Tests define the contract

Write BDD scenarios first; make them fail for the expected reason; implement to pass. No production-path change without a matching test.

### 3) No placeholders in production paths

No `TODO`, no `// will fix later`, no `throw new Error("not implemented")` in shipped code. Forward-references in docs or skill output must say "available in Hulumi vN+" with an explicit version. The audit-log adapter is the only deferred surface and is documented as "deferred to v1.1" in cookbook + skill output, not stubbed in code.

### 4) Preserve backwards compatibility

Interfaces listed in Runbook Metadata are stable. Existing AWS interfaces from Hulumi v1.0.0 cannot be broken — extending `Tier`, `DriftSource`, and `DriftAdapter` is allowed only via additive changes. The cache schema bump (if needed in M4) requires explicit migration in the same release.

### 5) Prefer smallest safe change

A bug fix doesn't need surrounding cleanup. A one-shot operation doesn't need a helper. Three similar lines is better than a premature abstraction.

### 6) Record evidence, not claims

Every milestone fills the Evidence Log with actual command outputs, not "all tests pass ✓". `/slo-retro` refuses to close a milestone with blank Actual Result cells.

### 7) Keep .gitignore current and clean up test artifacts

Pulumi checkpoints, integration-test sandbox-org state, webhook-fixture artifacts, drift-cache test fixtures, TLA+ scratch — all must be ignored. `git status` after a milestone must be clean.

---

## Global Entry Rules (Pre-Milestone Protocol)

1. Read the full milestone file under `docs/runbook-milestones/hulumi-github-m<N>.md` + Global Execution Rules (especially Rule 0).
2. Read prior-milestone lessons (`docs/lessons/hulumi-github-m<N-1>.md`).
3. Read the Hulumi-for-GitHub research synthesis (`docs/research/hulumi-github/synthesis.md`) and the relevant section of the dossier.
4. Read files listed in "Files to read before changing anything."
5. Copy the Evidence Log template into the milestone's Evidence Log section.
6. Re-state the milestone's load-bearing constraints in your own words in working notes before coding, **including the Rule 0 scope contract.**

## Global Exit Rules (Post-Milestone Protocol)

1. All BDD + E2E tests green.
2. Smoke tests checked off.
3. Compatibility checklist complete (incl. AWS-Hulumi-v1.0.0 interfaces unbroken).
4. `git status` clean.
5. `.gitignore` updated.
6. `docs/lessons/hulumi-github-m<N>.md` written with surprises + decisions + deltas-from-plan.
7. `docs/completion/hulumi-github-m<N>.md` written with changed files + tests added + documentation updated.
8. Milestone Tracker above updated to `done`.
9. Docs listed in Post-Flight updated.

---

## Background Context

### Current State

Hulumi v1.0.0 (AWS) is shipped and stable. Master runbook at [`docs/RUNBOOK-hulumi.md`](./RUNBOOK-hulumi.md), all 5 milestones `done`. Current branch policy and GitHub workflows are configured for the AWS variant only.

### Problem

Platform engineers who adopted Hulumi for AWS still hand-configure the GitHub side of their platform. The wedge persona has no GHEC (Team or Pro tier), so GHEC-only solutions don't apply. Audit-log API is GHEC-only and classic-PAT-only, so a Hulumi drift classifier on GitHub must use a webhook fallback adapter at the wedge tier and must expose `tier-degraded` and `feature-not-licensed` honestly. Existing competitors (`safe-settings`, `cloudposse`, `mineiros`, `step-security/secure-repo`) cover slices but no single competitor offers components + policy pack + drift + threat-model skill in one Apache-2.0 stack — the Hulumi shape applied to GitHub.

### Target Architecture

See the End-to-End Architecture Diagram above. No separate `docs/design/hulumi-github/ARCHITECTURE.md` is produced — `/slo-architect` was skipped per the idea doc's recommendation (feature addition to an already-designed workspace, not a new design).

### Key Design Principles

Inherits all principles from the AWS Hulumi runbook (`docs/RUNBOOK-hulumi.md` § Key Design Principles), plus three GitHub-specific additions:

- **Tier-aware drift verdicts.** `tier-degraded: true` and `feature-not-licensed: string[]` are first-class verdict outcomes. The classifier never silently emits `no-drift` when the underlying signal source is tier-gated or feature-gated.
- **OIDC sub claim is `job_workflow_ref` + `environment` by default.** Policy rule `G_OIDC_1` rejects wildcard / `StringLike` `sub` conditions on AWS / Azure / GCP trust policies. UNC6426 (March 2026) is the named adversary.
- **`OrganizationSettings` is encapsulated, not exposed.** GitHub has marked the underlying flat fields with an "endpoint closing down" notice. `OrgFoundation` exposes a stable surface; the Code Security Configurations REST escape hatch is the switchable backend that flips in if/when GitHub removes the flat fields.

### What to Keep

The entire shipped AWS Hulumi v1.0.0 surface. No regressions allowed.

### What to Change

Nothing in the AWS surface. All changes are additive sub-paths under the three existing packages.

### Global Red Lines

Inherits from the AWS runbook (`docs/RUNBOOK-hulumi.md` § Global Red Lines), plus seven GitHub-specific additions:

- **No CodeQL queries, Semgrep rules, or custom secret-scanning patterns shipped in this repo.** The infra-only contract (Rule 0) is enforced by code review and the `license-boundary-lint` extension that flags any file path containing `codeql/`, `semgrep/`, or `secret-scanning/patterns/`.
- **No GHEC-tier-only features in the M1–M5 default path.** `EnterpriseSecurityAnalysisSettings` use, audit-log REST polling, audit-log streams configuration are all v1.1 deferrals. M4's webhook-fallback adapter is the ONLY drift adapter shipped in v1 of Hulumi-for-GitHub.
- **No long-lived classic PATs in repo state, CI secrets, or test fixtures.** The IaC default is GitHub App installation token; the cookbook documents fine-grained PAT as a user-tier alternative; classic PATs are documented only as the v1.1 audit-log adapter's auth requirement.
- **No `child_process.exec` in `packages/drift/src/adapters/github-webhook-fallback.ts`.** Inherits AWS rule; the webhook signature-verification path uses Node's `crypto.timingSafeEqual`, never shells out to `openssl`.
- **No verbatim CIS GitHub Benchmark text in source.** IDs only, mirroring `cis-aws.ts`. CIS GitHub Benchmark v1.2.0 ships under CC BY-NC-SA 4.0 with the same Non-Member Terms as CIS AWS Foundations.
- **No verbatim NIST SSDF text in source.** IDs only. SSDF v1.1 (SP 800-218 final 2022-02-03) is the binding target; v1.2 IPD is annotated only.
- **No DriftSource enum value outside the documented set** — additions go through the same review gate as AWS-side changes.

---

## BDD and Runtime Validation Rules

(Inherits from `docs/RUNBOOK-hulumi.md` § BDD and Runtime Validation Rules. The GitHub-specific test-file naming is:)

- Unit / BDD: `packages/<pkg>/tests/github/<feature>.test.ts`
- Integration (real GitHub sandbox org): `packages/<pkg>/tests/integration/github/<feature>.integration.test.ts`
- Drift verdict matrix (extended): `packages/drift/tests/github-verdict-matrix.feature.test.ts`

### Test-Artifact Cleanup Rules — GitHub-specific

- Sandbox-org repos created in integration tests: teardown in `afterAll`, with a runbook-mandated tag prefix `hulumi-github-m<N>-<test-id>` so leaked repos can be cleaned by a sweep script.
- Webhook-fixture artifacts: `tests/fixtures/webhooks/*.json` are checked in (real-payload-shape examples, redacted of any org/user identifiers); transient fixtures live in `memfs`.
- Classic PAT material: never committed, never logged. Integration tests requiring the v1.1 audit-log adapter (none in this runbook) would need a separate secret-handling protocol.

---

## Documentation Update Table

Tracks which documentation files each milestone touches. Maintainers update this table as part of each milestone's Post-Flight step.

| Doc / Surface                                     | M1                                                                  | M2                                                  | M3                                                          | M4                                                  | M5                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `README.md`                                       | —                                                                   | —                                                   | —                                                           | —                                                   | UPDATE — GitHub variant section, canonical install, four threat-model scenarios            |
| `AGENTS.md`                                       | —                                                                   | —                                                   | —                                                           | —                                                   | UPDATE — pointer to `RUNBOOK-hulumi-github.md`                                              |
| `docs/why-hulumi.md`                              | —                                                                   | —                                                   | —                                                           | —                                                   | UPDATE — paragraph on GitHub variant + infra-only scope contract                            |
| `docs/getting-started.md`                         | —                                                                   | —                                                   | —                                                           | —                                                   | UPDATE — "GitHub variant" section with copy-pasteable steps                                 |
| `docs/RUNBOOK-hulumi-github.md` Milestone Tracker | UPDATE                                                              | UPDATE                                              | UPDATE                                                      | UPDATE                                              | UPDATE                                                                                      |
| `docs/RUNBOOK-hulumi-github.md` Doc Update Table  | —                                                                   | —                                                   | —                                                           | —                                                   | UPDATE — final fill-in                                                                      |
| `docs/runbook-milestones/hulumi-github-m1.md`     | NEW                                                                 | —                                                   | —                                                           | —                                                   | —                                                                                           |
| `docs/runbook-milestones/hulumi-github-m2.md`     | —                                                                   | NEW                                                 | —                                                           | —                                                   | —                                                                                           |
| `docs/runbook-milestones/hulumi-github-m3.md`     | —                                                                   | —                                                   | NEW                                                         | —                                                   | —                                                                                           |
| `docs/runbook-milestones/hulumi-github-m4.md`     | —                                                                   | —                                                   | —                                                           | NEW                                                 | —                                                                                           |
| `docs/runbook-milestones/hulumi-github-m5.md`     | —                                                                   | —                                                   | —                                                           | —                                                   | NEW                                                                                         |
| `docs/lessons/hulumi-github-m1..m5.md`            | NEW (m1)                                                            | NEW (m2)                                            | NEW (m3)                                                    | NEW (m4)                                            | NEW (m5)                                                                                    |
| `docs/completion/hulumi-github-m1..m5.md`         | NEW (m1)                                                            | NEW (m2)                                            | NEW (m3)                                                    | NEW (m4)                                            | NEW (m5)                                                                                    |
| `docs/threat-model-examples/github-*.md` (×4)     | NEW                                                                 | —                                                   | —                                                           | —                                                   | UPDATE (citation polish)                                                                    |
| `docs/threat-model-examples/README.md`            | UPDATE                                                              | —                                                   | —                                                           | —                                                   | UPDATE                                                                                      |
| `docs/cookbooks/README.md`                        | —                                                                   | —                                                   | —                                                           | —                                                   | UPDATE — five new cookbooks indexed                                                         |
| `docs/cookbooks/github-oidc-trust-to-cloud.md`    | —                                                                   | —                                                   | —                                                           | —                                                   | NEW                                                                                         |
| `docs/cookbooks/github-actions-supply-chain.md`   | —                                                                   | —                                                   | —                                                           | —                                                   | NEW                                                                                         |
| `docs/cookbooks/github-app-token-exposure.md`     | —                                                                   | —                                                   | —                                                           | —                                                   | NEW                                                                                         |
| `docs/cookbooks/github-self-hosted-runner.md`     | —                                                                   | —                                                   | —                                                           | —                                                   | NEW                                                                                         |
| `docs/cookbooks/github-webhook-drift.md`          | —                                                                   | —                                                   | —                                                           | —                                                   | NEW                                                                                         |
| `docs/cookbooks/verify-provenance.md`             | —                                                                   | —                                                   | —                                                           | —                                                   | UPDATE — examples include GitHub-side packages                                              |
| `docs/components/README.md`                       | —                                                                   | —                                                   | —                                                           | —                                                   | UPDATE                                                                                      |
| `docs/components/secure-repository.md`            | NEW (one-line stub)                                                 | —                                                   | UPDATE (controls tag added)                                 | —                                                   | UPDATE — full reference                                                                     |
| `docs/components/org-foundation.md`               | —                                                                   | NEW (one-line stub)                                 | UPDATE (controls tag added)                                 | —                                                   | UPDATE — full reference                                                                     |
| `docs/components/hulumi-github-hardening-pack.md` | —                                                                   | —                                                   | NEW (one-line stub)                                         | —                                                   | UPDATE — full reference                                                                     |
| `docs/components/cis-github-v1-pack.md`           | —                                                                   | —                                                   | NEW (one-line stub)                                         | —                                                   | UPDATE — full reference                                                                     |
| `docs/components/g-oidc-1.md`                     | —                                                                   | —                                                   | NEW (one-line stub)                                         | —                                                   | UPDATE — full reference                                                                     |
| `docs/components/github-webhook-fallback-adapter.md` | —                                                                | —                                                   | —                                                           | NEW (one-line stub)                                 | UPDATE — full reference                                                                     |
| `examples/secure-repository-smoke/`               | —                                                                   | —                                                   | —                                                           | —                                                   | NEW                                                                                         |
| `examples/org-foundation-smoke/`                  | —                                                                   | —                                                   | —                                                           | —                                                   | NEW                                                                                         |
| `examples/github-drift-smoke/`                    | —                                                                   | —                                                   | —                                                           | —                                                   | NEW                                                                                         |
| `tests/fixtures/webhooks/*.json`                  | —                                                                   | —                                                   | —                                                           | NEW (×7)                                            | —                                                                                           |
| `CHANGELOG.md`                                    | —                                                                   | —                                                   | —                                                           | —                                                   | UPDATE — v1.1.0 entry                                                                       |
| `docs/issue-candidates.md`                        | —                                                                   | —                                                   | UPDATE — WorkBench follow-up                                | —                                                   | UPDATE — v1.1 deferral list                                                                 |
| `docs/ARCHITECTURE.md`                            | UPDATE — describe M1 additions                                      | UPDATE — M2                                         | UPDATE — M3                                                 | UPDATE — M4                                         | UPDATE — M5 launch state                                                                    |
| `docs/design/hulumi-github-threat-model.md`       | —                                                                   | —                                                   | UPDATE — extend STRIDE rows with policy-pack rows           | UPDATE — extend with M4 abuse-case rows             | UPDATE — final pass + lessons-learned cross-references                                       |
| `docs/runbook-milestones/hulumi-github-v1.1-deferrals.md` | —                                                           | —                                                   | UPDATE — append D4 (CIS WorkBench completion) details if any change | —                                           | UPDATE — sync with `docs/issue-candidates.md` at release tag                                |
| `.github/workflows/weekly-integration.yml`        | —                                                                   | —                                                   | —                                                           | —                                                   | UPDATE — extend matrix                                                                      |
| `.github/workflows/release.yml`                   | —                                                                   | —                                                   | —                                                           | —                                                   | POSSIBLY UPDATE                                                                             |
| `scripts/exact-pin-guard.mjs`                     | UPDATE — add `@pulumi/github`                                       | —                                                   | —                                                           | —                                                   | —                                                                                           |
| `scripts/cooling-off-diff.mjs`                    | UPDATE — add `@pulumi/github`                                       | —                                                   | —                                                           | —                                                   | —                                                                                           |
| `scripts/license-boundary-lint.mjs`               | —                                                                   | —                                                   | UPDATE — extend to CIS GitHub + SSDF mappings; reject TODO-WORKBENCH on release tags | —                                                   | —                                                                                           |

---

## Per-Milestone Specs

Each milestone has its own file under [`docs/runbook-milestones/`](./runbook-milestones/):

- [M1: `/hulumi-threat-model` GitHub scenarios + `SecureRepository` + sandbox-org E2E](./runbook-milestones/hulumi-github-m1.md)
- [M2: `OrgFoundation` + Code-Security-Configurations switchable backend](./runbook-milestones/hulumi-github-m2.md)
- [M3: `HulumiGithubHardeningPack` + `CisGithubV1Pack` + `G_OIDC_1`](./runbook-milestones/hulumi-github-m3.md)
- [M4: `GithubWebhookFallbackAdapter` + verdict matrix extension](./runbook-milestones/hulumi-github-m4.md)
- [M5: SLSA-L3 release + launch readiness](./runbook-milestones/hulumi-github-m5.md)

Lessons learned: `docs/lessons/hulumi-github-m{1..5}.md` — written during each milestone's exit. Completion summaries: `docs/completion/hulumi-github-m{1..5}.md` — written during each milestone's exit.

---

## Recommended next step

After this runbook lands and before any execution begins, run **`/slo-critique hulumi-github`** to walk the four-persona adversarial review (CEO, eng-lead, security; design pass auto-skipped — no UI surface). Critique will find the things this plan got wrong before they ship as code. Then `/slo-execute M1` to begin.
