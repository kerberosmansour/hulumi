---
title: Run Istio sidecars under Pod Security Admission "baseline"
description: The NET_ADMIN collision between PSA-baseline namespaces and Istio sidecar injection — and the istio-cni cure that actually works.
---

# Run Istio sidecars under Pod Security Admission "baseline"

## When to use this recipe

You are running Istio on EKS (or any Kubernetes 1.25+ cluster) and your application namespaces have `pod-security.kubernetes.io/enforce: baseline` — increasingly the default in regulated and compliance-driven environments. Pods come up with the symptom:

```
Error creating: pods "platform-api-..." is forbidden:
  violates PodSecurity "baseline:latest":
  non-default capabilities (container "istio-init" must not include "NET_ADMIN", "NET_RAW")
```

This recipe walks through why the obvious fixes are wrong and what the working install actually looks like.

## Preconditions

- An EKS cluster (or any K8s 1.25+ cluster) where target namespaces enforce `pod-security.kubernetes.io/enforce: baseline`.
- Helm 3 + `kubectl`, OR a Pulumi program with `@pulumi/kubernetes` that can render `helm.v3.Release` resources.
- Decision on Istio version. Pin both releases below to the same version — control-plane / data-plane skew is not supported.
- (EKS only) An understanding of which node groups are EC2 vs Fargate. The CNI DaemonSet must avoid Fargate (see step 3).

## Why the obvious fixes are wrong

Two near-fixes that look like they help but introduce real regressions:

- **Setting `traffic.sidecar.istio.io/excludeInboundPorts` (or `excludeOutboundPorts`) on the workload.** This bypasses the mesh for the listed ports. The pod stops needing `istio-init` for those flows but the traffic also stops being mTLS-wrapped, stops being subject to `AuthorizationPolicy`, and stops appearing in mesh telemetry. You traded a `NET_ADMIN` violation for a silent security regression.
- **Promoting the namespace from `baseline` to `privileged`.** This makes the symptom go away and removes every other PSA-baseline guarantee at the same time (host networking, host PID, every elevated cap). Compliance-wise this is usually unacceptable.

The real fix moves the iptables setup off the pod entirely.

## Steps

### 1. Install `istio-cni` as a DaemonSet

The `istio-cni` plugin runs on every node and applies the iptables rules that `istio-init` would otherwise apply per-pod. Once it's running, sidecars come up without elevated capabilities.

```bash
helm repo add istio https://istio-release.storage.googleapis.com/charts
helm repo update

# Pin a specific version — keep this in sync with istiod below.
ISTIO_VERSION=1.24.2

helm upgrade --install istio-cni istio/cni \
  --version "${ISTIO_VERSION}" \
  --namespace kube-system \
  --set cni.cniBinDir=/opt/cni/bin \
  --set cni.cniConfDir=/etc/cni/net.d
```

In Pulumi:

```ts
import * as k8s from "@pulumi/kubernetes";

const ISTIO_VERSION = "1.24.2";

const istioCni = new k8s.helm.v3.Release("istio-cni", {
  chart: "cni",
  version: ISTIO_VERSION,
  namespace: "kube-system",
  repositoryOpts: { repo: "https://istio-release.storage.googleapis.com/charts" },
  values: {
    cni: { cniBinDir: "/opt/cni/bin", cniConfDir: "/etc/cni/net.d" },
  },
});
```

### 2. Install `istiod` with `pilot.cni.enabled=true`

This is the step most "install just the CNI" walkthroughs miss. `istiod` writes the sidecar-injector ConfigMap. Without `pilot.cni.enabled=true`, that ConfigMap **still renders an `istio-init` initContainer with `NET_ADMIN` + `NET_RAW`**, even though the CNI is now doing the same work at the node. PSA-baseline keeps rejecting the pods until the injector knows the CNI is active.

```bash
helm upgrade --install istiod istio/istiod \
  --version "${ISTIO_VERSION}" \
  --namespace istio-system --create-namespace \
  --set pilot.cni.enabled=true
```

In Pulumi:

```ts
const istiod = new k8s.helm.v3.Release(
  "istiod",
  {
    chart: "istiod",
    version: ISTIO_VERSION,
    namespace: "istio-system",
    createNamespace: true,
    repositoryOpts: { repo: "https://istio-release.storage.googleapis.com/charts" },
    values: { pilot: { cni: { enabled: true } } },
  },
  { dependsOn: [istioCni] },
);
```

The `dependsOn` matters: if `istiod` lands first, the injector ConfigMap gets written, namespaces start admitting pods, and the racing first wave still hits `istio-init` until the CNI catches up. Order it explicitly.

### 3. (EKS + Fargate only) Exclude Fargate from the CNI DaemonSet

Fargate does not run DaemonSets. If any Fargate profile selects a namespace, the daemon-set controller still creates DaemonSet pods targeting Fargate-eligible nodes — they sit `Pending` forever. `helm.v3.Release`'s default wait-for-ready never converges, and after the 5-minute default timeout you get `context deadline exceeded` with no diagnostic pointing at Fargate.

Add a node affinity that excludes Fargate to the CNI release values:

```ts
values: {
  cni: { cniBinDir: "/opt/cni/bin", cniConfDir: "/etc/cni/net.d" },
  affinity: {
    nodeAffinity: {
      requiredDuringSchedulingIgnoredDuringExecution: {
        nodeSelectorTerms: [
          {
            matchExpressions: [
              {
                key: "eks.amazonaws.com/compute-type",
                operator: "NotIn",
                values: ["fargate"],
              },
            ],
          },
        ],
      },
    },
  },
},
```

Same affinity belongs on any other DaemonSet you install — tracked separately as [issue #42](https://github.com/kerberosmansour/hulumi/issues/42) for a packaged auto-injection helper.

### 4. Restart workloads in PSA-baseline namespaces

Existing pods carry the old (rejected) `istio-init` template. Trigger a rollout so the injector re-renders against the new `pilot.cni.enabled=true` ConfigMap:

```bash
kubectl rollout restart deployment -n <your-namespace>
```

## Verify

- **No `istio-init` container.** `kubectl get pod <name> -n <ns> -o jsonpath='{.spec.initContainers[*].name}'` returns either empty or `istio-validation` (the cni-mode replacement). It must not return `istio-init`.
- **Sidecar present.** `kubectl get pod <name> -n <ns> -o jsonpath='{.spec.containers[*].name}'` includes `istio-proxy`.
- **CNI DaemonSet healthy.** `kubectl get ds istio-cni-node -n kube-system` reports `desiredNumberScheduled == numberReady` and the count matches your EC2 node count (Fargate-excluded).
- **No PSA admission errors.** `kubectl get events -n <ns> --field-selector reason=FailedCreate` returns nothing referencing `NET_ADMIN` or `NET_RAW`.

## Troubleshooting

- **Pods still rejected for `NET_ADMIN` after installing the CNI.** Almost always missing `pilot.cni.enabled=true` on `istiod`. Verify with `kubectl get cm istio-sidecar-injector -n istio-system -o yaml | grep -A2 initContainer` — if you see `name: istio-init` there, istiod still thinks it owns iptables setup. Re-run the istiod install with the value set, then `kubectl rollout restart` your workloads.
- **`helm.v3.Release` for `istio-cni` times out at 5 minutes on EKS.** You have a Fargate profile and missed the affinity in step 3. Check `kubectl get pods -n kube-system -l k8s-app=istio-cni-node`; `Pending` pods with `0/1 nodes are available: ... had untolerated taint {eks.amazonaws.com/compute-type: fargate}` confirms it.
- **Some sidecar-injected pods are fine, others get rejected.** Order-of-install: `istiod` finished and started injecting before the CNI DaemonSet was Ready. Either add `dependsOn: [istioCni]` on the istiod release (Pulumi) or `kubectl rollout restart` the injected workloads after the CNI is up.
- **mTLS works in-mesh but ALB health checks fail.** Separate problem — the gateway needs `PeerAuthentication` set to `PERMISSIVE` for the health-check port, OR the ALB needs to point its health check at port 15021 (`/healthz/ready`). Outside the scope of PSA; tracked under the proposed `MeshedHttpEntrypoint` ([issue #41](https://github.com/kerberosmansour/hulumi/issues/41)).

## Status

Hulumi does not yet ship a packaged Istio installer. The `MeshFoundation` proposal ([issue #39](https://github.com/kerberosmansour/hulumi/issues/39)) would bundle `istiod` + `istio-cni` + the ingress gateway with these defaults (and the Fargate affinity from [issue #42](https://github.com/kerberosmansour/hulumi/issues/42)) so consumers don't have to re-derive this recipe per cluster. Until that lands, the snippets above are the canonical workaround.

## See also

- [issue #39 — hardened Istio install bundle](https://github.com/kerberosmansour/hulumi/issues/39)
- [issue #42 — DaemonSet helpers should auto-add Fargate-exclusion affinity](https://github.com/kerberosmansour/hulumi/issues/42)
- [issue #41 — MeshedHttpEntrypoint bundle](https://github.com/kerberosmansour/hulumi/issues/41)
- [issue #34 — parent cookbook epic](https://github.com/kerberosmansour/hulumi/issues/34)
- [Istio CNI plugin docs](https://istio.io/latest/docs/setup/additional-setup/cni/) — upstream reference for the cni-mode injector path.
- [Kubernetes Pod Security Admission](https://kubernetes.io/docs/concepts/security/pod-security-admission/) — the `baseline` policy definition.
