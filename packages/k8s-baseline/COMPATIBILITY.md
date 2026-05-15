# `@hulumi/k8s-baseline` — tested chart versions

This file is the human-readable companion to `src/compatibility.ts`'s `TESTED_VERSIONS` typed const. The typed const is the source of truth at runtime; this file documents the same data for human readers.

When `HardenedHelmRelease` (or any Hulumi K8s component installing a Helm chart) is given a chart version not listed here, it emits a `pulumi.log.warn` and proceeds. The consumer accepts the risk.

When this list is updated, update `src/compatibility.ts` in lockstep. The `release-readiness.test.ts` BDD suite asserts every chart name and version in `TESTED_VERSIONS` is also present in this file.

| Chart            | Repository                                            | Tested versions | Last verified | Notes                                                                                                                                   |
| ---------------- | ----------------------------------------------------- | --------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `istiod`         | `https://istio-release.storage.googleapis.com/charts` | `1.24.2`        | 2026-04-27    | Shipped in lockstep with `cni` and `gateway`. Mixing is unsupported.                                                                    |
| `cni`            | `https://istio-release.storage.googleapis.com/charts` | `1.24.2`        | 2026-04-27    | Pinned to the same Istio minor as `istiod`.                                                                                             |
| `gateway`        | `https://istio-release.storage.googleapis.com/charts` | `1.24.2`        | 2026-04-27    | Pinned to the same Istio minor as `istiod`.                                                                                             |
| `metrics-server` | `https://kubernetes-sigs.github.io/metrics-server/`   | `3.13.0`        | 2026-05-15    | Chart appVersion `0.8.0`; `MetricsServer` sets `tls.type: helm` and refuses insecure kubelet/APIService TLS unless explicitly reasoned. |

## How to add a chart entry

1. Run a kind integration test against the chart at the new version.
2. Update `src/compatibility.ts`'s `TESTED_VERSIONS` const with the chart name and version.
3. Append a row here documenting the verification date and any chart-class-specific notes (timeout overrides, required values).
4. Open a PR; the PR review confirms the kind test passed and the `release-readiness.test.ts` BDD invariant still holds.
