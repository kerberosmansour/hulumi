# Threat model — Hulumi Aurora identity boundary

Slug: `hulumi-aurora-identity-boundary`
Base commit: `f2669f729e8006c71fbf483bc2cd14df10e6e640`
Upstream authority: `docs/threat-model-iam-least-privilege-20260728.md`
(blob `8b8e801b6cafccb62d48fd559aaca3da11b928de`)

## ID provenance — read before citing anything

The merged upstream threat model ships **no `.slo.json` and no stable `tm-*`
IDs**, and none exist repo-wide. Its rows are therefore cited here by section
and verbatim text only.

The `tm-hulumi-aurora-identity-boundary-abuse-N` IDs below **originate in this
artifact pair** and are frozen from this commit. Renumbering is forbidden: a
changed ID is a different abuse case, and downstream `/slo-plan`,
`/slo-critique` and `/slo-verify` bind to these strings.

Data classification for this feature: **restricted** — the assets are database
credentials and KMS decrypt paths.

## Scope

In: workload identity separation (runtime / migrator / broker), IRSA and Pod
Identity trust, credential and network denial for the serving runtime, and the
IAM role-kind classification that AWS policy H3 keys on.

Out, owned by later milestones: broker SQL mediation and capability validation;
PostgreSQL authority allowlist and RLS; rotation, global locks and
`LISTEN`/`NOTIFY`; value-free receipts and release-time discovery.

## STRIDE per component

| Component | Class | State | Control or reason |
|---|---|---|---|
| Runtime ServiceAccount / IRSA role | Elevation of privilege | eliminated | No transition exists by which the runtime acquires a DB credential. Modelled as `RuntimeNeverHoldsCredential`; the hardened spec has no `AttemptAssume` rule at all. |
| Runtime → migrator/broker role | Spoofing | eliminated | IRSA trust uses `StringEquals` on exact `sub` **and** `aud`. No `StringLike`, no wildcard on either axis. |
| Runtime → Aurora / RDS Proxy | Information disclosure | eliminated | No network path. Proven by a same-run paired probe: runtime fails, migrator connects. |
| Deployment controller | Elevation of privilege | mitigated | Denied `serviceaccounts/token`, impersonation, and pod/controller template creation naming a privileged SA. Mitigated rather than eliminated because the controller must still create *its own* envelopes. |
| Bootstrap / Pulumi state | Information disclosure | eliminated | `SecureSecret` is value-free. #40 `RdsCredentialSecret` is an anti-exemplar: it reads the master value at Pulumi evaluation and renders it into a Kubernetes Secret, so the value transits state and etcd. |
| IAM role classification | Tampering | mitigated | Persisted closed `hulumi:role-kind` discriminator; H3 requires the IaC tag only for deployment roles and **fails closed** on missing or unknown kinds. |
| Node / IMDS, Pod Identity agent | Elevation of privilege | mitigated | Unreachable from the runtime pod, or yields no role with secret/KMS access. Mitigated: reachability is an environment property, not a code one. |
| Rotation lifecycle | Denial of service | na | Owned by M4. Recording it `na` here would be false if this milestone claimed rotation; it does not. |
| Audit attribution | Repudiation | mitigated | Value-free identity receipts plus CloudTrail role-kind classification. |

## Abuse cases

| ID | Attacker | Step | Outcome | Control |
|---|---|---|---|---|
| `tm-hulumi-aurora-identity-boundary-abuse-1` | Compromised runtime pod | Re-reads the Aurora master secret after startup | Full DB authority | Effective-authorization denial on `secretsmanager:GetSecretValue` **and** `kms:Decrypt`, asserted with the evaluating policy named |
| `tm-hulumi-aurora-identity-boundary-abuse-2` | Compromised runtime pod | Assumes the migrator or broker role | Bypasses the bounded application role | `sts:AssumeRole` denied, tested **transitively** at every hop, not first-hop only |
| `tm-hulumi-aurora-identity-boundary-abuse-3` | Any other pod or ServiceAccount | Mints a token for the migrator SA, or mounts its token Secret | Assumes a privileged identity | Pairwise live negatives on `serviceaccounts/token`, impersonation, projected-volume and `secretKeyRef` mounts |
| `tm-hulumi-aurora-identity-boundary-abuse-4` | Workload with template-create rights | Creates a Pod/Job naming a privileged ServiceAccount | Privileged execution | Admission rejects non-owning request identities per exact envelope |
| `tm-hulumi-aurora-identity-boundary-abuse-5` | Compromised runtime pod | Reaches Aurora or RDS Proxy directly | Bypasses the broker entirely | Security-group / NetworkPolicy negative, with a same-run migrator success proving the endpoint exists |
| `tm-hulumi-aurora-identity-boundary-abuse-6` | Compromised runtime pod | Obtains credentials via Pod Identity association, agent, node profile or IMDS v1/v2 | Side-channel to DB authority | Association absent and its creation denied; agent and IMDS unreachable from the runtime pod |
| `tm-hulumi-aurora-identity-boundary-abuse-7` | Consumer of this component | Builds a serving Deployment from partial identity outputs | Serving on an unvalidated boundary | Structural: no public constructor, no runnable outputs, no serving-output claim. `NoServingBeforeValidated` over the whole aggregate |
| `tm-hulumi-aurora-identity-boundary-abuse-8` | Operator adding a capability | Passes a free-form policy ARN or inline policy | Unbounded privilege extension | No `policyArns` / `inlinePolicies`. Closed capability union; a member without both its matrix and its negative twin fails the build |

## Residual risks

| Risk | Accepted | Reason |
|---|---|---|
| Superuser bypass of any PostgreSQL-side control | true | Out of scope for this boundary and unavoidable at the DB layer; the design's answer is that the runtime never holds a DB credential at all, not that RLS confines a superuser. |
| Break-glass / control-plane exceptions | false | Must be named exactly, be unavailable to workloads, and be tested separately. An implicit privileged-workload exception is forbidden. **Not yet enumerated — open work, not accepted risk.** |
| Live evidence unavailable in CI | false | Operator-gated. An absent fixture is `blocked_by_operator`, never skipped-as-pass. |

`accepted_residual: true` means knowingly accepted. The two `false` rows are
**missing coverage**, recorded so they cannot be read as accepted.

## Compliance mapping

| Control | Reference |
|---|---|
| Least privilege / access enforcement | NIST 800-53r5 AC-3, AC-6 |
| Identifier management for services | NIST 800-53r5 IA-9 |
| Authenticator management | NIST 800-53r5 IA-5 |
| Baseline configuration | NIST 800-53r5 CM-2 |
| Audit record generation | NIST 800-53r5 AU-12 |
| Access control verification | SOC 2 CC6.1, CC6.3 |
| Secret storage and handling | ASVS v5 V6 |
| Authorisation architecture | ASVS v5 V4 |

## Framing note

Cells above say *eliminated by* or *mitigated by* a named control, not "this
attack might be possible here". Where a class is genuinely out of this
milestone's scope it is marked `na` **with the owning milestone named** —
marking rotation `na` without saying M4 owns it would read as coverage.
