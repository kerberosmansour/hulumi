# Hulumi for GitHub — v1.1+ deferrals

> Structured deferral list addressing critique finding C2. Each entry has: trigger condition, acceptance criteria, target milestone in v1.1+. Cross-linked from [`docs/issue-candidates.md`](../issue-candidates.md). The list closes the loop between v1.0's wedge-tier focus (Team / Pro / Free) and v1.1's GHEC + CIS WorkBench expansion.

## D1 — Classic-PAT-authed audit-log REST adapter (GHEC only)

**Surface**: `@hulumi/drift/adapters/GithubAuditLogAdapter` (analogue of `cloudtrail.ts` for the GitHub side).

**Trigger condition**: A wedge-adjacent persona on GitHub Enterprise Cloud asks for full-fidelity drift detection, OR the v1.0 webhook-fallback adapter accumulates >3 user-reported gaps that the audit-log REST API would close.

**Acceptance criteria**:
- Adapter reads `/enterprises/{enterprise}/audit-log` with classic PAT carrying `read:audit_log` (the only auth mode GitHub accepts on this endpoint family — see [GitHub REST API docs](https://docs.github.com/en/enterprise-cloud@latest/rest/enterprise-admin/audit-log)).
- Adapter is gated on `GithubWebhookFallbackAdapterArgs.tier !== "ghec"` — when GHEC is detected, the audit-log adapter takes precedence; when not GHEC, it never instantiates.
- `OrgFoundation` accepts a second `github.Provider` instance dedicated to the classic-PAT auth path (the Hulumi-side runtime decision: GitHub App default + classic-PAT secondary for audit-log surface only).
- Verdict matrix `tierDegraded: false` for GHEC consumers using this adapter.
- BDD scenario: classic-PAT auth required — adapter refuses GitHub App token, refuses fine-grained PAT, refuses OAuth-app token (matches GitHub's documented constraint).

**Target milestone**: v1.1 M1 (treat as a fresh single-milestone runbook `hulumi-github-v1.1-audit-log`).

## D1.5 — Real REST hooks for the Code Security Configurations backend

**Surface**: `packages/baseline/src/github/org-security-defaults.ts` — `CodeSecurityConfigurationsBackend` issues real `POST/PATCH/DELETE` against `/orgs/{org}/code-security/configurations` and `…/{config_id}/attach` via `pulumi.dynamic.Resource` with proper REST hooks.

**Trigger condition**: M2 shipped a thin `pulumi.ComponentResource` placeholder for the CSC backend because `pulumi.dynamic.Resource` triggers `ERR_TRACE_EVENTS_UNAVAILABLE` under vitest's worker pool (the AWS-side documented gotcha). Real REST integration ships once either (a) the dynamic-resource pattern is wired with a vitest-compatible mock fence, or (b) GitHub publishes a first-class `@pulumi/github` resource for Code Security Configurations (currently absent in v6.13.0; tracked upstream in `pulumi/pulumi-github`).

**Acceptance criteria**:
- Real `pulumi.dynamic.ResourceProvider` create / update / delete hooks issuing REST calls.
- Errors surface with HTTP status + endpoint (per M2 forbidden shortcut b: never silent fallback to flat-fields).
- Token-redaction layer (M2 `redactTokens`) applies to error messages.
- Integration test exercises a real sandbox-org CSC create + attach + destroy round-trip.

**Target milestone**: v1.1 M1 (alongside D1's audit-log adapter, since both rely on REST escape-hatch infrastructure).

## D2 — `EnterpriseSecurityAnalysisSettings` enforcement (GHEC only)

**Surface**: `@hulumi/baseline.github.OrgFoundation` extension to set `EnterpriseSecurityAnalysisSettings` when tier is GHEC.

**Trigger condition**: D1 lands AND a GHEC user requests org-default extensions (`secretScanningValidityChecksEnabled`, `secretScanningPushProtectionCustomLink`).

**Acceptance criteria**:
- `OrgFoundationArgs.enterpriseSecurityAnalysis: { validityChecksEnabled?: boolean, pushProtectionCustomLink?: string }` (only valid when tier is GHEC; runtime check refuses otherwise).
- New mappings in `cis-github.ts` if WorkBench section access becomes available.

**Target milestone**: v1.1 M2 (after D1).

## D3 — Audit-log streams configuration (GHEC only)

**Surface**: `@hulumi/baseline.github.OrgFoundation` sub-component `org-audit-log-streams.ts` writing to S3 / Azure Blob / Azure Event Hubs / Datadog / GCS / Splunk via REST.

**Trigger condition**: Customer demand from a GHEC user wanting Hulumi-managed streaming destinations alongside D1's adapter.

**Acceptance criteria**:
- REST escape hatch via `pulumi.dynamic.Resource` mirroring M2's CSC backend pattern.
- Classic-PAT-authed (same constraint as D1's adapter — uniform across all `/enterprises/{enterprise}/audit-log/*` endpoints).
- Six destinations supported (S3, Azure Blob, Azure Event Hubs, Datadog, GCS, Splunk).
- BDD: each destination's create/update/delete REST flow.
- Idempotency: stream-key rotation does not break existing streams.

**Target milestone**: v1.1 M3 (after D1).

## D4 — CIS GitHub Benchmark v1.2.0 section-number completion

**Surface**: `packages/baseline/src/mappings/cis-github.ts` — replace every `TODO-WORKBENCH` placeholder with verified CIS section IDs.

**Trigger condition**: CIS WorkBench access secured (membership purchase OR access-grant negotiation OR a public release of the IDs without WorkBench gating).

**Acceptance criteria**:
- Every component's mapping array contains real CIS GitHub Benchmark v1.2.0 section IDs (no `TODO-WORKBENCH` entries).
- `license-boundary-lint` extension that rejects `TODO-WORKBENCH` on `release-*` git tags (M3 deliverable) is the gate.
- BDD scenario: every entry traces to a public CIS resource (e.g., the WorkBench search URL or the published Benchmark PDF table-of-contents).
- `CisGithubV1Pack` placeholder rules become real mandatory rules.

**Target milestone**: v1.1+ — gated on CIS WorkBench access, which has no fixed timeline.

## D5 — Threat-model skill scenario for GitHub Apps with broad org-admin scopes

**Surface**: `skills/hulumi-threat-model/scenarios/github-app-org-admin-scope.json`.

**Trigger condition**: User feedback from v1.0 launch identifies that the four shipped scenarios (OIDC, Actions supply-chain, App tokens, self-hosted runners) miss the "Vercel April 2026"-style scenario where a GitHub App with org-admin permissions is compromised.

**Acceptance criteria**:
- Scenario JSON + threat-model exemplar following the M1 shape.
- Cites OWASP ATLAS T1195, GitHub App permission model, named 2025–2026 incidents (Vercel April 2026, OpenAI Codex Feb 2026).
- Linked from existing scenarios where overlap exists (the App-token-exposure scenario from M1 forward-references this when D5 lands).

**Target milestone**: v1.2 (one minor after v1.1's GHEC work).

## D6 — Optional: Oracle Cloud / IBM Cloud OIDC trust extension to G_OIDC_1

**Surface**: `packages/policies/src/github/g-oidc-1.ts` extension covering Oracle Cloud (OCI) Identity Domains + IBM Cloud Workload Identity Federation.

**Trigger condition**: User feedback identifies a real customer running Hulumi-for-GitHub against OCI or IBM Cloud (low-probability — AWS / Azure / GCP cover the wedge persona).

**Acceptance criteria**:
- Two new cloud-specific resource-traversal paths in `G_OIDC_1`.
- BDD coverage parallel to M3's existing AWS / Azure / GCP variants.
- No regression on existing three-cloud coverage.

**Target milestone**: v1.2+ — opportunistic.

## Cross-cutting v1.1+ infrastructure work

- **`docs/issue-candidates.md`** synced with this file at every release.
- **`AGENTS.md`** cross-tool standard alignment IF any new revision lands by v1.1 (track [agentskills.io](https://agentskills.io) for spec changes).
- **`@pulumi/github` major-version bump** — when Pulumi releases v7.x, the cooling-off CI gate flags it; a coordinated v1.x bump runbook tracks the migration.

## Triage cadence

Maintainer reviews this file at every release tag. Move "trigger condition met" entries into a fresh single-milestone runbook (`hulumi-github-v1.1-<deferral-id>.md`). Treat all entries as `defer` until their trigger condition holds — do not treat the deferral list as a backlog to grind through.
