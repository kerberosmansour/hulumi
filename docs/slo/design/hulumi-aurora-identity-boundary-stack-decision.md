# Stack decision — Hulumi Aurora identity boundary

Base commit `f2669f729e8006c71fbf483bc2cd14df10e6e640`.

## Stack retained, not chosen

TypeScript + Pulumi + AWS + Kubernetes. This is a brownfield amendment: the
repo is 381 `.ts` files with an established component idiom
(`*.args.ts` / `*.outputs.ts` / implementation + `tests/` + `docs/components/`).
Nothing here proposes a stack change, and `docs/ARCHITECTURE.md` is amended
reality-first rather than replaced.

## Formal-method selection

| Method | Required | Basis |
|---|---|---|
| TLA+ / TLC | **yes** | The load-bearing claims are about *interleaving* — credential acquisition, validation and serving start — which is exactly what a state-space checker settles and what tests sample. |
| Kani | **no** | Measured: 381 `.ts`, **0 `.rs`, 0 `Cargo.toml`**. Kani is a Rust model checker. Recording an obligation would be a fabricated one. |

## Semver: behaviour-changing, and the classification is deliberately deferred

The `hulumi:role-kind` discriminator changes emitted tags on **existing**
workload roles. That is a behaviour change, not a no-op — an earlier draft of
mine claimed otherwise and is withdrawn (see the reversibility artifact).

**The exact semver level is not asserted here.** It depends on whether Hulumi
treats a tag-only, identity-stable diff on consumer-owned resources as
breaking, and that is a project-wide convention question this feature should
not settle unilaterally. What *is* fixed: stable URN / name / ARN, no
replacement, and both upgrade and rollback previews captured and diffed before
the change is accepted.

## Why not the alternatives

**Reuse `SecureWorkloadRole`.** Rejected on structure, not preference:
`workloadTrustPolicy` (`secure-aws-primitives.ts:262-275`) is
`Principal: { Service }` + `sts:AssumeRole` with no federated principal and no
condition block, so it cannot express EKS OIDC with an exact
namespace/ServiceAccount `sub`.

**Reuse #40 `RdsCredentialSecret`.** Rejected by the merged threat model as
*unconditionally incompatible*: it reads the master value during Pulumi
evaluation and renders it into a Kubernetes Secret, so the value transits
Pulumi state and etcd even when serving-workload RBAC cannot read the result.

**Keep direct runtime DML and rely on `FORCE ROW LEVEL SECURITY`.** Rejected
by the reviewed boundary: FORCE RLS cannot tenant-scope global locks or
`LISTEN`/`NOTIFY`. This is the finding that turned the whole feature from
"tighten the grants" into "broker-mediated SQL with no runtime credential and
no network path".

**Export the component with a `boundaryValidated` flag.** Rejected: a boolean
a consumer may not read is a convention, not a barrier, and this component
does not own the serving Deployment. M1 stays internal instead.

## Project-wide artifacts

Root `SECURITY.md` is left **byte-for-byte untouched** by explicit skip
decision. The architect idempotency diff was computed and is semantic, not
formatting: zero occurrences of *least privilege*, *IRSA*, *Aurora*,
*Secrets Manager* or *threat model*. An architect pass would be **adding a new
topic area**, not reconciling drift — a separate decision with its own blast
radius. Per-feature threat content lives in this artifact pair instead.

## Downstream shape

One runbook, five milestones: M1 identity / H3 / structural rollout; M2 broker
plus the exhaustive live identity and subresource matrix; M3 PostgreSQL
authority, RLS and global surfaces; M4 rotation plus locks and
`LISTEN`/`NOTIFY`; M5 receipts, discovery fail-closed and live certification.

No second runbook and no sixth milestone. An earlier draft proposed splitting
gate 1 into M1a/M1b; that was a scope change I recorded as accepted when it
was mine only to propose. It is withdrawn.
