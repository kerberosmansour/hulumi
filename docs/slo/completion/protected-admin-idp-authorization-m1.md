# Completion summary — Protected admin IdP authorization integrity M1

Date: 2026-10-15
Status: local execution and verification complete; exact-head and merged-main gates pending.

## Delivered

- Removed identity-provider `loginMethod` entries from inline and reusable Access policy Includes.
- Kept identity-provider IDs in application `allowedIdps` as authentication-routing constraints.
- Required at least one email, email domain, or Access group authorization selector before creating provider resources.
- Kept both policy forms on one authorization-selector union.
- Made `requiredIdentitySelectors` report authorization evidence only.
- Documented the provider-only migration and the distinction between login choices and authorization.

## Evidence

- Baseline: 3/3 focused tests plus package build, typecheck, and lint.
- RED: three intended failures with four controls passing against the old behavior.
- Final focused suite: 7/7.
- Complete package suite: 24 passed and three live-provider tests skipped; build, typecheck, and lint passed.
- Full workspace test/build/typecheck/lint and repository governance gates passed across 19 runnable projects.
- OSV 2.7.0: two unchanged lockfiles, 575 package occurrences, zero vulnerabilities and zero `MAL-*`.
- Semgrep 1.156.0: 74 rules, three TypeScript targets, zero findings and zero errors.
- Secret review, allow-list audit, dependency diff, and diff hygiene passed.
- No package dependency, manifest, lockfile, version, publication, or live-cloud change.

## Remaining gates

- Signed+DCO exact source commit and exact-head GitHub CI.
- Authorized merge of the exact green head.
- Exact merged-main Codex Security scan with source finding `csf_18a737a03f908a5ae725cd34` absent.
