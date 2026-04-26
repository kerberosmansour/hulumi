---
title: IstioFoundation
description: Bundled hardened Istio install — istiod (pilot.cni.enabled=true) + istio-cni DaemonSet (Fargate-excluded) + ingressgateway (ClusterIP), all version-pinned together. PSA-baseline-clean defaults. Full reference at M5.
---

# `IstioFoundation`

`@hulumi/k8s-baseline.IstioFoundation` — bundles three version-pinned Helm releases into one declaration:

1. **`istio-cni`** in `kube-system` — DaemonSet with Fargate-exclusion `nodeAffinity`. Moves iptables setup off the pod so PSA-baseline namespaces don't reject mesh-injected pods.
2. **`istiod`** in `istio-system` — control plane with `pilot.cni.enabled=true` so the sidecar injector renders `istio-validation` (cni-mode) instead of `istio-init` (NET_ADMIN-requiring).
3. **`istio-ingressgateway`** in `istio-ingress` — ClusterIP service; ALB targets it via target-type=ip.

All three pin to the same `version`. `dependsOn` chain: `cni → istiod → ingressGateway`.

Plus a cluster-wide `PeerAuthentication` for `defaultMTLS: "STRICT"` (the security-positive default).

Opt-outs (`cniEnabled: false`, `defaultMTLS: "PERMISSIVE"`) emit `pulumi.log.warn` documenting the security regression.

Full reference doc lands at M5. Source: [packages/k8s-baseline/src/istio-foundation.ts](../../packages/k8s-baseline/src/istio-foundation.ts). Cookbook (the manual recipe this collapses): [docs/cookbooks/psa-baseline-istio-sidecar.md](../cookbooks/psa-baseline-istio-sidecar.md).
