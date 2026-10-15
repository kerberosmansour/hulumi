# Lessons Learned — IAM policy structural coverage M1

## What changed

- One internal IAM document helper now normalizes AWS's valid singleton and
  array `Statement` representations and identifies the bounded exact
  full-administrator grant used by two policy families.
- `G_OIDC_1` requires one supported GitHub `sub` equality restriction and
  rejects ambiguous or uninspectable trust structures.
- `G_OIDC_2` follows role properties, inline policies, direct/exclusive/generic
  attachment resources and in-stack customer-managed policies.
- CIS 1.16 covers the same singleton statement and AdministratorAccess resource
  representations without claiming whole-account authorization analysis.

## Findings from execution

- Pulumi AWS 7.50 exposes managed authority through both deprecated role
  properties and newer dedicated attachment resources; a security policy must
  cover both while users migrate.
- Dependency URNs are the strongest in-preview identity. Exact role and policy
  ARN/name/ID values remain necessary for serialized previews and test harnesses
  where property dependency edges are absent.
- Splitting policy parsing between CIS and GitHub rules created predictable
  representation drift. A shared internal predicate removed that gap.
- A condition operator parser that strips arbitrary prefixes would accept a
  fabricated `Bogus:StringEquals` operator. An exact allow-list is clearer and
  fail closed.

## Corrections during verification

- The first full-workspace typecheck in the fresh worktree lacked several
  workspace `node_modules` links and failed on unresolved existing packages.
  Reusing the already-admitted dependency directories restored the intended
  environment; the complete typecheck then passed without a source change.
- The initial OIDC operator normalizer accepted any prefix ending in
  `StringEquals`. It was replaced with the four documented supported operators
  and a regression for fabricated qualifiers.
- Documentation originally repeated the older claim that CIS handled only
  array statements. The README, component guide and threat model now describe
  the implemented coverage and its effective-authorization limit.

## Patterns to retain

- Share structural normalization whenever two security rules interpret the
  same authority document.
- Prefer property dependency URNs, then exact values; never correlate security
  principals by substring.
- Preserve a red run that distinguishes every missing graph edge before adding
  implementation branches.
- Document the exact authority forms a preview rule can observe and pair them
  with live/effective-authorization checks for the rest.

## Follow-ups

- Exact-head CI and Codex Security must pass before merge.
- Broader effective-permission analysis remains with issue-specific live tests
  and AWS IAM Access Analyzer rather than this bounded policy patch.
