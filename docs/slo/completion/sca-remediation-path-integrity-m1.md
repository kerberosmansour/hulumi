# Completion — SCA remediation path integrity M1

Date: 2026-10-15
Status: implementation verified locally; exact-head and merged-main gates pending.

## Delivered

- Strict work-item and evidence validation with exact identity and manifest consistency.
- Explicit repository-root, Git-revision, and reviewed-work-item SHA-256 bindings for apply.
- Canonical repository-relative path validation across direct and derived targets, including link and special-file rejection.
- Tracked/clean target checks, no-follow descriptor reads, concurrent-change fingerprints, exclusive staging, atomic replacement, and post-write digest verification.
- An explicit refusal to run pnpm or any package manager in the bounded writer.
- Thirty-eight security-boundary tests covering hostile paths, stale bindings, duplicate evidence, target replacement, package-manager refusal, and authorized npm, PyPI, and NuGet updates.
- Operator documentation for the required bindings and the separate dependency-admission lane.

## Evidence summary

- Baseline 26/26; RED eight intended failures with 27 controls; final 38/38.
- Strict SCA TypeScript build, ESLint, formatting, and full 19-project workspace gates passed.
- OSV-Scanner 2.7.0: two unchanged lockfiles, 575 package occurrences, zero vulnerability or `MAL-*` results; report SHA-256 `10c55dbf5e83d5268eb5fa37e826477ae5eb4a972a2fe38e0a6832f28be95df4`.
- Semgrep 1.156.0: 210 rules, two TypeScript targets, zero findings/errors; report SHA-256 `8d713c66eb209fd6ad57fd7cc9376be9a20e3e558d2b256e5fa1deadea86e479`.
- Governance, secret-pattern, dependency-diff, allow-list, formatting, and diff-hygiene gates passed.

## Closeout boundary

The milestone is complete only after a signed DCO commit passes exact-head CI, merges without content drift, and an exact merged-main xhigh Codex Security scan confirms that untrusted manifest paths cannot escape the reviewed repository or select an unbound revision.
