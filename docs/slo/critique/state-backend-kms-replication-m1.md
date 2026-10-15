# Critique — state backend KMS replication M1

Date: 2026-10-15
Runbook: `docs/RUNBOOK-state-backend-kms-replication.md`
Verdict: approved for bounded execution after the revisions captured below.

## CEO pass

- The current `replication` output implies recoverable state while the actual SSE-KMS state objects are excluded by AWS defaults. The product output must be backed by effective provider configuration.
- This is a correctness and security repair within the existing 3.x API. The constructor must reject the previously accepted ineffective form, while the v3 declaration can remain optional long enough to give existing consumers an explicit migration error.
- Revision accepted: keep publication and package-version changes in the coordinated release milestone; this repair changes source, tests, and documentation only.

## Engineering lead pass

- Capture the source encryption and versioning resources so the replication configuration can depend on them explicitly. Constructor statement order alone is not a deployment dependency contract.
- Validate arguments before `super` so invalid JavaScript callers do not leave a partially registered component.
- Revision accepted: require `destinationKmsKeyArn` at runtime before `super`; retain the optional v3 declaration for migration compatibility and make it statically required in a future major.

## Security pass

- AWS requires both an SSE-KMS source-selection opt-in and destination encryption configuration. Adding only one produces an invalid or ineffective rule.
- `PutBucketReplication` can return success for an unusable KMS key. The component cannot prove the external destination key, bucket, or IAM role, so the documentation must not claim live recovery qualification.
- Revision accepted: emit both fields in one indivisible code path and document destination Region, key-policy, IAM, and versioning responsibilities.

## Design pass

- The API should make the security-relevant key visible next to the destination bucket and role. A hidden default would make recovery encryption unclear.
- Operators need a complete example and read-only verification checklist without reading state objects.
- Revision accepted: document the required key ARN, source rule shape, destination prerequisites, and metadata-only verification.

## Final constraints

- Missing or empty literal destination KMS key fails before resource registration.
- Every generated rule includes enabled `sseKmsEncryptedObjects` and an exact `replicaKmsKeyId`.
- Replication explicitly depends on source versioning and SSE-KMS configuration.
- No destination resources, IAM widening, dependency, lockfile, version, publication, live AWS, state-object, or out-of-scope change.
- RED evidence must reproduce the absent fields and missing-key acceptance before implementation.
