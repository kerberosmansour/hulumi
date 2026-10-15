# Completion: GitHub OIDC subject-template binding M1

State: implementation and local verification complete; exact-head CI, merge, and merged-main Codex Security validation pending.

## Delivered

- `OrgFoundation` now rejects custom subject templates unless they contain `repo`, `job_workflow_ref`, and `environment` exactly once.
- Claim keys must be unique and use GitHub-compatible alphanumeric-or-underscore syntax; safe extra claims remain supported in caller order.
- HULUMI-H2 validates every organization subject-template resource, including raw resources and claimed component children, and fails closed on uninspectable inputs.
- Public symbol names, the default claim list, the stable H2 rule ID, and exact scoped suppressions remain compatible.
- Component, policy, threat-model, and usage documentation state the same identity-binding contract.

## Evidence

- Focused component/policy suites: 24/24 and 45/45.
- Package suites: 190 passed with 14 skipped and one todo; 355/355.
- Full workspace build, typecheck, test, lint, format, and license-boundary checks: pass.
- OSV: 2 lockfiles, 575 package occurrences, 0 vulnerabilities, 0 malicious-package advisories.
- Semgrep: 210 applicable rules across four files, 0 findings/errors.
- Secret diff scan: 0 high-confidence matches.
- Dependency graph: unchanged.

## Follow-up

Merge only after exact-head CI passes, then run Codex Security on the exact merged-main commit and close `csf_c6da8258f32fee3d38e20583` only when it is absent. Publish the correction in the next coordinated Hulumi release after the remaining security batches are merged and release-wide evidence is current.
