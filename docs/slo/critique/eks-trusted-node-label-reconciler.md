# Critique — trusted EKS node-label reconciler M1

Mode: degraded for machine-readable threat-model consumption because the frozen
schema resource referenced by the installed SLO skill is unavailable. Abuse IDs
are read from the Markdown threat model and no JSON ID-stability claim is made.

| id | persona | category | runbook section | finding | concrete scenario | recommendation / resolution |
|---|---|---|---|---|---|---|
| C-CEO-1 | CEO | reduce-scope | Milestone tracker | Shipping runtime/IAM/image work with the first kernel would make a security boundary hard to review. | A large PR passes mocked tests while the actual trust decision and cloud authority cannot be assessed separately. | Resolved in plan: M1 remains pure and unexported; M2/M3 retain runtime and live outcomes. |
| C-ENG-1 | Engineering lead | ask | BDD-4 | Resource-version tests alone do not bind a plan to the same cloud identity. | A Node keeps its object identity while its provider ID changes during replacement bookkeeping, and a stale verdict patches it. | Accepted autonomously under the user's continue instruction: bind provider ID in the plan and JSON Patch tests. |
| C-ENG-2 | Engineering lead | ask | BDD-8 | Fresh individual responses can still be combined across a long reconcile interval. | An old ASG response and a new EC2 response agree by chance after membership changes. | Accepted: require each timestamp to be fresh/not future and cap maximum evidence skew. |
| C-SEC-1 | Security | ask | BDD-3 | Duplicate membership is an authenticity ambiguity (CWE-345/CWE-362). | Eventual-consistency snapshots list one instance in both old and new ASGs; first-match logic silently authorizes it. | Accepted: require exactly one membership across exact EKS-reported ASGs and deny duplicates. Variant: foreign, missing and duplicate membership all get distinct tests. |
| C-SEC-2 | Security | ask | BDD-5 | Noop before attestation would preserve a forged protected label (CWE-269). | An attacker preloads the expected value on a foreign Node and the reconciler skips all cloud checks. | Accepted: full attestation precedes both `noop` and `patch`. |
| C-DESIGN-1 | Design | defer | Entire runbook | N/A — no UI or human interaction surface in M1. | No operator flow is introduced. | M2/M3 must document operator status, alarms and recovery guidance. |

No unresolved scope finding remains for M1. The accepted asks are part of its BDD
and implementation contract; runtime authority still requires a separately
authored and reviewed M2 contract.
