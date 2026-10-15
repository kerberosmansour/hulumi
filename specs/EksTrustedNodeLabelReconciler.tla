---- MODULE EksTrustedNodeLabelReconciler ----
EXTENDS Integers, TLC

CONSTANTS MaxEpoch, Hardened

NoPlan == -1
Labels == {"Absent", "Expected", "Conflict"}

VARIABLES nodeEpoch,
          label,
          evidenceFresh,
          planEpoch,
          unsafeWrite

vars == <<nodeEpoch, label, evidenceFresh, planEpoch, unsafeWrite>>

TypeOK ==
  /\ MaxEpoch \in Nat
  /\ MaxEpoch > 0
  /\ Hardened \in BOOLEAN
  /\ nodeEpoch \in 0..MaxEpoch
  /\ label \in Labels
  /\ evidenceFresh \in BOOLEAN
  /\ planEpoch \in (0..MaxEpoch) \union {NoPlan}
  /\ unsafeWrite \in BOOLEAN

Init ==
  /\ nodeEpoch = 0
  /\ label = "Absent"
  /\ evidenceFresh = FALSE
  /\ planEpoch = NoPlan
  /\ unsafeWrite = FALSE

(* One reconcile-cycle fetch has independently attested the current identity. *)
RefreshEvidence ==
  /\ ~evidenceFresh
  /\ evidenceFresh' = TRUE
  /\ UNCHANGED <<nodeEpoch, label, planEpoch, unsafeWrite>>

(* Planning captures UID, resourceVersion and provider identity as one epoch. *)
PlanPatch ==
  /\ evidenceFresh
  /\ label = "Absent"
  /\ planEpoch' = nodeEpoch
  /\ UNCHANGED <<nodeEpoch, label, evidenceFresh, unsafeWrite>>

(* Provider evidence can expire while a plan is waiting to be applied. *)
ExpireEvidence ==
  /\ evidenceFresh
  /\ evidenceFresh' = FALSE
  /\ UNCHANGED <<nodeEpoch, label, planEpoch, unsafeWrite>>

(* Delete/recreate or provider-identity replacement resets the protected label. *)
ReplaceNode ==
  /\ nodeEpoch < MaxEpoch
  /\ nodeEpoch' = nodeEpoch + 1
  /\ label' = "Absent"
  /\ evidenceFresh' = FALSE
  /\ UNCHANGED <<planEpoch, unsafeWrite>>

(* A different actor writes a conflicting protected identity. *)
WriteConflict ==
  /\ nodeEpoch < MaxEpoch
  /\ label # "Conflict"
  /\ nodeEpoch' = nodeEpoch + 1
  /\ label' = "Conflict"
  /\ evidenceFresh' = FALSE
  /\ UNCHANGED <<planEpoch, unsafeWrite>>

(* Any unrelated Node update advances the resourceVersion identity epoch. *)
BumpResourceVersion ==
  /\ nodeEpoch < MaxEpoch
  /\ nodeEpoch' = nodeEpoch + 1
  /\ evidenceFresh' = FALSE
  /\ UNCHANGED <<label, planEpoch, unsafeWrite>>

SafeToApply ==
  /\ evidenceFresh
  /\ planEpoch = nodeEpoch
  /\ label = "Absent"

(*
 * Hardened models exact JSON Patch tests plus a fresh apply-time gate.
 * Naive models an implementation that applies any previously created plan.
 *)
ApplyPatch ==
  /\ planEpoch # NoPlan
  /\ IF Hardened THEN SafeToApply ELSE TRUE
  /\ label' = "Expected"
  /\ planEpoch' = NoPlan
  /\ unsafeWrite' = (unsafeWrite \/ ~SafeToApply)
  /\ UNCHANGED <<nodeEpoch, evidenceFresh>>

DiscardPlan ==
  /\ planEpoch # NoPlan
  /\ planEpoch' = NoPlan
  /\ UNCHANGED <<nodeEpoch, label, evidenceFresh, unsafeWrite>>

Next ==
  \/ RefreshEvidence
  \/ PlanPatch
  \/ ExpireEvidence
  \/ ReplaceNode
  \/ WriteConflict
  \/ BumpResourceVersion
  \/ ApplyPatch
  \/ DiscardPlan

InitSpec == Init /\ [][FALSE]_vars
Spec == Init /\ [][Next]_vars

(* Load-bearing safety property: no stale, expired or conflicting write occurs. *)
NoUnsafeWrite == ~unsafeWrite

(* A conflict is never overwritten by the hardened action relation. *)
ConflictCannotApply == Hardened /\ label = "Conflict" => ~ENABLED ApplyPatch

(* An outstanding plan can apply only to the exact current identity when hardened. *)
EnabledApplyIsCurrent == Hardened /\ ENABLED ApplyPatch => SafeToApply

====
