---
title: MetricsServer
---

# `MetricsServer`

`@hulumi/k8s-baseline.MetricsServer` installs the Kubernetes Metrics API via the
upstream `metrics-server` Helm chart. It is intended for clusters where
`kubectl top` and HorizontalPodAutoscaler CPU/memory telemetry should be managed
through Pulumi instead of ad hoc Helm commands.

## Defaults

The component defaults to:

- chart: `metrics-server`
- repository: `https://kubernetes-sigs.github.io/metrics-server/`
- chart version: `3.13.0`
- namespace: `kube-system`
- Helm release name: `metrics-server`
- APIService name: `v1beta1.metrics.k8s.io`
- TLS mode: chart-managed `tls.type: helm`
- APIService TLS verification: enabled (`insecureSkipTLSVerify: false`)

The chart's kubelet address defaults are preserved:
`InternalIP,ExternalIP,Hostname`, `--kubelet-use-node-status-port`, and
`--metric-resolution=15s`.

## Insecure Opt-Ins

`--kubelet-insecure-tls` and APIService TLS skipping are refused unless the
caller provides an explicit reason:

```ts
import { MetricsServer } from "@hulumi/k8s-baseline";

new MetricsServer("metrics", {
  insecureKubeletTls: {
    enabled: true,
    reason: "temporary bootstrap while node serving cert SANs are remediated",
  },
});
```

Prefer fixing kubelet serving certificates or APIService CA wiring over using
these escape hatches.

## Example

```ts
import { MetricsServer } from "@hulumi/k8s-baseline";

export const metrics = new MetricsServer("cluster-metrics", {
  version: "3.13.0",
  resources: {
    requests: {
      cpu: "100m",
      memory: "200Mi",
    },
  },
});

export const metricsApiService = metrics.apiServiceName;
```

## Validation

After applying the plan, operators should verify:

```bash
kubectl get apiservice v1beta1.metrics.k8s.io
kubectl top pods -A
kubectl get hpa -A
```

## Outputs

- `releaseName`
- `namespace`
- `chartVersion`
- `apiServiceName`
- `insecureKubeletTlsReason`
- `insecureApiServiceTlsReason`
- `status`
