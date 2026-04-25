# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
