# Lessons Learned — hulumi-k8s-security Milestone 3

## What changed

Three new CrossGuard PolicyPacks under `@hulumi/policies/k8s`:

- **`HulumiK8sHardeningPack`** — 5 rules: `WL-1` privileged containers, `WL-2` host namespace (network/PID/IPC), `WL-3` mutable image tag, `WL-4` resources requests/limits (advisory), `SVC-1` public LoadBalancer needs `hulumi.dev/public-justification` annotation.
- **`HulumiK8sRbacPack`** — 3 rules: `RBAC-1` wildcard verbs, `RBAC-2` `list`/`watch` on Secrets, `RBAC-3` cluster-admin RoleBinding/ClusterRoleBinding.
- **`HulumiEksClusterPack`** — 2 rules: `EKS-CL-1` public endpoint with `0.0.0.0/0` (or unset, which AWS defaults to `0.0.0.0/0`), `EKS-CL-2` audit logging required.

Each rule respects the existing `Suppression` API. M3-strengthened invariant: a suppression entry without a non-empty `reason` is silently ignored.

## Design decisions and why

- **Three packs, not one** — each pack covers a distinct enforcement decision (workload posture vs. RBAC vs. EKS control plane), and `@pulumi/policy` allows only one PolicyPack per process. Splitting lets a consumer enable RBAC checks without taking on the workload checks (or vice versa) when rolling out.
- **Reused the existing AWS `Suppression` shape** — imported `matchSuppression` and `Suppression` from `../aws/suppressions`. No new K8s-specific suppression mechanism. The same `urnScope` glob (trailing `*`) and required-`reason` invariant apply.
- **`WL-4` (resources) is advisory by default** — `requests`/`limits` matter for noisy-neighbor protection but aren't a security floor; making it mandatory would block any consumer who hasn't fully tier-classified their workloads. Tier-aware promotion can happen later via the `enforcement` config knob (deferred).
- **`SVC-1` keys off the same `hulumi.dev/public-justification` annotation** that M2's `AlbMeshedHttpEntrypoint` writes. Consumers who already use the entrypoint pass the gate automatically; consumers who use raw `Service` resources get a uniform discipline. Annotation reuse beats inventing a new annotation namespace.
- **`WL-3` image-tag detection** — the `imageHasMutableTag` helper handles the four shapes: no tag, `:latest`, `:edge`, host:port without a tag (`registry.example.com:5000/nginx`). `@sha256:` digest is always immutable. Captured as an `it.each` table test for clarity.
- **Did NOT consume Pulumi's policy gRPC** in tests — the BDD scenarios call `validateResource` directly with synthetic `ResourceValidationArgs`. Same pattern as the existing AWS `HulumiHardeningPack` tests; avoids the gRPC-server-per-process constraint.

## Assumptions verified

- The existing `matchSuppression` helper accepts an empty `reason` string at the type level but doesn't filter on emptiness. Each K8s pack's `readSuppressions` adds the `reason.trim().length > 0` filter — captured as the M3 invariant.
- Pulumi's K8s resource type strings are stable: `kubernetes:apps/v1:Deployment`, `kubernetes:rbac.authorization.k8s.io/v1:ClusterRole`, `aws:eks/cluster:Cluster`. Verified by reading existing tests and `@pulumi/kubernetes` provider types.
- `Service.spec.type` is one of `ClusterIP` | `NodePort` | `LoadBalancer` | `ExternalName`. Public-facing detection only fires on `LoadBalancer`.
- Adding K8s exports to `packages/policies/src/index.ts` doesn't conflict with the `aws` and `github` namespace re-exports (they live under their own re-export prefixes; K8s rules are top-level).

## Assumptions still unresolved

- **No real-EKS test of the EKS rules** — `EKS-CL-1` and `EKS-CL-2` are validated against synthetic `props` shapes. A future M5/M6 milestone with real EKS access could exercise the rules against live `aws eks describe-cluster` output to catch any provider-shape drift.
- **`urnScope` glob is trailing-`*` only** — discovered when the rbac-pack test using `"*::external-secrets"` (leading-`*`) failed to suppress. Worth promoting to a docs note in the suppressions cookbook.

## Mistakes made

- Initial draft of `EnabledClusterLog` interface was unused (I added it speculatively then never referenced it). TypeScript `noUnusedLocals` caught it; removed in the same iteration.
- First pass of the suppression test for external-secrets used `urnScope: "*::external-secrets"`, which the trailing-`*` matcher doesn't accept. Switched to an exact-URN match.

## Root causes

- Speculative interfaces creep into TypeScript drafts when the implementation gets reshaped mid-write. `noUnusedLocals` catches the trivial cases; review-after-write would catch the rest.
- The `urnScope` glob shape isn't widely advertised in the existing docs — the test failure was the most direct way to discover it.

## What was harder than expected

- Image-tag detection: distinguishing `host:port/image` (registry with port, no tag) from `image:tag` (image with tag). Used `lastIndexOf("/")` vs `lastIndexOf(":")` to disambiguate.
- Mapping the runbook BDD scenarios to specific rule IDs while keeping the rule names semantically meaningful. Settled on the `HULUMI-<DOMAIN>-<KIND>-<N>` convention (`HULUMI-K8S-WL-1`, `HULUMI-EKS-CL-1`, etc.) — mirrors the AWS pack's `HULUMI-H1` style.

## Invariants/assertions added or strengthened

- Suppression with `reason.trim().length === 0` is silently ignored across all 10 K8s/EKS rules (M3 invariant — encoded in three `readSuppressions` helpers).
- `WL-1` blocks `securityContext.privileged: true` on every container in the pod template, including `initContainers`.
- `WL-2` rejects each of `hostNetwork`, `hostPID`, `hostIPC` independently — three separate violation messages possible per pod.
- `WL-3` rejects: no tag, `:latest`, `:edge`, host:port-only (no tag). Allows: explicit tag (e.g. `:1.27.0`), `@sha256:…` digest.
- `SVC-1` only fires on `Service.spec.type === "LoadBalancer"`. ClusterIP / NodePort / ExternalName are out of scope.
- `RBAC-2` only flags rules that target the **core** API group (`apiGroups` includes `""` or `"*"`) — Secret-shaped CRs in other API groups are out of scope.
- `EKS-CL-1` treats unset `publicAccessCidrs` as the unsafe default (matches AWS's `["0.0.0.0/0"]` default).

## Resource bounds established or verified

- `POD_OWNING_TYPES` is a finite Set of 7 K8s controller types — explicit list, no glob.
- `ROLE_TYPES` and `BINDING_TYPES` are finite Sets of 2 each.
- One pass per resource per rule — no accumulation, no cross-resource state. Matches the runbook §4.4 bound for policy pack traversal.

## Debugging / inspection notes

- Inspected `packages/policies/src/aws/suppressions.ts` to verify the `urnScope` glob shape. Trailing `*` only.
- Inspected `packages/policies/src/aws/hulumi-hardening-pack.ts` to mirror the AWS pack's metadata + handler shape.
- The K8s rule type strings (`kubernetes:apps/v1:Deployment`, etc.) match what the mock-runtime registrations use in `packages/k8s-baseline/tests/setup.ts`.

## Naming conventions established

- Rule ID: `HULUMI-<DOMAIN>-<KIND>-<N>` (e.g., `HULUMI-K8S-WL-1`, `HULUMI-K8S-RBAC-1`, `HULUMI-EKS-CL-1`).
- Pack ID (PackMetadata.id): `hulumi-k8s-hardening-pack`, `hulumi-k8s-rbac-pack`, `hulumi-eks-cluster-pack`.
- Pack entry point: `@hulumi/policies/k8s/packs/<pack-name>`.
- Annotation namespace for audit metadata: `hulumi.dev/<facet>` (e.g. `hulumi.dev/public-justification`). Reused from M2.

## Test patterns that worked well

- `it.each([...])` for `WL-3` image-tag truth table — keeps the seven cases compact.
- One synthetic-stack E2E test in `policy-pack-runtime.test.ts` that fires every rule once. Easy to extend in M4-M6 by appending resources.

## Missing tests that should exist now

- A test that loads each pack entry point (`packs/hulumi-k8s-*.ts`) in isolation and asserts the gRPC-per-process constraint is honored. The existing AWS pack does this; deferred for M3 because the constraint is a runtime property, not a code-shape property.
- A test for the E2E "hardened stack" that uses Hulumi-emitted resources (e.g. via the existing `KubernetesSecretFromAwsSecretsManager` mock-runtime registrations) rather than synthetic dicts.

## Rules for the next milestone

1. **K8s resources from the M2 components are now polic-checkable** — M4's `NamespaceFoundation` should emit resources that pass all three K8s packs by default. Test the foundation against the runtime test's `k8s_pack_allows_hardened_stack` scenario as a regression guard.
2. **The `hulumi.dev/<facet>` annotation namespace is the place** for audit-level metadata that policy packs key off of. M4's NetworkPolicy / NamespaceFoundation can re-use the namespace for things like `hulumi.dev/cni-caveat`, `hulumi.dev/imds-deny-acknowledged`.
3. **Suppression `urnScope` is trailing-`*` only** — pre-emptively docs M4 examples with exact URNs or `<prefix>*` patterns.
4. **`@pulumi/policy` PolicyPack-per-process constraint** means the entry-point dance from `packs/*.ts` continues to apply for any future packs.
