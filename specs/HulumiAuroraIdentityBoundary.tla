---------------- MODULE HulumiAuroraIdentityBoundary ----------------
(*
Formal model of the Hulumi #255 brokered Aurora application-principal
boundary, as frozen by the merged threat model
`docs/threat-model-iam-least-privilege-20260728.md` at Hulumi main
f2669f729e8006c71fbf483bc2cd14df10e6e640.

WHAT THIS MODEL IS FOR

The reviewed boundary rests on one load-bearing claim: the serving
application runtime holds no database credential and has no Aurora or RDS
Proxy network path, and the migrator / broker identities are not
interchangeable with it. Everything downstream (PostgreSQL authority
allowlists, RLS, rotation) is unverifiable until that claim holds.

This spec exists to show that the claim is a property of the STRUCTURE and
not of operator discipline. Concretely it must reject the two designs a
reasonable engineer would otherwise ship:

  1. a boolean "validated" flag that a consumer may simply not read, and
  2. bootstrap ordering enforced by convention rather than by construction.

BOUNDS AND WHY THEY ARE ENOUGH

Identities are a fixed finite set. The interesting behaviour is not in
scaling the identity count but in the interleaving of credential
acquisition, validation and serving start, so the model is deliberately
small and exhaustive rather than large and sampled. Adding a fourth
workload identity does not produce a new class of interleaving: the
boundary is per-identity and the invariants quantify over the set.

FAIRNESS

Liveness is intentionally NOT claimed. A stuck bootstrap that never starts
serving is a safe outcome for this boundary; the milestone that owns
deployment wiring is responsible for progress. Modelling weak fairness here
would assert a liveness property this component cannot deliver on its own,
which would be a false claim rather than a stronger one.
*)

EXTENDS Naturals, FiniteSets

CONSTANTS
    Runtime,        \* the serving application workload identity
    Migrator,       \* schema-migration Job identity
    Broker,         \* SQL-mediating broker identity
    Deployer,       \* deployment-controller identity
    NaiveMode       \* TRUE selects the deliberately weak variant

Identities  == {Runtime, Migrator, Broker, Deployer}
Privileged  == {Migrator, Broker}

VARIABLES
    holdsDbCredential,   \* SUBSET Identities — who currently holds a DB credential
    assumed,             \* [Identities -> SUBSET Identities] — who has assumed whom
    validated,           \* SUBSET {"migrator", "broker", "admission", "effectiveAuth"}
    serving              \* BOOLEAN — has the serving workload started

vars == << holdsDbCredential, assumed, validated, serving >>

RequiredValidations == {"migrator", "broker", "admission", "effectiveAuth"}

TypeOK ==
    /\ holdsDbCredential \subseteq Identities
    /\ assumed \in [Identities -> SUBSET Identities]
    /\ validated \subseteq RequiredValidations
    /\ serving \in BOOLEAN

Init ==
    /\ holdsDbCredential = {}
    /\ assumed = [i \in Identities |-> {}]
    /\ validated = {}
    /\ serving = FALSE

(* --------------------------------------------------------------------
   ACTIONS
   -------------------------------------------------------------------- *)

\* A privileged identity acquires its bounded DB credential. Runtime is
\* structurally excluded from this action: there is no rule by which it can
\* ever enter holdsDbCredential. That exclusion is the whole point — it is
\* not a guard that an operator could relax, it is an absent transition.
AcquireCredential(i) ==
    /\ i \in Privileged
    /\ i \notin holdsDbCredential
    /\ holdsDbCredential' = holdsDbCredential \cup {i}
    /\ UNCHANGED << assumed, validated, serving >>

\* An identity attempts to assume another. Only the NAIVE variant permits a
\* non-privileged identity to reach a privileged one; the hardened variant
\* has no such transition, so interchangeability is unrepresentable rather
\* than merely disallowed.
AttemptAssume(i, j) ==
    /\ i /= j
    /\ NaiveMode
    /\ assumed' = [assumed EXCEPT ![i] = @ \cup {j}]
    /\ holdsDbCredential' =
         IF j \in holdsDbCredential THEN holdsDbCredential \cup {i}
         ELSE holdsDbCredential
    /\ UNCHANGED << validated, serving >>

RecordValidation(v) ==
    /\ v \in RequiredValidations
    /\ v \notin validated
    /\ validated' = validated \cup {v}
    /\ UNCHANGED << holdsDbCredential, assumed, serving >>

\* HARDENED: serving can only be constructed from the complete validated
\* aggregate. The enabling condition is the aggregate itself, so a partial
\* state cannot produce a serving workload.
StartServingHardened ==
    /\ ~NaiveMode
    /\ ~serving
    /\ validated = RequiredValidations
    /\ serving' = TRUE
    /\ UNCHANGED << holdsDbCredential, assumed, validated >>

\* NAIVE: serving starts from individual outputs, reading the flag only by
\* convention. This is the ignorable-boolean design the critique rejected;
\* it is modelled so TLC can produce the counterexample rather than us
\* asserting the design is bad.
StartServingNaive ==
    /\ NaiveMode
    /\ ~serving
    /\ serving' = TRUE
    /\ UNCHANGED << holdsDbCredential, assumed, validated >>

Next ==
    \/ \E i \in Identities : AcquireCredential(i)
    \/ \E i, j \in Identities : AttemptAssume(i, j)
    \/ \E v \in RequiredValidations : RecordValidation(v)
    \/ StartServingHardened
    \/ StartServingNaive

Spec == Init /\ [][Next]_vars

(* --------------------------------------------------------------------
   INVARIANTS — the three claims the boundary must actually make
   -------------------------------------------------------------------- *)

\* The serving runtime never holds a database credential, by any path,
\* including transitively through role assumption.
RuntimeNeverHoldsCredential ==
    Runtime \notin holdsDbCredential

\* No unprivileged identity ever obtains a privileged one. Deployer is
\* included deliberately: the deployment controller is a distinct identity
\* and must not be a back door.
IdentitiesNonInterchangeable ==
    \A i \in (Identities \ Privileged) :
        assumed[i] \cap Privileged = {}

\* Serving never exists alongside incomplete validation. Stated over the
\* whole aggregate, so a partially-validated boundary cannot serve.
NoServingBeforeValidated ==
    serving => (validated = RequiredValidations)

=============================================================================
