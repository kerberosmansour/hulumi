# Completion — GitHub OIDC effective authority M1

Date: 2026-10-15
Status: implementation verified locally; exact-head and merged-main gates pending.

## Delivered

- A dedicated `G_OIDC_2` effective-authority predicate that preserves the shared exact-full-admin helper used by CIS 1.16.
- Fail-closed rejection of any structurally parsed `Allow` statement containing `NotAction` or `NotResource`, including empty, null, malformed, scalar, array, and combined values.
- Consistent enforcement across role inline policies, linked `RolePolicy` resources, direct managed-policy references, and all supported customer-managed attachment resources.
- Explicit negative controls for deny-side complements, scoped positive allowlists, unrelated roles, and unbound policies.
- Bounded diagnostics that identify the role, policy edge, and unsafe authority class without copying policy contents.
- Operator documentation explaining positive allowlists, complement risk, and the limits of preview-only analysis.

## Evidence summary

- Baseline 23/23; RED 6 intended failures with 24 controls; final focused 30/30.
- Policy package 459/459 plus build, typecheck, and lint.
- All 19 runnable workspace projects passed build, typecheck, sequential tests, and lint.
- OSV-Scanner 2.7.0: two unchanged lockfiles, 575 package occurrences, zero vulnerability or `MAL-*` results; report SHA-256 `10c55dbf5e83d5268eb5fa37e826477ae5eb4a972a2fe38e0a6832f28be95df4`.
- Semgrep 1.156.0: 210 rules, three TypeScript targets, zero findings/errors; report SHA-256 `392565a0b5b2a7ead2695055555971cde30955093d5c3d38b96d8c26a03e1103`.
- No manifest, lockfile, dependency, version, publication, or live AWS/GitHub change.

## Closeout boundary

The milestone is complete only after a signed DCO commit passes exact-head CI, merges without content drift, and an exact merged-main xhigh Codex Security scan confirms that allow-side IAM complement operators cannot bypass `G_OIDC_2` on any supported in-stack policy edge.
