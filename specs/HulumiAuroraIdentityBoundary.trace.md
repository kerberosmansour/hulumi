# HulumiAuroraIdentityBoundary — TLC trace and verification record

Feature: Hulumi #255 brokered Aurora application-principal boundary.
Source authority: `docs/threat-model-iam-least-privilege-20260728.md` at
Hulumi main `f2669f729e8006c71fbf483bc2cd14df10e6e640`.

## Toolchain status — READ THIS FIRST

**The numbers in this file are DRAFTING-ONLY and are NOT admissible as
verified-design evidence.** They were produced on an **unpinned** jar
(`sha256 237332bd…`) while the `skills/slo-tla/tools.toml` pin
(`d5d07d5d…`) was unsatisfiable on the authoring host: the mutable release
URL for tag `v1.8.0` served a *third* distinct build
(`cc4803dc…`, `Implementation-Version 2.0 2026-07-18`) against a cache
holding `2.0 2026-05-26`, and the pin matched neither.

They are recorded anyway for one reason: to hand the verifier a spec that
**parses and discriminates**, rather than burning a pinned run on a syntax
error. The authoritative run is performed separately on the exact pinned
artifact, and its output replaces this section.

| Field | Drafting run | Authoritative run |
|---|---|---|
| jar sha256 | `237332bd…` (UNPINNED) | `d5d07d5d…` (pinned) |
| status | not admissible | pending |

## What is modelled

Three claims, chosen because each one is load-bearing for a *downstream*
milestone that cannot be verified until it holds:

| Invariant | Claim |
|---|---|
| `RuntimeNeverHoldsCredential` | the serving runtime never holds a DB credential by any path, including transitively |
| `IdentitiesNonInterchangeable` | no unprivileged identity ever obtains a privileged one — deployer included, since a deployment controller is a real back door |
| `NoServingBeforeValidated` | serving never coexists with incomplete validation, stated over the whole aggregate |

## Naive variant — designed to FAIL

A spec that only ever passes proves nothing about its own discriminating
power. `HulumiAuroraIdentityBoundaryNaive.cfg` sets `NaiveMode = TRUE`,
enabling exactly the two designs the `/slo-critique` pass rejected:

1. **`AttemptAssume`** — role assumption reachable by any identity.
2. **`StartServingNaive`** — serving constructed from individual outputs,
   with the validation flag read only by convention. This is the
   ignorable-`Output<boolean>` design; modelling it lets TLC produce the
   counterexample instead of us asserting the design is bad.

**Observed (drafting run):**

```
Error: Invariant IdentitiesNonInterchangeable is violated.
7 states generated, 7 distinct states found, 5 states left on queue.
```

The violation appears within 7 states — the counterexample is shallow,
which is the point: an unprivileged identity reaching a privileged one is
not an exotic interleaving, it is the second thing that can happen.

## Hardened variant — must PASS

`NaiveMode = FALSE` does not *guard* the weak transitions, it **removes
them**. There is no `AttemptAssume` rule at all, and serving is enabled
only by the complete validated aggregate. Interchangeability and premature
serving are therefore *unrepresentable*, not merely disallowed — which is
what "structurally impossible" has to mean to be worth claiming.

**Observed (drafting run):**

```
Model checking completed. No error has been found.
201 states generated, 68 distinct states found, 0 states left on queue.
```

`0 states left on queue` is the part that matters: the state space was
exhausted at these bounds, not sampled.

## Two honest limits

**`CHECK_DEADLOCK FALSE`, and why that is not a dodge.** This is a
safety-only model with a natural terminal state — once both privileged
identities hold their credential, all validations are recorded and serving
has started, nothing is enabled. TLC reports that as `Deadlock reached`.
The first hardened run did exactly this, with **no invariant violated**.
The alternative fix — adding a stuttering action purely to silence it —
would hide genuine deadlocks in any future revision, so the check is
disabled explicitly and the rationale is written into both `.cfg` files.

**Liveness is not claimed.** No fairness constraints are declared. A
bootstrap that never starts serving is a *safe* outcome for this boundary;
progress belongs to the milestone that owns deployment wiring. Asserting
weak fairness here would be a false claim dressed as a stronger one.

## Bounds

Four identities, two of them privileged; four validation gates. The
interesting behaviour is the interleaving of credential acquisition,
validation and serving start — not identity count. A fifth identity adds no
new class of interleaving, because the boundary is per-identity and the
invariants quantify over the set.
