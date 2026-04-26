# Completion summary — Hulumi-K8s M2 (`IstioFoundation`)

## Status: `done` (2026-04-26)

## Changed files

```
packages/k8s-baseline/
├── src/
│   ├── compatibility.ts         # 3 chart entries added (istiod, cni, gateway @ 1.24.2)
│   ├── index.ts                 # IstioFoundation re-export
│   ├── istio-foundation.args.ts # NEW
│   ├── istio-foundation.outputs.ts # NEW
│   └── istio-foundation.ts      # NEW — bundles 3 HardenedHelmRelease children + namespaces + PeerAuthentication
└── tests/
    ├── istio-foundation.test.ts # NEW — 14 BDD scenarios
    └── setup.ts                 # mock for kubernetes:core/v1:Namespace + dynamic CRDs; settle bumped to 200
```

## Tests added

- `packages/k8s-baseline/tests/istio-foundation.test.ts` — 14 scenarios covering happy paths (6 rows), invalid input refusals (4 rows), security-positive opt-out warns (2 rows), version output + chartClass propagation (2 rows).

Total: **41 tests passing** in the K8s package; 0 failures; 0 skipped.

## Repo-wide regression sweep

| Check                            | Result                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm -r build`                  | green (4 packages)                                                                      |
| `pnpm -r test`                   | green (10 workspace projects, 41 K8s tests + existing AWS/GitHub/policies/drift suites) |
| `pnpm -r typecheck`              | green                                                                                   |
| `pnpm -r lint`                   | green                                                                                   |
| `pnpm run lint:license-boundary` | OK                                                                                      |
| `pnpm run lint:exact-pin-guard`  | OK                                                                                      |

## Issues closed / progressed

- [#39 — hardened Istio install bundle](https://github.com/kerberosmansour/hulumi/issues/39) → **closed** by `IstioFoundation`.
- [#42 — DaemonSet Fargate-exclusion affinity](https://github.com/kerberosmansour/hulumi/issues/42) → **fully closed** — the cni release uses `daemonSet: true` + the default `excludeFargate: true` to inject the affinity in production paths.

## Surface added (stable from M2)

- `@hulumi/k8s-baseline.IstioFoundation` + `IstioFoundationArgs` + `IstioFoundationOutputs` + `ISTIO_FOUNDATION_COMPONENT_TYPE`.
- Type re-exports: `DefaultMTLSMode`, `PodSecurityLevel`, `IngressGatewayServiceType`, `IstioIngressGatewayArgs`.

## Compatibility table additions

`packages/k8s-baseline/src/compatibility.ts`:

```ts
istiod: ["1.24.2"],
cni: ["1.24.2"],
gateway: ["1.24.2"],
```

## Deferrals

- Kind integration test deferred to M5.
- `COMPATIBILITY.md` (markdown) update for the 3 new entries deferred to M5 (mirrors the typed const).
- Update of `docs/cookbooks/psa-baseline-istio-sidecar.md` to recommend `IstioFoundation` as the packaged path is M5 work.

## Next milestone

M3 — `AlbMeshedHttpEntrypoint`. Consumes `IstioFoundationOutputs.ingressGatewayServiceAccountName` + `ingressGatewayNamespace` for principal linkage and cross-ns Gateway ref.
