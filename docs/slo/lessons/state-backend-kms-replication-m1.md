# Lessons — state backend KMS replication M1

Date: 2026-10-15
Runbook: `docs/RUNBOOK-state-backend-kms-replication.md`

## What changed our understanding

- A replication resource is not proof that the protected data class is replicated. The component's source encryption determines whether AWS's default selection includes the objects.
- AWS requires source selection and destination encryption as a pair for SSE-KMS objects. Modeling either field independently permits an ineffective or invalid recovery claim.
- `PutBucketReplication` validates configuration shape rather than live KMS usability. A successful provider operation cannot replace destination recovery qualification.
- Pulumi mock registrations are asynchronous. A fail-before-registration test must drain earlier registrations before asserting an empty registry, otherwise unrelated work from a prior scenario can create a false failure.

## Reusable rules

- Derive posture outputs from the complete effective security contract, including provider defaults that exclude protected data.
- Validate migration-sensitive security inputs before `ComponentResource` registration and keep explicit runtime errors when a semver-compatible declaration cannot yet be tightened.
- Capture prerequisite resources and express `dependsOn` when provider correctness depends on configuration completion rather than resource identity alone.
- Use non-sensitive canaries and metadata for recovery qualification; never turn a state-recovery test into a state-exfiltration path.

## Follow-ups

- Make `destinationKmsKeyArn` statically required in the next planned major version.
- A separate live qualification milestone may validate destination versioning, key policy, role permissions, replication metrics, and canary recovery in an isolated account without reading Pulumi state.
