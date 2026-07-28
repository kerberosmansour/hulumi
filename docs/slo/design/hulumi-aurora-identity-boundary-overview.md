# Hulumi Aurora identity boundary — design overview

Feature: [#255](https://github.com/kerberosmansour/hulumi/issues/255) — secure
Aurora application principal.
Authority: `docs/threat-model-iam-least-privilege-20260728.md` at main
`f2669f729e8006c71fbf483bc2cd14df10e6e640` (merged via #256; reviewed source
head `4fdbf0c7`, document SHA unchanged).

## Architect decisions

| Key | Value |
|---|---|
| `tla_required` | `true` |
| `kani_required` | `false` |
| `security_libs_required` | `true` |
| `ai_component` | `false` |

`kani_required: false` is a measured fact, not a preference: Hulumi is
**381 `.ts`, 0 `.rs`, 0 `Cargo.toml`**. Kani is a Rust model checker, so
recording an obligation here would be a fabricated one.

## The problem, stated as the threat model states it

A stateful workload today uses **one** ServiceAccount and **one** IRSA role
for both schema migration and request-serving database access. The
application can therefore re-read the Aurora master secret after startup.
Changing PostgreSQL roles *inside that same process* does not create a
durable authority boundary — the process that can switch roles can switch
back.

The reviewed conclusion is stronger than "tighten the grants": direct
runtime DML against shared tables is **rejected as insufficient**, because
`FORCE ROW LEVEL SECURITY` cannot tenant-scope global locks or
`LISTEN`/`NOTIFY`. The contract is broker-mediated SQL with the application
denied database credentials *and* network path, or physical isolation.

## What this design commits to

1. **Non-interchangeable workload identities.** Distinct runtime, migrator
   and broker ServiceAccounts with exact IRSA trust — `StringEquals` on both
   `sub` and `aud`, never `StringLike`.
2. **No credential and no network path for the runtime.** Denial proven by
   *effective authorization*, not by policy-text absence.
3. **No secret value in Pulumi state or etcd.**

Gates 4–11 of the threat model (rotation, PostgreSQL authority allowlist,
RLS end-to-end, receipts) are **out of this design's first milestone** and
are unverifiable until the three above hold.

## Exemplar and anti-exemplar

**Exemplar** — `packages/baseline/src/aws/secure-aws-primitives.ts` for
component shape (`*.args.ts` / `*.outputs.ts` / impl + `tests/`), and
`docs/TLAdocs/hulumi/HulumiReconciler.{tla,cfg}` for spec convention.

**Anti-exemplar, recorded deliberately** —
`docs/slo/design/hulumi-k8s-surface.md` puts IRSA helpers and workload
NetworkPolicies explicitly out of scope and endorses the #40
`RdsCredentialSecret` plaintext-to-Kubernetes-Secret extraction. The merged
threat model calls that pattern **unconditionally incompatible** with this
boundary, because it reads the master value during Pulumi evaluation and
renders it into a Kubernetes Secret — so the value transits Pulumi state and
etcd even when serving-workload RBAC cannot read the resulting Secret. That
file is a contrast and migration input, never a template.

## A constraint discovered in the existing code, not assumed

`packages/policies/src/aws/hulumi-hardening-pack.ts:36` sets
`H3_ENFORCEMENT_LEVEL = "mandatory"`, and the rule violates for **every** IAM
role whose tags lack `hulumi:iac-role=true`. Meanwhile
`packages/baseline/src/aws/secure-aws-primitives.ts:138` injects that tag at
line 155 for **both** `SecureIamDeploymentRole` (call site 209) and
`SecureWorkloadRole` (call site 290).

So the two obvious moves are both wrong: inheriting the tag misclassifies
broker/migrator **workload** identities as IaC **deployment** roles, and
simply removing it makes them fail a *mandatory* policy. The design
therefore introduces a **persisted, closed** `hulumi:role-kind`
discriminator that fails closed on missing or unknown values, and narrows
H3 to require the IaC tag only for deployment roles.

(Noted in passing: that rule's own description string still reads "Advisory
in M2" against a `mandatory` constant — stale prose, reported rather than
edited here.)

`SecureWorkloadRole` cannot be reused for these identities. Its trust is
built by `workloadTrustPolicy` (`secure-aws-primitives.ts:262-275`) as
`Principal: { Service: … }` + `sts:AssumeRole` — no federated principal, no
condition block — so it structurally cannot express EKS OIDC with an exact
namespace/ServiceAccount `sub`. This is new capability, not a
parameterisation.

## Formal verification

`specs/HulumiAuroraIdentityBoundary.tla` with a naive variant that must
counterexample and a hardened variant that must pass. See
`specs/HulumiAuroraIdentityBoundary.trace.md` — including its statement that
the drafting numbers are **not** admissible evidence, pending a run on the
pinned toolchain.

## Threat-model ID mode

The merged document ships **no** `.slo.json` and **no** stable `tm-*` IDs,
and none exist repo-wide. Stable IDs may originate only in this architect
artifact pair, with frozen provenance recorded alongside them. Nothing here
invents an ID for the merged document's rows; those are cited by section and
verbatim text.
