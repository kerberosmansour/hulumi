# Verification — Cloudflare origin trust boundary M1

Date: 2026-10-15
Runbook: `docs/RUNBOOK-cloudflare-origin-trust-boundary.md`
Base: `2d28d71143e6b4995c1ac9e14e01bfb4a21aca93`
Findings: `csf_d8bcb3b6fce71904a27d2444`, `csf_3d548f23d5c03ffed2ea34f1`, `csf_d301d5fdd6abfad96c0b7455`, `csf_b76328f43c9acbfaa1709206`
Verdict: local implementation and security gates passed; exact-head CI, merge, and merged-main Codex Security remain.

## Outcome and BDD evidence

| Evidence                   | Result                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline                   | The existing component suite passed 6/6 and the Cloudflare policy suite passed 22/22. Official OSV-Scanner 2.7.0 scanned both resolved lockfiles and 575 package occurrences with zero vulnerabilities and zero `MAL-*`.                                                                                                                                                                                          |
| RED                        | The expanded component suite produced 8 intended failures with 3 controls passing. The expanded policy suite produced 12 intended failures with 23 controls passing. Failures reproduced plain parent tunnel input, absent ALB mTLS resources, permissive CIDRs, duplicate ranges, component-only evidence, TLS-disabled or unbound tunnel configs, missing/weak AOP enforcement, and wider security-group paths. |
| Tunnel secrecy             | Parent component inputs omit `tunnelSecret`; the Cloudflare tunnel child receives a Pulumi secret wrapper even when the caller supplied a literal.                                                                                                                                                                                                                                                                |
| Tunnel evidence            | CF_ORIGIN_1 requires one direct child tunnel and one bound config for the exact account and hostname, TLS verification enabled, SNI-host matching, and a terminal `http_status:404` fallback.                                                                                                                                                                                                                     |
| Origin authentication      | Allowlist+AOP mode creates a version-pinned `aws.lb.TrustStore` and an HTTPS `aws.lb.Listener` with the concrete server certificate, fixed TLS policy, exact target group, mutual-TLS `verify` mode, and client-certificate expiry enforcement.                                                                                                                                                                   |
| Source restriction         | The constructor and policy admit only non-empty, unique subsets of Cloudflare's pinned published IPv4 ranges. Internet-wide, malformed, non-canonical, duplicate, IPv6, and unrelated ranges fail closed.                                                                                                                                                                                                         |
| AOP ordering               | Per-hostname AOP depends on the concrete listener and all source/target security-group rules, so Cloudflare activation follows origin enforcement. The policy requires those dependency edges.                                                                                                                                                                                                                    |
| Focused/package regression | Final focused suites passed 11/11 component tests and 41/41 Cloudflare policy tests. The complete `@hulumi/platform-patterns` suite passed 84 tests with 9 intentional integration skips; the complete `@hulumi/policies` suite passed 440/440. Both packages passed build, typecheck, and lint.                                                                                                                  |
| Workspace regression       | After the required build-before-test ordering, recursive test, build, typecheck, and lint passed across all 19 runnable workspace projects.                                                                                                                                                                                                                                                                       |

## Security and repository evidence

| Gate                  | Result                                                                                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OSV admission         | Official checksum-verified OSV-Scanner 2.7.0 scanned two unchanged resolved lockfiles and 575 package occurrences with zero vulnerability results and zero `MAL-*`; baseline and final report SHA-256 `10c55dbf5e83d5268eb5fa37e826477ae5eb4a972a2fe38e0a6832f28be95df4`. |
| Dependency diff       | No manifest or lockfile changed, and the implementation added no dependency, lifecycle script, build script, or package authority.                                                                                                                                        |
| Semgrep               | Semgrep 1.156.0 ran 74 TypeScript rules over the five changed TypeScript files with zero findings and zero errors; report SHA-256 `a41424f5d1cad018ebfe1d0de25c9546621fe59fe0e20a038b6e547b86e0480b`.                                                                     |
| Secret review         | Added lines contain no live credential, token, private key, or account secret. The tunnel fixture is inert synthetic base64 data; the implementation removes it from parent state and forces the child input secret.                                                      |
| Repository governance | Prettier, license-boundary, exact-pin, workflow-governance, exact allow-list, and `git diff --check` passed.                                                                                                                                                              |

## Residual limits

- The Cloudflare IPv4 set is deliberately pinned. A Cloudflare range addition requires a reviewed Hulumi update before operators can admit the range.
- The component now owns the HTTPS listener and trust store. Existing resources must be imported into the component's child URNs or replaced through a reviewed migration; an unplanned second listener on the same ALB port will fail.
- The policy validates resources visible in one Pulumi stack. External listeners, trust stores, rules, or AOP associations cannot satisfy CF_ORIGIN_1 without an in-stack managed tuple.
- Unknown or computed identifiers fail closed until policy evaluation can inspect concrete values and property dependencies.
- Tests exercise Pulumi registrations and policy inputs locally and make no live Cloudflare or AWS calls.

## Pending closeout

- Sign and DCO-stamp the exact source commit.
- Pass exact-head GitHub checks and merge only that verified head under standing authorization.
- Run xhigh Codex Security against the exact merged-main commit and confirm all four source findings and equivalent trust-boundary bypasses are absent.
