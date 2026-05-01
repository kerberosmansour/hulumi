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

## M2 — explicit selector required

The AuthorizationPolicy's `selector.matchLabels` MUST be either explicitly supplied via `workloadSelector: { matchLabels: {...} }` (preferred) OR the consumer must opt in to the legacy inferred selector via `acknowledgeInferredSelector: true`. Constructing without either fails fast with a migration message.

```ts
// Preferred — explicit selector
new AlbMeshedHttpEntrypoint("api", {
  // ...,
  workloadSelector: { matchLabels: { "app.kubernetes.io/name": "api", tier: "frontend" } },
});

// Legacy — inferred from `serviceRef.name` (still works, requires acknowledgement)
new AlbMeshedHttpEntrypoint("api", {
  // ...,
  acknowledgeInferredSelector: true,
});
```

`workloadSelector.matchLabels` is bounded at **32 labels**. `authorizationPolicy.extraPrincipals` is bounded at **64 entries**.

## M2 — public ALB requires certificate + justification

`scheme: "internal"` is the default. When `scheme: "internet-facing"`, BOTH of the following are required (the constructor fails fast otherwise):

- `alb.certificateArn` — ACM cert for HTTPS termination.
- `alb.publicJustification` — plain-language reason (≥ 8 chars) explaining why this workload is on the public internet. Recorded as the `hulumi.dev/public-justification` annotation on the emitted Ingress for audit.

```ts
new AlbMeshedHttpEntrypoint("public-api", {
  // ...,
  scheme: "internet-facing",
  workloadSelector: { matchLabels: { app: "public-api" } },
  alb: {
    certificateArn: "arn:aws:acm:us-east-1:111:certificate/abc",
    publicJustification: "Public marketing site; HTTPS-only; no PII handled.",
  },
});
```

Full reference doc lands at M5. Source: [packages/k8s-baseline/src/alb-meshed-http-entrypoint.ts](../../packages/k8s-baseline/src/alb-meshed-http-entrypoint.ts).
