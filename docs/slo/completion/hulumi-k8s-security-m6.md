# Completion Summary — hulumi-k8s-security Milestone 6

## Goal completed

EKS upgrade safety, exact-pinned add-on management, K8s drift signaling, and threat-modeling expansion all exist:

- `EksAddonFoundation` rejects `latest` and non-exact versions; bounds at 32 add-ons.
- `planUpgrade()` + `reportToMarkdown()` produce a structured upgrade report (`safe | degraded | unsafe`) keyed off support status, version skew, backup evidence, and per-add-on compatibility. One cluster per call.
- `KubernetesApiAdapter` provides drift signals via live-vs-desired snapshot comparison with a bounded `p-timeout` probe.
- Two new threat-model scenarios — `eks-cluster-baseline` and `eks-runtime-and-backup` — registered with the skill scenario lister and asserted by the skill-bdd suite.

## Files changed

### Added (source)

- `packages/k8s-baseline/src/eks-addon-foundation.{args,outputs,ts}.ts`.
- `packages/k8s-baseline/src/eks-upgrade-planner.ts`.
- `packages/drift/src/adapters/kubernetes-api.ts`.
- `skills/hulumi-threat-model/scenarios/eks-cluster-baseline.json`.
- `skills/hulumi-threat-model/scenarios/eks-runtime-and-backup.json`.

### Added (tests)

- `packages/k8s-baseline/tests/eks-addon-foundation.test.ts` — 4 BDD scenarios.
- `packages/k8s-baseline/tests/eks-upgrade-planner.test.ts` — 9 BDD scenarios.
- `packages/drift/tests/k8s/kubernetes-api-adapter.test.ts` — 4 BDD scenarios.

### Added (docs)

- `docs/components/eks-addon-foundation.md`.
- `docs/components/eks-upgrade-planner.md`.
- `docs/slo/lessons/hulumi-k8s-security-m6.md`.
- `docs/slo/completion/hulumi-k8s-security-m6.md`.

### Modified

- `packages/k8s-baseline/src/index.ts` — re-exports.
- `skills/hulumi-threat-model/scripts/list-scenarios.mjs` — appends two new IDs.
- `tests/skill-bdd/hulumi-threat-model.test.ts` — asserts 11-scenario lister.
- `docs/components/README.md` — two new rows.

## Tests added

17 new tests:

**EksAddonFoundation** (4): exact-pinned happy path; `"latest"` rejected; non-semver rejected; 33-addon bound rejected.

**EksUpgradePlanner** (9): safe path; unsupported target → unsafe; extended support → safe + warning; minor-version skip → unsafe; downgrade → unsafe; missing-backup → unsafe; incompatible add-on → unsafe; unknown target → degraded; 33-addon bound; markdown output shape.

**KubernetesApiAdapter** (4): matched digests → no drift; mismatched digests + `changedKinds` → drift detected; bounded probe timeout returns degraded within budget; `probeTimeoutMs <= 0` rejected.

## Static analysis evidence

| Check               | Result                                                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm -r typecheck` | green                                                                                                                                     |
| `pnpm -r build`     | green                                                                                                                                     |
| `pnpm -r lint`      | green                                                                                                                                     |
| license-boundary    | OK                                                                                                                                        |
| exact-pin-guard     | OK                                                                                                                                        |
| Full tests          | 67 baseline / 96 policies / **58** drift (+4) / **149** k8s-baseline (+15) / 28 skill-bdd (1 modified for 11 scenarios) / 4 example smoke |

## Compatibility checks

- Existing drift verdicts + adapters unchanged — verified by 54-test → 58-test diff (only additive).
- Existing skill scenarios still generate; the lister-order BDD asserts the new scenarios are appended at the end.
- Existing K8s components unaffected.
- No live-AWS / live-K8s dependency in unit tests.

## Invariants

- Add-on versions exact (regex-validated; `latest` rejected).
- One cluster per `planUpgrade()` call.
- `probeTimeoutMs > 0` on `KubernetesApiAdapter`.
- Drift adapter timeout returns degraded signal, not "no drift" (false-negative protection).
- Threat-model scenario lister returns exactly 11 IDs in the declared order.

## Resource bounds

- `MAX_EKS_ADDONS = 32`.
- `MAX_UPGRADE_PLANNER_ADDONS = 32`.
- Adapter probe budget consumer-controlled; required positive.

## Documentation updated

- `docs/components/eks-addon-foundation.md`, `docs/components/eks-upgrade-planner.md` (new).
- `docs/components/README.md` (two new rows).

## Deferred follow-ups

- **`helm-history` drift adapter** — the runbook anticipates it; M6 ships only the `kubernetes-api` adapter. The same `p-timeout` shape applies; follow-up PR.
- **Real-EKS integration** for `upgrade-planner.eks.test.ts` — deferred until EKS sandbox is in CI.
- **CLI wrapper script** for `planUpgrade` — a thin `scripts/eks-upgrade-check.mjs` would let consumers invoke the planner from CI without writing TypeScript glue.

## Known non-blocking limitations

- `KubernetesApiAdapter` defines a `liveSnapshot` / `desiredSnapshot` fetcher interface but does not provide a default fetcher implementation. Consumers must wire the actual `@kubernetes/client-node` or `kubectl get -o json` logic.
- `planUpgrade` consumes a pre-built inventory; it does not call `aws eks describe-cluster` itself. A wrapper that does is a follow-up.
