---
title: NamespaceFoundation
description: Hardened K8s Namespace foundation — PSA enforcement, default ServiceAccount token-automount disabled, ResourceQuota / LimitRange, default-deny + DNS / IMDS NetworkPolicy defaults. CNI-dependent.
---

# `NamespaceFoundation`

`@hulumi/k8s-baseline.NamespaceFoundation` — emits a hardened K8s Namespace + the supporting policy resources for an application namespace. Added in runbook `hulumi-operations-k8s-security` Milestone 4.

## What it emits

1. **`Namespace`** — labeled with Pod Security Admission `enforce` / `audit` / `warn`. Default `enforce: baseline`, `audit: restricted`, `warn: restricted` so consumers see what the next level up would catch.
2. **Default `ServiceAccount` (`default`)** — `automountServiceAccountToken: false` by default (M4 typed escape hatch via `defaultServiceAccountAutomount: "required"`).
3. **`ResourceQuota`** — when `quota` arg supplied. Bounded at 32 entries (`MAX_QUOTA_ENTRIES`).
4. **`LimitRange`** — when `limitRanges` arg supplied.
5. **NetworkPolicy: default-deny** — `Ingress` + `Egress`, podSelector `{}` (selects all pods).
6. **NetworkPolicy: allow-dns-egress** — to CoreDNS in `kube-system` on UDP/TCP 53.
7. **NetworkPolicy: deny-imds-egress** — `cidr: 0.0.0.0/0` with `except: ["169.254.169.254/32"]`. Carries the `hulumi.dev/cni-caveat` annotation reminding operators that NetworkPolicy enforcement requires a capable CNI plugin (Calico, Cilium, AWS VPC CNI with policy enabled).
8. **NetworkPolicy: allow-mesh-egress** — emitted only when `networkDefaults.allowMeshEgress: true` AND `meshIngressNamespace` is set. Allows egress to the named mesh-ingress namespace.

## Quick start

```ts
import { NamespaceFoundation } from "@hulumi/k8s-baseline";

new NamespaceFoundation("team-a-foundation", {
  name: "team-a",
  podSecurity: "restricted",
  quota: {
    hard: { "requests.cpu": "10", "requests.memory": "32Gi", pods: "100" },
  },
  limitRanges: [
    {
      type: "Container",
      defaults: { cpu: "500m", memory: "256Mi" },
      defaultRequests: { cpu: "100m", memory: "128Mi" },
    },
  ],
  networkDefaults: { allowMeshEgress: true, meshIngressNamespace: "istio-ingress" },
});
```

## Important caveats

- **NetworkPolicy enforcement is CNI-dependent.** The component emits structurally-valid NetworkPolicy resources, but enforcement requires a CNI plugin that supports them. Default AWS VPC CNI does NOT enforce NetworkPolicy unless `enable-network-policy=true` is set.
- **`hostNetwork: true` pods bypass NetworkPolicy.** The IMDS-deny policy in particular cannot block IMDS access from a pod that runs in the host network namespace. Pair with `HulumiK8sHardeningPack`'s `WL-2` rule (added in M3) to reject those pods at preview time.

## Resource bounds

| Bound                          | Value | Constant                           |
| ------------------------------ | ----: | ---------------------------------- |
| Namespace labels               |    32 | `MAX_NAMESPACE_LABELS`             |
| `ResourceQuota.spec.hard`      |    32 | `MAX_QUOTA_ENTRIES`                |
| NetworkPolicy peers (per direction) |  128 | `MAX_NETWORK_POLICY_PEERS`         |
| Recommended peers              |    32 | `RECOMMENDED_NETWORK_POLICY_PEERS` |

## Outputs

- `namespaceName: Output<string>`
- `defaultServiceAccountName: Output<string>` (always `"default"`)
- `networkPolicyNames: Output<string[]>` — bounded list of emitted NetworkPolicy names
- `defaultServiceAccountAutomountDisabled: Output<boolean>`

Source: [packages/k8s-baseline/src/namespace-foundation.ts](../../packages/k8s-baseline/src/namespace-foundation.ts).
