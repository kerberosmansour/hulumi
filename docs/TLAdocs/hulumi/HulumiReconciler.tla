---- MODULE HulumiReconciler ----
EXTENDS TLC

CONSTANTS Resources,
          Scoped,
          Singleton,
          EnoughEvidence,
          AlreadyDeleted,
          SingletonDeleteAllowed

States == {"Unknown", "Candidate", "Blocked", "Planned", "Executing", "Deleted", "Retained", "Failed"}
Modes == {"Plan", "Execute"}

VARIABLES status, mode

vars == <<status, mode>>

TypeOK ==
  /\ status \in [Resources -> States]
  /\ mode \in Modes
  /\ Scoped \subseteq Resources
  /\ Singleton \subseteq Resources
  /\ EnoughEvidence \subseteq Resources
  /\ AlreadyDeleted \subseteq Resources
  /\ SingletonDeleteAllowed \in BOOLEAN

Init ==
  /\ mode \in Modes
  /\ status = [r \in Resources |->
       IF r \in AlreadyDeleted THEN "Deleted" ELSE "Unknown"]

Discover(r) ==
  /\ status[r] = "Unknown"
  /\ status' = [status EXCEPT ![r] =
       IF r \in Scoped /\ r \in EnoughEvidence THEN "Candidate" ELSE "Blocked"]
  /\ UNCHANGED mode

PlanResource(r) ==
  /\ status[r] = "Candidate"
  /\ status' = [status EXCEPT ![r] = "Planned"]
  /\ UNCHANGED mode

RetainSingleton(r) ==
  /\ status[r] \in {"Candidate", "Planned"}
  /\ r \in Singleton
  /\ ~SingletonDeleteAllowed
  /\ status' = [status EXCEPT ![r] = "Retained"]
  /\ UNCHANGED mode

BeginExecute(r) ==
  /\ mode = "Execute"
  /\ status[r] = "Planned"
  /\ r \in Scoped
  /\ r \in EnoughEvidence
  /\ ~(r \in Singleton /\ ~SingletonDeleteAllowed)
  /\ status' = [status EXCEPT ![r] = "Executing"]
  /\ UNCHANGED mode

DeleteResource(r) ==
  /\ mode = "Execute"
  /\ status[r] = "Executing"
  /\ r \in Scoped
  /\ r \in EnoughEvidence
  /\ ~(r \in Singleton /\ ~SingletonDeleteAllowed)
  /\ status' = [status EXCEPT ![r] = "Deleted"]
  /\ UNCHANGED mode

FailResource(r) ==
  /\ status[r] = "Executing"
  /\ status' = [status EXCEPT ![r] = "Failed"]
  /\ UNCHANGED mode

RetryFailed(r) ==
  /\ status[r] = "Failed"
  /\ r \in Scoped
  /\ r \in EnoughEvidence
  /\ ~(r \in Singleton /\ ~SingletonDeleteAllowed)
  /\ status' = [status EXCEPT ![r] = "Planned"]
  /\ UNCHANGED mode

IdempotentAlreadyDeleted(r) ==
  /\ r \in AlreadyDeleted
  /\ status[r] = "Deleted"
  /\ UNCHANGED vars

Next ==
  \/ \E r \in Resources:
       \/ Discover(r)
       \/ PlanResource(r)
       \/ RetainSingleton(r)
       \/ BeginExecute(r)
       \/ DeleteResource(r)
       \/ FailResource(r)
       \/ RetryFailed(r)
       \/ IdempotentAlreadyDeleted(r)
  \/ UNCHANGED vars

Spec == Init /\ [][Next]_vars

DryRunCannotMutate ==
  mode = "Plan" =>
    \A r \in Resources:
      /\ status[r] # "Executing"
      /\ (r \notin AlreadyDeleted => status[r] # "Deleted")

ExecuteCannotDeleteBlocked ==
  \A r \in Resources:
    status[r] = "Blocked" => status[r] # "Deleted"

ExecuteCannotDeleteOutOfScope ==
  \A r \in Resources:
    status[r] = "Deleted" /\ r \notin AlreadyDeleted => r \in Scoped

ExecuteRequiresEvidence ==
  \A r \in Resources:
    status[r] = "Deleted" /\ r \notin AlreadyDeleted => r \in EnoughEvidence

RetainedSingletonNotDeleted ==
  \A r \in Singleton:
    ~SingletonDeleteAllowed => status[r] # "Deleted"

AlreadyDeletedStaysDeleted ==
  \A r \in AlreadyDeleted:
    status[r] = "Deleted"

====
