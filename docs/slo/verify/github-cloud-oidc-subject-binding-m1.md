# Verification — Azure and GCP GitHub OIDC subject binding M1

Date: 2026-10-15
Runbook: `docs/RUNBOOK-github-cloud-oidc-subject-binding.md`
Base: `0331c5b6ea9660925751cbfa4fa580a6af775b2f`
Verdict: local implementation gates passed; exact-head CI, merge, and merged-main Codex Security remain.

## Outcome and BDD evidence

| Evidence           | Result                                                                                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline           | Focused GitHub hardening suite passed 45/45 before test changes.                                                                                                             |
| RED                | 16 intended Azure/GCP cases failed while 48 existing and positive cases passed.                                                                                              |
| GREEN              | Focused suite passed 66/66.                                                                                                                                                  |
| Azure variants     | Missing, non-string, empty, wildcard, repo-only, missing workflow, missing environment, duplicate axis, and malformed pair shapes report exactly one violation.              |
| Azure positive     | Three required axes plus an immutable numeric extra claim pass.                                                                                                             |
| GCP variants       | Missing, non-string, empty, wildcard, constant truth, incomplete axes, disjunction, tautological suffix, function, and duplicate binding report exactly one violation.       |
| GCP positive       | Nested parentheses, reversed equality, double/single-quoted literals, all required assertions, and an immutable numeric extra assertion pass.                                |
| AWS compatibility  | Existing AWS trust-policy, issuer anchoring, operator, wildcard, H3 alias, and suppression tests remain green.                                                               |
| Package regression | `@hulumi/policies`: 18 files, 386 tests passed.                                                                                                                              |
| Workspace          | Recursive build, typecheck, test, and lint passed across 19 projects; existing intentional integration skips/todo remained.                                                  |

## Security and repository evidence

| Gate                 | Result                                                                                                                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OSV admission        | Official checksum-verified OSV-Scanner 2.7.0; two resolved lockfiles, 575 package occurrences, zero vulnerability entries, zero `MAL-*`; report SHA-256 `10c55dbf5e83d5268eb5fa37e826477ae5eb4a972a2fe38e0a6832f28be95df4`; receipt `c3c0f5f4117b350ce6d38650f98aa318ca95eb8e17e14b32d0f77151d196371e`. |
| Dependency diff      | No `package.json`, package manifest, or lockfile change. The test toolchain's 21 manifests and lockfile exactly matched this branch before reuse; no install or lifecycle script ran.               |
| Semgrep              | Semgrep 1.156.0; 210 rules on two changed TypeScript files; zero findings and zero errors; report SHA-256 `e31c1c9bacea6bfc17bcaca95cf574b8100c72ff65e2a44657d6709188eff538`.                                                                       |
| Formatting           | Repository Prettier check passed.                                                                                                                                                                  |
| License boundary     | IDs-only boundary check passed.                                                                                                                                                                    |
| Exact dependency pin | All 14 protected dependencies retained exact manifest specs and lockfile integrity hashes.                                                                                                         |
| Diff hygiene         | `git diff --check` passed; manifests/lockfiles unchanged.                                                                                                                                           |
| Provider evidence    | Microsoft exact subject matching, Google shared-issuer condition guidance, and GitHub claim semantics reviewed from current official documentation.                                                |

## Residual limits

- This preview rule proves only literal resource inputs. It does not query live Azure, GCP, or GitHub state and cannot prove provider-side mapping drift.
- The GCP grammar deliberately rejects valid CEL outside conjunction, parentheses, and exact direct assertion/string equality. Operators must rewrite equivalent conditions into the documented narrow form.
- Exact string binding reduces known scope errors; it does not detect unknown issuer or provider vulnerabilities.

## Pending closeout

- Sign and DCO-stamp the exact source commit.
- Pass exact-head GitHub checks and review the final diff.
- Merge only the verified head under standing authorization.
- Run Codex Security against the exact merged-main commit and confirm both source findings are absent.
