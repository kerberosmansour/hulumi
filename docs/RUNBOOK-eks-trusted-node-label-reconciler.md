---
runbook_version: 4
id: hulumi-eks-trusted-node-label-reconciler
prefix: eks-node-label-reconciler
issue: 305
stack: TypeScript 5.9, Vitest 4, Pulumi Kubernetes/AWS in later milestones
tla_required: true
kani_required: false
security_libs_required: true
ai_component: false
compliance: [nist-800-53]
---

# Trusted EKS node-label reconciler runbook

## Milestone tracker

| Milestone | Title                                                                        | Status            | Contract                                                                                                                                                                                                  |
| --------- | ---------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1        | Pure attestation and patch-planning kernel                                   | done (2026-10-15) | [Verification](slo/verify/eks-trusted-node-label-reconciler-m1.md), [lessons](slo/lessons/eks-trusted-node-label-reconciler-m1.md), [completion](slo/completion/eks-trusted-node-label-reconciler-m1.md). |
| M2        | Deployable controller, IAM/RBAC/admission, audit and alarms                  | proposed          | Author only after M1 retrospective.                                                                                                                                                                       |
| M3        | Isolated EKS rolling/zero-capacity qualification and coordinated publication | proposed          | Author only after M2 retrospective and operator readiness.                                                                                                                                                |

The runbook is intentionally authored one milestone at a time. M2 and M3 titles
reserve the outcome; they do not authorize their file scope or shortcuts.

## Stable red lines

- Kubelet-supplied metadata never authorizes a protected identity.
- The controller never receives cluster-admin and never gets write AWS actions.
- A conflicting protected label is a security finding, not an overwrite target.
- The patch mutates one configured NodeRestriction-protected label and tests the
  exact UID, resourceVersion and provider ID observed during attestation.
- Zero capacity is healthy only when the EKS node group's desired size is zero.
- No dependency, lockfile, cloud resource, registry artifact or public API changes
  in M1.

## Formal-verification decision

`tla_required: true`: kubelet/operator/controller changes and delete/recreate races
share Node state across processes. M2 must model attestation, conflict and patch
preconditions before runtime mutation is admitted. `kani_required: false`: this is
TypeScript with no Rust kernel.

## Secure value and security contract

M1 is security-relevant but not value-bearing: it produces an internal deterministic
kernel and no deployable user outcome. The value wedge is class elimination before
authority: prevent forged or stale node evidence from reaching a protected-label
mutation. Operator readiness for M1 is local and requires no credential. M2/M3 must
add the real operator gate, least-privilege authority, monitoring, rollback and live
outcome contract.

The threat model is
[`docs/slo/design/eks-trusted-node-label-reconciler-threat-model.md`](slo/design/eks-trusted-node-label-reconciler-threat-model.md).
Security bundles used in M1: input/shape abuse cases, identity and authorization
decision tests, concurrency preconditions, dependency graph preservation, and
regression/type/lint checks.

## M1 contract — pure attestation and patch-planning kernel

Completed: 2026-10-15.

### Goal

Create a deterministic, side-effect-free kernel that consumes bounded Node, EKS
node-group, Auto Scaling and EC2 snapshots and returns `deny`, `noop`, or an
optimistic-concurrency JSON Patch for exactly one protected label.

### Exact file allow-list

- `docs/RUNBOOK-eks-trusted-node-label-reconciler.md`
- `docs/slo/design/eks-trusted-node-label-reconciler-threat-model.md`
- `docs/slo/design/eks-trusted-node-label-reconciler-threat-model.slo.json`
- `docs/slo/critique/eks-trusted-node-label-reconciler.md`
- `packages/k8s-baseline/src/trusted-node-label-reconciler-core.ts`
- `packages/k8s-baseline/tests/trusted-node-label-reconciler-core.test.ts`
- `docs/slo/verify/eks-trusted-node-label-reconciler-m1.md`
- `docs/slo/lessons/eks-trusted-node-label-reconciler-m1.md`
- `docs/slo/completion/eks-trusted-node-label-reconciler-m1.md`

The JSON threat-model companion is optional in M1 because the referenced frozen
schema resource is unavailable in this environment; critique runs in documented
degraded mode and must not claim stable machine-readable abuse IDs.

### Exemplar and anti-exemplar

- Copy bounded validation and discriminated result shapes from
  `packages/k8s-baseline/src/eks-cluster-foundation.args.ts` and
  `packages/k8s-baseline/src/eks-upgrade-planner.ts`.
- Do not copy `EksClusterNodePoolArgs.labels` as a trust signal: those inputs are
  desired configuration, not independent runtime evidence.
- Do not create a Pulumi dynamic provider or mutate a live Node in M1.

### Data classification and controls

Internal: cluster/node-group/instance identifiers and Node metadata. No secret or
credential is accepted. Controls: strict format/length bounds, finite collections,
freshness/skew checks, exact allowlists, independent-source agreement, conflict
refusal, optimistic concurrency and least mutation.

### BDD acceptance scenarios

| ID    | Given / when                                                                                                             | Then                                                                                                                         |
| ----- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| BDD-1 | Fresh ACTIVE node-group, exact ASG membership, running EC2 identity, expected type/AZ/taints and absent protected label. | Return a patch whose only mutation is adding the configured label and whose tests bind UID, resourceVersion and provider ID. |
| BDD-2 | A kubelet forges ordinary EKS node-group/type labels but the instance is not in an EKS-reported ASG.                     | Deny with no patch (`tm-eks-node-label-reconciler-abuse-1`).                                                                 |
| BDD-3 | Instance membership is foreign, missing or ambiguous; account/region/AZ/type/state differs; expected taint is missing.   | Deny with a stable reason and no patch (`tm-eks-node-label-reconciler-abuse-2`).                                             |
| BDD-4 | UID, resourceVersion or provider ID changes between plan and apply.                                                      | Reject the stale plan; emitted JSON Patch also contains exact `test` operations (`tm-eks-node-label-reconciler-abuse-3`).    |
| BDD-5 | Protected label already has the expected value or a different value.                                                     | Return `noop` only after full attestation for the same value; deny every conflict (`tm-eks-node-label-reconciler-abuse-4`).  |
| BDD-6 | Node-group status is UPDATING with old/new allowed ASGs and the replacement joins exactly one.                           | Accept the replacement; reject an instance absent from both.                                                                 |
| BDD-7 | Desired size and observed node count are both zero, or desired size is nonzero with no nodes.                            | Classify the first as `zero_capacity` and the second as `awaiting_nodes` (`tm-eks-node-label-reconciler-abuse-5`).           |
| BDD-8 | AWS evidence is stale, future-dated, excessively skewed, malformed or exceeds input bounds.                              | Deny without throwing or producing a patch.                                                                                  |

### Compatibility

- No export is added from `@hulumi/k8s-baseline` in M1.
- Existing package tests, typecheck, lint, build and formatting remain green.
- `package.json`, `pnpm-lock.yaml` and every dependency identity stay unchanged.

### AI tolerance contract

N/A — no AI component.

### Measurement and outcome validation

N/A — M1 is not value-bearing and has no deployable front-to-end path. M3 must
define recovery-time and false-label guardrails plus real replacement and
scale-from-zero critical journeys.

### Forbidden shortcuts

- Trusting `eks.amazonaws.com/nodegroup`, instance-type or zone labels without AWS evidence.
- Treating any AWS API failure, missing record or stale record as an empty/healthy result.
- Matching an ASG, cluster, account or label by prefix/substring.
- Replacing a conflicting protected label.
- Omitting UID/resourceVersion/provider-ID patch tests.
- Adding a dependency, network adapter, controller image, public export or cloud mutation.

### Evidence log

| Evidence           | Expected                                                                         | Actual result                                                                                                                                        | Status       |
| ------------------ | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Baseline           | Existing `@hulumi/k8s-baseline` tests pass before implementation.                | 17 test files / 215 tests passed after exact-lock offline installation with lifecycle scripts disabled.                                              | pass         |
| Red tests          | Required abuse/concurrency/capacity scenarios fail before the kernel exists.     | Focused Vitest failed on the missing production module before implementation.                                                                        | pass         |
| Focused tests      | All M1 scenarios pass through production kernel functions.                       | 17/17 tests passed across BDD-1 through BDD-8.                                                                                                       | pass         |
| Package regression | Test, typecheck, lint, build and format checks pass.                             | 18 files / 232 tests passed; package typecheck, lint and build passed; repository format check passed.                                               | pass         |
| Dependency scope   | No manifest or lock diff; OSV admission not triggered.                           | No manifest/lock diff. Defensive re-scan used pinned OSV-Scanner 2.7.0: 2 lockfiles / 567 packages, 0 advisories and 0 `MAL-*`.                      | pass         |
| Codex Security     | No open canonical finding before implementation; review exact diff before merge. | Pre-implementation canonical query: zero open. Local exact-file Semgrep: 210 rules, zero findings. Post-PR Codex Security remains a ship/merge gate. | pass (local) |

### Definition of done

- Every BDD scenario has production-function evidence.
- Every changed path is on the allow-list and no dependency file changes.
- The kernel is deterministic, finite, side-effect-free and unexported.
- Verification and retrospective state M1's typed-snapshot trust boundary and M2 obligations.

### Self-review gate

- Yes — scope is one deterministic kernel, not an implied deployable controller.
- Yes — forbidden shortcuts name the principal trust and concurrency failures.
- Yes — abuse IDs map to concrete issue acceptance cases.
- Yes — M2/M3 authority and live evidence are explicitly outside M1.
