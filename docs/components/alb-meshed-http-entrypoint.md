---
title: AlbMeshedHttpEntrypoint
description: Bundled ALB Ingress + Istio Gateway + VirtualService + AuthorizationPolicy for one workload, with consistent SA-principal linkage automatically wired from the IstioFoundation ref. Full reference at M5.
---

# `AlbMeshedHttpEntrypoint`

`@hulumi/k8s-baseline.AlbMeshedHttpEntrypoint` — emits four resources for one workload's ingress:

1. **K8s `Ingress`** in the gateway namespace — ALB annotations: `target-type=ip`, `scheme`, `healthcheck-port=15021`, `healthcheck-path=/healthz/ready`, `group.name`. Backend points at the istio-ingressgateway Service.
2. **Istio `Gateway`** in the gateway namespace — selector matches gateway pods; captures the host on port 80.
3. **Istio `VirtualService`** in the workload namespace — `spec.gateways` uses cross-namespace form (`<gateway-ns>/<gateway-name>`).
4. **Istio `AuthorizationPolicy`** in the workload namespace — `from.principals` computed from `mesh.ingressGatewayServiceAccountName` (NEVER from a consumer string).

`mTLS: "STRICT"` (default) also emits a workload-namespace `PeerAuthentication`.

`allowFromGateway: false` requires explicit `acknowledgeNoAuthZ: true` AND non-empty `extraPrincipals` — the no-AuthZ posture is opt-in friction-y by design.

`scheme: "internal"` is the default; `"internet-facing"` is opt-in.

Full reference doc lands at M5. Source: [packages/k8s-baseline/src/alb-meshed-http-entrypoint.ts](../../packages/k8s-baseline/src/alb-meshed-http-entrypoint.ts).
