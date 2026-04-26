# Lessons learned — Hulumi-K8s M2 (`IstioFoundation`)

## Surprises

1. **`apiextensions.CustomResource` registers under a dynamic GVK type, not the static `CustomResource` type name.** The mock-runtime test harness was filtering for `kubernetes:apiextensions.k8s.io:CustomResource`, but the actual registration came in as `kubernetes:security.istio.io/v1beta1:PeerAuthentication` — derived at runtime from the `apiVersion + kind` fields. Fix: make the test helper match `kubernetes:*` excluding the well-known `core/` and `helm.sh/` prefixes. Recorded so M3's `Gateway`/`VirtualService`/`AuthorizationPolicy` (all CustomResources) are filtered the same way.

2. **`settlePulumi()` needed a higher iteration count for the dependsOn chain.** The M1 components settled in 40 microtask cycles; M2's three-layer `dependsOn` chain (cni → istiod → gateway → PeerAuthentication) needed more. Bumped to 200 in `tests/setup.ts`. Documented inline so future authors know why.

## Decisions

1. **Three releases, explicit dependsOn — not just `dependsOn` on istiod.** The cni release is the dependency for istiod (so the CNI is Ready before sidecar injection lands); istiod is the dependency for the ingressGateway. Encoded directly via `{ parent: this, dependsOn: [cniRelease] }`. The chain is the abstraction's reason to exist (per the Important design rule).

2. **istiod's values include `pilot.cni.enabled: true` ONLY when `cniEnabled` is true.** When the consumer opts out of the CNI, `pilot.cni.enabled` is irrelevant (and would be misleading) — istiod renders the legacy istio-init initContainer because it has no choice. The warn message makes the consequence explicit.

3. **`ingressGatewayServiceAccountName` is computed as `${name}-ingress`.** The Istio gateway chart's default service-account name is the release name; since `HardenedHelmRelease` defaults `releaseName` to the component instance name (M1 commit), the SA name = the M2 release's instance name = `${componentName}-ingress`. M3's `AlbMeshedHttpEntrypoint` consumes this output directly.

4. **PSA-baseline namespace label on every namespace this component creates.** istio-system and istio-ingress get `pod-security.kubernetes.io/enforce: baseline`. The `kube-system` namespace is owned by the cluster; we don't create it (and don't change its PSA posture).

5. **The `PeerAuthentication` lives in `istiodNamespace` (default `istio-system`), not in the workload namespace.** A single cluster-wide PeerAuthentication is the canonical Istio pattern for "default for the whole mesh"; per-namespace overrides are workload decisions.

## Deltas from plan

- The kind integration test (`istio-foundation.kind.test.ts`) is **deferred to M5** for the same reason as M1's: requires kind binary + a real Istio install round-trip, better fits the M5 release readiness sweep.
- The runbook anticipated possibly extending the `chartClass` enum further; it stayed at `"default" | "istio"`. The M1 wrapper extension was sufficient.
- `COMPATIBILITY.md` typed const now has 3 chart entries (`istiod`, `cni`, `gateway`) at version `1.24.2`. The human-readable mirror at `COMPATIBILITY.md` (the markdown) was NOT updated in M2 — a small follow-up before M5.

## What I'd do differently

- The `apiextensions.CustomResource` type-registration surprise would have been caught earlier by writing the test BEFORE assuming a static type name. Same lesson as M1's TDD discipline.

## Carry-forward to M3

- The `customResources()` test helper that filters by `kubernetes:*` prefix excluding `core/` and `helm.sh/` will pick up M3's `Gateway`, `VirtualService`, `AuthorizationPolicy` (all CustomResources). M3's tests should refine that filter to assert by `kind` field, not by Pulumi type string.
- `IstioFoundationOutputs.ingressGatewayServiceAccountName` and `ingressGatewayNamespace` are the load-bearing inputs M3 consumes. Both ship as `pulumi.Output<string | undefined>` because they may be absent when `ingressGateway: { enabled: false }`.
