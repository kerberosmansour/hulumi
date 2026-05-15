# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] — 2026-05-15

The Hulumi Edge Platform release. Atomic six-package publish:
`@hulumi/baseline@1.3.0`, `@hulumi/policies@1.3.0`,
`@hulumi/drift@1.3.0`, `@hulumi/k8s-baseline@1.3.0`, and first public
publishes for `@hulumi/cloudflare-baseline@1.3.0` and
`@hulumi/platform-patterns@1.3.0`. All six packages use the same SLSA
Build L3 + npm provenance release path.

### Added

- **`@hulumi/cloudflare-baseline@1.3.0`** — first release of Cloudflare
  edge primitives: `ZoneFoundation`, `PublicHostname`, `EdgeWafBaseline`,
  `BotProtectionBaseline`, and `ProtectedAdminHostname`.
- **`@hulumi/platform-patterns@1.3.0`** — first release of
  cross-provider patterns: `CloudflareOriginIngress`,
  `GitHubAwsOidcDeploymentRole`, `DeploymentRepositoryFoundation`, and
  `BuildProvenanceFoundation`.
- **Edge policy coverage** in `@hulumi/policies`: Cloudflare hardening,
  origin-bypass, deployment-governance, and workflow-governance checks.
- **Edge smoke and integration lanes**: `examples/edge-platform-smoke/`,
  Cloudflare/platform integration tests that skip without real credentials,
  and CI coverage for the new package pair.
- **Release advisory preparation**: `docs/release/v1.3.0-security-advisories.md`
  tracks the GHSA registrations to publish after the npm packages are live.

### Security

- **PR #80** — `@hulumi/baseline`: CloudTrail selector-tampering detection
  now catches selector-changing APIs such as `PutEventSelectors` and
  `PutInsightSelectors`.
- **PR #119** — `/hulumi-threat-model`: helper scripts are anchored to the
  installed skill root so an attacker-controlled workspace cannot shadow the
  generator helpers.
- **PR #120** — `@hulumi/policies`: HULUMI-H1 no longer trusts substring
  parent matches for `SecureBucket`-managed resources, closing a parent-spoof
  bypass for raw `BucketV2`.
- **PR #121** — `@hulumi/policies`: CIS 1.16 admin-policy detection now
  covers inline role/user/group policies and `AdministratorAccess`
  attachments, not only standalone IAM policies.
- **PR #122** — deployment SCP guidance: the `hulumi:iac-role` tag guard now
  denies tag-on-create paths for `iam:CreateRole` and `iam:CreateUser`.
- **PR #123** — `@hulumi/drift`: `OrphanReconciler.execute()` now requires
  the in-memory token/action set and refuses externally supplied stale plans.
- **PR #124** — weekly integration IAM guidance: removed unnecessary role
  mutation permissions from the documented policy and added regression coverage
  to keep inline role-policy writes and trust-policy mutation out.
- **PR #126** — `@hulumi/cloudflare-baseline`: `ProtectedAdminHostname`
  hostname validation uses bounded parser-style checks before first public
  publish.
- **`@hulumi/policies`** — `G_OIDC_1` now inspects AWS set-qualified and
  `IfExists` condition operators on the GitHub OIDC `sub` claim, closing a
  bypass where wildcard trusts under `ForAnyValue:StringLike`,
  `ForAllValues:StringLike`, or set-qualified `StringEquals` variants were
  missed.
- **`@hulumi/policies`** — Cloudflare, origin-bypass, and deployment-governance
  stack validators now require per-resource evidence matching. Unrelated
  `ZoneDnssec`, `CloudflareOriginIngress`, `DeploymentRepositoryFoundation`,
  or unscoped OIDC-role resources no longer suppress findings for other zones,
  hostnames, or deployment repositories.

### Changed

- Release and CI workflows expand from four to six packages for pack,
  SBOM, attestation, dry-run, and npm publish steps.
- `release-readiness.test.ts` now enforces the six-package atomic version
  invariant, per-package README/LICENSE requirements, and the v1.3 changelog
  entry.
- `docs/slo/` is ignored as development-only SLO runbook material, not a
  user-facing publish artifact.
- Dependency and workflow governance docs now describe the v1.3 package set
  and the 13 exact-pinned supply-chain dependencies.

### Migration

For consumers on v1.2.x: existing AWS, GitHub, drift, and K8s surfaces are
additive. The two new packages are opt-in. Edge-platform real-provider proof
remains credential-gated; use the smoke example and integration docs before
promoting Cloudflare/AWS/GitHub edge patterns into production.

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
- **Pre-public-launch docs polish + v2.0 migration prep** (runbook
  `hulumi-pre-public-launch` M5): four new docs covering the
  stranger-facing gaps before the public flip — `docs/faq.md`
  consolidates recurring gotchas from the lessons-learned files into a
  top-level FAQ; `docs/v2-migration.md` is the design contract for the
  future v2.0 BucketV2 → non-V2 migration (no v2 release commitment yet
  — preserves user planning); `docs/cookbooks/migration-from-terraform.md`
  - `docs/cookbooks/migration-mid-stack-adoption.md` cover the two
    dominant first-time-adopter scenarios. Cookbooks index + root README
    Documentation table updated to link the new docs.
- **Release-pipeline SBOM fix + drop `security@hulumi.io` references**
  (post-flip-public hardening): `release.yml`'s SBOM step now generates a
  transient `package-lock.json` per package via `npm install
--package-lock-only --ignore-scripts` (resolution only, no install)
  before invoking `@cyclonedx/cyclonedx-npm`, then deletes the lockfile.
  Fixes the pnpm-vs-npm evidence mismatch that broke the v1.2.0 publish
  attempt. Separately: every `security@hulumi.io` reference is replaced
  with the GitHub Security Advisory flow + GitHub-profile fallback
  (mirroring the `SunLitSecurityLibraries` pattern). Hulumi will not
  publish a `security@` email; all vulnerability reports route through
  https://github.com/kerberosmansour/hulumi/security/advisories/new.
  Affected files: `SECURITY.md` (full rewrite), `.github/SECURITY-CONTACTS`
  (drops the `email_contacts` block), `CODE_OF_CONDUCT.md` (line 39),
  `docs/faq.md`, `docs/launch/csa-outreach.md`, `.github/attestations/README.md`.
- **Pre-public-launch supply-chain guard extension + dead-code cleanup**
  (runbook `hulumi-pre-public-launch` M4): `scripts/exact-pin-guard.mjs`
  ALLOWED extended with 5 new entries — `@aws-sdk/client-cloudtrail`,
  `@aws-sdk/client-sts`, `@aws-sdk/credential-providers`, `p-timeout`,
  `simple-git` (all `@hulumi/drift` runtime deps). Pin-guard now covers
  11 pinned deps total; a republish of any of these packages under the
  same version string with tampered bytes will fail CI.
  `resolveFromLockfile` enhanced to handle both quoted (`'@scope/pkg':`)
  and bare (`pkg@ver:`) lockfile shapes. Unused
  `packages/baseline/src/aws/probes/poll.ts` removed (zero callers; the
  vitest-pool gotcha narrative survives in `docs/ARCHITECTURE.md`).
  New BDD test at `tests/skill-bdd/exact-pin-guard.test.ts` enforces
  ALLOWED coverage + dead-code absence going forward.
- **Pre-public-launch test-surface battle-test** (runbook
  `hulumi-pre-public-launch` M3): closed the audit's "stubbed integration
  tests masquerading as coverage" finding. New
  `tests/skill-bdd/cooling-off-diff.test.ts` exercises
  `scripts/cooling-off-diff.mjs` against synthetic lockfile fixtures
  (network-gated via `HULUMI_NETWORK_TESTS=1` for the 2 scenarios that
  hit npm). New `tests/skill-bdd/scp-teardown-harness.ts` plus
  `scp-teardown.test.ts` encode the SCP teardown manual procedure as a
  5-state phase machine with a bounded poll budget plus
  illegal-transition invariants. The 7 previously-tautological
  integration test bodies in
  `packages/{baseline,drift}/tests/integration/*.integration.test.ts`
  are converted to `it.todo()` slots backed by a new
  `docs/integration-testing-roadmap.md` that contracts the follow-up
  real-AWS implementation runbook.
- **Pre-public-launch hygiene pass** (runbook `hulumi-pre-public-launch`
  M2): every GitHub Actions `uses:` reference across all four workflow
  files now SHA-pinned with a tag-as-comment (e.g.
  `actions/checkout@<40-char-sha> # v6`) so a tag-rewrite attack on any
  upstream action repo cannot land in Hulumi CI. `.github/SECURITY-CONTACTS`
  shipped (k8s.io convention; closes the SECURITY.md:23 forward
  reference). Sandbox AWS account ID redacted from
  `docs/slo/lessons/hulumi-m3.md`. Four `docs/slo/research/hulumi-github/`
  iteration-scratch files removed (synthesis.md captures the consolidated
  output; iteration history belongs in git, not docs/). New BDD test at
  `tests/skill-bdd/workflow-action-pinning.test.ts` enforces the SHA-pin
  invariant and OIDC-trusted-publishing posture going forward.

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
