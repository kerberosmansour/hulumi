# Verification — state backend KMS replication M1

Date: 2026-10-15
Runbook: `docs/RUNBOOK-state-backend-kms-replication.md`
Base: `46f1ceae2e9accb1a981a39acb2b26c144419e27`
Finding: `csf_d7321aad5920489504273101`
Verdict: local implementation and security gates passed; exact-head CI, merge, and merged-main Codex Security remain.

## Outcome and BDD evidence

| Evidence | Result |
| --- | --- |
| Baseline | Focused state-backend tests passed 6/6. Official OSV-Scanner 2.7.0 scanned two resolved lockfiles and 575 package occurrences with zero vulnerability results and zero `MAL-*`. |
| RED | The focused suite produced three intended failures with six controls passing: missing and empty destination KMS keys were accepted, and the emitted rule lacked the SSE-KMS source-selection opt-in. An isolated positive run confirmed the existing destination key mapping and isolated the missing source selector. |
| Input boundary | Replication now rejects an omitted or empty literal `destinationKmsKeyArn` before the component or any child resource registers. The v3 declaration remains optional so existing consumers receive the explicit migration error; a future major can make it statically required. |
| AWS rule | Every emitted replication rule enables `sourceSelectionCriteria.sseKmsEncryptedObjects.status` and supplies the exact destination key as `destination.encryptionConfiguration.replicaKmsKeyId`. |
| Ordering | The replication configuration explicitly depends on the source `BucketServerSideEncryptionConfiguration` and `BucketVersioning` resources. Focused registration evidence also confirms both are registered before replication. |
| Focused final | The state-backend suite passed 9/9. |
| Package regression | `@hulumi/platform-patterns` passed build, typecheck, lint, and 91 runnable tests with nine intentional integration skips. |
| Workspace regression | All 19 runnable workspace projects passed topological build, typecheck, lint, formatting, and sequential tests. Representative package totals were baseline 195 passed/14 skipped/one todo, Cloudflare 24/three skipped, drift 146, Kubernetes 272, policies 452, skill BDD 120/two skipped, and platform patterns 91/nine skipped. |

## Security and repository evidence

| Gate | Result |
| --- | --- |
| OSV admission | Official checksum-verified OSV-Scanner 2.7.0 scanned two unchanged resolved lockfiles and 575 package occurrences with zero vulnerability results and zero `MAL-*`; baseline and final SHA-256 `10c55dbf5e83d5268eb5fa37e826477ae5eb4a972a2fe38e0a6832f28be95df4`. |
| Dependency diff | No manifest or lockfile changed. The implementation added no direct/transitive dependency, lifecycle script, build script, or package authority. |
| Semgrep | Semgrep 1.156.0 ran 210 rules over the three changed TypeScript targets with zero findings and zero errors; report SHA-256 `0431d5e1379fc1dac94743478d33a387b4a5344c431cf0aae9f810c9307857ab`. |
| Secret review | Added lines produced zero credential, token, or private-key pattern hits. ARNs in documentation and tests are explicit non-secret fixtures. |
| Repository governance | License-boundary, exact-pin, workflow-governance, maintenance-workflow tests, OSV-gate unit tests, formatting, and `git diff --check` passed. |

## Residual limits

- This component does not create or inspect the destination bucket, destination KMS key, or replication IAM role.
- AWS can accept `PutBucketReplication` while the destination key is invalid or inaccessible. Operators must qualify destination versioning, Region, key state/policy, role permissions, metrics, and a non-sensitive encrypted canary.
- The component does not read state objects and the verification procedure must not use a Pulumi state snapshot as its canary.
- The destination-key property remains optional in the v3 declaration for migration compatibility, while runtime construction always requires it when replication is present.

## Pending closeout

- Sign and DCO-stamp the exact source commit.
- Pass exact-head GitHub checks and merge only that verified head under standing authorization.
- Run xhigh Codex Security against the exact merged-main commit and confirm ineffective SSE-KMS replication, false DR posture, and equivalent occurrences are absent.
