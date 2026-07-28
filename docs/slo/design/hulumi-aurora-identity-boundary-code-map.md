# Brownfield code map — Hulumi Aurora identity boundary

Every path and line number below was read at
`f2669f729e8006c71fbf483bc2cd14df10e6e640`, not inferred.

## Files this design must change

| Path | Why | Anchor |
|---|---|---|
| `packages/baseline/src/aws/secure-aws-primitives.ts` | Add the closed `roleKind` discriminator | `commonRoleArgs` **:138**, tag injected **:155**, call sites **:209** (`SecureIamDeploymentRole`) and **:290** (`SecureWorkloadRole`) |
| `packages/baseline/tests/secure-aws-primitives.test.ts` | Assert both role kinds | — |
| `packages/policies/src/aws/hulumi-hardening-pack.ts` | Narrow H3 to deployment roles; fail closed on unknown | `H3_ENFORCEMENT_LEVEL` **:36**, rule **:447-462** |
| `packages/policies/tests/hulumi-hardening-pack.test.ts` | Five named cases (see below) | — |
| `packages/drift/src/classifier.ts` + `tests/classifier-fail-closed.test.ts` | Attribute the classification change rather than absorb it | — |

## Files this design creates

`packages/k8s-baseline/src/aurora-workload-identity-boundary.{args,outputs}.ts`
and the implementation; `packages/k8s-baseline/tests/aurora-workload-identity-boundary.test.ts`;
`packages/policies/src/k8s/aurora-identity-boundary-pack.ts` (handlers) and
`packages/policies/src/k8s/packs/hulumi-aurora-identity-boundary.ts` (the
**registration** seam); `packages/policies/tests/k8s/aurora-identity-boundary-pack.test.ts`;
`packages/k8s-baseline/tests/integration/{eks,kind}/aurora-identity-boundary.*.test.ts`;
`packages/k8s-baseline/tests/aurora-identity-boundary-tla-alignment.test.ts`.

## Two constraints read out of the code, not assumed

**1. H3 is `mandatory` and rejects every untagged role.**
`hulumi-hardening-pack.ts:36` sets `H3_ENFORCEMENT_LEVEL = "mandatory"`, and
the rule violates for *any* IAM role whose tags lack `hulumi:iac-role=true`.
Meanwhile `commonRoleArgs` injects that tag for **both** role classes. So the
two obvious moves are both wrong: inheriting the tag misclassifies workload
identities as IaC deployment roles, and simply removing it makes them fail a
mandatory policy. Hence the discriminator.

*Aside, reported not fixed:* that rule's own description string still reads
"Advisory in M2" against a `mandatory` constant — stale prose, outside this
design's owned paths.

**2. `SecureWorkloadRole` cannot be reused.** `workloadTrustPolicy`
(**:262-275**) builds `Principal: { Service: … }` + `sts:AssumeRole` — no
federated principal, no condition block — so it structurally cannot express
EKS OIDC with an exact namespace/ServiceAccount `sub` and `aud`. This is new
capability, not a parameterisation.

*(An earlier draft attributed the `GITHUB_OIDC_ISSUER` constant to
`SecureWorkloadRole`. That was wrong: it belongs to `deploymentTrustPolicy`
at **:107**, and the mistake came from reading line proximity instead of
enclosing scope. Corrected here so the code map does not carry it forward.)*

## Registration is not export

`packages/policies/src/index.ts` (**:74-81**) is an **export** seam;
`packages/policies/src/k8s/packs/*.ts` is the **registration** seam. Exporting
a handler proves nothing about enforcement. The test that matters is
`packages/policies/tests/k8s/policy-pack-runtime.test.ts`, extended so the new
pack actually **runs and violates** — a unit test on handler shape would
repeat exactly the gap this note exists to close.

The existing `rbac-pack.ts` rules (`k8sRbac1NoWildcardVerbs`,
`k8sRbac2NoSecretListWatch`, `k8sRbac3NoClusterAdminBinding`, metadata at
**:127**) cover **none** of: privileged-ServiceAccount workload naming,
token-Secret mounts, Pod Identity association or agent, IMDS, or SG/NetworkPolicy
reachability. They are the shape exemplar, not existing coverage.

## Required H3 test cases

| Case | Expected |
|---|---|
| `iac-deployment` + IaC tag | pass |
| `iac-deployment`, tag absent | violation |
| `workload` + role-kind, no IaC tag | pass |
| role-kind absent | violation |
| role-kind unknown value | violation |

## Read-only anti-exemplars

`packages/k8s-baseline/src/kubernetes-secret-from-asm.ts` and
`packages/k8s-baseline/tests/rds-credential-secret.test.ts` (#40), plus
`docs/slo/design/hulumi-k8s-surface.md`. Read for contrast; **must not be
modified** by this work.

## Formal-methods anchors

`specs/HulumiAuroraIdentityBoundary.{tla,cfg}` with the naive
counterexample config alongside. The alignment test is **dedicated** —
`packages/k8s-baseline/tests/aurora-identity-boundary-tla-alignment.test.ts` —
and deliberately does **not** overload `packages/drift/tests/tla-alignment.test.ts`,
which checks reconciler state and is unrelated to this boundary.
