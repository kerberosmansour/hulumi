# Completion: Cloudflare DNS-only policy proof M1

State: implementation and local verification complete; exact-head CI, merge, and merged-main Codex Security validation pending.

## Delivered

- CF_DNS_1 now evaluates the stack graph rather than trusting one resource's URN.
- DNS-only acceptance requires a concrete, in-stack `PublicHostname` parent with a matching normalized hostname and explicit acknowledged inputs.
- Regression coverage includes all missing, mismatched, and malformed parent-evidence cases plus the existing raw/proxied/suppression behavior.
- Cloudflare policy and component documentation describe the evidence contract.

## Evidence

- Focused: 22/22.
- Policy package: 345/345.
- Build, typecheck, lint, format, and license-boundary checks: pass.
- OSV: 2 lockfiles, 575 package occurrences, 0 vulnerabilities, 0 malicious-package advisories.
- Semgrep: 210 applicable rules, 0 findings/errors.
- Secret diff scan: 0 high-confidence matches.

## Follow-up

Publish this policy correction in the next coordinated Hulumi release after the remaining security batches are merged and release-wide evidence is current.
