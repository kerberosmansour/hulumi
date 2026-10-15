# Verification Report — IAM policy structural coverage M1

## Outcome

Local verification passed. `G_OIDC_1` now normalizes singleton and array trust
statements and fails closed on uninspectable or incomplete GitHub OIDC subject
restrictions. `G_OIDC_2` follows the bounded Pulumi role authority graph for
EKS cluster admin, AWS AdministratorAccess, inline full-admin documents, and
in-stack customer-managed full-admin equivalents. CIS 1.16 uses the same IAM
statement normalizer and covers common direct, role-managed, exclusive, and
generic attachment shapes.

Exact-head GitHub CI and Codex Security validation remain merge gates.

## BDD and security evidence

| Scenario | Result | Evidence |
| --- | --- | --- |
| BDD-M1-1 / singleton trust | pass | Singleton GitHub OIDC trust is inspected by both rules; `StringLike` is rejected and administrator correlation succeeds. |
| BDD-M1-2 / exact `sub` restriction | pass | Missing/empty condition, missing claim, numeric/fabricated operators, scalar/array type confusion, duplicate restrictions and wildcards fail. |
| BDD-M1-3 / uninspectable trust | pass | Malformed JSON, missing Statement and scalar Statement each emit one mandatory violation. |
| BDD-M1-4 / managed attachments | pass | Direct role property, direct attachment, exclusive attachment and generic attachment paths report for the exact GitHub role. |
| BDD-M1-5 / inline authority | pass | `Role.inlinePolicies` and linked `RolePolicy` exact full-admin documents report. |
| BDD-M1-6 / customer policy | pass | Customer-managed exact full-admin policies correlate through policy ARN/property dependencies; a scoped policy does not report. |
| BDD-M1-7 / CIS structure | pass | Singleton statements and every supported AdministratorAccess resource shape report; scoped policies remain accepted. |
| BDD-M1-8 / negative boundaries | pass | Anchored look-alike issuers, non-GitHub trust, unrelated roles, scoped policies and namespace EKS access remain accepted. |
| Baseline | pass | Before BDD additions, 3 files / 64 tests passed at merged main. |
| Red phase | pass | 23 expected failures reproduced; 65 existing cases passed. |
| Focused Vitest | pass | 3 files / 91 tests passed. |
| Policy package | pass | 18 files / 329 tests passed. |
| Full workspace | pass | Build, typecheck, tests and lint passed; 1,125 tests passed, 28 integration/network cases skipped and 1 existing todo remained. |
| Format/license | pass | Prettier check and IDs-only license-boundary lint passed. |
| OSV/MAL | pass | Official pinned OSV-Scanner 2.7.0 scanned 2 lockfiles / 575 package occurrences with zero vulnerabilities and zero `MAL-*`. Report SHA-256 `10c55dbf5e83d5268eb5fa37e826477ae5eb4a972a2fe38e0a6832f28be95df4`; receipt SHA-256 `c3c0f5f4117b350ce6d38650f98aa318ca95eb8e17e14b32d0f77151d196371e`. |
| Semgrep | pass | Semgrep OSS 1.156.0 ran 18 applicable rules from 160 loaded community rules over 7 changed source/test files with zero findings or errors. JSON SHA-256 `227362d097083e6672dcc5fa059f6365fad94966cdd567ef3a3d3a0e0af5880c`. |
| DAST | N/A | These are offline Pulumi preview policies; no HTTP service or route is introduced. |

## Environment

- macOS 26.5.2 (25F84), arm64.
- Node.js 24.14.0; pnpm 9.12.0; Vitest 4.1.11; TypeScript 5.9.3.
- OSV-Scanner 2.7.0; Semgrep OSS 1.156.0.
- Tests reused the exact already-admitted frozen workspace dependency graph;
  no dependency or lockfile changed.

## Limits

- The full-admin predicate intentionally covers exact `Allow`, `Action: "*"`,
  `Resource: "*"` grants. It does not compute equivalent multi-statement or
  service-wildcard combinations.
- `G_OIDC_2` observes the Pulumi resources present in one stack. External policy
  versions, permissions boundaries, session policies, Organizations controls,
  resource policies and out-of-band attachments require effective-authorization
  tests and IAM Access Analyzer.
- Exact-head CI and a successful Codex Security scan are required before merge.
