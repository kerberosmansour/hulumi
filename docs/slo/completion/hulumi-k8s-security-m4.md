# Completion Summary — hulumi-k8s-security Milestone 4

## Goal completed

`NamespaceFoundation` exists and emits the hardened K8s namespace baseline: PSA labels, default ServiceAccount with `automountServiceAccountToken: false`, optional `ResourceQuota` / `LimitRange`, and the four foundational NetworkPolicy resources (default-deny, DNS allow, IMDS deny, opt-in mesh-egress). Resource bounds encoded; CNI caveat documented inline as an annotation.

## Files changed

### Added (source)

- `packages/k8s-baseline/src/namespace-foundation.args.ts` — types + `MAX_*` constants.
- `packages/k8s-baseline/src/namespace-foundation.outputs.ts` — outputs interface.
- `packages/k8s-baseline/src/namespace-foundation.ts` — component.

### Added (tests)

- `packages/k8s-baseline/tests/namespace-foundation.test.ts` — 17 BDD scenarios.

### Added (docs)

- `docs/components/namespace-foundation.md`.
- `docs/slo/lessons/hulumi-k8s-security-m4.md`.
- `docs/slo/completion/hulumi-k8s-security-m4.md`.

### Modified

- `packages/k8s-baseline/src/index.ts` — re-exports `NamespaceFoundation` + types + bounds.
- `docs/components/README.md` — adds the new component row.

## Tests added

17 BDD scenarios under `tests/namespace-foundation.test.ts`:

- Namespace defaults to PSA `enforce: baseline` / `audit: restricted` / `warn: restricted`.
- `restricted` opt-in flips `enforce`.
- Default ServiceAccount has `automountServiceAccountToken: false` by default; `"required"` opt-in flips it.
- ResourceQuota + LimitRange emitted when args supplied.
- Default-deny NetworkPolicy emitted with `Ingress + Egress` policyTypes.
- DNS-egress NetworkPolicy emitted with kube-system + UDP/TCP 53.
- IMDS-deny NetworkPolicy emitted with `0.0.0.0/0` except `169.254.169.254/32`.
- CNI caveat annotation present on the IMDS-deny policy.
- `allowMeshEgress: true` emits the mesh-egress policy.
- Empty / invalid name rejected; invalid PSA rejected; `allowMeshEgress` without `meshIngressNamespace` rejected.
- Label / quota bounds enforced.
- Output names lock (component type registered, networkPolicyNames matches expected sorted set).

## Static analysis evidence

| Check               | Result                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| `pnpm -r typecheck` | green                                                                                                       |
| `pnpm -r build`     | green                                                                                                       |
| `pnpm -r lint`      | green                                                                                                       |
| license-boundary    | OK                                                                                                          |
| exact-pin-guard     | OK                                                                                                          |
| Full tests          | 67 baseline / 96 policies / 54 drift / **119** k8s-baseline (was 102; +17) / 28 skill-bdd / 4 example smoke |

## Compatibility checks

- Existing K8s components unchanged — verified by the unchanged 102 pre-M4 tests.
- New `NamespaceFoundation` does not require cluster-topology args (no EKS cluster ref, no node-group input).
- `IstioFoundation` interop preserved — the optional `allowMeshEgress` + `meshIngressNamespace` accept the existing `IstioFoundation.ingressGatewayNamespace` Output.

## Invariants

- PsaLevel discriminated union (`privileged | baseline | restricted`) prevents loose strings.
- Default-deny is emitted unless explicitly disabled via `networkDefaults.defaultDeny: false`.
- `allowMeshEgress: true` requires `meshIngressNamespace`.

## Resource bounds

- `MAX_NAMESPACE_LABELS = 32`, `MAX_QUOTA_ENTRIES = 32`, `MAX_NETWORK_POLICY_PEERS = 128`.

## Documentation updated

- `docs/components/namespace-foundation.md` (new, with CNI caveat block).
- `docs/components/README.md` (component row).

## Deferred follow-ups

- **kind integration test** for `namespace-foundation.kind.test.ts` — the runbook anticipates it; deferred until kind binary is wired into CI (M1 carry-forward).
- **`docs/cookbooks/eks-workload-namespace-bootstrap.md`** — the runbook anticipates a cookbook; out of M4's strict allow-list focus, but a follow-up PR can fold it in.
- **`network-policy-foundation.ts`** as a separate exported helper — for now the NetworkPolicy resources are inlined into `NamespaceFoundation`. Splitting them out is a refactor, not a feature.

## Known non-blocking limitations

- NetworkPolicy enforcement is CNI-dependent. The component documents this via the `hulumi.dev/cni-caveat` annotation but cannot guarantee enforcement.
- `hostNetwork: true` pods bypass NetworkPolicy. Pair with `HulumiK8sHardeningPack`'s `WL-2` rule (M3) to reject those at preview.
