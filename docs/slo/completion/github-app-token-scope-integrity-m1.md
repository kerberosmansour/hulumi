# Completion summary — GitHub App token scope integrity M1

Date: 2026-10-15
Status: local execution and verification complete; exact-head and merged-main gates pending.

## Delivered

- Canonicalized and bounded every component repository allowlist and permission map.
- Added an IaC-owned `hulumi:github-app-scope-sha256` tag and additive non-secret `scopeDigest` output.
- Removed wildcard-repository and empty-permission defaults from secret population.
- Required population scope to match the component tag before `PutSecretValue`.
- Stored the canonical scope and digest with the App credential without placing PEM bytes in process arguments.
- Required tag, payload digest, recomputed scope, and requested target to agree before private-key use.
- Required every token request, including wildcard allowlist mode, to name exactly one repository and carry the bound non-empty permissions.
- Added structural and byte limits, fixed HTTPS/TLS settings, the current GitHub API version header, and reason-only failures.
- Documented migration, wildcard semantics, IAM requirements, limits, and operational failure behavior.

## Evidence

- Baseline: 17/17 focused tests plus package build, typecheck, and lint.
- RED: 15 intended failures with 15 controls passing against the old behavior.
- Final focused suite: 34/34.
- Complete package suite: 265/265; build, typecheck, lint, Bash syntax, and ShellCheck passed.
- Full workspace test/build/typecheck/lint and repository governance gates passed across 19 runnable projects.
- OSV 2.7.0: two unchanged lockfiles, 575 package occurrences, zero vulnerabilities and zero `MAL-*`.
- Semgrep 1.156.0: 74 rules, four TypeScript targets, zero findings and zero errors.
- Secret review, allow-list audit, dependency diff, and diff hygiene passed.
- No package dependency, manifest, lockfile, version, publication, or live-cloud change.

## Remaining gates

- Signed+DCO exact source commit and exact-head GitHub CI.
- Authorized merge of the exact green head.
- Exact merged-main Codex Security scan with the scope-widening source finding absent.
