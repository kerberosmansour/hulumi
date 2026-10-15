# Verification: AWS organization delegated-admin binding M1

## Result

Local verification passes. Exact-head CI and merged-main Codex Security validation remain required before closeout.

| Gate                           | Result | Evidence                                                                                                                                                                                                                                                                                     |
| ------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline                       | pass   | The focused AWS organization policy suite passed 7/7 before the new account-binding cases.                                                                                                                                                                                                   |
| RED                            | pass   | Six new identity-binding cases failed for the intended missing correlation while ten existing or compatibility cases passed.                                                                                                                                                                 |
| Focused BDD                    | pass   | `aws-org-hardening-pack.test.ts`: 16/16.                                                                                                                                                                                                                                                     |
| Policy package                 | pass   | 18 files, 365/365 tests.                                                                                                                                                                                                                                                                     |
| Full workspace                 | pass   | Recursive build, typecheck, test, and lint passed across the workspace.                                                                                                                                                                                                                      |
| Formatting/licensing/exact pin | pass   | Prettier, IDs-only license-boundary lint, and exact dependency pin/integrity guard passed.                                                                                                                                                                                                   |
| OSV                            | pass   | OSV-Scanner 2.7.0 scanned 2 lockfiles and 575 package occurrences: 0 vulnerable occurrences and 0 `MAL-*` advisories. Report SHA-256 `10c55dbf5e83d5268eb5fa37e826477ae5eb4a972a2fe38e0a6832f28be95df4`; receipt SHA-256 `c3c0f5f4117b350ce6d38650f98aa318ca95eb8e17e14b32d0f77151d196371e`. |
| Semgrep                        | pass   | Semgrep OSS 1.156.0 ran 210 applicable community rules over the changed TypeScript source and test: 0 findings and 0 errors. JSON SHA-256 `8a546156dc30b7816b6bc5748a643c7f6bf7574b4d385fb6fcf76d5391d95cd8`.                                                                                |
| Secret diff scan               | pass   | High-confidence AWS access key, GitHub token, Slack token, and private-key patterns: 0.                                                                                                                                                                                                      |
| Dependency graph               | pass   | No manifest or lockfile changed. Existing admitted dependencies were reused with lifecycle installation disabled.                                                                                                                                                                            |
| Scope                          | pass   | Only the nine-file M1 allow-list is modified.                                                                                                                                                                                                                                                |

## Behaviour checked

- A stack without a startup-hardened foundation remains outside ORG-1.
- Each startup-hardened foundation is evaluated separately.
- Missing, non-string, and malformed foundation `securityAccountId` values fail closed with the foundation URN.
- A required service delegated only to another, missing, non-string, or malformed account does not count.
- A wrong-account decoy cannot hide a missing exact delegate; a correct delegate for the same service is accepted.
- Four exact service/account pairs satisfy ORG-1.
- ORG-2 through ORG-6 retain their existing focused and package behavior.

## Operational limit

This rule validates the Pulumi preview graph. It cannot attest live AWS Organizations state or later drift; the AWS organization live validator owns that control-plane boundary.
