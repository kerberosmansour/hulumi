# Completion summary — GitHub OIDC workflow binding M1

Date: 2026-10-15
Status: local execution and verification complete; exact-head and merged-main gates pending.

## Delivered

- Replaced AWS G_OIDC_1's wildcard-only subject check with one scalar `StringEquals` custom-sub grammar that binds repository, reusable workflow, and one exact environment/ref context.
- Rejected branch-only and environment-only subjects, arrays, set operators, `IfExists`, malformed pairs, duplicate contexts, pull-request/non-`refs/*` contexts, and malformed workflow paths.
- Changed both AWS deployment-role constructors to require one exact reusable workflow for every subject mode and embed it inside `sub`.
- Removed the unsupported standalone `token.actions.githubusercontent.com:job_workflow_ref` condition key from generated AWS trust policies.
- Added test-first adversarial coverage and preserved Azure/GCP behavior.
- Documented the matching GitHub `include_claim_keys: ["repo", "context", "job_workflow_ref"]` template and fail-closed/parallel-role migration paths.

## Evidence

- Baselines: policies 66/66; baseline 9/9; platform patterns 6/6.
- RED: policies 11 intended failures with 67 controls; baseline 2 intended failures with 8 controls; platform patterns 4 intended failures with 3 controls.
- Final focused suites: policies 78/78; baseline 13/13; platform patterns 10/10.
- Complete affected packages: baseline 195 passed; platform patterns 88 passed; policies 452 passed, with only existing intentional skips/todo.
- Full 19-project workspace build, typecheck, lint, and sequential test passed; formatting and repository governance gates passed.
- OSV-Scanner 2.7.0: two unchanged lockfiles, 575 package occurrences, zero vulnerabilities, and zero `MAL-*`.
- Semgrep 1.156.0: 210 rules, nine TypeScript targets, zero findings, and zero errors.
- Secret review, exact allow-list, dependency diff, and diff hygiene passed.
- No dependency, manifest, lockfile, package version, publication, or live GitHub/AWS change.

## Remaining gates

- Signed+DCO exact source commit and exact-head GitHub CI.
- Authorized merge of the exact green head.
- Exact merged-main xhigh Codex Security scan with the source finding and equivalent OIDC authority bypasses absent.
