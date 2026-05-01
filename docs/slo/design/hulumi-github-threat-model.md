# Threat model — Hulumi for GitHub

> Consolidated threat-model artifact addressing critique finding S4 (V17 missing threat model). Produced 2026-04-26 outside the standard `/slo-architect` Step 3.5 path because that skill was deliberately skipped per the idea doc — Hulumi-for-GitHub is a feature addition to an already-designed workspace, not a new design.
>
> This file is the canonical surface for any future security review or contribution against the runbook. Every per-milestone abuse-case row (`tm-hulumi-github-abuse-N`) cited in [`docs/RUNBOOK-hulumi-github.md`](../RUNBOOK-hulumi-github.md) and the per-milestone files at [`docs/runbook-milestones/`](../runbook-milestones/) traces back to a row in this document. The four threat-model scenario exemplars at [`docs/threat-model-examples/`](../threat-model-examples/) (shipped in M1) are the per-scenario depth; this doc is the cross-cutting surface.

## Trust boundaries

```
                  ┌─────────────────────────────────────────────┐
                  │ User Environment (laptop / CI runner)        │
                  │                                              │
                  │   Engineer ─→ Claude Code ─→ Pulumi program  │
                  │                                              │
                  │   Imports @hulumi/baseline.github.*          │
                  │   Imports @hulumi/policies.github.*          │
                  │   Imports @hulumi/drift                       │
                  └─────────────────┬───────────────────────────┘
                                    │ (trust boundary 1)
                                    │   IaC GitHub App installation token
                                    │   or fine-grained PAT
                                    ▼
                  ┌─────────────────────────────────────────────┐
                  │ Target GitHub Org (Team / Pro / Free tier)   │
                  │                                              │
                  │   Repos with rulesets, security-and-analysis │
                  │   Org settings, OIDC sub claim template      │
                  │   Org webhooks (drift-detection signal)      │
                  └─────────────────┬───────────────────────────┘
                                    │ (trust boundary 2)
                                    │   GitHub Actions OIDC token
                                    │   sub claim: job_workflow_ref + environment
                                    ▼
                  ┌─────────────────────────────────────────────┐
                  │ Cloud accounts (AWS / Azure / GCP)           │
                  │                                              │
                  │   IaC role tagged hulumi:iac-role=true       │
                  │   IAM trust policy: StringEquals on sub      │
                  └─────────────────────────────────────────────┘
```

**Boundary 1 (User → GitHub)**: crossed by Pulumi API calls authenticated via GitHub App installation token (default) or fine-grained PAT (cookbook). Webhook events flow back across this boundary into the drift adapter at the User Environment.

**Boundary 2 (GitHub → Cloud)**: crossed by GitHub Actions runners assuming cloud roles via OIDC. The `sub` claim shape is the load-bearing security control. Hulumi's default template uses the three-axis safe shape `repo:{org}/{repo}:job_workflow_ref:{org}/{repo}/.github/workflows/{workflow}@{ref}:environment:{environment}` (UNC6426 mitigation).

## In-scope vs out-of-scope (Rule 0 — pinned from runbook)

The runbook's Global Execution Rule 0 governs scope. Restated here for cross-reference:

**In scope** (Infrastructure-as-Code surface, per GitHub's Well-Architected SSDF mapping practice IDs PO.2/PO.3/PO.4/PO.5/PS.1/PW.4/PW.5/PW.6/PW.7/RV.1):

- Repository configuration (visibility, rulesets, security-and-analysis toggles, environments, deploy keys, custom properties, webhooks for drift detection)
- Organization configuration (rulesets, Actions allowlist with SHA-pin enforcement, OIDC subject-claim customization template, organization secrets, default workflow permissions, fork-PR approval, classic-PAT disablement)
- Enablement (not authoring) of secret scanning, push protection, Dependabot, code scanning
- GHAS Code Security Configurations attachment to repos
- OIDC trust shape from GitHub to cloud accounts

**Out of scope** (workflow plane, per SSDF practice IDs PS.2/PW.1/PW.2/PW.8/RV.2/RV.3):

- Authoring CodeQL queries / Semgrep rules / custom secret-scanning patterns
- Triaging Dependabot / CodeQL / secret-scanning alerts
- Per-PR scanning workflows
- Anything requiring reading users' source code to function

## STRIDE — per-component surface analysis

Each component lands in a milestone (M1–M4). The fifth column ("M5") covers release-pipeline / supply-chain risks.

### `SecureRepository` (M1)

| STRIDE                | Threat                                                                                   | Eliminated / mitigated / residual                                                                                                  | Abuse-case row                                  |
| --------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **S** Spoofing        | Forged `pulumi up` impersonating IaC role                                                | Mitigated by GitHub App installation token (short-lived OIDC); class V2/V6                                                          | n/a (out of scope — auth is operational)        |
| **T** Tampering       | User-program declares `visibility: "public"` accidentally                                | Eliminated by discriminated-union type + runtime invariant (M1 design); class V14 hardened defaults                                | `tm-hulumi-github-abuse-public-visibility`      |
| **T** Tampering       | Skill scenario ID is path-traversal `../../etc/passwd`                                   | Eliminated by skill scenario allow-list; class V4 path traversal                                                                    | `tm-hulumi-github-abuse-scenario-id-traversal`  |
| **R** Repudiation     | Audit footer in skill output is forgeable                                                | Mitigated by IDs-only citations + `license-boundary-lint`; class V7 missing audit trail                                             | `tm-hulumi-github-abuse-license-boundary`       |
| **I** Info Disclosure | Public repo with secret-scanning off leaks code                                          | Mitigated by hardened defaults; class V14; FULL elimination requires `OrgFoundation` (M2) + `HulumiGithubHardeningPack` (M3)        | covered by M2 + M3 abuse cases                  |
| **D** Denial of Service | Sandbox-org integration test leaks repos                                               | Eliminated by `afterAll` cleanup-by-prefix; class V17 architecture discipline                                                       | `tm-hulumi-github-abuse-sandbox-leak`           |
| **E** Elevation of Privilege | License-boundary breach via verbatim CIS text                                     | Eliminated by `license-boundary-lint` enforcement + IDs-only mapping discipline                                                     | `tm-hulumi-github-abuse-license-boundary`       |

### `OrgFoundation` (M2)

| STRIDE                | Threat                                                                                                  | Eliminated / mitigated / residual                                                                                          | Abuse-case row                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **T** Tampering       | Wildcard OIDC `sub` template (UNC6426)                                                                  | Eliminated at runtime in M2; class V14; declarative rejection in M3 (`G_OIDC_1`)                                            | `tm-hulumi-github-abuse-oidc-default-safe`, `oidc-wildcard-rejected` |
| **T** Tampering       | Actions SHA-pin off at startup-hardened                                                                 | Eliminated by tier-gated default in M2; class V14                                                                           | `tm-hulumi-github-abuse-sha-pin-default`                |
| **I** Info Disclosure | CSC backend REST 4xx leaks token fragment in audit row                                                  | **Mitigated by Forbidden Shortcut + token-redaction layer (per critique S2)**; class V6                                     | `tm-hulumi-github-abuse-token-redaction-in-audit`       |
| **R** Repudiation     | `OrganizationSettings` flat-fields silently no-op when GitHub deprecates                                | Mitigated by switchable backend (CSC); class V14                                                                            | `tm-hulumi-github-abuse-csc-backend-no-data-loss`       |
| **D** Denial of Service | Backend-swap on live stack briefly disables security defaults                                          | **Mitigated by `dependsOn` ordering (per critique S3)**; class V11 race                                                     | `tm-hulumi-github-abuse-csc-backend-swap-no-gap`        |
| **E** Elevation of Privilege | Org-level integration test leaks rulesets/templates                                              | Eliminated by `afterAll` cleanup-by-prefix; class V17                                                                       | `tm-hulumi-github-abuse-org-sandbox-leak`               |

### `HulumiGithubHardeningPack` + `CisGithubV1Pack` + `G_OIDC_1` (M3)

| STRIDE                | Threat                                                                                                  | Eliminated / mitigated / residual                                                                                          | Abuse-case row                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **T** Tampering       | User declares raw `github.Repository` bypassing `SecureRepository`                                       | Eliminated by H1 declarative rejection at preview-time; class V14                                                           | `tm-hulumi-github-abuse-raw-repo-rejected`                |
| **T** Tampering       | `OrgFoundation` with wildcard custom OIDC template                                                       | Eliminated by H2 + runtime check (M2); class V14                                                                            | `tm-hulumi-github-abuse-oidc-wildcard-declarative-rejected` |
| **T** Tampering       | AWS / Azure / GCP IAM trust policy with `StringLike` `sub`                                              | Eliminated by `G_OIDC_1` (= H3) across all three clouds; class V14                                                          | `tm-hulumi-github-abuse-trust-policy-stringlike-rejected` |
| **R** Repudiation     | Tier monotonicity regression (Sandbox emits more controls than Startup-Hardened)                         | Eliminated by H4 AST-level meta-test; class V11                                                                             | `tm-hulumi-github-abuse-tier-monotonicity-violation`      |
| **I** Info Disclosure | Verbatim CIS GitHub Benchmark text shipped (license breach)                                              | Eliminated by `license-boundary-lint` extension; class V10 supply-chain (license)                                           | `tm-hulumi-github-abuse-cis-id-fabrication`               |
| **R** Repudiation     | `hulumi:controls` tag value drift (fabricated IDs)                                                      | Eliminated by AST-level cross-check between component output and mapping table; class V17                                   | `tm-hulumi-github-abuse-controls-tag-tampering`           |
| **R** Repudiation     | Skill output cites fabricated framework IDs not present in mapping tables                               | **Mitigated by citation-ID meta-test (per critique E4)**; class V17                                                         | `tm-hulumi-github-abuse-skill-output-id-validation`       |

### `GithubWebhookFallbackAdapter` (M4)

| STRIDE                | Threat                                                                                                  | Eliminated / mitigated / residual                                                                                          | Abuse-case row                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **S** Spoofing        | Webhook with tampered HMAC signature                                                                    | Eliminated by `crypto.timingSafeEqual` HMAC verification (mandatory at startup-hardened); class V6                          | `tm-hulumi-github-abuse-webhook-signature-tampered`       |
| **T** Tampering       | Webhook replay attack (same delivery re-ingested)                                                       | Eliminated by idempotency cache keyed on `(deliveryId, eventType, repoFullName)` triple; class V11                          | `tm-hulumi-github-abuse-webhook-replay-attack`            |
| **T** Tampering       | Webhook payload contains path-traversal in `repository.full_name`                                       | **Mitigated by SHA-256 cache-key hashing (per critique S5)**; class V4 path traversal                                       | `tm-hulumi-github-abuse-cache-key-path-traversal`         |
| **D** Denial of Service | Deserialization bomb in webhook payload (deeply-nested JSON within 25 MB limit)                       | **Mitigated by depth-bounded parser + 25 MB size cap (per critique S1)**; class V4 deserialization bomb                     | `tm-hulumi-github-abuse-payload-deserialization-bomb`     |
| **R** Repudiation     | Out-of-order webhook delivery produces stale verdicts                                                   | **Mitigated by event-time ordering before composition (per critique E1)**; class V11 race                                   | `tm-hulumi-github-abuse-webhook-out-of-order-delivery`    |
| **I** Info Disclosure | `tierDegraded` / `featureNotLicensed` silently suppressed                                               | Eliminated by non-suppressible verdict fields (no API flag hides them); class V7                                            | `tm-hulumi-github-abuse-tier-degraded-not-silent`, `feature-not-licensed-honest` |
| **R** Repudiation     | Webhook secret rotation breaks verification silently                                                    | **Mitigated by structured `security_event.webhook_secret_rotation_suspected` audit row (per critique E3)**; class V7        | `tm-hulumi-github-abuse-webhook-secret-rotation`          |
| **D** Denial of Service | Cache schema migration v1 → v2 loses AWS-side state                                                   | Eliminated by `.v1.backup` atomic-write order (backup-then-v2-write); class V17                                             | `tm-hulumi-github-abuse-cache-migration-no-data-loss`     |

### Release pipeline (M5)

| STRIDE                | Threat                                                                                                  | Eliminated / mitigated / residual                                                                                          | Abuse-case row                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **T** Tampering       | Tarball tampering after attestation                                                                     | Eliminated by SLSA L3 + `gh attestation verify`; class V10                                                                  | `tm-hulumi-github-abuse-supply-chain-tarball-tampering`   |
| **R** Repudiation     | Partial release leaves three packages on different versions                                             | Eliminated by atomic-three-package-with-rollback discipline (existing AWS-side); class V11                                  | `tm-hulumi-github-abuse-partial-release-rollback`         |
| **S** Spoofing        | Typosquat installation path                                                                             | Mitigated by README canonical-install pinned commit SHA; class V14                                                          | `tm-hulumi-github-abuse-typosquat-readme-canonical-path`  |
| **T** Tampering       | Cookbook OIDC example uses `StringLike` (UNC6426 pitfall)                                               | Eliminated by grep-test in M5; class V14 documentation discipline                                                           | `tm-hulumi-github-abuse-cookbook-oidc-stringequals`       |

## Out-of-scope risks acknowledged (v1.1+ deferrals)

These risks are **acknowledged** but explicitly out of scope for v1.0 of Hulumi-for-GitHub. Tracked in [`docs/runbook-milestones/hulumi-github-v1.1-deferrals.md`](../runbook-milestones/hulumi-github-v1.1-deferrals.md):

- GHEC audit-log REST adapter — full-fidelity drift detection requires GHEC + classic-PAT auth.
- `EnterpriseSecurityAnalysisSettings` enforcement — GHEC-only knobs.
- Audit-log streams configuration — GHEC-only feature.
- CIS GitHub Benchmark v1.2.0 section-number completion — gated on CIS WorkBench access.
- Classic-PAT-authed adapter for GHEC customers — gated on the audit-log REST adapter landing first.

## Threat-model maintenance contract

- Every contributor adding a new component to `@hulumi/baseline.github.*`, `@hulumi/policies.github.*`, or a new drift adapter for GitHub MUST add the corresponding STRIDE row + abuse-case ID to this file in the same PR.
- Every milestone's BDD table abuse-case rows MUST cite a `tm-hulumi-github-abuse-N` ID present in this file.
- The license-boundary-lint extension (M3) does NOT scan this file's "concrete exploit scenario" prose for verbatim framework text — that is a known limitation. Review during PR.
- This file is reality-first: only document threats whose mitigations exist or are landing in a tracked milestone. Aspirational threats belong in [`docs/runbook-milestones/hulumi-github-v1.1-deferrals.md`](../runbook-milestones/hulumi-github-v1.1-deferrals.md).
