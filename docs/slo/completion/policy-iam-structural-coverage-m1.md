# Completion Summary — IAM policy structural coverage M1

## Goal

Close three high-severity IAM policy bypasses without changing dependencies,
cloud resources, package versions, or runtime authority.

## Delivered

- Fail-closed singleton/array AWS trust-policy inspection for `G_OIDC_1`.
- Exact GitHub `sub` condition cardinality, operator, type and wildcard checks.
- Complete bounded Pulumi IAM authority correlation for `G_OIDC_2` across role
  properties, inline policies, direct/exclusive/generic attachments and
  customer-managed exact full-admin policies.
- Shared singleton/array full-admin parsing in CIS 1.16.
- 27 new focused regression cases and updated component, README, threat-model,
  runbook, critique, verification and lessons documentation.

## Verification

- Focused: 91 passed after a preserved 23-failure red phase.
- Policy package: 329 passed.
- Full workspace build, tests, typecheck, lint, format and license boundary:
  pass.
- OSV: 2 lockfiles / 575 package occurrences / 0 advisories / 0 `MAL-*`.
- Semgrep: 160 loaded community rules / 18 applicable / 7 targets / 0 findings.

## Publication and versioning

This is a backward-compatible security fix to the existing policy pack. It does
not change dependencies or public TypeScript signatures. A patch release should
be handled by the repository's coordinated release process after this PR and
the remaining security batches are merged, avoiding an unnecessary partial
publication between related high-severity fixes.

## Remaining gate

Create a signed+DCO commit and pull request, require exact-head GitHub CI and
Codex Security validation, merge the reviewed head, and re-scan merged main.
