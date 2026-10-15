# Verification: Cloudflare DNS-only policy proof M1

## Result

Local verification passes. Exact-head CI and merged-main Codex Security validation remain required before closeout.

| Gate | Result | Evidence |
| --- | --- | --- |
| Baseline | pass | The focused Cloudflare file passed 13/13 before adding the new evidence cases. |
| RED | pass | The final stack-validation contract produced 13 expected CF_DNS_1 failures while nine unrelated DNSSEC/origin tests stayed green. |
| Focused BDD | pass | `hulumi-cloudflare-hardening-pack.test.ts`: 22/22. |
| Policy package | pass | 18 files, 345/345 tests. |
| Build/typecheck/lint | pass | `@hulumi/policies` build, typecheck, and ESLint all passed. |
| Formatting/licensing | pass | Repository Prettier check and IDs-only license-boundary lint passed. |
| OSV | pass | OSV-Scanner 2.7.0 scanned 2 lockfiles and 575 package occurrences: 0 vulnerable occurrences and 0 `MAL-*` advisories. Report SHA-256 `10c55dbf5e83d5268eb5fa37e826477ae5eb4a972a2fe38e0a6832f28be95df4`; receipt SHA-256 `c3c0f5f4117b350ce6d38650f98aa318ca95eb8e17e14b32d0f77151d196371e`. |
| Semgrep | pass | Semgrep OSS 1.156.0 ran 210 applicable community rules over the changed TypeScript source and test: 0 findings and 0 errors. JSON SHA-256 `439140e9f692c611cf954afd62d8f650cb7801c6dbb8098bdd39e444018485b4`. |
| Secret diff scan | pass | High-confidence AWS access key, GitHub token, Slack token, and private-key patterns: 0. |
| Dependency graph | pass | No manifest or lockfile changes. Existing admitted dependencies were reused with lifecycle installation disabled. |
| Scope | pass | Only the nine-file M1 allow-list is modified. |

## Behaviour checked

- Raw DNS-only public-application records remain violations.
- A `PublicHostname` URN ancestor without a concrete parent remains a violation.
- A parent reference absent from the stack or carrying another type remains a violation.
- Hostname mismatch, non-public purpose, proxied parent state, missing acknowledgement, and blank justification remain violations.
- A concrete matching acknowledged parent passes, as do proxied records and existing scoped suppressions.
- Forged type tokens in logical names remain violations.

## Operational limit

The policy validates the Pulumi stack graph and component inputs. It does not attest Cloudflare's live control-plane state or the origin server's network controls; the separate secure-origin rule owns that boundary.
