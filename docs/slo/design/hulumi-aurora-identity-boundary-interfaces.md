# Interfaces — Hulumi Aurora identity boundary

Base commit `f2669f729e8006c71fbf483bc2cd14df10e6e640`.

## Component visibility

`AuroraWorkloadIdentityBoundary` is **internal and non-exported** for M1.
`packages/k8s-baseline/src/index.ts` is deliberately **not** touched, so the
component has no public surface, no public constructor and no runnable
outputs.

This is the answer to "a boolean gate is ignorable": a consumer cannot build a
serving Deployment from partial outputs if it cannot reach the component at
all. The M1 test therefore asserts the **construction barrier** — the module
is unreachable from the package entrypoint — not a convention that a caller
is trusted to observe. An earlier draft of this design exposed a
`boundaryValidated: Output<boolean>`; that was withdrawn, because a flag a
consumer may simply not read is a convention wearing a barrier's clothes.

## Args — closed capability union, no free-form policy seam

```ts
type AuroraIdentityCapability =
  | { kind: "read-own-bounded-app-secret"; secretArn: string; kmsKeyArn: string }
  | { kind: "migrate-schema";              secretArn: string; kmsKeyArn: string }
  | { kind: "broker-mediate";              secretArn: string; kmsKeyArn: string;
                                           capabilityIssuerArn: string };
```

There is **no `policyArns` and no `inlinePolicies`**. Each union member
generates a fixed action / resource / condition matrix. Adding a member
requires adding its matrix **and** its negative twin; a member with only one
of the two fails the build. A free-form policy input would reintroduce
precisely the elevation path this boundary exists to deny.

## Outputs — value-free

`runtimeServiceAccountName`, `migratorServiceAccountName`,
`brokerServiceAccountName`, `runtimeRoleArn`, `migratorRoleArn`,
`brokerRoleArn`, `admissionPolicyNames`, `deniedSubresourceInventoryDigest`.

**Forbidden in outputs:** any secret value, any secret-version ARN, any
connection string.

## Frozen non-production fixture names

Evidence commands must be executable with **no angle-bracket substitution**.
These names are frozen here so the runbook and tests can reference them
literally:

| Purpose | Frozen name |
|---|---|
| EKS fixture cluster | `hulumi-fixture-aurora-identity` |
| Namespace | `hulumi-fixture-aurora` |
| Runtime ServiceAccount | `aurora-runtime` |
| Migrator ServiceAccount | `aurora-migrator` |
| Broker ServiceAccount | `aurora-broker` |
| Runtime IAM role | `hulumi-fixture-aurora-runtime` |
| Migrator IAM role | `hulumi-fixture-aurora-migrator` |
| Broker IAM role | `hulumi-fixture-aurora-broker` |
| Master secret | `hulumi-fixture-aurora-master` |
| Bounded app secret | `hulumi-fixture-aurora-app` |

## Secret-handling rule for evidence

`aws secretsmanager get-secret-value` is **banned** from this design's evidence
path. It prints secret material into logs and evidence artifacts, which turns
a verification step into a disclosure. Denial is proven with metadata-only
calls — `describe-secret`, `list-secret-version-ids` — plus a harness that
asserts the **typed decision** (`AccessDenied` versus success) and never
captures the value.

An earlier draft of this contract used `get-secret-value` under each identity.
That was a real defect in the proposal, not a presentation nit, and it is
recorded here so it is not reintroduced.

## Live outcome path

Repo convention, measured rather than invented: `HULUMI_INTEGRATION=1`
(`package.json:22-23`), gating idiom at `docs/development.md:134-139`
(`RUN_INTEGRATION = process.env.HULUMI_INTEGRATION === "1"`).

- `packages/k8s-baseline/tests/integration/eks/aurora-identity-boundary.eks.test.ts`
  — real EKS / IRSA / IAM outcomes
- `packages/k8s-baseline/tests/integration/kind/aurora-identity-boundary.kind.test.ts`
  — admission / RBAC / NetworkPolicy outcomes, runnable without AWS

Exemplars: `eks-cluster-foundation.eks.test.ts`,
`release-readiness.{eks,kind}.test.ts`.

**An absent fixture is `blocked_by_operator`. Never skipped, never reported as
pass.** A milestone that cannot run its live evidence is incomplete, not
green.

## Every negative carries a same-run positive twin

A denial that cannot be distinguished from an absence proves nothing. Each
negative is invalidated — not passed — if the target is missing, the principal
is deny-all, or a DNS name fails to resolve. Each asserts the **deny reason**
(`explicitDeny` or `implicitDeny`, with the evaluating policy named), never a
bare non-200.

| Negative | Same-run positive twin |
|---|---|
| Runtime denied master secret / KMS | Migrator succeeds on both |
| Runtime denied `sts:AssumeRole` | Runtime succeeds at `sts:GetCallerIdentity`, proving the principal is live rather than dead |
| Runtime has no Aurora route | Migrator connects over the identical probe |
| Broker denied master secret | Broker succeeds on the bounded app secret in the same run |
