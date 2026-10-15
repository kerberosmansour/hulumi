# Adversarial critique — EKS trusted node-label reconciler M2

Date: 2026-10-15. The machine-readable threat-model companion is absent, so
the security pass used the Markdown rows in documented degraded mode and makes
no abuse-ID-stability claim. The operator's standing instruction to continue
autonomously confirms the bounded M2 contract; no finding below widens M2.

| id | persona | category | runbook section | finding | concrete scenario | recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| M2-C1 | CEO | reduce-scope | Goal / image admission | Building and publishing a controller image in M2 would couple authority code to an unresolved vulnerable-base decision and delay the independently useful component/runtime boundary. | An operator copies a proposed Dockerfile whose base has a fixed critical `tar` or OpenSSL advisory, turning a maintenance feature into a supply-chain regression. | Keep M2 image-consumer-only with exact digest validation; require scanned provenance-attested image publication in M3. Accepted. |
| M2-C2 | engineering lead | auto-fix | Runtime / TLA refinement | The initial runtime outline did not explicitly require re-attestation after HTTP 409/JSON-Patch test failure. | A Node is recreated after planning; a retry reuses the old decision and violates the checked `EnabledApplyIsCurrent` invariant. | Make every patch rejection terminal for that plan and begin the next cycle from a fresh Kubernetes/AWS read; add a TLA-alignment test. Applied to contract. |
| M2-C3 | engineering lead | auto-fix | Provider adapters | Pagination completeness needs a concrete bound and duplicate/missing-record rule. | Auto Scaling returns a continuation token or duplicate group and the adapter silently treats its first page as the full EKS ASG set. | Bound pages/items, reject repeated tokens and require each requested ASG exactly once before invoking the kernel. Applied to BDD-M2-2. |
| M2-C4 | security | auto-fix | IAM/RBAC/admission | CWE-269 / OWASP C1: Node `patch` RBAC alone cannot constrain the key or surrounding object. Class is mitigated only if admission binds the exact ServiceAccount and mutation shape; variant analysis covers other users and piggyback changes. | A compromised controller token patches a taint, owner reference or different protected value while still using an allowed Node PATCH verb. | Add cluster-wide fail-closed ValidatingAdmissionPolicy tests for non-controller changes and controller piggyback mutations (`tm-eks-node-label-reconciler-abuse-6`). Applied. |
| M2-C5 | security | auto-fix | Audit/metrics | CWE-532 / OWASP C9: logging raw AWS/Kubernetes failures can disclose credentials or topology; variant analysis covers success, denial, provider failure and patch conflict. | An SDK error includes an authorization header or response object and the controller serializes it into CloudWatch logs. | Emit allow-listed fields and stable codes only; test known token/header markers never appear (`tm-eks-node-label-reconciler-abuse-8`). Applied. |
| M2-C6 | security | defer | Provider-ID policy | Expanding provider IDs to Local Zones/Wavelength without live semantics would weaken CWE-345 authenticity checks. | A loose region-prefix parser accepts a topology whose zone/account interpretation was never qualified. | Preserve the regional-AZ parser; keep expansion under parent issue #305 for a future qualified milestone. Accepted. |
| M2-C7 | design | defer | UI | No UI surface exists in M2. | N/A: users consume a Pulumi component, runtime logs and CloudWatch alarms. | Skip design review. |

## Review verdict

Proceed with M2 after exact dependency admission. Scope remains the 28-file
allow-list in the runbook. Publication, registry provenance, live EKS mutation,
alarm delivery and recovery-time claims remain M3 gates.
