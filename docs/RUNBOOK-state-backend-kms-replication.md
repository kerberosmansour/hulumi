# Runbook: state backend KMS replication

Status: confirmed by the user's standing instruction to continue autonomously with the SLO skills on defensive cybersecurity work.
Runbook ID: `state-backend-kms-replication`
Finding: `csf_d7321aad5920489504273101` — state backend reports replication while SSE-KMS objects are not selected.
Base: `46f1ceae2e9accb1a981a39acb2b26c144419e27`
Data classification: S3 bucket ARNs, KMS key ARNs, IAM role ARNs, and state-backend names are internal configuration. State objects, Pulumi exports, credentials, and decrypted values must not be read or captured in evidence.

## 1. Architecture and provider evidence

`PulumiStateBackendFoundation` encrypts every state object with a customer managed KMS key. Amazon S3 excludes SSE-KMS and DSSE-KMS objects from replication by default. An effective replication rule must explicitly enable `SourceSelectionCriteria.SseKmsEncryptedObjects` and provide `Destination.EncryptionConfiguration.ReplicaKmsKeyID`. AWS also warns that `PutBucketReplication` does not validate whether the destination KMS key is usable; operators must qualify the key, Region, and IAM permissions independently.

Provider references:

- <https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutBucketReplication.html>
- <https://docs.aws.amazon.com/AmazonS3/latest/userguide/replication-config-for-kms-objects.html>
- <https://www.pulumi.com/registry/packages/aws/api-docs/s3/bucketreplicationconfig/>

## 2. Security contract

| Contract item          | Decision                                                                                                                                                                                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal                   | A reported `replication` DR posture must correspond to an S3 rule that selects the KMS-encrypted state objects and encrypts replicas with one explicit destination KMS key.                                                                                                        |
| Input                  | `replication.destinationKmsKeyArn` is required at runtime. Omission and an empty literal fail synchronously before the component or child resources register. The v3 declaration remains optional for an explicit migration error; a future major can make it statically required. |
| Source selection       | Every generated rule enables `sseKmsEncryptedObjects`; no unencrypted-only rule may satisfy the posture.                                                                                                                                                                           |
| Destination encryption | Every generated rule supplies the exact caller-provided destination KMS key ARN as `replicaKmsKeyId`.                                                                                                                                                                              |
| Ordering               | The replication resource explicitly depends on the source bucket versioning and SSE-KMS configuration resources.                                                                                                                                                                   |
| External boundary      | The destination bucket, destination key, and replication IAM role remain caller-owned. Their existence, Region, key policy, grants, and destination versioning require deployment qualification.                                                                                   |
| Dependency contract    | No dependency, manifest, lockfile, package version, publication, or live AWS change.                                                                                                                                                                                               |

## 3. M1 — make KMS replication concrete

Started: 2026-10-15
Refactor budget: one component, one input type, one focused test file, two operator documents, and SLO evidence.

### Allowed files

- `docs/RUNBOOK-state-backend-kms-replication.md`
- `docs/slo/critique/state-backend-kms-replication-m1.md`
- `docs/slo/verify/state-backend-kms-replication-m1.md`
- `docs/slo/lessons/state-backend-kms-replication-m1.md`
- `docs/slo/completion/state-backend-kms-replication-m1.md`
- `packages/platform-patterns/src/pulumi-state-backend-foundation.ts`
- `packages/platform-patterns/src/pulumi-state-backend-foundation.args.ts`
- `packages/platform-patterns/tests/pulumi-state-backend-foundation.test.ts`
- `docs/components/pulumi-state-backend-foundation.md`
- `docs/cookbooks/secure-pulumi-state-backend.md`

### BDD acceptance

| ID       | Given/when                                                       | Then                                                                                                         |
| -------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| BDD-M1-1 | replication is requested without `destinationKmsKeyArn`          | construction fails before any resource registration.                                                         |
| BDD-M1-2 | replication receives an empty literal destination key            | construction fails before any resource registration.                                                         |
| BDD-M1-3 | replication receives a destination bucket, IAM role, and KMS key | the S3 rule enables SSE-KMS source selection and contains the exact replica KMS key.                         |
| BDD-M1-4 | the replication resource is registered                           | source SSE-KMS configuration and versioning are registered first and are explicit dependencies in code.      |
| BDD-M1-5 | no replication is requested                                      | object-lock, lease, event-classification, secret-redaction, and degraded-posture behavior remains unchanged. |
| BDD-M1-6 | package/workspace/security gates run                             | all pass with no dependency graph or out-of-scope diff.                                                      |

### Execution sequence

1. Run the focused baseline and official pinned OSV gate.
2. Add missing-key, empty-key, source-selection, replica-key, and ordering scenarios; preserve the intended RED failures.
3. Require and validate the destination KMS key at runtime before `super`, emit the complete AWS rule, and add explicit dependencies.
4. Update component and migration documentation with destination prerequisites and verification commands.
5. Run focused/package/workspace tests, build, typecheck, lint, formatting, OSV, Semgrep, secret review, exact allow-list, and diff hygiene.
6. Sign and DCO-stamp the exact source commit, pass exact-head CI, merge only the pinned head under standing authorization, and run xhigh Codex Security on the exact merged-main commit.

### Forbidden shortcuts

- No replication posture from configuration presence alone when the destination KMS key is absent.
- No unencrypted-only replication rule, AWS-managed destination key fallback, placeholder ARN, cast that hides a missing field, or swallowed validation error.
- No destination resource creation, IAM broadening, live bucket inspection, state-object read, dependency update, suppression, severity downgrade, or fabricated evidence.

### Definition of done

All BDDs and regressions pass; every generated rule selects SSE-KMS objects and supplies a destination KMS key; the exact-head PR is green and merged; and an exact merged-main scan no longer reports ineffective KMS replication or an equivalent false DR posture.
