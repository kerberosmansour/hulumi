---
title: EksAddonFoundation
description: Exact-pinned EKS add-on management. Refuses `latest`. Bounded at 32 add-ons per call.
---

# `EksAddonFoundation`

`@hulumi/k8s-baseline.EksAddonFoundation` — emits one `aws.eks.Addon` per spec, refusing non-exact versions.

```ts
new EksAddonFoundation("prod-eks-addons", {
  clusterName: "prod-eks",
  addons: [
    { name: "vpc-cni", version: "v1.20.0-eksbuild.1" },
    { name: "coredns", version: "v1.11.4-eksbuild.2" },
    { name: "kube-proxy", version: "v1.31.3-eksbuild.2" },
  ],
});
```

- `version: "latest"` is rejected.
- Versions must match `^v?\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?(\+...)?$`.
- `MAX_EKS_ADDONS = 32`.

Source: [packages/k8s-baseline/src/eks-addon-foundation.ts](../../packages/k8s-baseline/src/eks-addon-foundation.ts).
