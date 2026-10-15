# Completion summary — Azure and GCP GitHub OIDC subject binding M1

Date: 2026-10-15
Status: local execution and verification complete; exact-head and merged-main gates pending.

## Delivered

- Fail-closed Azure subject validation with unique `repo`, `job_workflow_ref`, and `environment` pairs.
- A bounded GCP condition parser that accepts only exact conjunctive identity bindings and safe extras.
- 21 new provider-specific regression cases, including disjunction, tautology, malformed, duplicate, and positive nested-parenthesis variants.
- Updated operator documentation, SLO plan, critique, verification evidence, and lessons.

## Evidence

- Focused: 66/66.
- Policy package: 386/386.
- Full workspace build/typecheck/test/lint: passed.
- Prettier, license-boundary, exact-pin, diff hygiene: passed.
- OSV 2.7.0: two lockfiles, 575 package occurrences, zero vulnerabilities and zero `MAL-*`.
- Semgrep 1.156.0: 210 rules, two targets, zero findings/errors.
- No dependency manifest, lockfile, version, release, or live-cloud change.

## Remaining gates

- Signed+DCO exact source commit and exact-head GitHub CI.
- Authorized merge of the exact green head.
- Exact merged-main Codex Security scan with `csf_c43a103ee0825be80e6d5c2a` and `csf_d7fa022948f19b61b4e59860` absent.
