# Lessons learned — Hulumi-K8s M3 (`AlbMeshedHttpEntrypoint`)

## Surprises

1. **`pulumi.all([singleOutput])` overload selection in TS strict mode.** Using `pulumi.all([ingressNs])` with a single-output array triggered TS overload-resolution failures: "Target requires 1 element(s) but source may have fewer." The library's `all` overloads are tuple-typed and the single-element shape ambiguates with the variadic. Fix: use `pulumi.output(ingressNs).apply(...)` for single-output transformations. Recorded so M4's dynamic provider (which composes multiple SM outputs) uses the right shape from the start.

2. **The Pulumi TS strict-mode "unused variable" lint catches dropped CustomResource handles.** Created `const gateway = new k8s.apiextensions.CustomResource(...)` without using it elsewhere — TS6133 flags it. Fix: drop the binding (the constructor's side-effect of registering the resource is the goal). The component's outputs reference the gateway via `gatewayName` string, not the binding.

## Decisions

1. **Principal linkage is computed via SPIFFE: `cluster.local/ns/<gateway-ns>/sa/<gateway-sa>`.** This is Istio's documented format for service-account principals; the component uses `cluster.local` as the trust domain (the Istio default — multi-cluster consumers with non-default trust domains can override via `extraPrincipals` at v1; first-class trust-domain config is a v1.x deferral).

2. **Ingress lives in the gateway's namespace, not the workload's.** ALB Controller binds at the same namespace as the Ingress; routing internal-facing ingress through the gateway's namespace puts the ALB and the gateway service in the same place. The VirtualService + AuthorizationPolicy live in the workload's namespace (where the workload service is).

3. **`AuthorizationPolicy` selects by `app: <serviceName>` label.** Standard Istio convention; matches the Service name. Workloads with non-conforming labels can override at v1.x; flagged as a known limitation.

4. **`certificateArn` adds 4 annotations.** When supplied: `certificate-arn`, `listen-ports: [{HTTP:80},{HTTPS:443}]`, `ssl-redirect: "443"`, optionally `ssl-policy`. Without `certificateArn`, only the 4 base annotations + group.name are emitted (HTTP-only, common for `internal` scheme).

5. **`STRICT` mTLS at the entrypoint emits a workload-namespace PeerAuthentication.** This is in addition to the mesh-wide `STRICT` PeerAuthentication M2 emits. Per-workload override is the correct shape — IstioFoundation sets the cluster default; `AlbMeshedHttpEntrypoint` reinforces it for the namespace its workload lives in. Test asserts `peers.length >= 2`.

## Deltas from plan

- The runbook anticipated `mesh.ingressGatewayNamespace` already being present from M2. Confirmed in the M2 outputs file. No M2 patch needed.
- The kind integration test deferred to M5 (same rationale as M1 + M2).

## What I'd do differently

- The `pulumi.all` vs `pulumi.output` overload choice would have surfaced earlier with stricter local typecheck during dev. Lesson: run `pnpm --filter @hulumi/k8s-baseline typecheck` after each major source change, not just at the end of the milestone.

## Carry-forward to M4

- The `customResources()` test helper that filters by `kind` works well across Gateway / VirtualService / AuthorizationPolicy / PeerAuthentication. M4's tests should reuse the same shape.
- The trust-domain assumption (`cluster.local`) is a known limitation; document in M5's full reference doc.
