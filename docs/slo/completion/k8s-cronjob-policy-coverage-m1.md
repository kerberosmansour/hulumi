# Completion: Kubernetes CronJob policy coverage M1

State: implementation and local verification complete; exact-head CI, merge, and merged-main Codex Security validation pending.

## Delivered

- `extractPodSpec` reads `spec.jobTemplate.spec.template.spec` for CronJobs.
- Seven regression assertions cover WL-1 through WL-4, including both container classes, every host namespace switch, and a generic-path decoy.
- Rollout and component documentation name the corrected coverage and its upgrade effect.

## Evidence

- Focused: 27/27.
- Policy package: 336/336.
- Build, typecheck, lint, format, and license-boundary checks: pass.
- OSV: 2 lockfiles, 575 package occurrences, 0 vulnerabilities, 0 malicious-package advisories.
- Semgrep: 210 applicable rules, 0 findings/errors.
- Secret diff scan: 0 high-confidence matches.

## Follow-up

Publish this policy correction in the next coordinated Hulumi release after the remaining security batches are merged and release-wide evidence is current.
