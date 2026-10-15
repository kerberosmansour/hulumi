# Verification — SCA remediation path integrity M1

Date: 2026-10-15
Runbook: `docs/RUNBOOK-sca-remediation-path-integrity.md`
Base: `117c612be7b58be343e85970ce93b3598ac6a229`
Finding: `csf_896f7e0dca6da265597eac34` / CWE-22
Verdict: local implementation and security gates passed; exact-head CI, merge, and merged-main Codex Security remain.

## Outcome and BDD evidence

| Evidence             | Result                                                                                                                                                                                                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Baseline             | The unchanged SCA package passed 26/26 tests after script-disabled installation of its existing exact lock. Official OSV-Scanner 2.7.0 scanned two lockfiles and 575 package occurrences with zero vulnerability or `MAL-*` results.                                                                                                       |
| RED                  | Against the pre-fix implementation, 27 controls passed and eight intended regressions failed: absolute escape, traversal, backslash ambiguity, final/intermediate links, stale revision, wrong work-item digest, duplicate evidence, and pnpm execution authority.                                                                         |
| Strict input         | The complete work-item document is strict-schema validated. One emergency item maps to exactly one evidence row whose finding, advisory, ecosystem, package, version, and single manifest path agree.                                                                                                                                      |
| Immutable binding    | Apply requires an explicit canonical repository root, exact 40-character Git commit, and SHA-256 of the reviewed work-item bytes. Any mismatch rejects before agent review or mutation.                                                                                                                                                    |
| Path boundary        | Direct and derived targets must be canonical repository-relative POSIX paths. Absolute paths, traversal, backslashes, links in any component, missing targets, directories, FIFOs, and other non-regular targets fail closed.                                                                                                              |
| Mutation boundary    | Every target is tracked and clean at the expected commit. Reads use `O_NOFOLLOW` and an inode/device/size/time/mode fingerprint; writes use an exclusive same-directory temporary file, `fsync`, a second fingerprint/digest check, atomic rename, and final digest verification.                                                          |
| Dependency execution | Bounded apply never invokes a package manager. pnpm apply is explicitly refused and redirected to the dependency-admission workflow.                                                                                                                                                                                                       |
| Positive formats     | Exact authorized npm, PyPI, and NuGet fixtures update only their derived manifest sets and preserve unrelated files and comments. Dynamic package-derived regular expressions were replaced with statically analyzable parsers.                                                                                                            |
| Final focused        | The SCA security-boundary suite passed 38/38; strict TypeScript build, ESLint, and package formatting passed.                                                                                                                                                                                                                              |
| Workspace regression | All 19 runnable workspace projects passed topological build, typecheck, sequential tests, lint, and repository formatting. Representative totals remained baseline 195 passed/14 skipped/one todo, Cloudflare 24/three skipped, drift 146, Kubernetes 272, policies 452, skill BDD 120/two skipped, and platform patterns 91/nine skipped. |

## Security and repository evidence

| Gate                  | Result                                                                                                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OSV admission         | Official checksum-verified OSV-Scanner 2.7.0 scanned two unchanged resolved lockfiles and 575 package occurrences with zero vulnerability results and zero `MAL-*`; report SHA-256 `10c55dbf5e83d5268eb5fa37e826477ae5eb4a972a2fe38e0a6832f28be95df4`. |
| Dependency diff       | No manifest or lockfile changed. The milestone adds no direct/transitive dependency, install hook, lifecycle script, build script, or package authority.                                                                                               |
| Semgrep               | Semgrep 1.156.0 ran 210 rules over both changed TypeScript targets with zero findings and zero errors; report SHA-256 `8d713c66eb209fd6ad57fd7cc9376be9a20e3e558d2b256e5fa1deadea86e479`.                                                              |
| Secret review         | Added lines matched zero private-key, AWS access-key, GitHub-token, or assigned-secret patterns. Fixtures contain only public package identifiers and inert versions.                                                                                  |
| Repository governance | License-boundary, exact-pin, workflow-governance, maintenance-workflow tests, OSV-gate unit tests, release-SBOM tests, formatting, and `git diff --check` passed.                                                                                      |
| Scope                 | The final staged diff is limited to the runbook, critique, verification, lessons, completion, remediation source, security-boundary tests, and SCA README.                                                                                             |

## Residual limits

- Node.js does not expose Linux `openat2`. The implementation combines component checks, no-follow final opens, descriptor fingerprints, and same-directory replacement; it still assumes an isolated checkout in which an untrusted concurrent process cannot replace parent directories.
- A multi-file package update cannot be one filesystem transaction. Every target is prechecked and each replacement is rechecked, but operators should discard the checkout after any interrupted apply rather than reusing a partial working tree.
- The bounded lane does not resolve a dependency graph or run a package manager. pnpm workspaces and any update that changes transitive dependencies must use the separate script-disabled, OSV-gated admission workflow.
- OSV covers known vulnerabilities and malicious-package advisories; it does not prove the absence of unknown malware.

## Pending closeout

- Sign and DCO-stamp the exact source commit.
- Pass exact-head GitHub checks and merge only that verified head under standing authorization.
- Run xhigh Codex Security against the exact merged-main commit and confirm the path-escape finding and equivalent occurrences are absent.
