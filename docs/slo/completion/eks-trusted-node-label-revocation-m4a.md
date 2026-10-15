# Completion: EKS trusted-node label revocation M4a

Date: 2026-10-16
State: implementation and local verification complete; external ship gates pending
AgentBus task: `t2_mva4kixq_f0241a8b-ab6`

## Delivered behavior

- A previously trusted Node receives an exact five-operation revoke patch when the bounded attestation decision later fails or per-node EC2 evidence is unavailable.
- Conflicting protected-label values and malformed local identity fail closed without mutation.
- Candidate discovery includes exact trusted-label holders after node-group selector drift, rejects inconsistent duplicate identities and enforces one global size bound.
- Add/remove plan validation rechecks name, UID, resourceVersion, providerID and mutation-specific label state immediately before PATCH.
- Admission accepts only an exact configured add or exact configured removal by the existing reconciler identity, with every other Node field unchanged.
- Audit and metrics distinguish successful revocation while withholding raw Node identity and provider responses.

## Evidence summary

Focused tests: 48 passed. Full package tests: 287 passed. Package typecheck, build and lint passed. OSV: 575 packages, zero known vulnerabilities, zero malicious-package advisories. Semgrep production scan: 74 rules, zero findings. Secrets scan: 41 applicable rules, zero findings. Dependency manifests and lockfiles are unchanged.

## Residuals

- Shared discovery failure is observable and mutation-free until a later cycle can safely enumerate and evaluate candidates.
- ServiceAccount token reuse remains the separate M4b authority-boundary milestone.
- Physical cluster behavior is not claimed by this milestone; exact-head CI and merged-main Codex Security evidence are required before AgentBus closure.

The pull request, exact-head checks, signed merge identity and merged-main scan are the authoritative external completion evidence because those identifiers do not exist until after this source record is committed.
