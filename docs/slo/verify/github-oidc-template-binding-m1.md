# Verification: GitHub OIDC subject-template binding M1

## Result

Local verification passes. Exact-head CI and merged-main Codex Security validation remain required before closeout.

| Gate                 | Result | Evidence                                                                                                                                                                                                                                                                                     |
| -------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline             | pass   | Before the new rejection cases, the focused component and policy suites passed 15/15 and 34/34.                                                                                                                                                                                              |
| RED                  | pass   | The new component cases produced seven expected failures while 16 existing cases passed; the policy cases produced nine expected failures while 35 existing cases passed.                                                                                                                    |
| Focused BDD          | pass   | `org-foundation.test.ts`: 24/24; `hulumi-hardening-pack.test.ts`: 45/45.                                                                                                                                                                                                                     |
| Package regression   | pass   | `@hulumi/baseline`: 190 passed, 14 skipped, one todo; `@hulumi/policies`: 355/355.                                                                                                                                                                                                           |
| Full workspace       | pass   | Recursive build, typecheck, test, and lint passed.                                                                                                                                                                                                                                           |
| Formatting/licensing | pass   | Repository Prettier and license-boundary checks passed.                                                                                                                                                                                                                                      |
| OSV                  | pass   | OSV-Scanner 2.7.0 scanned 2 lockfiles and 575 package occurrences: 0 vulnerable occurrences and 0 `MAL-*` advisories. Report SHA-256 `10c55dbf5e83d5268eb5fa37e826477ae5eb4a972a2fe38e0a6832f28be95df4`; receipt SHA-256 `c3c0f5f4117b350ce6d38650f98aa318ca95eb8e17e14b32d0f77151d196371e`. |
| Semgrep              | pass   | Semgrep OSS 1.156.0 ran 210 applicable community rules over four changed TypeScript source and test files: 0 findings and 0 errors. JSON SHA-256 `98e4b79678764589c195c03e4790d39bc7592a8680e6b40a5fa57f818e23d75e`.                                                                         |
| Secret diff scan     | pass   | High-confidence AWS access key, GitHub token, Slack token, and private-key patterns: 0.                                                                                                                                                                                                      |
| Dependency graph     | pass   | No manifest or lockfile changed. Existing admitted dependencies were reused with lifecycle installation disabled.                                                                                                                                                                            |
| Scope                | pass   | Only the 15-file M1 allow-list is modified.                                                                                                                                                                                                                                                  |

## Behaviour checked

- The unchanged default emits `repo`, `context`, `job_workflow_ref`, and `environment`.
- Valid custom supersets keep caller order and may include unique GitHub-compatible extra claims.
- Runtime construction rejects an empty list, every missing required identity axis, duplicate keys, wildcard keys, malformed key syntax, whitespace/control characters, and non-string entries.
- HULUMI-H2 applies the same invariant to raw template resources and children of a claimed `OrgFoundation` component.
- Missing, non-array, and non-string preview inputs fail closed; a forged logical name does not suppress the violation.
- Exact scoped H2 suppression and unrelated GitHub hardening rules retain their behavior.

## Operational limit

This milestone validates Hulumi-created organization subject templates and their Pulumi preview representation. Repository-level OIDC opt-in, cloud trust-policy content, immutable GitHub identity adoption, and live organization state remain separate controls.
