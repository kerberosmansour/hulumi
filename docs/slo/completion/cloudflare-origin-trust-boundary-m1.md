# Completion summary — Cloudflare origin trust boundary M1

Date: 2026-10-15
Status: local execution and verification complete; exact-head and merged-main gates pending.

## Delivered

- Removed `tunnelSecret` from parent component inputs and forced the tunnel child's value to a Pulumi secret.
- Replaced metadata-only AOP inputs with a concrete, version-pinned ALB trust store and HTTPS mutual-TLS listener contract.
- Fixed the listener to TLS 1.3/1.2 policy, `verify` mode, client-certificate expiry enforcement, the exact server certificate, and the exact target group.
- Enabled only per-hostname Cloudflare AOP and ordered it after the listener and all source/target security-group controls.
- Exported the pinned Cloudflare IPv4 origin range set and rejected Internet-wide, malformed, non-canonical, duplicate, IPv6, and unrelated CIDRs.
- Replaced CF_ORIGIN_1 component-presence acceptance with exact direct-child and dependency evidence for both tunnel and allowlist+AOP modes.
- Added adversarial component and policy tests and updated component, policy-pack, and cookbook migration guidance.

## Evidence

- Baselines: component 6/6; Cloudflare policy 22/22.
- RED: component 8 intended failures with 3 controls passing; policy 12 intended failures with 23 controls passing.
- Final focused suites: component 11/11; Cloudflare policy 41/41.
- Complete package suites: `@hulumi/platform-patterns` 84 passed with 9 intentional integration skips; `@hulumi/policies` 440/440.
- Full workspace test, build, typecheck, and lint passed across 19 runnable projects; formatting and governance gates passed.
- OSV-Scanner 2.7.0: two unchanged lockfiles, 575 package occurrences, zero vulnerabilities and zero `MAL-*`.
- Semgrep 1.156.0: 74 TypeScript rules, five targets, zero findings and zero errors.
- Secret review, exact allow-list, dependency diff, and diff hygiene passed.
- No dependency, manifest, lockfile, package version, publication, or live-cloud change.

## Remaining gates

- Signed+DCO exact source commit and exact-head GitHub CI.
- Authorized merge of the exact green head.
- Exact merged-main xhigh Codex Security scan with all four source findings and equivalent origin-control bypasses absent.
