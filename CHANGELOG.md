# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] — 2026-05-01

The Hulumi-K8s-Security + Hulumi-Operations + pre-public-launch release.
Atomic four-package publish: `@hulumi/baseline@1.2.0`,
`@hulumi/policies@1.2.0`, `@hulumi/drift@1.2.0`, and the first stable
`@hulumi/k8s-baseline@1.2.0` (version reconciled from the planned 1.0.0
to match the atomic-release invariant — see runbook
`hulumi-pre-public-launch` M1). All four ship with SLSA Build L3
attestation. AWS-side v1.x surface unchanged for existing consumers; new
components are additive.

### Added

- **`@hulumi/k8s-baseline@1.2.0`** — first stable release of the K8s/EKS
  package, version-aligned with the v1.2 train. Existing components
  (`HardenedHelmRelease`, `EksSubnetTagger`, `IstioFoundation`,
  `AlbMeshedHttpEntrypoint`, `KubernetesSecretFromAwsSecretsManager`,
  `RdsCredentialSecret`, `GitHubAppCredential`) now ship at v1.2.0; new in
  this release:
  `NamespaceFoundation`, `EksRuntimeDetectionFoundation`,
  `EksBackupFoundation`, `EksAddonFoundation`, plus the `planUpgrade()` /
  `reportToMarkdown()` upgrade-planner library functions.
- **K8s/EKS CrossGuard packs** under `@hulumi/policies/k8s/packs/`:
  `hulumi-k8s-hardening` (5 rules), `hulumi-k8s-rbac` (3 rules),
  `hulumi-eks-cluster` (2 rules).
- **`KubernetesSecretFromAwsSecretsManager`** is now fail-closed by default
  on fetch / parse / depth / missing-key failures. Legacy degraded behavior
  available via `failureMode: "warn-empty"` / `missingKeyMode: "warn"`.
- **`AlbMeshedHttpEntrypoint`** requires explicit `workloadSelector` (or
  typed `acknowledgeInferredSelector`) AND certificate + ≥ 8-char
  `publicJustification` for `scheme: "internet-facing"`.
- **`@hulumi/drift`** adds `KubernetesApiAdapter` for live-vs-desired K8s
  state comparison with a bounded `p-timeout` probe.
- **`Ec2PatchBaseline` + `Ec2PatchWaves`** in `@hulumi/baseline.aws` —
  SSM patch orchestration with tier-aware reboot defaults, CRC32-bucket
  staggering, and a CompositeAlarm-gated wave model (no Lambda).
- **`DetectiveServicesEnable`** — Access Analyzer + Inspector v2 + Cost
  Anomaly Detection, with EventBridge primary routing + optional KEV
  dual-routing topic.
- **`AuditTrail`** — multi-region CloudTrail with log-file validation,
  KMS-encrypted CW Logs, and a SecureBucket-backed S3 archive.
- **`HulumiOperationsHardeningPack`** under `@hulumi/policies/aws/packs/` —
  4 rules covering Patch:Group enum, CloudTrail posture, CT log-group KMS,
  and Inspector v2 coverage.
- **5 new threat-model scenarios** under `/hulumi-threat-model`:
  `eks-cluster-baseline`, `eks-runtime-and-backup`,
  `operations-patch-compliance-lapse`,
  `operations-detective-services-disabled`,
  `operations-audit-pipeline-broken`. Total prebuilt scenarios: 14
  (5 AWS + 4 GitHub + 2 K8s + 3 Ops).
- **Atomic four-package release** — `release.yml` packs, generates SBOMs
  for, attests, and publishes all four packages in lockstep. Any preflight
  failure aborts before any `npm publish`.

### Changed

- README, `docs/ARCHITECTURE.md`, `docs/README.md`, `docs/components/README.md`
  describe the K8s + Operations surfaces alongside AWS and GitHub.
- `packages/k8s-baseline/COMPATIBILITY.md` synced with the runtime
  `TESTED_VERSIONS` typed const (Istio `istiod`/`cni`/`gateway` at `1.24.2`),
  with a BDD invariant test enforcing the lockstep going forward.
- **Pre-public-launch publish-readiness pass** (runbook
  `hulumi-pre-public-launch` M1): all four `@hulumi/*` packages drop
  `"private": true`, ship a per-package `README.md` (rendered on
  npmjs.com) and adjacent `LICENSE` (Apache-2.0, byte-identical to the
  repo root), and declare canonical `repository` / `bugs` / `homepage`
  fields. `@hulumi/k8s-baseline` version reconciled from `1.0.0` to
  `1.2.0` to satisfy the atomic-release invariant. `package-lock.json`
  removed in favour of the canonical `pnpm-lock.yaml`. Extended
  `release-readiness.test.ts` enforces these invariants going forward.

### Migration

For consumers on v1.1.x: `@hulumi/baseline` and `@hulumi/policies` upgrades
are additive — no construction changes required. `@hulumi/k8s-baseline`
consumers using the pre-release `1.0.0-pre.1` see two breaking-shaped
defaults that need a one-line migration each:

1. `KubernetesSecretFromAwsSecretsManager` now fails closed by default. To
   preserve the v1.0.0-pre.1 "log + emit empty Secret" behavior, opt back
   in with `failureMode: "warn-empty"` and `missingKeyMode: "warn"`.
2. `AlbMeshedHttpEntrypoint` now refuses construction unless either
   `workloadSelector` or `acknowledgeInferredSelector: true` is set; and
   `scheme: "internet-facing"` requires both `alb.certificateArn` and
   `alb.publicJustification` (≥ 8 chars).

See `docs/components/{kubernetes-secret-from-asm,alb-meshed-http-entrypoint,rds-credential-secret}.md`
for the exact migration snippets.

## [1.1.0] — 2026-04-26

GitHub-as-Infrastructure surface added under a hard infra-only scope contract
(see [`docs/slo/completed/RUNBOOK-hulumi-github.md`](./docs/slo/completed/RUNBOOK-hulumi-github.md) Global
Execution Rule 0). Atomic three-package release: `@hulumi/baseline@1.1.0`,
`@hulumi/policies@1.1.0`, `@hulumi/drift@1.1.0` — all carrying SLSA Build L3
attestation. AWS-side v1.0.0 surface unchanged; existing consumers can upgrade
with no code changes.

### Added

- **`/hulumi-threat-model` GitHub scenarios** — four new scenarios anchored on
  named 2025–2026 incidents: `github-oidc-trust-cloud-account` (UNC6426 March
  2026), `github-actions-supply-chain` (trivy-action / tj-actions / Sysdig
  Shai-Hulud / Wiz prt-scan), `github-app-token-exposure` (OpenAI Codex Feb
  2026 / Vercel April 2026), `github-self-hosted-runner` (Sysdig backdoors,
  Praetorian TensorFlow). Shipped in M1.
- **`@hulumi/baseline.github.SecureRepository`** — hardened repo
  `ComponentResource` with discriminated-union `acknowledgePublic` opt-in for
  public visibility (requires `acknowledgePublic: true` AND non-empty
  `publicJustification: string`; emits `security_event.public_visibility_acknowledged`
  audit row). Tier-gated security-and-analysis defaults. Shipped in M1.
- **`@hulumi/baseline.github.OrgFoundation`** — composing `ComponentResource`
  for org-level hardening: `OrganizationRuleset`, Actions allowlist with the
  2025-08-15 SHA-pin policy on at startup-hardened, OIDC subject-claim
  customization template defaulted to the three-axis safe shape (`repo` +
  `context` + `job_workflow_ref` + `environment` — UNC6426 mitigation), and
  encapsulated `securityDefaults` surface backed by either `OrganizationSettings`
  (flat-fields, default) or a thin `ComponentResource` placeholder for the GHAS
  Code Security Configurations REST surface (CSC, switchable). Shipped in M2.
- **`@hulumi/policies/github.HulumiGithubHardeningPack`** — CrossGuard pack
  with H1 (no raw `github.Repository`), H2 (no wildcard custom OIDC template),
  H3 (= `G_OIDC_1`). Mandatory at startup-hardened. Shipped in M3.
- **`@hulumi/policies/github.G_OIDC_1`** — standalone CrossGuard rule
  rejecting `StringLike` and wildcard `sub` conditions on AWS / Azure / GCP
  IAM trust policies for GitHub Actions OIDC. Shipped in M3.
- **`@hulumi/policies/github.CisGithubV1Pack`** — placeholder advisory pack;
  per-section rules await CIS WorkBench access (v1.1 deferral D4). Shipped in
  M3.
- **`@hulumi/baseline/mappings.cisGithub` and `nistSsdfV11`** — IDs-only
  framework mapping tables. `cisGithub` ships with `:PENDING-WORKBENCH`
  placeholders until WorkBench access is secured. Shipped in M3.
- **`hulumi:controls` tag** — added to `SecureRepository` description and as
  a top-level `Output<readonly string[]>` on `OrgFoundation` (sourced from
  the union of the new mapping tables). Staged-migration completion. Shipped
  in M3.
- **`@hulumi/drift.GithubWebhookFallbackAdapter`** — pure TypeScript
  `DriftAdapter` implementation for GitHub webhook events at non-GHEC plan
  tiers. Bounded payload (25 MB / 64 nesting depth — per critique S1).
  SHA-256-keyed idempotency cache (no path-traversal — per critique S5).
  HMAC verification via `crypto.timingSafeEqual` (constant-time compare).
  Webhook secret-rotation detection with structured audit row at >3
  consecutive HMAC failures from same source (per critique E3). Out-of-order
  events sequenced by envelope timestamp before composition (per critique
  E1). Allow-list of 7 webhook event types: `branch_protection_rule`,
  `repository_ruleset`, `secret_scanning_alert`, `dependabot_alert`,
  `code_scanning_alert`, `member`, `organization`. Shipped in M4.
- **`DriftVerdict.tierDegraded?: boolean`** — additive field, true when the
  GithubWebhookFallbackAdapter contributes (the adapter exists _because_
  GHEC audit-log REST is unavailable; the truth is non-suppressible — no
  API flag hides it). Distinct from Hulumi's `Tier` enum. Shipped in M4.
- **`DriftVerdict.featureNotLicensed?: string[]`** — additive field listing
  GitHub-platform features the underlying plan tier does NOT license (e.g.
  `["code_scanning_alert"]` for non-GHAS repos). Non-suppressible. Shipped
  in M4.

### Changed

- **Cache schema bumped v1 → v2** — adds optional `githubWebhookCache` field
  for the M4 webhook-fallback adapter's idempotency cache. Migration runs
  automatically on first read; `<cache>.v1.backup` preserved one rotation.
  AWS-side consumers see no behavior change. Atomic write order:
  backup-then-v2-write.
- **`/hulumi-threat-model` SKILL.md** — extended `description` and
  refusal-language to cover CIS GitHub Benchmark in addition to CSA CCM /
  CIS AWS Foundations.
- **`scripts/exact-pin-guard.mjs`** — extended `ALLOWED` to include
  `@pulumi/github@6.13.0` (integrity-hash-pinned).
- **`scripts/cooling-off-diff.mjs`** — `PULUMI_PACKAGES` extended to include
  `@pulumi/github`; future bumps go through the 72h/24h cooling-off gate.

### Compatibility commitments

- `DriftSource` enum **unchanged** — TLA+ alignment preserved
  ([`docs/TLAdocs/hulumi/HulumiDrift.tla`](./docs/TLAdocs/hulumi/HulumiDrift.tla)
  Source set unchanged; verdict-composition rules unchanged; M4's new behavior
  expressed via additive fields on `DriftVerdict`, not new enum values).
- All v1.0.0 AWS-side BDD scenarios continue to pass.
- `Tier` enum (`"sandbox"` / `"startup-hardened"`) unchanged; re-exported
  from `@hulumi/baseline/github` so consumers don't need to import from
  `@hulumi/baseline/aws` for the enum.
- `OrganizationSettings.billingEmail` is required by GitHub; `OrgFoundationArgs`
  exposes it as a required field. Documented in M2 lessons.

### Deferred to v1.1.x

See [`docs/slo/runbook-milestones/hulumi-github-v1.1-deferrals.md`](./docs/slo/runbook-milestones/hulumi-github-v1.1-deferrals.md):

- **D1** — Classic-PAT-authed audit-log REST adapter (GHEC only).
- **D1.5** — Real REST hooks for the Code Security Configurations backend
  (currently a `ComponentResource` placeholder due to the vitest worker-pool
  gotcha on `pulumi.dynamic.Resource`).
- **D2** — `EnterpriseSecurityAnalysisSettings` enforcement (GHEC only).
- **D3** — Audit-log streams configuration (GHEC only).
- **D4** — CIS GitHub Benchmark v1.2.0 section-number completion (gated on
  CIS WorkBench access).
- **D5** — Threat-model skill scenario for GitHub Apps with broad org-admin
  scopes (post-Vercel-April-2026 follow-up).
- **D6** — Optional Oracle Cloud / IBM Cloud OIDC trust extension to G_OIDC_1.

## [1.0.0] — 2026-04-25

First public release. SLSA Build L3 attestation on every published
package. Atomic three-package release: `@hulumi/baseline@1.0.0`,
`@hulumi/policies@1.0.0`, `@hulumi/drift@1.0.0`.

### Added

- **`@hulumi/baseline.aws.SecureBucket`** — hardened S3 bucket
  ComponentResource with Sandbox / Startup-Hardened tiers (3
  per-tier deltas: ObjectLock, Logging, CloudTrail EventDataStore).
  Shipped at v0.2 (M2).
- **`@hulumi/baseline.aws.AccountFoundation`** — composes CloudTrail +
  Config + GuardDuty + Security Hub + IAM password policy + Access
  Analyzer + KMS key ring with 4 per-tier deltas. Shipped at v0.3
  (M3).
- **`@hulumi/policies.HulumiHardeningPack`** — H1 (block raw S3),
  H2 (block file:// state backend), H3 (iac-role tag — see breaking
  change below), H4 (Startup-Hardened requires logging sibling).
  Shipped at v0.2 (M2).
- **`@hulumi/policies.CisV5Pack`** — full CIS AWS Foundations v5.0.0
  sections 1 (IAM), 2 (Storage), 3 (Logging). Sections 4–5 advisory
  stubs. Shipped at v0.3 (M3).
- **`@hulumi/drift.DriftClassifier`** — local-first drift classifier
  with 4 pluggable adapters (AutomationApi, CloudTrail,
  ProviderVersion, GitLog). Verdict logic mirrors TLA+
  `HardenedVerdict` exactly (5-row matrix walked verbatim by the
  feature test). Six security BDDs: cache 0o600, shell-injection
  refusal, shallow-clone guard, probe-timeout graceful degradation,
  CloudTrail namespace rejection, cache-based rate limit. Shipped
  at v0.4 (M4).
- **`/hulumi-threat-model`** Claude Code skill with 5 prebuilt AWS
  scenarios. Shipped at v0.1 (M1).
- **`docs/deployment/scp.json`** — ready-to-apply AWS Organizations
  SCP that protects the `hulumi:iac-role` tag from non-IaC
  principals. See `docs/deployment/scp-guide.md`.
- **SLSA Build L3 attestation** on every published npm tarball via
  `actions/attest-build-provenance` + `slsa-framework/slsa-github-generator`.
  Verify with `gh attestation verify`.
- **Pulumi cooling-off CI gate** — every PR bumping `@pulumi/*`
  pins waits 72h (minor/major) or 24h (patch) from upstream npm
  publish before the bump can merge. Self-applies to the first
  post-release Pulumi-bump.
- **Five launch-readiness drafts** in `docs/launch/`: CSA outreach,
  Pulumi GitHub Discussion, two CFP drafts (FWD CloudSec + BSides),
  Pulumi blog pitch. MITRE ATLAS contribution stub for post-release.

### Changed (BREAKING)

- **`HulumiHardeningPack` H3 flips from `advisory` to `mandatory`.**
  Stacks that don't tag their IaC role `hulumi:iac-role=true` will
  now fail `pulumi preview` with a mandatory CrossGuard violation.
  - **Migration A (recommended)**: tag the IaC role
    `hulumi:iac-role=true`. The role's tag is then tamper-evident
    via the v1.0.0 SCP template (`docs/deployment/scp.json`).
  - **Migration B (suppression)**: add a Hulumi `Suppression`
    scoped to the role's URN with a documented reason and (for
    high-severity rules) an `expiresAt`.
  - **Migration C (override)**: locally edit the pack's enforcement
    level — discouraged for production but supported.

### Deprecated

- `@pulumi/aws.s3.BucketV2` and the other `*V2` resource names are
  deprecated upstream in `@pulumi/aws@7.x` in favor of the non-V2
  names. `interfaces.md §1` currently locks `SecureBucketOutputs.bucket`
  to `aws.s3.BucketV2`. The migration to non-V2 names is tracked as
  a v2.0.0 follow-up; v1.x ships V2 names for backwards compatibility.

### Security

- All three packages publish with `"provenance": true` via npm
  trusted publishing (OIDC-backed; no `NPM_TOKEN` long-lived
  credential in this repo).
- License-boundary lint enforces IDs-only on shipped `dist/`
  artifacts — no verbatim CCM / CIS / NIST text in any tarball.
- `@pulumi/*` exact-pinned with integrity hashes; drift detected by
  `scripts/exact-pin-guard.mjs` on every PR.
- `@aws-sdk/*` + `simple-git` + `p-timeout` exact-pinned in
  `pnpm-lock.yaml`; cooling-off CI checks Pulumi-specific bumps but
  general dev-dep bumps go through Dependabot major-version
  ignore-list.
