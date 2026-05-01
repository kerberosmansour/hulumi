# Lessons Learned — hulumi-k8s-security Milestone 6

## What changed

- **`EksAddonFoundation`** in `@hulumi/k8s-baseline` — emits one `aws.eks.Addon` per spec; refuses `latest`; refuses non-semver-shaped versions; bounded at 32 add-ons.
- **`planUpgrade()` + `reportToMarkdown()`** — pure library functions in `@hulumi/k8s-baseline`. One cluster per call. Verdict matrix: `safe | degraded | unsafe`. Gates on support status, version skew (no skipping minors), downgrade refusal, backup preflight, and per-add-on K8s-target compatibility.
- **`KubernetesApiAdapter`** in `@hulumi/drift` — drift signal from a live K8s API server (live-vs-desired digest comparison). Uses `p-timeout` (the existing probe pattern) so the no-shell-exec lint stays clean. Returns a degraded signal (`detected: false, ok: false, data.degraded: true`) on timeout.
- **Two new threat-model scenarios**: `eks-cluster-baseline` and `eks-runtime-and-backup`. Both registered via `skills/hulumi-threat-model/scripts/list-scenarios.mjs`. Skill BDD test updated to assert 11 scenarios in declared order (5 AWS + 4 GitHub + 2 K8s).

## Design decisions and why

- **`EksUpgradePlanner` as a pure function, not a `ComponentResource`** — the planner doesn't emit Pulumi resources. It produces a report. Wrapping it in a ComponentResource would force consumers to invoke it inside a Pulumi program; a pure function lets it run in CI scripts, kubectl wrappers, or pre-flight checks without Pulumi state.
- **`EksSupportStatus` discriminated union** — `"standard" | "extended" | "unsupported" | "unknown"`. Same Carmack-rule-4.5 pattern as M2's `failureMode` and M5's `EksComputeMode`. The `unknown` value is the explicit "we don't know" path that yields `degraded`, not `safe`.
- **Reused `p-timeout` from `packages/drift/src/probe.ts` for `KubernetesApiAdapter`** — instead of inventing a new `setTimeout`-based wrapper, used the same shape that the CloudTrail probe already uses. Keeps the no-shell-exec lint passing and the timeout semantics consistent across adapters.
- **Two threat-model scenarios, not one** — `eks-cluster-baseline` covers the M3/M4 controls (RBAC, NetworkPolicy, EKS endpoint, audit logging); `eks-runtime-and-backup` covers the M5 controls (GuardDuty Fargate caveat, vault lock, recovery-point deletion). Splitting them lets consumers run focused threat-modeling sessions.
- **Did NOT ship a `helm-history` adapter** — the runbook anticipates one, but the M6 BDD contract is satisfied by a single `KubernetesApiAdapter` plus the bounded-probe scenario. `helm-history` can be a separate milestone or a follow-up PR.

## Mistakes made

- Initial `KubernetesApiAdapter` used a hand-rolled `setTimeout` wrapper. The drift package's `tests/no-shell-exec.test.ts` flagged it. Switched to `p-timeout` (already a dep) and the lint passed.
- Test `tooMany` arrays needed explicit `Array<{...}>` annotations under `noImplicitAny`. Same gotcha as M5's backup test.

## Invariants/assertions added

- `EksAddonFoundation`: version must match exact semver-ish regex; `latest` rejected.
- `planUpgrade`: skipping minor versions ⇒ unsafe; downgrade ⇒ unsafe; missing recent backup ⇒ unsafe.
- `KubernetesApiAdapter`: `probeTimeoutMs > 0` required; bounded by `p-timeout`.
- Skill scenarios list is asserted as exact 11-element order in `tests/skill-bdd/hulumi-threat-model.test.ts`.

## Resource bounds

- `MAX_EKS_ADDONS = 32`.
- `MAX_UPGRADE_PLANNER_ADDONS = 32` (one cluster per call).
- `KubernetesApiAdapter.probeTimeoutMs` consumer-supplied; required > 0.

## Test patterns

- BDD-as-truth-table for the upgrade planner: each verdict gate gets its own scenario; the report `reasons` array is the assertion target.
- Adapter timeout test asserts elapsed time `< 500ms` for a 50ms timeout — bounded probe fires on time.

## Carry-forward

- A future `helm-history` adapter would reuse the same `p-timeout` pattern and the `KubernetesApiSnapshot` shape.
- The two threat-model scenarios serve as templates for any future K8s/EKS scenarios; the schema is fixed by the existing skill-bdd tests.
- The `planUpgrade()` function is callable from a CI step (e.g. `node -e "import('./dist').then(m => console.log(m.reportToMarkdown(m.planUpgrade(...))))"`); a small `eks-upgrade-check.mjs` wrapper script could be a useful follow-up.
