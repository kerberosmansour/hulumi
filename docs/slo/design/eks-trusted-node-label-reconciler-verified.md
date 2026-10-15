---
name: eks-trusted-node-label-reconciler
verified_at: 2026-10-15
tlc_bound: "one node/controller, MaxEpoch=2, label states=3, one outstanding plan"
tool: "TLA+ tools 1.8.0; TLC build 2026.09.04.170753"
---

# Verified Design — EKS trusted node-label reconciler

## System goal

Prevent a trusted-label controller from applying a verdict after its AWS
evidence expires, after the Node identity changes, or after another actor writes
a conflicting protected label.

## Abstract state

- `nodeEpoch`: the current UID/resourceVersion/provider-ID identity tuple.
- `label`: `Absent`, `Expected`, or `Conflict`.
- `evidenceFresh`: whether the current independent AWS attestation is usable.
- `planEpoch`: the identity captured by the outstanding plan, or no plan.
- `unsafeWrite`: history flag set by any application lacking current authority.
- `Hardened`: model switch used to demonstrate the naive failure before checking
  the corrected design.

## Actions

- `RefreshEvidence`, `PlanPatch`, `ExpireEvidence`.
- `ReplaceNode`, `WriteConflict`, `BumpResourceVersion`.
- `ApplyPatch`, `DiscardPlan`.

## Safety properties checked

- `TypeOK` — PASS at the declared bound.
- `NoUnsafeWrite` — PASS for hardened; the naive variant fails in five states.
- `ConflictCannotApply` — PASS; hardened application is disabled on conflict.
- `EnabledApplyIsCurrent` — PASS; every enabled hardened application has fresh
  evidence and an exact current identity epoch.

TLC generated 115 states, found 34 distinct states, exhausted the queue at depth
6 and reported no invariant violation. The verifier jar SHA-256 is
`b658b4e504fdf0b721caf7066320f6b6fe5805f4dd2f717d0e47baba4097205e`.

## Liveness properties checked (with fairness)

- N/A — this model is safety-only. It does not claim eventual reconciliation,
  so no fairness assumption is introduced.

## Simplifications from the real design

- UID, resourceVersion and provider ID are one epoch because the safety rule
  treats a change to any member identically: the plan must be discarded.
- Freshness summarizes EKS/ASG/EC2 completeness, age and skew. M1 tests the
  concrete decomposition; M2 adapters must preserve it.
- One Node represents per-Node safety. Shared rate limits, leader election and
  multi-node scheduling can affect availability but do not authorize a stale
  per-Node patch; they need separate runtime tests.
- Patch transport is atomic. Kubernetes JSON Patch `test` operations provide the
  real refinement; admission and integration tests must prove rejection on a
  failed test.

## Open questions

- The runtime retry/backoff and leader-election design needs bounded availability
  tests; no liveness proof exists.
- Local Zone and Wavelength provider-ID forms remain outside the policy until
  their identity semantics and live behavior are qualified.
- CloudWatch metric/alarm delivery and Kubernetes audit correlation require
  empirical failure injection rather than this state model.

## Evidence

- Spec/configs: `specs/EksTrustedNodeLabelReconciler*`.
- Counterexample and full TLC result:
  `specs/EksTrustedNodeLabelReconciler.trace.md`.
