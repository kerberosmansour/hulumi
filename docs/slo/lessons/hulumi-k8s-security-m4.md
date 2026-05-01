# Lessons Learned — hulumi-k8s-security Milestone 4

## What changed

- New `NamespaceFoundation` component in `@hulumi/k8s-baseline` emits a hardened K8s `Namespace`, locks down the default `ServiceAccount` token automount, and emits the four foundational NetworkPolicy resources: default-deny (Ingress + Egress), allow-dns-egress (CoreDNS), deny-imds-egress (`0.0.0.0/0` except `169.254.169.254/32`), and an opt-in allow-mesh-egress.
- Pod Security Admission default: `enforce: baseline` and `audit: restricted` / `warn: restricted`. Consumers see what `restricted` would catch even when only `baseline` is enforced.
- Bounds encoded: 32 namespace labels, 32 quota entries, 128 network-policy peers (recommended ≤ 32).
- 17 BDD scenarios across happy paths, network defaults, invalid input refusals, and outputs lock.

## Design decisions and why

- **Audit/warn defaults to `restricted` even when `enforce` is `baseline`** — gives platform teams a passive view of what tightening to `restricted` would break, without breaking deploys.
- **`automountServiceAccountToken: false` on the default SA** — the historical K8s default of `true` is the most common privilege-escalation foothold in compromised pods. Workloads that need API access bind their own SA explicitly. Typed escape hatch: `defaultServiceAccountAutomount: "required"`.
- **IMDS deny via `egress.to.ipBlock` with `except`** — instead of a deny rule (NetworkPolicy doesn't have one), the allow-egress-to-everything-except-IMDS pattern. This works only because the namespace also has the default-deny baseline; the IMDS policy is additive.
- **`hulumi.dev/cni-caveat` annotation on the IMDS-deny policy** — reusing the M2/M3 audit-annotation namespace. Operators reading `kubectl describe networkpolicy` see the CNI-dependency warning inline.
- **`allowMeshEgress` is opt-in, not on by default** — most application namespaces don't talk to a mesh gateway directly; the default keeps the namespace airtight. Consumers using `IstioFoundation` + `AlbMeshedHttpEntrypoint` flip the flag.
- **PsaLevel union type** — discriminated `"privileged" | "baseline" | "restricted"`, validated at construction. Same Carmack-rule-4.5 pattern as M2's `failureMode`.

## Assumptions verified

- The mock-runtime test setup correctly handles `kubernetes:core/v1:Namespace`, `kubernetes:core/v1:ServiceAccount`, `kubernetes:networking.k8s.io/v1:NetworkPolicy`, `kubernetes:core/v1:ResourceQuota`, `kubernetes:core/v1:LimitRange`. All emit registrations the BDD tests can assert against.
- Pulumi's `LimitRangeItem` type requires `type` to be present; the args spread had to use conditional spreading instead of mutating `Record<string, unknown>` to satisfy `tsc`.
- Default `restricted` audit/warn is operator-friendly but doesn't break PSA: `audit` and `warn` levels are independent of `enforce`.

## Mistakes made / typecheck friction

- `NamespaceFoundationLimitRange` unused-import — `noUnusedLocals` caught it.
- Initial `Record<string, unknown>` literal for `LimitRangeItem` array clashed with Pulumi's nominal type; switched to conditional-spread literals.
- First test pass expected `audit: restricted` while the impl defaulted to `baseline`. Required differentiating the audit/warn default from the enforce default in `validatePsa`.

## Invariants/assertions added

- Empty `name`, `/`, `..` rejected.
- Invalid `podSecurity` / `podSecurityAuditAndWarn` rejected.
- `quota.hard` non-empty.
- `allowMeshEgress: true` requires `meshIngressNamespace`.
- 32 label / 32 quota / 128 peer bounds.

## Resource bounds

- `MAX_NAMESPACE_LABELS = 32`.
- `MAX_QUOTA_ENTRIES = 32`.
- `MAX_NETWORK_POLICY_PEERS = 128` (`RECOMMENDED_NETWORK_POLICY_PEERS = 32`).

## Test patterns

- Reused the existing mock-runtime helpers (`registrations`, `resetRegistrations`, `settlePulumi`, `valueOf`). No new infra.
- Findhelper functions per resource type (`namespaces()`, `networkPolicies()`, `findNetPolicyByName()`, `serviceAccounts()`).

## Carry-forward to M5/M6

1. The `hulumi.dev/cni-caveat` annotation pattern is the right place for "operator MUST see this caveat" metadata. Reuse for M5's runtime-detection Fargate caveat.
2. The PsaLevel discriminated-union approach generalizes cleanly to "EKS support status" (M6: `standard | extended | unsupported | unknown`).
3. NetworkPolicy peer bounds match the runbook §4.4 contract; M5/M6 should adhere to the same `MAX_*` constant pattern.
