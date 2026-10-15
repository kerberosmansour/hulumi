# Verification — Drift evidence-window contract M1

Date: 2026-10-15
Runbook: `docs/RUNBOOK-drift-evidence-window-contract.md`
Base: `bb44c21ca4e9fbe8fccb122c09e0cf301bc84cc8`
Verdict: local implementation gates passed; exact-head CI, merge, and merged-main Codex Security remain.

## Outcome and BDD evidence

| Evidence                    | Result                                                                                                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline                    | `@hulumi/drift` passed 26 files and 138 tests before test changes.                                                                                                         |
| RED                         | Seven intended cases failed: inverted classifier default, invalid/reversed classifier input, inverted direct CloudTrail default, and missing validation at three adapters. |
| Polarity control            | Existing Git mapping passed during RED: `after` maps to `--since` and `before` maps to `--until`.                                                                          |
| GREEN                       | Focused evidence-window suite passed 8/8.                                                                                                                                  |
| Default classifier interval | All four classifier adapters receive the same object with `after = now - 24h` and `before = now`, derived from one fixed clock reading.                                    |
| Classifier failure behavior | Invalid and reversed explicit windows reject before adapter or delivery-probe invocation.                                                                                  |
| Direct CloudTrail           | Omitted window produces the ordered preceding 24 hours; invalid and reversed windows return `ok: false` without lookup.                                                    |
| Direct Git                  | Valid bounds retain the established argv mapping; invalid and reversed windows return `ok: false` before repository or log lookup.                                         |
| Webhook fallback            | Invalid and reversed windows return `ok: false`; an event between inclusive valid bounds remains detected.                                                                 |
| Fixture compatibility       | Namespace and live CloudTrail integration fixtures now encode the documented lower/upper polarity.                                                                         |
| Package regression          | `@hulumi/drift`: 27 files and 146 tests passed; build, typecheck, and lint passed.                                                                                         |
| Workspace                   | Recursive build, typecheck, test, and lint passed across 19 projects; existing intentional integration skips/todo remained.                                                |

## Security and repository evidence

| Gate                 | Result                                                                                                                                                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OSV admission        | Official checksum-verified OSV-Scanner 2.7.0; two resolved lockfiles, 575 package occurrences, zero vulnerability entries, zero `MAL-*`; report SHA-256 `10c55dbf5e83d5268eb5fa37e826477ae5eb4a972a2fe38e0a6832f28be95df4`; receipt `c3c0f5f4117b350ce6d38650f98aa318ca95eb8e17e14b32d0f77151d196371e`. |
| Dependency diff      | No `package.json`, package manifest, or lockfile change. The reused test toolchain's 22 manifests/lockfile inputs exactly matched this branch; no install or lifecycle script ran.                                                                                                                      |
| Semgrep              | Semgrep 1.156.0; 74 TypeScript rules on 10 changed source/test files; zero findings and zero errors; report SHA-256 `ad88e964f912037317c0b3bdbee3db7c78f9262d3b128d959fcdfb59289a443d`.                                                                                                                 |
| Secret review        | Added diff lines matched zero high-confidence private-key, AWS access-key, GitHub-token, or Slack-token patterns.                                                                                                                                                                                       |
| Formatting           | Repository Prettier check passed.                                                                                                                                                                                                                                                                       |
| License boundary     | IDs-only boundary check passed.                                                                                                                                                                                                                                                                         |
| Exact dependency pin | All 14 protected dependencies retained exact manifest specs and lockfile integrity hashes.                                                                                                                                                                                                              |
| Diff hygiene         | `git diff --check` passed; manifests and lockfiles are unchanged.                                                                                                                                                                                                                                       |

## Residual limits

- `Date.parse` accepts the JavaScript runtime's supported timestamp representations; the helper proves finite instants and ordering without rewriting valid caller strings.
- A direct `GitLogAdapter.signal()` call that omits its optional window retains the established unbounded-history behavior. Classifier calls always supply the ordered default.
- Evidence-window correctness does not prove provider delivery completeness; the existing CloudTrail probe and degraded-verdict behavior continue to cover delivery gaps.

## Pending closeout

- Sign and DCO-stamp the exact source commit.
- Pass exact-head GitHub checks and review the final diff.
- Merge only the verified head under standing authorization.
- Run Codex Security against the exact merged-main commit and confirm the evidence-window findings are absent.
