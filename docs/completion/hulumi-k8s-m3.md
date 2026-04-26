# Completion summary — Hulumi-K8s M3 (`AlbMeshedHttpEntrypoint`)

## Status: `done` (2026-04-26)

## Changed files

```
packages/k8s-baseline/
├── src/
│   ├── alb-meshed-http-entrypoint.args.ts    # NEW
│   ├── alb-meshed-http-entrypoint.outputs.ts # NEW
│   ├── alb-meshed-http-entrypoint.ts         # NEW — emits 4 K8s/Istio resources with SA-principal linkage
│   └── index.ts                              # AlbMeshedHttpEntrypoint re-export
└── tests/
    ├── alb-meshed-http-entrypoint.test.ts    # NEW — 15 BDD scenarios
    └── setup.ts                              # mock for kubernetes:networking.k8s.io/v1:Ingress + general kubernetes:* fallback
```

## Tests added

- `packages/k8s-baseline/tests/alb-meshed-http-entrypoint.test.ts` — 15 scenarios: happy paths (7 rows), invalid input refusals (4 rows), abuse cases (3 rows), outputs lock (1 row).

Total: **56 tests passing** in the K8s package; 0 failures; 0 skipped.

## Repo-wide regression sweep

| Check | Result |
| --- | --- |
| `pnpm -r build` | green (4 packages) |
| `pnpm -r test` | green (10 workspace projects) |
| `pnpm -r typecheck` | green |
| `pnpm -r lint` | green |
| `pnpm run lint:license-boundary` | OK |
| `pnpm run lint:exact-pin-guard` | OK |

## Issues closed

- [#41 — `MeshedHttpEntrypoint` bundle](https://github.com/kerberosmansour/hulumi/issues/41) → **closed** by `AlbMeshedHttpEntrypoint`.

## Surface added (stable from M3)

- `@hulumi/k8s-baseline.AlbMeshedHttpEntrypoint` + `AlbMeshedHttpEntrypointArgs` + `AlbMeshedHttpEntrypointOutputs` + `ALB_MESHED_HTTP_ENTRYPOINT_COMPONENT_TYPE`.
- Type re-exports: `AlbMeshedHttpEntrypointAuthZ`, `AlbMeshedHttpEntrypointAlb`, `AlbMeshedHttpEntrypointServiceRef`, `AlbScheme`, `EntrypointMTLSMode`.

## Deferrals

- Kind integration test deferred to M5.
- Custom trust-domain support deferred to v1.x.
- Non-`app=<serviceName>`-label-selector workloads deferred to v1.x.

## Next milestone

M4 — `KubernetesSecretFromAwsSecretsManager` + `RdsCredentialSecret`. Independent of M2/M3.
