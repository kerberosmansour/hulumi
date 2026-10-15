# Completion summary — OSV scanner cache integrity M1

Date: 2026-10-15
Status: local execution and verification complete; exact-head and merged-main gates pending.

## Delivered

- Moved the OSV executable cache from the scanned checkout to a private operator cache.
- Upgraded the embedded official scanner pin to v2.7.0 and recorded all six release asset digests.
- Removed automatic PATH scanner selection.
- Required absolute, repository-external paths for cache roots and operator overrides.
- Added component-level link rejection before directory creation and final-file no-follow opening.
- Added regular-file, size, owner, executable-mode, write-mode, and exact SHA-256 checks on every selected scanner.
- Added a bounded HTTPS download path with validated length, approved GitHub hosts, private unique staging, final installation, and re-verification.
- Documented the operator cache, override contract, failure behavior, and dependency-admission sequence.

## Evidence

- Baseline: 16/16 existing SCA tests.
- Final SCA suite: 26/26; build, lint, and format passed.
- Real official v2.7.0 download and cache hit: passed; reported pinned commit `bfe2f84abd2f09fe0b83ba7f6dad40d296762f40`.
- Full workspace test/build/typecheck/lint/format and repository governance checks: passed across 19 projects.
- OSV 2.7.0: two unchanged lockfiles, 575 package occurrences, zero vulnerabilities and zero `MAL-*`.
- Semgrep 1.156.0: 74 rules, two targets, zero findings/errors.
- Secret review, allow-list audit, dependency diff, and diff hygiene: passed.
- No package dependency, manifest, lockfile, version, publication, or live-cloud change.

## Remaining gates

- Signed+DCO exact source commit and exact-head GitHub CI.
- Authorized merge of the exact green head.
- Exact merged-main Codex Security scan with source finding `csf_f8669dde43f27c6a64744256` absent.
