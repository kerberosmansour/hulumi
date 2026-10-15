# Completion summary — AdministratorAccess partition detection M1

Date: 2026-10-15
Status: local execution and verification complete; exact-head and merged-main gates pending.

## Delivered

- Added exact recognition of AWS-managed `AdministratorAccess` in the commercial, GovCloud, and China partitions.
- Routed G_OIDC_2 direct and array policy values through the shared IAM predicate used by CIS 1.16.
- Preserved the existing commercial `AWS_ADMINISTRATOR_ACCESS_ARN` export and all public rule identifiers.
- Added adversarial tests that keep customer-account policies, unknown partitions, prefixes, suffixes, whitespace, alternate case, embedded strings, other policy names, and non-string values outside the match boundary.
- Covered every supported G_OIDC_2 and CIS 1.16 managed-policy attachment shape in GovCloud and China.
- Documented the three admitted ARNs and the exact negative boundary for operators.

## Evidence

- Baseline focused suite: 57/57.
- RED: five intended failures with 58 controls passing against the prior implementation.
- Final focused suite: 63/63; complete `@hulumi/policies` suite: 401/401.
- Full workspace test, build, typecheck, and lint passed across 19 runnable projects; formatting and governance gates passed.
- OSV-Scanner 2.7.0: two unchanged lockfiles, 575 package occurrences, zero vulnerabilities and zero `MAL-*`.
- Semgrep 1.156.0: 74 TypeScript rules, four targets, zero findings and zero errors.
- Secret review, exact allow-list, dependency diff, and diff hygiene passed.
- No dependency, manifest, lockfile, package version, publication, or live-cloud change.

## Remaining gates

- Signed+DCO exact source commit and exact-head GitHub CI.
- Authorized merge of the exact green head.
- Exact merged-main xhigh Codex Security scan with `csf_6dc6685b80368670490947d5` and equivalent partition blind spots absent.
