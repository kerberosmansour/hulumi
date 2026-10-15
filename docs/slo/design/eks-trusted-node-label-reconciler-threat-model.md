# Threat model — trusted EKS node-label reconciler

Status: M1 focused design for Hulumi issue #305. The repository has no open
canonical Codex Security finding as of 2026-10-15.

## Requested outcome

The issue request is treated as literal source material:

~~~text
Restore one NodeRestriction-protected workload identity label after managed-node
replacement, but only after independently proving the node belongs to an exact
allowed EKS managed node group and matches its expected EC2 identity and taints.
~~~

## Trust boundaries

1. Kubernetes Node metadata is untrusted evidence. `providerID`, ordinary labels
   and names can select a lookup but cannot authorize a label mutation.
2. EKS `DescribeNodegroup`, Auto Scaling membership and EC2 instance data are
   independent provider evidence. M2 must fetch them with one dedicated Pod
   Identity role and must not accept caller-supplied substitutes.
3. The pure M1 kernel receives typed snapshots and produces `deny`, `noop` or one
   JSON Patch. It has no network or mutation authority.
4. The Kubernetes API is the mutation boundary. A patch must test the exact Node
   UID and `resourceVersion` and may mutate only the configured protected label.
5. Runtime IAM, Kubernetes RBAC/admission, audit events, failure alarms and the
   controller image are outside M1 and are mandatory before operational release.

## STRIDE sweep

| Boundary | Spoofing | Tampering | Repudiation | Information disclosure | Denial of service | Elevation of privilege |
|---|---|---|---|---|---|---|
| Node snapshot | Mitigated by treating metadata only as lookup input and cross-checking provider ID, account, region, AZ, instance type, node group and ASG membership. | Mitigated by exact UID/resourceVersion/provider-ID preconditions and conflict refusal. | Residual until M2 emits bounded audit decisions. | Eliminated in M1; inputs contain identifiers and labels, not credentials. | Mitigated by finite input bounds and deterministic work. | Mitigated by never deriving authority from kubelet-writable metadata. |
| AWS attestations | Mitigated by M2 dedicated Pod Identity and exact cluster/node-group allowlist. | Mitigated in M1 by freshness/skew bounds, exact membership and cross-service consistency checks. | Residual until CloudTrail and controller decision events are joined in M2/M3. | Mitigated by read-only Describe APIs and no response echo in public errors. | Residual provider throttling; M2 requires bounded retry/backoff and a failure alarm. | Mitigated by read-only AWS authority and no credential access in the kernel. |
| Kubernetes patch | Mitigated by M2 exact ServiceAccount plus admission identity binding. | Mitigated by JSON Patch tests for UID/resourceVersion/provider ID and one escaped label path. | Residual until audit-policy and decision-event qualification. | N/A — patch contains no secret. | Mitigated by retrying only concurrency conflicts and bounding reconciliation. | Mitigated by M2 RBAC/admission restricting the actor and exact mutation shape; RBAC alone cannot restrict a label key. |

## Abuse cases

| ID | Attacker and action | Bad outcome | Required control |
|---|---|---|---|
| `tm-eks-node-label-reconciler-abuse-1` | A compromised kubelet forges `eks.amazonaws.com/nodegroup` and an instance-type label. | A lower-trust node receives the protected workload identity. | Ignore those labels as authority; require strict provider ID plus exact EKS-reported ASG membership and matching EC2 evidence. |
| `tm-eks-node-label-reconciler-abuse-2` | A foreign instance appears in a caller-supplied or stale ASG view. | Cross-cluster or cross-pool elevation. | Accept exactly one membership in an ASG named by fresh EKS node-group evidence; bind account, region, AZ and instance ID. |
| `tm-eks-node-label-reconciler-abuse-3` | A Node is deleted/recreated or modified after attestation but before patch. | The verdict is applied to a different object or stale state. | Test UID, resourceVersion and provider ID in the JSON Patch; requeue on conflict and re-attest. |
| `tm-eks-node-label-reconciler-abuse-4` | An operator or attacker preloads a different protected identity. | The reconciler overwrites evidence of misconfiguration or compromise. | Refuse every conflicting existing value; never replace it automatically. |
| `tm-eks-node-label-reconciler-abuse-5` | Provider throttling or a zero-sized pool is treated as success. | Missing labels go undetected, or scale-to-zero creates perpetual false alarms. | Distinguish `zero_capacity`, `awaiting_nodes` and provider failure; fail closed and alarm only actionable states. |
| `tm-eks-node-label-reconciler-abuse-6` | A stolen controller token or another Node writer changes the protected label or piggybacks another field change. | The narrow identity restoration path becomes general Node mutation authority. | Bind minimal RBAC to one ServiceAccount and enforce exact label-addition shape and identity with a fail-closed ValidatingAdmissionPolicy. |
| `tm-eks-node-label-reconciler-abuse-7` | An API returns a partial page, duplicate record, malformed object or unbounded continuation. | The controller authorizes against incomplete evidence or consumes unbounded memory/time. | Bound every page/item/byte/retry count, require requested records exactly once, and treat every partial/ambiguous result as failure. |
| `tm-eks-node-label-reconciler-abuse-8` | A failure path logs bearer tokens, credential headers, raw provider responses or high-cardinality metadata. | Credentials or sensitive infrastructure topology enter logs and metric stores. | Emit only stable reason codes, fixed dimensions and a one-way Node UID correlation hash; test redaction on every failure class. |
| `tm-eks-node-label-reconciler-abuse-9` | A mutable or known-vulnerable controller image is deployed. | Registry substitution or a compromised runtime gains the controller's patch authority. | Require a digest-pinned image in M2; publish only an OSV/Trivy-clean, provenance-attested artifact after M3 qualification. |

## Residual risks and milestone ownership

| Risk | Disposition | Owner / expiry |
|---|---|---|
| Cross-service AWS snapshots are not atomic. | Mitigate with bounded freshness/skew, one reconcile-cycle fetch and optimistic Kubernetes patching; live rolling tests required. | M2/M3, repository maintainer, before publication. |
| M1 trusts typed provider snapshots supplied by its caller. | Accepted only for the pure-kernel milestone; M2 owns real adapters and prevents arbitrary input injection. | M2, repository maintainer. |
| RBAC cannot restrict a Node patch to one label key. | M2 must add an admission control bound to the exact controller identity and mutation shape. | M2, repository maintainer. |
| Intentional zero capacity has no recovery-time sample. | M3 measures recovery only after capacity becomes non-zero and records the scale-from-zero start point. | M3, repository maintainer. |
| The M2 component accepts an externally built digest-pinned controller image. | The digest prevents substitution but does not establish build provenance or vulnerability status. M3 must publish and attest the supported image before an operational release claim. | M3, repository maintainer, before publication. |

## Compliance/control mapping

- NIST 800-53 Rev 5: AC-3, AC-6, AU-2, AU-12, CM-6, SI-4.
- OWASP Proactive Controls 2024: C1 access control, C3 input validation,
  C9 security logging and monitoring, C10 exceptional-condition handling.
- CWE classes: CWE-269 improper privilege management, CWE-345 insufficient
  authenticity verification, CWE-362 concurrent execution using shared state,
  CWE-754 improper check for unusual conditions.
