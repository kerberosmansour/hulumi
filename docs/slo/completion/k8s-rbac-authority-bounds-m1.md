# Completion — Kubernetes RBAC authority bounds M1

Date: 2026-10-15
Status: implementation verified locally; exact-head and merged-main gates pending.

## Delivered

- RBAC-1 rejection for explicit `bind`, `escalate`, and `impersonate` verbs as well as the existing wildcard rejection.
- RBAC-2 fail-closed validation that permits core Secret `get` only with a nonempty array of trimmed, nonempty exact names other than `*`.
- At most one RBAC-1 and one RBAC-2 diagnostic per offending policy rule.
- Preserved public rule IDs, exported symbols, reasoned suppression behavior, RBAC-3 behavior, ordinary workload reads, and exact named-Secret reads.
- Bounded diagnostics that identify the authority class without copying Secret names or complete rules.
- A dedicated operator reference and rollout migration guidance for explicit escalation verbs and exact Secret-name bounds.

## Evidence summary

- Baseline 8/8; RED 11 intended failures with 8 controls; final focused 19/19.
- Policy package 485/485 plus build, typecheck, and lint.
- All 19 runnable workspace projects passed build, typecheck, 1,344 sequential tests, and lint.
- OSV-Scanner 2.7.0: two unchanged lockfiles, 575 package occurrences, zero vulnerability or `MAL-*` results; report SHA-256 `10c55dbf5e83d5268eb5fa37e826477ae5eb4a972a2fe38e0a6832f28be95df4`.
- Semgrep 1.156.0: 210 rules, two TypeScript targets, zero findings/errors; report SHA-256 `a4547366556e148eb79525b55b5aa1bf74dcbe2b99028f123e043292b7689259`.
- No manifest, lockfile, dependency, version, publication, live cluster, Kubernetes API, or resource deployment change.

## Closeout boundary

The milestone is complete only after a signed DCO commit passes exact-head CI, merges without content drift, and an exact merged-main xhigh Codex Security scan confirms that explicit escalation verbs and unscoped Secret reads cannot pass RBAC-1 or RBAC-2.
