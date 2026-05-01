# Completion Summary — hulumi-k8s-security Milestone 3

## Goal completed

Three CrossGuard PolicyPacks under `@hulumi/policies/k8s` block unsafe K8s workloads, RBAC, services, and EKS cluster settings at Pulumi preview time. Each pack inspects raw `kubernetes.*` and `aws:eks/cluster:Cluster` resources without requiring consumers to adopt Hulumi components. 10 rules total, with consistent suppression discipline (suppressions without a non-empty `reason` are ignored).

## Files changed

### Added (source)
- `packages/policies/src/k8s/hulumi-hardening-pack.ts` — workload + Service rules + pack metadata.
- `packages/policies/src/k8s/rbac-pack.ts` — RBAC rules + pack metadata.
- `packages/policies/src/k8s/eks-cluster-pack.ts` — EKS cluster rules + pack metadata.
- `packages/policies/src/k8s/packs/hulumi-k8s-hardening.ts` — `PolicyPack` entry point.
- `packages/policies/src/k8s/packs/hulumi-k8s-rbac.ts` — `PolicyPack` entry point.
- `packages/policies/src/k8s/packs/hulumi-eks-cluster.ts` — `PolicyPack` entry point.

### Added (tests)
- `packages/policies/tests/k8s/hulumi-k8s-hardening-pack.test.ts` — 20 tests across 5 BDD scenarios.
- `packages/policies/tests/k8s/rbac-pack.test.ts` — 8 tests across 3 BDD scenarios + suppression/reason invariant.
- `packages/policies/tests/k8s/eks-cluster-pack.test.ts` — 7 tests across 2 BDD scenarios.
- `packages/policies/tests/k8s/policy-pack-runtime.test.ts` — 2 E2E scenarios: synthetic unsafe stack fires every rule; synthetic hardened stack fires zero violations.

### Added (docs)
- `docs/slo/lessons/hulumi-k8s-security-m3.md` — lessons file.
- `docs/slo/completion/hulumi-k8s-security-m3.md` — this file.

### Modified
- `packages/policies/src/index.ts` — re-exports K8s rule handlers + metadata.
- `docs/components/README.md` — adds K8s policy packs section above the K8s components section.
- `docs/cookbooks/policy-pack-rollout.md` — adds K8s/EKS rollout section with phased Day 0 / 7 / 14 cadence.

## Tests added

37 new tests; all pass. K8s/EKS rules total 10:

| Rule ID            | What it blocks                                                                     |
| ------------------ | ---------------------------------------------------------------------------------- |
| `HULUMI-K8S-WL-1`  | Containers with `securityContext.privileged: true`                                 |
| `HULUMI-K8S-WL-2`  | Pods with `hostNetwork: true`, `hostPID: true`, or `hostIPC: true`                 |
| `HULUMI-K8S-WL-3`  | Mutable image tags (`:latest`, no tag, `:edge`)                                    |
| `HULUMI-K8S-WL-4`  | Containers without `resources.requests` and/or `resources.limits` (advisory)       |
| `HULUMI-K8S-SVC-1` | `Service` of type `LoadBalancer` without `hulumi.dev/public-justification`         |
| `HULUMI-K8S-RBAC-1`| `(Cluster)Role.rules.verbs: ["*"]`                                                 |
| `HULUMI-K8S-RBAC-2`| `(Cluster)Role` granting `list` / `watch` / `*` on `secrets` in core API group    |
| `HULUMI-K8S-RBAC-3`| `(Cluster)RoleBinding` whose `roleRef.name === "cluster-admin"`                    |
| `HULUMI-EKS-CL-1`  | `aws:eks/cluster:Cluster` with `endpointPublicAccess: true` and `0.0.0.0/0` CIDR   |
| `HULUMI-EKS-CL-2`  | `aws:eks/cluster:Cluster` whose `enabledClusterLogTypes` does not include `audit`  |

## Runtime validations added

- `policy-pack-runtime.test.ts > k8s_pack_reports_expected_violations` — synthetic unsafe stack fires every one of the 10 rules.
- `policy-pack-runtime.test.ts > k8s_pack_allows_hardened_stack` — synthetic hardened stack emits zero violations.

## Static analysis and formatter evidence

| Check | Command | Result |
|---|---|---|
| Format | `npx prettier --write <files>` | clean (auto-applied) |
| Typecheck | `pnpm -r typecheck` | green across 10 projects |
| Build | `pnpm -r build` | green |
| Lint | `pnpm -r lint` | green |
| License boundary | `pnpm -w run lint:license-boundary` | OK |
| Exact-pin guard | `pnpm -w run lint:exact-pin-guard` | OK |
| Full tests | `pnpm -r test` | 67 baseline / **96** policies (+37) / 54 drift / 102 k8s-baseline / 28 skill-bdd / 4 example smoke |

## Compatibility checks performed

- Existing AWS `HulumiHardeningPack` and `CisV5Pack` exports unchanged — verified by the still-passing 46 AWS policy tests.
- Existing GitHub `HulumiGithubHardeningPack` and `CisGithubV1Pack` exports unchanged — verified by the still-passing 13 GitHub policy tests.
- New K8s exports namespaced under their own pack metadata (`hulumi-k8s-hardening-pack`, `hulumi-k8s-rbac-pack`, `hulumi-eks-cluster-pack`) — no collisions.
- One-PolicyPack-per-process discipline preserved — each new pack has its own entry point under `src/k8s/packs/`.
- `Suppression` API pattern reused: same shape, same `matchSuppression` helper.

## Invariants/assertions added

- Suppression with empty / whitespace-only `reason` is silently ignored across all 10 rules (M3 invariant).
- WL-1 inspects both `containers` and `initContainers`.
- WL-2 reports each of `hostNetwork`, `hostPID`, `hostIPC` independently.
- WL-3 distinguishes `host:port/image` (no tag) from `image:tag`.
- SVC-1 only fires on `Service.spec.type === "LoadBalancer"`.
- RBAC-2 only fires when `apiGroups` includes `""` (core) or `"*"` (any).
- EKS-CL-1 treats unset `publicAccessCidrs` as the unsafe default.

## Resource bounds added or verified

- `POD_OWNING_TYPES` finite Set (7 entries).
- `ROLE_TYPES` and `BINDING_TYPES` finite Sets (2 each).
- One pass per resource per rule. No persistent state.

## Documentation updated

- `docs/components/README.md` — new "Kubernetes / EKS policy packs" section.
- `docs/cookbooks/policy-pack-rollout.md` — new "Rolling out the K8s / EKS packs" section with phased Day 0 / 7 / 14 cadence and suppression example.

## .gitignore changes

- None.

## Test artifact cleanup verified

- `git status --short` shows only intentional source / docs / test changes.

## Deferred follow-ups

- **Real-EKS validation** for `EKS-CL-1` and `EKS-CL-2` against live `aws eks describe-cluster` output — deferred to M5/M6 when an EKS sandbox is wired into CI.
- **Tier-aware promotion of `WL-4`** from advisory to mandatory — the runbook anticipates this; deferred until a tier config knob is plumbed end-to-end.
- **Documenting the trailing-`*`-only `urnScope` glob** in `docs/cookbooks/suppressions.md` — out of M3's allow-list; flag for the next docs sweep.
- **A test that loads each pack entry point in isolation** to validate the gRPC-per-process constraint — deferred (the existing AWS pack tests don't cover it either).

## Known non-blocking limitations

- Pre-existing 86-file format baseline persists; M3 only formatted files it touched.
- The `Errors 66 errors` line from M2's k8s-baseline test suite (FailClosedError unhandled-rejection noise) is unchanged — independent of M3 work.
