# Design — Hulumi Kubernetes / EKS surface (decision record)

> Decision record for opening a Kubernetes / EKS / Istio / RDS surface in Hulumi. Authored 2026-04-26 in response to issues #38–#45, all filed by a real-world consumer who burned ~4 hours per workload re-deriving the same patterns. Issue #45 (cookbook) shipped same-day; this doc decides the shape of the components that would stop the next consumer from re-deriving #38–#44.
>
> Status: **proposed**. Every "Decision" line below is a commitment-point that survives PR review or gets revised. Open questions live in [§ Open questions](#open-questions).

## Why this doc exists (and what it isn't)

Hulumi today ships an AWS account-level surface (`AccountFoundation`, `SecureBucket`, KMS / IAM / CloudTrail / GuardDuty / Config / Security Hub / Access Analyzer) and a GitHub org-level surface (`SecureRepository`, `OrgFoundation`, `OrgRulesets`, …). A consumer who lands on EKS with Istio, an ALB, an RDS database, and CI that pulls private GitHub deps now has to re-derive eight separate patterns by hand:

1. Helm release names that survive destroy/recreate ([#44](https://github.com/kerberosmansour/hulumi/issues/44))
2. DaemonSet `nodeAffinity` to exclude Fargate ([#42](https://github.com/kerberosmansour/hulumi/issues/42))
3. EKS subnet tags so the AWS Load Balancer Controller can auto-discover ([#38](https://github.com/kerberosmansour/hulumi/issues/38))
4. PSA-baseline-clean Istio install (istiod with `pilot.cni.enabled=true`, istio-cni DaemonSet, version-pinned ingress gateway) ([#39](https://github.com/kerberosmansour/hulumi/issues/39); cookbook [#45](./../cookbooks/psa-baseline-istio-sidecar.md) shipped)
5. Bundled meshed HTTP entrypoint (ALB Ingress + Istio `Gateway` + `VirtualService` + `AuthorizationPolicy`) ([#41](https://github.com/kerberosmansour/hulumi/issues/41))
6. RDS auto-managed master credential → K8s `Secret` with extracted plaintext ([#40](https://github.com/kerberosmansour/hulumi/issues/40))
7. GitHub-App-issued installation tokens for cargo-fetch / private-dep CI ([#43](https://github.com/kerberosmansour/hulumi/issues/43))
8. The cross-cutting decisions that connect all of the above (this doc)

These are not Sunlit-specific patterns. **Anyone running EKS + Istio + ALB + RDS hits all eight.** The cost of abstraction is justified because every consumer is rebuilding the same fragile glue and getting it subtly wrong (the `pilot.cni.enabled=true` step alone is a ~90 minute error; the `manage_master_user_password=true` extraction is a recurring drift source between Pulumi state and live cluster).

This doc is **not** a runbook. The runbook is the v1.x milestone breakdown that lives at `docs/slo/completed/RUNBOOK-hulumi-k8s.md` once these decisions are accepted. This doc commits to the shape; the runbook commits to the sequencing.

## Scope of the K8s surface

**In scope.** Components that any team running production workloads on EKS would re-derive, where the right-default value is non-obvious or where a packaged abstraction collapses ≥3 hand-written resources into one declaration:

- Helm release wrapping with hardened defaults
- EKS subnet tagging for ALB Controller auto-discovery
- Service mesh foundation (Istio v1 — see [Decision: mesh choice](#decision-mesh-choice))
- Bundled mesh HTTP entrypoints (ingress + gateway + virtualservice + authz)
- Database-credential extraction from AWS Secrets Manager into K8s `Secret`
- Build-time credential bundles (GitHub App installation tokens; design extends to other OAuth-app-token-style fetches)

**Out of scope.** Cluster-shape decisions belong to the consumer:

- Cluster provisioning (`@pulumi/eks` `Cluster` is sufficient and battle-tested; we do not wrap it)
- Node-group / Karpenter / Fargate-profile shape (cluster-specific)
- CNI plugin choice (AWS VPC CNI vs Cilium vs Calico — we accept whatever's installed)
- Workload sidecars beyond Istio (OTEL collectors, log agents — application-specific)
- Application-level network policies (workload-specific)
- IRSA / service-account → IAM-role binding helpers (out-of-scope; consumers use `aws.iam.OpenIdConnectProvider` + `aws.iam.Role` directly, OR depend on a separate community helper. Rationale: IRSA is a clean primitive; wrapping it adds little)

The line we draw: **Hulumi K8s components codify _security_ + _stability_ defaults that have right answers; cluster topology + workload shape stay in consumer hands.**

## Decision: package layout

**Decision.** Ship the K8s surface as a separate package: `@hulumi/k8s-baseline`. Not `@hulumi/baseline/k8s`.

**Why.**

- Peer-deps differ. AWS-account users today install `@pulumi/aws` + `@pulumi/github`. K8s users add `@pulumi/kubernetes` (~50 MB unpacked) and optionally `@pulumi/eks`. Pulling all of that into `@hulumi/baseline` taxes consumers who don't run K8s.
- Version cadence differs. Kubernetes / Istio version skew turns on a 4–6 month cycle; AWS API surface barely moves. Independent versioning lets `@hulumi/k8s-baseline` track upstream more aggressively without forcing a `@hulumi/baseline` bump.
- The multi-package precedent already exists: `@hulumi/baseline`, `@hulumi/policies`, `@hulumi/drift`. Adding a fourth is consistent.
- Threat-model separation: K8s components have a different trust boundary set (cluster API server, kubelet, CNI) than account-level AWS components. A separate package simplifies the threat-model doc per package.

**Cross-package contracts.**

- `@hulumi/k8s-baseline` may import _types_ from `@hulumi/baseline` (e.g., the `Tier` enum), but never depend on it for runtime resources. This keeps consumers free to install one without the other.
- Outputs that need to flow K8s → AWS (e.g., a `KubernetesSecretFromAwsSecretsManager` referencing a Secrets Manager ARN from the AWS side) travel via plain Pulumi `Output<string>` — no shared module state.

## Decision: `HardenedHelmRelease` wrapper

**Decision.** Build a thin `HardenedHelmRelease` ComponentResource wrapping `@pulumi/kubernetes` `helm.v3.Release`. Every Hulumi K8s component that installs a Helm chart goes through this wrapper.

**Why a wrapper instead of using `helm.v3.Release` directly.** Five universal policies any IaC user rebuilds:

| Policy                                                               | Pulumi default            | Hulumi default                                              |
| -------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------- |
| Release name                                                         | adds 8-char random suffix | uses ComponentResource instance name verbatim ([#44])       |
| Chart version                                                        | optional                  | required (no `latest`, no missing — refuse construction)    |
| `wait` for ready                                                     | `true` with 5 min timeout | `true`, with chart-class-aware timeout (Istio: 8 min)       |
| `repositoryOpts.repo`                                                | optional                  | required (no implicit fallback to current `helm repo` list) |
| Fargate-exclusion `nodeAffinity` injection on charts with DaemonSets | none                      | opt-in via `daemonSet: true` arg ([#42])                    |

[#44]: https://github.com/kerberosmansour/hulumi/issues/44
[#42]: https://github.com/kerberosmansour/hulumi/issues/42

**Why not magic-detect DaemonSet presence in the chart.** Considered and rejected. Post-rendering Helm charts to detect DaemonSets is fragile (charts that conditionally render DaemonSets on a value flag would mis-detect); a known-chart catalog drifts. Explicit `daemonSet: true` is one extra line per release and is correct by construction.

**API shape (proposed).**

```ts
new k8sBaseline.HardenedHelmRelease("istio-cni", {
  chart: "cni",
  version: "1.24.2", // required
  namespace: "kube-system",
  repository: "https://istio-release.storage.googleapis.com/charts", // required
  values: { cni: { cniBinDir: "/opt/cni/bin" } },
  daemonSet: true, // injects Fargate-exclusion affinity
  excludeFargate: true, // opt-out via false; defaults true when daemonSet=true, ignored when daemonSet=false
  waitTimeoutMs: 480_000, // Istio chart class default; explicit override always allowed
});
```

The wrapper returns the same outputs as `helm.v3.Release` (name, namespace, status) so it's a drop-in replacement.

**Generalization beyond Sunlit.** Every team using `@pulumi/kubernetes` re-implements at least the name-stability and version-pin policies. The Fargate-affinity is EKS-specific but the wrapper degrades cleanly on non-Fargate clusters (the affinity selector simply matches every node).

## Decision: stable release names default

**Decision.** `HardenedHelmRelease.name` (the Helm release name visible to `kubectl get hr`) defaults to the ComponentResource instance name. Override via explicit `releaseName` arg. The Pulumi default of "always add a random suffix" is wrong for IaC where reproducibility across destroy/recreate is the whole point.

**Trade-off acknowledged.** Two `HardenedHelmRelease` instances with the same instance name in the same namespace will collide on `helm install` — Pulumi's diagnostic surfaces this clearly at preview time. This is a feature: collisions surface at IaC review, not as production drift.

**Migration path for existing suffixed releases.** Adopting Hulumi for a stack that already has `istio-ingressgateway-3dfc1766` requires a `pulumi replace` (delete + create). For stateful workloads this means a maintenance window. The cookbook for the cutover lives at `docs/cookbooks/k8s-helm-release-rename.md` (TBD; sized as a v1.x cookbook deliverable, not a blocker for shipping the wrapper).

## Decision: `EksSubnetTagger`

**Decision.** Ship `EksSubnetTagger` as a standalone helper, not a wrapper around `awsx.ec2.Vpc`. Takes existing subnet IDs + a cluster name + a role.

**Why standalone.** awsx `Vpc` is one of three common VPC-creation patterns (the others: hand-rolled `aws.ec2.Vpc`, AWS-supplied via Control Tower / Landing Zone). Tying the tagger to awsx forks the user base unnecessarily. The tagger reads existing subnets via `aws.ec2.getSubnets` filters and writes tags via `aws.ec2.Tag`.

**API shape (proposed).**

```ts
new k8sBaseline.EksSubnetTagger("alb-discovery", {
  clusterName: "production",
  publicSubnetIds: vpc.publicSubnetIds, // tagged kubernetes.io/role/elb=1
  privateSubnetIds: vpc.privateSubnetIds, // tagged kubernetes.io/role/internal-elb=1
  ownership: "shared", // or "owned"; controls kubernetes.io/cluster/<name>=<value>
});
```

If a consumer only has private subnets (cluster-internal workloads only), `publicSubnetIds` is omitted. If they have a single subnet per role, that's fine — the component takes a list, not a fixed count.

**Generalization beyond Sunlit.** Every EKS+ALB user hits this. The AWS Load Balancer Controller's auto-discovery is documented to require these tags but doesn't ship a tag-writer. Production teams who started without the tags pay it later.

## Decision: mesh choice — Istio first, mesh-agnostic API where it costs nothing

**Decision.** Ship `IstioFoundation` as the concrete mesh component. Do NOT pretend the API is mesh-agnostic at v1 — Linkerd's Helm install shape, sidecar-injection model, and authz primitives differ enough that a real mesh-agnostic API would be a leaky abstraction ("if mesh is Istio, set `pilot.cni.enabled=true`; if Linkerd, …").

**Why Istio first, not Linkerd or Cilium service mesh.**

- Istio is the documented PSA-baseline interop path with a known cure (the istio-cni install pattern). Linkerd's PSA-baseline story relies on its proxy-init-less mode, which has its own version-skew gotchas; the patterns aren't transferrable.
- Istio has the largest installed base on EKS by ~5×; the abstraction "pays back" sooner.
- The Sunlit consumer (and most enterprise consumers we'd expect to hit) are on Istio.

**What "mesh-agnostic where it costs nothing" means.** The `MeshedHttpEntrypoint` API takes a `mesh: MeshFoundation` ref, not an `istioFoundation`. If a `LinkerdFoundation` lands later, it satisfies the same ref shape. The internal _resources_ emitted by the entrypoint differ (Istio's `Gateway` + `VirtualService` vs Linkerd's `Server` + `HTTPRoute`), but the consumer-facing args are stable.

**Out of scope at v1.** Cilium service mesh, App Mesh (deprecated), Consul Connect. Ship Istio; revisit when there's a second concrete consumer.

**API shape (proposed).**

```ts
const mesh = new k8sBaseline.IstioFoundation("mesh", {
  version: "1.24.2", // applied uniformly to istiod, istio-cni, ingressgateway
  excludeFargate: true,
  ingressGateway: {
    enabled: true,
    serviceType: "ClusterIP", // ALB targets the gateway via NodePort/IP; no LB on the gateway itself
  },
  cni: { enabled: true }, // PSA-baseline default; opt-out via false for legacy clusters
  defaultMTLS: "STRICT", // sets a cluster-wide PeerAuthentication
});
```

`mesh.ingressGateway` is consumed by `MeshedHttpEntrypoint`; `mesh.istiodReleaseName` and `mesh.cniReleaseName` are exposed for advanced consumers who want to chain `dependsOn` from custom resources.

**Generalization beyond Sunlit.** The PSA-baseline + Istio interop is a documented pattern; every regulated EKS user hits it. The Fargate-exclusion is EKS-specific, the rest is portable to GKE/AKS.

## Decision: `MeshedHttpEntrypoint` — ALB-first

**Decision.** Ship `AlbMeshedHttpEntrypoint` as the concrete v1 component. Do NOT generalize to "any-ingress" at v1. NLB / Cloudflare Tunnel / raw NodePort are valid but each has its own health-check + scheme + target-type quirks.

**Why ALB first.**

- ALB is the EKS-default Layer-7 ingress; the AWS Load Balancer Controller is the canonical install path.
- The four-resource bundle (ALB Ingress + Istio `Gateway` + `VirtualService` + `AuthorizationPolicy`) is exactly what every team rebuilds. Three of the four resources are mesh-side, not load-balancer-side, so the abstraction value is in the wiring, not the LB type.
- The ALB-specific bits (`alb.ingress.kubernetes.io/healthcheck-port: 15021`, `healthcheck-path: /healthz/ready`, `target-type: ip`, `scheme`, `group.name`) are well-understood and stable across ALB Controller versions.

**API shape (proposed).**

```ts
new k8sBaseline.AlbMeshedHttpEntrypoint("platform-api-entry", {
  mesh: meshFoundation,
  host: "platform-api.example.internal",
  serviceRef: { namespace: "production", name: "platform-api", port: 9090 },
  scheme: "internal", // or "internet-facing"
  mTLS: "STRICT", // workload-namespace PeerAuthentication; falls back to mesh.defaultMTLS if omitted
  authorizationPolicy: {
    allowFromGateway: true, // emits AuthorizationPolicy with from.principals matching gateway SA
    extraPrincipals: [], // additional SPIFFE IDs allowed
  },
  alb: {
    healthcheckPath: "/healthz/ready", // gateway-native; override only when bypassing the gateway
    healthcheckPort: 15021,
    groupName: "default",
  },
});
```

The `from.principals` linkage to the gateway SA is computed automatically from `mesh.ingressGatewayServiceAccountName` — this is the bug that took ~90 min in the M7 evidence log; the abstraction collapses it to a one-line ref.

**What stays user-controlled.** Host, service ref, mTLS mode, additional principals, ALB group name, ALB scheme. All of these legitimately differ across deployments; the component opinionates on the wiring, not the policy.

**Generalization beyond Sunlit.** Sunlit's deployment hits this on platform-api alone; every multi-service mesh deployment rebuilds it per service. The bundle is universal.

## Decision: `KubernetesSecretFromAwsSecretsManager` (foundation) + `RdsCredentialSecret` (convenience)

**Decision.** Ship two layers:

1. **`KubernetesSecretFromAwsSecretsManager`** — the generic foundation. Takes a Secrets Manager ARN, a JSON-key → K8s-secret-key mapping, a target namespace, and a target name. Drops a `kubernetes.core.v1.Secret` with the extracted values.
2. **`RdsCredentialSecret`** — the convenience layer that wraps the foundation with the standard RDS auto-managed-master JSON shape (`username`, `password`, `engine`, `host`, `port`).

**Why two layers.** The RDS-specific shape is documented and stable, but consumers extract Secrets Manager values for many reasons beyond RDS (third-party API keys, ElastiCache AUTH tokens, opaque DSNs from `manage_master_user_password=true` on Aurora / DocumentDB / Neptune). The generic foundation is reusable; the convenience layer keeps the common case ergonomic.

**Decision on extraction mechanism.** Ship as a `pulumi.dynamic.Resource` that reads the Secrets Manager value at apply time and writes the K8s Secret directly. Considered alternatives:

| Option                         | Verdict         | Reason                                                                                                                                                                      |
| ------------------------------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pulumi.dynamic.Resource`      | **chosen**      | Extracted value lives in encrypted Pulumi state; rotation handled by re-running `pulumi up` with `pulumi.secret()` semantics. Clean trust boundary.                         |
| In-cluster Job with IRSA + TTL | rejected for v1 | Cluster-coupled; failure modes (Job can't pull image, IRSA misconfigured, TTL expires before cluster ready) are noisy. Worth revisiting if SM-CSI-driver maturity warrants. |
| AWS Secrets Manager CSI driver | rejected for v1 | Adds cluster-wide infra dependency; many regulated clusters reject community CSI drivers. Re-evaluate when SOC2 / FedRAMP attestations land for the driver.                 |
| Helm post-renderer pattern     | rejected        | Coupling secret extraction to Helm-time rendering complicates rotation and breaks the "secret value never on disk" property.                                                |

**Trust boundary documented.** The Secrets Manager value transits Pulumi state in encrypted form (per Pulumi's standard secret handling). Consumers who require the value never to leave AWS-managed infra should choose the CSI driver instead — Hulumi will not install the CSI driver on their behalf at v1.

**API shape (proposed).**

```ts
new k8sBaseline.RdsCredentialSecret("platform-api-db", {
  rdsManagedMasterCredentialArn: rds.masterUserSecret.secretArn,
  namespace: "production",
  secretName: "platform-api-rds",
  // Default extraction emits: username, password, host, port, engine.
  // Override via `keyMapping` when the consumer wants a non-standard shape.
});

new k8sBaseline.KubernetesSecretFromAwsSecretsManager("oncall-pagerduty-key", {
  secretsManagerArn: pagerDutyKeyArn,
  keyMapping: { routing_key: "PAGERDUTY_ROUTING_KEY" }, // SM key → K8s data key
  namespace: "production",
  secretName: "pagerduty-creds",
});
```

**Generalization beyond Sunlit.** The RDS JSON-blob extraction is a documented AWS pattern. Aurora / DocumentDB / Neptune all use the same shape. Outside RDS, the Secrets-Manager-to-K8s-Secret pattern is a recurring need for any team running stateless workloads on EKS that consume third-party API credentials.

## Decision: `GitHubAppCredential` — generic build-time credential bundle

**Decision.** Ship `GitHubAppCredential` as a focused component for GitHub-App-issued installation tokens (the dominant build-time-credential pattern for private GitHub deps). Do not over-generalize to "any OAuth-app credential" at v1 — the JWT-mint flow is GitHub-specific (RS256 with a specific claim shape, `installations` discovery endpoint, scoped permissions). Other build-time credential needs (GHCR PAT, npm registry tokens, generic OAuth-client credentials) get their own focused components when consumer demand arrives.

**Decision on shipped scripts.** Yes, ship `populate.sh` and `mint.sh` as user-facing executable artifacts under `packages/k8s-baseline/scripts/`. Precedent: `scripts/exact-pin-guard.mjs`, `scripts/license-boundary-lint.mjs` are repo-internal; the new ones are user-facing. The package's `files` field in `package.json` includes `scripts/` so the artifacts ship with the npm tarball.

**Why not bake the JWT-mint into Pulumi's apply-time logic.** Considered. Two reasons it stays as a script:

- Token mint runs at _build_ time (inside `docker build` with the BuildKit secret-mount pattern), not Pulumi-up time. Pulumi-up has no access to the build context.
- The mint script doubles as a CI-step primitive that consumers script around. Embedding it in a Pulumi resource hides it from those consumers.

The component _provisions_ the Secrets Manager container, IAM read-policy, and KMS-key alignment. The scripts _use_ what was provisioned.

**API shape (proposed).**

```ts
const cred = new k8sBaseline.GitHubAppCredential("private-deps-reader", {
  repos: ["myorg/private-libs"], // OR "*" for all installation repos
  permissions: { contents: "read" }, // GitHub App permission shape
  kmsKeyAlias: accountFoundation.kmsKeyAliases.secrets, // align with AccountFoundation outputs
});
// Outputs:
//   cred.secretArn       — Secrets Manager ARN
//   cred.iamReadPolicyArn — Attach to BuildKit's IAM principal
//   cred.populateScriptPath — path within node_modules; consumer runs `bash $path <APP_ID> <PEM>`
//   cred.mintScriptPath    — path within node_modules; consumer runs in CI to emit a token to stdout
```

**Generalization beyond Sunlit.** Sunlit hit this for `cargo fetch` against a private GitHub repo. The same pattern applies to: `npm install` against private packages on GitHub Packages, `go mod download` against `GOPRIVATE` modules, `pip install` from a private GitHub repo, any Docker-build-time-private-fetch flow. The component is private-GitHub-specific; the script is reusable across all of those build flows.

## Cross-cutting policy: PSA-baseline as the security default

**Decision.** Every namespace Hulumi K8s components create defaults to:

```yaml
pod-security.kubernetes.io/enforce: baseline
pod-security.kubernetes.io/enforce-version: latest
```

Override via explicit `podSecurity: "privileged" | "restricted"` arg on namespace-creating components (today: `IstioFoundation`'s `istio-system`; tomorrow: any other K8s component that creates namespaces). `restricted` is supported but not the default — it breaks too many third-party charts to be ergonomic at v1.

**Why baseline, not restricted.** `baseline` is the realistic floor for production workloads on EKS today. `restricted` requires every workload (and most third-party operators) to declare seccompProfiles, drop ALL caps, set `runAsNonRoot: true`, etc. That work is real but belongs in workload-shape decisions consumers make per-app. Hulumi won't refuse to create a `restricted` namespace, but the default is `baseline`.

**Why this is a cross-cutting decision, not a per-component flag.** Every component the K8s surface ships interacts with PSA. Picking a default once means the Istio install (#39 / #45) doesn't need to repeat the discussion, and `MeshedHttpEntrypoint` (#41) inherits the same expectation.

## Cross-cutting policy: version-pin discipline

**Decision.** Every Hulumi K8s component that takes a `version` arg requires it. No `latest`, no fallback, no "Hulumi picks for you." Hulumi maintains a tested-versions table in `packages/k8s-baseline/COMPATIBILITY.md` and refuses construction with a `?` warning (not an error) when the consumer pins to a version Hulumi has not tested.

**Why a warning, not an error.** Forcing the consumer to a tested version is too strict — Istio releases monthly; Hulumi's CI cadence will not keep pace. The warning surfaces the risk; the consumer accepts it. The compatibility table is a living artifact of "what Hulumi has actually exercised" — it does not gate adoption of newer versions.

**Same policy for chart repositories.** `repository: "..."` is required on every Helm-using component. No implicit fallback to the consumer's local `helm repo` list.

## Out of scope at v1 (explicit)

To prevent scope creep during implementation:

- **Cluster provisioning.** Use `@pulumi/eks` `Cluster` directly. Wrapping it would re-litigate node-group / Karpenter / Fargate decisions that legitimately differ per consumer.
- **CNI plugin choice.** AWS VPC CNI / Cilium / Calico / Weave are all valid. Hulumi K8s components install on top of whatever's there.
- **Network policies.** Workload-specific. Out of scope.
- **Ingress alternatives** (NLB, Cloudflare Tunnel, NodePort, traefik, nginx-ingress). ALB only at v1; revisit on consumer demand with a second concrete deployment as evidence.
- **Mesh alternatives** (Linkerd, Cilium service mesh, App Mesh, Consul). Istio only at v1.
- **IRSA helpers.** `aws.iam.OpenIdConnectProvider` + `aws.iam.Role` is a clean primitive; wrapping adds little.
- **Database engines beyond standard RDS / Aurora.** Generic SM-extraction works for any JSON-shaped credential; `RdsCredentialSecret` convenience is RDS / Aurora / DocumentDB / Neptune (same JSON shape).
- **Build-time credentials beyond GitHub Apps.** Demand-driven; ship when a second concrete consumer hits a non-GitHub case.

## Sequencing (when this doc is accepted)

The runbook should sequence implementation roughly as:

1. **M1 — package skeleton + `HardenedHelmRelease` + `EksSubnetTagger`.** Smallest pieces; no Istio dependency; validates the package boundary, the wrapper API, and the cross-package contract with `@hulumi/baseline`. Closes [#38] and the cross-cutting [#44]. Issue [#42] half-closes (Fargate-affinity arg lands on the wrapper; the auto-detection path stays an opt-in).
2. **M2 — `IstioFoundation`.** Closes [#39]. Carries the version-pin policy and the PSA-baseline default into a real consumer.
3. **M3 — `AlbMeshedHttpEntrypoint`.** Closes [#41]. Depends on M2's mesh ref shape.
4. **M4 — `KubernetesSecretFromAwsSecretsManager` + `RdsCredentialSecret`.** Closes [#40]. Independent of M2/M3; can run parallel if capacity allows.
5. **M5 — `GitHubAppCredential` + shipped scripts.** Closes [#43]. Independent track; lowest dependency footprint.

[#38]: https://github.com/kerberosmansour/hulumi/issues/38
[#39]: https://github.com/kerberosmansour/hulumi/issues/39
[#40]: https://github.com/kerberosmansour/hulumi/issues/40
[#41]: https://github.com/kerberosmansour/hulumi/issues/41
[#43]: https://github.com/kerberosmansour/hulumi/issues/43

Each milestone ships with: BDD tests, an integration test against a sandbox EKS cluster (gated behind the existing `HULUMI_INTEGRATION=1` flag), a cookbook, and a threat-model section update.

## Open questions

These are the calls that still want a sign-off before the runbook commits:

- **Q1 — Cluster integration tests.** Sandbox EKS clusters cost $0.10/hr per cluster + compute. The existing weekly-integration workflow runs in `us-east-1`; can it tolerate a 30-minute EKS spin-up + tear-down per run? Alternative: run K8s integration tests via [kind](https://kind.sigs.k8s.io/) in CI, with a quarterly real-EKS gate. Bias: kind in CI + quarterly EKS gate.
- **Q2 — Helm release name collision policy.** When two `HardenedHelmRelease` instances would collide on `helm install` (same instance name, same namespace), should the second one fail at preview time or override? Bias: fail at preview; collisions surface at IaC review.
- **Q3 — Compatibility-table format.** `COMPATIBILITY.md` as a markdown table vs a typed TS const that the wrapper imports? Bias: typed TS const; the warning becomes a real lint, not a doc string.
- **Q4 — Where does `IstioFoundation`'s ingress-gateway live.** Same release as istiod (`istio-system`), separate release in a dedicated namespace (`istio-ingress`)? Both are documented Istio patterns. Bias: separate namespace — easier to scope `NetworkPolicy` and audit RBAC at the gateway boundary.
- **Q5 — Is `RdsCredentialSecret` worth its own component, or is it a docstring on the generic foundation?** Bias: yes, it's worth it — the convenience layer is one line of consumer code vs. five-key plumbing.

## See also

- [issue #38 — EKS subnet tagging](https://github.com/kerberosmansour/hulumi/issues/38)
- [issue #39 — hardened Istio install](https://github.com/kerberosmansour/hulumi/issues/39)
- [issue #40 — `SecureRds` credential extraction](https://github.com/kerberosmansour/hulumi/issues/40)
- [issue #41 — `MeshedHttpEntrypoint` bundle](https://github.com/kerberosmansour/hulumi/issues/41)
- [issue #42 — DaemonSet Fargate-exclusion affinity](https://github.com/kerberosmansour/hulumi/issues/42)
- [issue #43 — `GitHubAppCredential` bundle](https://github.com/kerberosmansour/hulumi/issues/43)
- [issue #44 — Helm release-name suffix default](https://github.com/kerberosmansour/hulumi/issues/44)
- [issue #45 — PSA-baseline + Istio cookbook (shipped)](../cookbooks/psa-baseline-istio-sidecar.md)
- [`docs/issue-candidates.md` § Kubernetes / EKS surface candidates](../issue-candidates.md#kubernetes--eks-surface-candidates-filed-2026-04-26-from-a-real-world-sg-unified-m7-deployment) — per-issue triage and recommended sequencing
- [`docs/slo/runbook-milestones/hulumi-github-v1.1-deferrals.md`](../runbook-milestones/hulumi-github-v1.1-deferrals.md) — companion deferral doc shape on the GitHub side; the K8s deferrals doc forks from this template once the runbook lands.
