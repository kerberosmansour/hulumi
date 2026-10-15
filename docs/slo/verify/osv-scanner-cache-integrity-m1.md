# Verification — OSV scanner cache integrity M1

Date: 2026-10-15
Runbook: `docs/RUNBOOK-osv-scanner-cache-integrity.md`
Base: `dbadf79346705c513bbb8d5dbaedd87b512a1db2`
Verdict: local implementation gates passed; exact-head CI, merge, and merged-main Codex Security remain.

## Outcome and BDD evidence

| Evidence               | Result                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline               | `@hulumi/sca-brain` passed its existing 16 tests plus build, lint, and format before RED changes.                                                                                                                                                                                                                                                       |
| RED                    | The first four hostile-boundary cases failed only because the old resolver accepted a wrong-digest cache file, followed a cache symlink, invoked a fake PATH scanner, and returned a relative override.                                                                                                                                                 |
| GREEN                  | The final SCA suite passed 26/26, including ten new hostile-boundary scenarios.                                                                                                                                                                                                                                                                         |
| Repository isolation   | The resolver ignores the legacy repository-local cache and rejects both a repository-local cache root and a repository-local explicit binary.                                                                                                                                                                                                           |
| Link isolation         | Final-file and parent-directory symbolic links reject before target execution; the parent-link test also proves no directory was created through the link.                                                                                                                                                                                              |
| Integrity on every use | Cache hits and absolute overrides pass one verifier that opens without following the final link, requires a regular bounded owned file, enforces safe executable and cache-directory permissions, and recomputes the platform asset SHA-256. A verified synthetic file rejects after mutation; group/world-writable files and cache directories reject. |
| PATH boundary          | A fake `osv-scanner` on PATH was never invoked. Automatic PATH discovery was removed.                                                                                                                                                                                                                                                                   |
| Download boundary      | The actual official v2.7.0 Darwin arm64 asset streamed under the 64 MiB cap, matched the release digest, installed through private staging, reported the pinned commit, and passed a second cache-hit verification.                                                                                                                                     |
| Failure behavior       | A corrupt existing cache entry fails closed and remains in place; resolution does not silently overwrite it or fall back to another executable.                                                                                                                                                                                                         |
| Package regression     | SCA tests 26/26; build, lint, and format passed.                                                                                                                                                                                                                                                                                                        |
| Workspace regression   | Recursive test, build, typecheck, lint, format, license-boundary, exact-pin, and workflow-governance checks passed across 19 projects.                                                                                                                                                                                                                  |

## Security and repository evidence

| Gate               | Result                                                                                                                                                                                                                                                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OSV admission      | Official checksum-verified OSV-Scanner 2.7.0 scanned two resolved lockfiles and 575 package occurrences with zero vulnerability results and zero `MAL-*`; report SHA-256 `10c55dbf5e83d5268eb5fa37e826477ae5eb4a972a2fe38e0a6832f28be95df4`; receipt SHA-256 `c3c0f5f4117b350ce6d38650f98aa318ca95eb8e17e14b32d0f77151d196371e`. |
| Dependency diff    | No manifest or lockfile changed. The missing workspace links were restored from the existing local pnpm store with `--frozen-lockfile --ignore-scripts --offline`: 422 packages reused, zero downloaded, and no lifecycle script executed.                                                                                       |
| Release provenance | The Google OSV-Scanner v2.7.0 release resolves to verified commit `bfe2f84abd2f09fe0b83ba7f6dad40d296762f40`; all six embedded platform digests exactly match the official `osv-scanner_SHA256SUMS` asset and `scripts/osv-dependency-gate.py`.                                                                                  |
| Semgrep            | Semgrep 1.156.0 ran 74 TypeScript rules over the two changed source/test files with zero findings and zero errors; report SHA-256 `34aca76668e6b08fdb447e8e7c8ab87f18446044c78e42634c8fc8810fdaa22a`.                                                                                                                            |
| Secret review      | Added lines matched zero high-confidence private-key, AWS access-key, GitHub-token, or generic assigned-secret patterns.                                                                                                                                                                                                         |
| Diff hygiene       | Prettier and `git diff --check` passed; all changed files are within the exact milestone allow-list.                                                                                                                                                                                                                             |

## Residual limits

- Exact asset hashing establishes identity against the admitted release bytes; it cannot prove the upstream release infrastructure was never compromised.
- A process with the same user identity and control of the operator's private cache can race or replace files after verification. The cache isolation, link rejection, open-file verification, safe-mode checks, and immediate pre-use resolution remove the untrusted-repository path addressed by this milestone.
- The injectable `scannerBin` test hooks in internal scan/review functions remain trusted caller seams. Production CLI resolution uses `ensureScannerBinary`.

## Pending closeout

- Sign and DCO-stamp the exact source commit.
- Pass exact-head GitHub checks and review the final diff.
- Merge only the verified head under standing authorization.
- Run Codex Security against the exact merged-main commit and confirm `csf_f8669dde43f27c6a64744256` is absent.
