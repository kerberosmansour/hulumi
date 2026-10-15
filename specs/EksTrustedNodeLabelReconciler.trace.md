# Counterexample and verification trace — EKS trusted node-label reconciler

## Suitability and safety property

TLA+ is appropriate because the controller and the Kubernetes/AWS environment
can race between attestation, planning and patch application. The load-bearing
property is:

> A protected label is never added unless the plan still binds the current Node
> identity, the provider evidence is fresh, and the protected label is absent;
> a conflicting label is never overwritten.

UID, resourceVersion and provider ID are collapsed into one `nodeEpoch`. Any
change to one of those facts advances the epoch.

## Pinned verifier

- Skill pin: TLA+ tools 1.8.0.
- TLC-reported build: `2026.09.04.170753` (`b123b22`).
- `tla2tools.jar` SHA-256:
  `b658b4e504fdf0b721caf7066320f6b6fe5805f4dd2f717d0e47baba4097205e`.
- JVM: OpenJDK 25.0.2, 4 GiB TLC heap, one worker.

## Stage A — initialization

`EksTrustedNodeLabelReconcilerInit.cfg` checked the initial predicate before any
transition was admitted:

- 1 generated state.
- 1 distinct state.
- complete graph depth 1.
- `TypeOK` passed.

## Naive / pre-fix counterexample

Command:

```sh
cd specs
java -Xmx4g -jar "$HOME/.sldo/tla/tla2tools.jar" \
  EksTrustedNodeLabelReconciler.tla \
  -config EksTrustedNodeLabelReconcilerNaive.cfg
```

TLC exited 12 because `NoUnsafeWrite` was violated after 39 generated / 17
distinct states at depth 5. The minimal behavior was:

1. Initial: label absent, evidence not fresh, no plan, identity epoch 0.
2. `RefreshEvidence`: independent provider evidence becomes fresh.
3. `PlanPatch`: the controller binds a plan to identity epoch 0.
4. `ExpireEvidence`: the provider evidence expires before application.
5. Naive `ApplyPatch`: the label becomes expected even though
   `SafeToApply = FALSE`; `unsafeWrite` becomes true.

The same naive action relation also enables a stale plan after a Node identity
epoch change and allows a previously planned patch to overwrite a conflict.

## Design correction

The hardened `ApplyPatch` action is enabled only when all three conditions hold
at application time:

- evidence is still fresh;
- the plan epoch equals the current Node identity epoch;
- the protected label is still absent.

The implementation refines those abstract checks through bounded evidence age
and skew, exact UID/resourceVersion/provider-ID JSON Patch `test` operations,
and conflict refusal.

## Hardened verification

Command:

```sh
cd specs
java -Xmx4g -jar "$HOME/.sldo/tla/tla2tools.jar" \
  EksTrustedNodeLabelReconciler.tla \
  -config EksTrustedNodeLabelReconciler.cfg
```

Result:

- 115 states generated.
- 34 distinct states.
- 0 states left on the queue.
- complete graph depth 6.
- no invariant violation.
- optimistic fingerprint-collision probability `1.5E-16`.

Checked invariants:

- `TypeOK` — every variable remains within the declared finite domain.
- `NoUnsafeWrite` — no stale, expired or conflicting application occurs.
- `ConflictCannotApply` — a conflict disables the hardened apply action.
- `EnabledApplyIsCurrent` — every enabled hardened apply satisfies all current
  safety preconditions.

## Bound and exclusions

- One Node and one controller interacting with one stateful environment.
- `MaxEpoch = 2`: initial identity plus two observable identity/resource-version
  transitions.
- Three label states, two freshness states and at most one outstanding plan.
- Safety only. No liveness property or fairness assumption is claimed.
- AWS API pagination, backoff, credentials, process crashes, multi-replica leader
  election and alarm delivery are outside this model and require M2 tests.
- Multiple Nodes are symmetric independent instances until shared rate limits or
  leader election are introduced; those shared mechanisms are not covered here.

Generated `_TTrace_` exploration files are ignored scratch artifacts and are not
part of the evidence set.
