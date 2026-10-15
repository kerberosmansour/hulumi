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
| M2        | Deployable controller, IAM/RBAC/admission, audit and alarms                  | done (2026-10-15) | [Verification](slo/verify/eks-trusted-node-label-reconciler-m2.md), [lessons](slo/lessons/eks-trusted-node-label-reconciler-m2.md), [completion](slo/completion/eks-trusted-node-label-reconciler-m2.md). |
| M3        | Isolated EKS rolling/zero-capacity qualification and coordinated publication | proposed          | Ready to author after the M2 retrospective; live operator readiness remains a hard gate.                                                                                                                  |

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

The M2 prerequisite is now verified at the stated finite bound in
[`docs/slo/design/eks-trusted-node-label-reconciler-verified.md`](slo/design/eks-trusted-node-label-reconciler-verified.md).
The naive action relation fails after evidence expiry; the hardened relation
exhausts 34 distinct states with `NoUnsafeWrite`, conflict refusal and exact
current-plan enablement intact. This is a safety claim only; runtime liveness,
provider behavior and alarm delivery remain empirical M2/M3 obligations.

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

## M2 contract — deployable controller, authority boundary and observability

Status: confirmed for autonomous execution on 2026-10-15 under the operator's
standing instruction to continue the SLO milestones and publish when verified.

Completed: 2026-10-15.

### Goal

Ship a deployable `EksTrustedNodeLabelReconciler` component and controller
runtime that obtains bounded evidence from the real Kubernetes and AWS APIs,
passes only typed snapshots to the M1 kernel, applies only the kernel's exact
JSON Patch, and surrounds that mutation with least-privilege Pod Identity,
RBAC, fail-closed admission, structured audit decisions and actionable alarms.

M2 accepts an operator-built controller image only when its reference ends in an
exact `sha256` digest. It does not publish or recommend a base image: the three
candidate images examined for this milestone all had known vulnerabilities.
Image construction, registry provenance and live EKS qualification remain M3.

### Exact file allow-list

- `docs/RUNBOOK-eks-trusted-node-label-reconciler.md`
- `docs/slo/design/eks-trusted-node-label-reconciler-threat-model.md`
- `docs/slo/design/eks-trusted-node-label-reconciler-verified.md`
- `docs/slo/critique/eks-trusted-node-label-reconciler-m2.md`
- `specs/EksTrustedNodeLabelReconciler.tla`
- `specs/EksTrustedNodeLabelReconciler.cfg`
- `specs/EksTrustedNodeLabelReconcilerInit.cfg`
- `specs/EksTrustedNodeLabelReconcilerNaive.cfg`
- `specs/EksTrustedNodeLabelReconciler.trace.md`
- `packages/k8s-baseline/package.json`
- `pnpm-lock.yaml`
- `packages/k8s-baseline/src/trusted-node-label-reconciler.args.ts`
- `packages/k8s-baseline/src/trusted-node-label-reconciler.outputs.ts`
- `packages/k8s-baseline/src/trusted-node-label-reconciler.ts`
- `packages/k8s-baseline/src/trusted-node-label-controller-aws.ts`
- `packages/k8s-baseline/src/trusted-node-label-controller-kubernetes.ts`
- `packages/k8s-baseline/src/trusted-node-label-controller.ts`
- `packages/k8s-baseline/src/trusted-node-label-controller-main.ts`
- `packages/k8s-baseline/src/index.ts`
- `packages/k8s-baseline/tests/trusted-node-label-reconciler.test.ts`
- `packages/k8s-baseline/tests/trusted-node-label-controller.test.ts`
- `packages/k8s-baseline/tests/trusted-node-label-runtime-boundary.test.ts`
- `packages/k8s-baseline/README.md`
- `docs/components/eks-trusted-node-label-reconciler.md`
- `docs/components/README.md`
- `docs/slo/verify/eks-trusted-node-label-reconciler-m2.md`
- `docs/slo/lessons/eks-trusted-node-label-reconciler-m2.md`
- `docs/slo/completion/eks-trusted-node-label-reconciler-m2.md`

### Files to read before changing anything

- `docs/slo/lessons/eks-trusted-node-label-reconciler-m1.md`
- `SECURITY.md`
- `packages/k8s-baseline/src/trusted-node-label-reconciler-core.ts`
- `packages/k8s-baseline/src/eks-cluster-foundation.ts`
- `packages/k8s-baseline/src/eks-runtime-detection-foundation.ts`
- `packages/platform-patterns/src/workload-capability-issuer-boundary.ts`

### Exemplar and anti-exemplar

- Copy Pod Identity composition from `eks-cluster-foundation.ts`, alarm shape
  from `eks-runtime-detection-foundation.ts`, and fail-closed CEL plus restricted
  Pod envelopes from `workload-capability-issuer-boundary.ts`.
- Do not copy the infrastructure-only terminal deny used by inactive platform
  patterns; this controller is active, so its admission policy must permit only
  the exact controller mutation and preserve every other Node field.
- Do not add `@kubernetes/client-node`: the controller uses Node's built-in HTTPS
  client with an explicit projected Kubernetes token and cluster CA, avoiding a
  high-authority dependency graph for four bounded API operations.
- Do not embed an image build recipe or mutable image tag in M2.

### Data classification and proactive controls

Internal: Node UID/resourceVersion/provider ID, instance, ASG, cluster and
node-group identifiers, plus stable decision reason codes. Credentials and raw
AWS/Kubernetes responses are Restricted and must never be logged.

Controls in play: OWASP Proactive Controls 2024 C1 access control, C3 input
validation, C9 security logging/monitoring and C10 exceptional-condition
handling; NIST 800-53 AC-3, AC-6, AU-2, AU-12, CM-6 and SI-4. Construction
defaults are exact digest inputs, dedicated Pod Identity, read-only AWS calls,
minimal Node RBAC, cluster-wide admission on the protected key, bounded
pagination/retries, TLS with the projected cluster CA, no credential or response
logging, and optimistic patch preconditions from the M1 kernel.

### Secure Value & Security Contract

**Value wedge.** An operator can declaratively deploy one bounded reconciler for
one EKS managed node group and recover the protected scheduling/identity label
after replacement without granting the kubelet, controller or another actor a
general Node mutation path.

**Operator readiness.** `safe_to_continue_without_blockers: true` for M2's
local/component proof. The pinned TLA+ model must pass; the admitted exact lock
must have zero OSV/MAL findings; the component tests use Pulumi mocks and local
fake HTTPS/AWS adapters; no cloud credential, registry write or cluster mutation
is needed. Live EKS, CloudWatch delivery and registry provenance are explicitly
degraded/deferred to M3 and cannot be claimed by M2.

**Threat summary.** The authoritative rows are
`tm-eks-node-label-reconciler-abuse-1` through `-9` in the Markdown threat model.
No machine-readable companion exists, so critique operates in documented
degraded mode and makes no stable-schema claim.

**Security test bundles.** A: strict environment/config and API-response shape;
B: Pod Identity, IAM, RBAC and admission identity; C: stale plan/delete-recreate
and concurrent conflicts; D: digest pin, OSV, provenance and graph diff; E:
structured audit/metric redaction; F: exact patch and failure injection across
the runtime boundary.

**Detected Work Ledger.** Every execution finding must end as `fix_now`,
`file_github_issue`, `operator_action`, `upstream_feedback`, or `accepted_risk`.
M2 starts with: vulnerable candidate base images → `fix_now` by omitting the
image recipe and enforcing a digest input; physical registry/EKS evidence →
`operator_action`, owned by M3; Local Zone/Wavelength provider IDs →
`file_github_issue` only if the parent issue no longer tracks them, otherwise
retain under parent #305.

### Measurement contract

The runtime emits bounded `ReconcileDecision`, `ReconcileFailure` and
`MissingTrustedLabel` metrics in one configured CloudWatch namespace, with only
cluster and node-group dimensions. Structured logs carry a timestamp, action,
stable reason and a one-way hash of the Node UID; they exclude tokens, headers,
raw provider responses and mutable label maps. Repository maintainers own the
guardrails. M3 reads alarms and audit records during rolling and scale-from-zero
qualification; M2 proves exact metric/log construction and alarm resources.

### Outcome Validation Contract

- Outcome scenario `oc-eks-node-label-reconciler-1`: a fresh managed Node with
  an absent protected label traverses Kubernetes read, EKS/ASG/EC2 attestation,
  the M1 decision kernel and Kubernetes JSON Patch; the receiver observes the
  exact UID/resourceVersion/provider-ID tests plus one label addition.
- Critical journey `cuj-eks-node-label-reconciler-1`: render the component,
  confirm dedicated identity/RBAC/admission/deployment/alarms, run one full local
  controller cycle through the real adapter code, then observe a successful
  patch decision and zero leaked credentials.
- Per-layer front-to-end: Pulumi resource rendering `applicable`; Kubernetes
  HTTPS adapter `applicable`; AWS SDK adapter `applicable`; M1 kernel
  `applicable`; real EKS scheduling and CloudWatch delivery
  `not_applicable (M3 operator-gated live proof)`. The cross-layer assertion is
  the adapter-to-kernel-to-HTTP-patch journey, not an isolated mock return.
- Core regressions: M1 forged evidence `pass`; conflict refusal `pass`; stale
  plan `pass`; rolling ASG membership `pass`; zero capacity `pass`; existing
  package API/tests `pass`; Local Zone/Wavelength `not_applicable (unsupported
by explicit policy)`.

### BDD acceptance scenarios

| ID       | Given / when                                                                                                                                               | Then                                                                                                                                                                                 |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BDD-M2-1 | Exact fresh Kubernetes, EKS, ASG and EC2 responses identify one eligible Node.                                                                             | One controller cycle reaches the M1 kernel and sends only its exact JSON Patch (`oc-eks-node-label-reconciler-1`).                                                                   |
| BDD-M2-2 | EKS/ASG/EC2 throttles, omits a requested item, duplicates membership, returns malformed data, exceeds a page/node bound or presents stale/skewed evidence. | The cycle fails closed, patches nothing, emits a bounded failure decision and remains retryable.                                                                                     |
| BDD-M2-3 | The Node changes UID/resourceVersion/provider ID or gains a conflicting protected label after attestation.                                                 | The API test/admission rejects the write; the controller discards the plan and re-attests on a later bounded cycle (`tm-eks-node-label-reconciler-abuse-3`, `-4`).                   |
| BDD-M2-4 | The component is rendered with a mutable image, invalid label, mismatched account/region, unbounded interval or unsupported configuration.                 | Construction throws before registering the privileged resources.                                                                                                                     |
| BDD-M2-5 | The component renders successfully.                                                                                                                        | IAM has only EKS/ASG/EC2 reads plus scoped metric publication; RBAC is only Node get/list/patch; the protected-label admission rule fails closed and binds the exact ServiceAccount. |
| BDD-M2-6 | Another principal changes the protected label, or the controller changes any other Node field/value.                                                       | The CEL policy denies the request (`tm-eks-node-label-reconciler-abuse-6`).                                                                                                          |
| BDD-M2-7 | Logs/metrics are emitted after success, deny, provider failure and patch conflict.                                                                         | Output is bounded to stable codes/dimensions and contains no bearer token, credential header or raw provider response (`tm-eks-node-label-reconciler-abuse-8`).                      |
| BDD-M2-8 | The TLA+ naive and hardened configurations are run at the recorded bound.                                                                                  | Naive reaches the stale-evidence counterexample and hardened exhausts the state space with all four invariants intact.                                                               |

### Compatibility

- Existing component inputs and resource tokens do not change.
- `EksTrustedNodeLabelReconciler` is additive and exported from
  `@hulumi/k8s-baseline`; controller internals do not become a general patch API.
- Four exact `@aws-sdk/*` 3.1149.0 clients are the only dependency additions.
  The admitted lock graph adds seven package identities and no install scripts.
- Node.js remains `>=22.12.0`; CommonJS output and current Pulumi peer ranges
  remain unchanged.

### AI tolerance contract

N/A — no AI component.

### Forbidden shortcuts

- No caller-supplied AWS snapshots at the runnable entry point.
- No trust in ordinary Node labels beyond bounded candidate selection and
  cross-checking; no success on partial/paginated provider evidence.
- No cluster-admin, secrets access, watch permission, AWS write action or
  wildcard Kubernetes verb/resource.
- No controller bypass around the M1 kernel or mutation beyond its patch.
- No admission rule that trusts RBAC alone or lets the controller change a
  protected label value, overwrite a conflict, or alter another Node field.
- No mutable image, unscanned dependency, lifecycle script, fabricated audit,
  severity threshold, MAL waiver, vulnerable base-image recipe or M3 claim.

### Evidence log

| Evidence              | Expected                                                                                                                      | Actual result                                                                                                                                                                                                                             | Status         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Repo hygiene          | Task branch based on merged M1; only allow-listed work present.                                                               | Branch `slo/eks-node-label-reconciler-m2` at `f6ad230`; M2 TLA/runbook work only.                                                                                                                                                         | pass           |
| Baseline              | Existing package tests, typecheck, lint and build pass before new dependency installation.                                    | Existing `@hulumi/k8s-baseline`: 18 files / 232 tests; package typecheck, lint and build passed before dependency-backed implementation tests.                                                                                            | pass           |
| Formal verification   | Recorded naive counterexample and hardened invariant pass at the exact bound.                                                 | Naive failed `NoUnsafeWrite`; hardened exhausted 34 distinct states / 115 generated, depth 6, all four invariants passed.                                                                                                                 | pass           |
| Dependency admission  | Exact candidate lock resolved with scripts disabled; full OSV/MAL and provenance/graph review pass before install/build/test. | Candidate 3.1149.0 graph: seven additions, zero removals, zero OSV/MAL; lock SHA-256 `dd6339dbc7dc0ad241642a86cec6f1f63308a5852d667ef53bb86f11e07596b6`.                                                                                  | pass           |
| Image admission       | No known-vulnerable image recipe enters M2.                                                                                   | Rejected Node/Alpine 3.22 (97), Node/Alpine 3.23 (13), and distroless Debian 13 (31) Trivy findings; component requires caller-supplied digest.                                                                                           | pass           |
| Red tests             | Every BDD/outcome path fails for missing production behavior before implementation.                                           | Initial red run had three explicit missing-public-behavior failures; final review added two red fail-closed regressions for extra EC2 evidence and ObjectMeta piggyback mutation before their fixes.                                      | pass           |
| Focused/runtime tests | Component and full adapter-to-kernel-to-patch journeys pass, including failure injection and redaction.                       | 3 focused files / 16 tests passed, including a real local TLS Kubernetes endpoint, projected token/CA files, AWS command objects, the M1 kernel and exact patch receiver.                                                                 | pass           |
| Regression            | Full package/repository tests, typecheck, lint, build and format pass.                                                        | `@hulumi/k8s-baseline`: 21 files / 248 tests; full workspace build, tests, typecheck, lint, exact-pin guard, workflow-governance lint and format check passed.                                                                            | pass           |
| Security              | Actual lock OSV/MAL, Semgrep, exact diff and Codex Security review are clean.                                                 | OSV 2.7.0: 2 lockfiles / 574 packages, 0 advisories and 0 `MAL-*`; seven integrity/provenance matches and zero install hooks; Semgrep 210 rules / 0 findings; secret-pattern scan clean; Codex Security Cloud open canonical findings: 0. | pass           |
| Live/cloud            | No live claim in M2; M3 owns registry/EKS/CloudWatch qualification.                                                           | `not_applicable` by milestone contract.                                                                                                                                                                                                   | not_applicable |

### Definition of done

- Every BDD and outcome row has production-path evidence.
- The admitted lock is reproduced exactly before any dependency-backed test,
  and the actual repository passes the pinned OSV/MAL gate.
- The component renders exact least-privilege IAM/RBAC/admission, a restricted
  one-replica workload with a digest image, and actionable alarms.
- The runnable path uses real adapter implementations, the M1 kernel and exact
  JSON Patch; provider/parse/pagination/concurrency failures patch nothing.
- Logs/metrics are bounded and credential-safe; the Detected Work Ledger has no
  undisposed row; all allow-listed docs and verification evidence are complete.

### Self-review gate

- Yes — M2 supplies deployable authority and runtime code while keeping image
  publication and live-cloud evidence in M3.
- Yes — the finite-state design directly constrains runtime apply behavior.
- Yes — dependency and image candidates fail closed before execution.
- Yes — value, abuse, measurement, compatibility and recovery limits are
  concrete and testable.
