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
| M3        | Isolated EKS rolling/zero-capacity qualification and coordinated publication | confirmed         | Confirmed on 2026-10-15 under the operator's standing instruction to continue autonomously and publish only after verified SLO evidence.                                                                  |

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

## M3 contract — qualified image, isolated EKS recovery and coordinated publication

Status: confirmed for autonomous repository execution on 2026-10-15 under the
operator's standing instruction to continue the SLO milestones and publish when
verified. Live AWS mutation and package publication remain separately gated by
the executable readiness and outcome checks below.

### Goal

Publish a provenance-attested, digest-only controller image whose base and final
multi-architecture filesystems and exact npm runtime graph pass the official
pinned OSV gate with zero known advisories or malicious-package findings;
then prove on a disposable EKS cluster that the M2 controller recovers the
protected label after a rolling replacement and scale from zero, emits the
expected bounded telemetry, uses Pod Identity with SDK IMDS access disabled,
and is followed by verified teardown before the coordinated 3.1.0 npm release.

### Context and important design rule

M2 deliberately consumes an external digest because its three evaluated bases
had known vulnerabilities. M3 re-ran admission against current immutable image
indexes: Chainguard Node was rejected after Trivy reported zero but official
OSV-Scanner 2.7.0 reported 22 Wolfi advisories. Microsoft Azure Linux Node 24
at index digest `sha256:b4f6866da0977e1bbf9ad4c5cdf265cb841bca03dcc2ea55cfa6a71ab655860b`
inventoried 86 packages per architecture and returned zero findings in both OSV
and an independent local Trivy cross-check for linux/amd64 and linux/arm64. It is
the only admitted base candidate. Trivy 0.76.0 and the current `actions/attest`
candidate were rejected as new CI dependencies because their own resolved tool
graphs contain known OSV advisories. The required CI admission gate therefore
uses checksum-verified OSV-Scanner 2.7.0, an embedded CycloneDX runtime SBOM and
the repository's already-admitted build-provenance action.

Image publication and AWS qualification are separate workflows. The image job
receives package-write and attestation authority but no AWS identity; the EKS
job receives sandbox OIDC but no package-write authority and accepts only an
exact public GHCR digest. GitHub does not expose a supported Packages API
mutation for initial visibility, so the first image run may create a private
package and fail closed. An authorized maintainer then makes it public once in
Package settings and reruns the workflow. Every successful publication verifies
the visibility and an anonymous digest pull. Neither workflow runs on pull
requests, forks, schedules or unreviewed feature refs.

### Refactor budget

No refactor permitted beyond the direct image, workflow, live fixture,
publication and documentation changes in this contract. M1/M2 decision,
adapter, IAM/RBAC and admission implementations remain unchanged unless a live
regression first demonstrates a defect and the allow-list is explicitly amended.

### Contract block

| Field                           | M3 contract                                                                                                                                                                                                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inputs                          | Merged `main` commit; immutable admitted Azure Linux Node 24 index digest; exact public GHCR controller digest; protected `aws-weekly-integration` environment; sandbox account/region/OIDC role/backend; exact EKS/Kubernetes and add-on versions; M2 component and M1 kernel.                                                 |
| Outputs                         | Public multi-arch controller image, SBOM and build provenance bound to one digest; redacted qualification artifact; verified teardown artifact; coordinated Hulumi 3.1.0 npm/GitHub release only after qualification passes.                                                                                                    |
| Interfaces touched              | GitHub Actions manual dispatch; GHCR; Pulumi Automation API; sandbox AWS EKS/EC2/VPC/IAM/Auto Scaling/CloudWatch/CloudTrail; Kubernetes API; existing release workflow.                                                                                                                                                         |
| New dependencies allowed        | None in npm/Cargo/Python locks. The admitted base is digest-pinned. Any new CLI/action/container/tool is a dependency and must receive the same OSV, integrity, source and authority review before use.                                                                                                                         |
| Migration allowed               | Coordinated additive package version change from 3.0.0 to 3.1.0 after live qualification. No state migration and no breaking public API change.                                                                                                                                                                                 |
| Compatibility commitments       | Node remains `>=22.12.0`; six-package atomic release invariant remains; Pulumi resource token and M1/M2 interfaces stay stable; existing caller-supplied digest remains supported.                                                                                                                                              |
| Exemplar code to copy           | OIDC/backend ownership and environment gating from `.github/workflows/weekly-integration.yml`; release isolation from `.github/workflows/sign-and-publish.yml`; bounded cleanup naming from `scripts/cleanup-e2e-stack.mjs`; M2 controller/component paths without alteration.                                                  |
| Anti-exemplar code not to copy  | The current protected-environment schedule that accumulates waiting runs; its no-op teardown message; combined registry/AWS authority; mutable image tags; scanner severity filters; prefix-only cleanup; mock-only EKS tests.                                                                                                  |
| AI tolerance contract           | N/A — no AI component.                                                                                                                                                                                                                                                                                                          |
| Data classification             | Internal for cluster/node/resource identifiers and timing; Restricted for credentials, kubeconfig, projected tokens, backend URLs, AWS account ID and raw provider responses. Restricted values never enter tracked files or uploaded artifacts.                                                                                |
| Proactive controls in play      | OWASP Proactive Controls 2024 C1 Implement Access Control, C3 Validate All Input and Handle Exceptions, C6 Implement Digital Identity, C9 Implement Security Logging and Monitoring, C10 Stop Errors from Becoming Security Failures; least privilege, immutable artifacts, independent evidence and fail-closed cleanup.       |
| Abuse acceptance scenarios      | BDD-M3-1 through BDD-M3-12 cover image substitution, scanner disagreement, untrusted workflow invocation, partial permission, admission bypass, stale replacement, false zero-capacity success, telemetry leakage and orphaned resources (`tm-eks-node-label-reconciler-abuse-3`, `-5`, `-6`, `-8`, `-9`, `-10`, `-11`, `-12`). |
| Measurement deliverables        | Recovery timestamps and bounded controller metrics/logs for rolling and scale-from-zero journeys; CloudTrail role-session event set; teardown inventory; readout in `docs/slo/verify/eks-trusted-node-label-reconciler-m3.md` on the qualification date.                                                                        |
| Outcome validation deliverables | `oc-eks-node-label-reconciler-2` through `-4` and `cuj-eks-node-label-reconciler-2` through `-4`, proven through registry → cluster → AWS/Kubernetes → telemetry → teardown layers.                                                                                                                                             |
| Forbidden shortcuts             | No execution of an unscanned base/final image; no MAL waiver or severity threshold; no mutable tag handoff; no cluster-admin; no shared/production cluster; no broad cleanup; no claimed recovery from mocks; no release before live green evidence.                                                                            |

### Exact file allow-list

- `docs/RUNBOOK-eks-trusted-node-label-reconciler.md`
- `docs/slo/design/eks-trusted-node-label-reconciler-threat-model.md`
- `docs/slo/critique/eks-trusted-node-label-reconciler-m3.md`
- `.github/workflows/trusted-node-label-image.yml`
- `.github/workflows/eks-trusted-node-label-qualification.yml`
- `.github/workflows/weekly-integration.yml`
- `containers/trusted-node-label-reconciler/Dockerfile`
- `containers/trusted-node-label-reconciler/README.md`
- `scripts/osv-image-gate.py`
- `scripts/test_osv_image_gate.py`
- `examples/eks-trusted-node-label-reconciler-live/**`
- `packages/k8s-baseline/tests/trusted-node-label-image.test.ts`
- `packages/k8s-baseline/tests/integration/eks/trusted-node-label-reconciler.eks.test.ts`
- `packages/k8s-baseline/README.md`
- `docs/components/eks-trusted-node-label-reconciler.md`
- `docs/integration-testing.md`
- `docs/deployment/weekly-integration-iam-policy.json`
- `docs/deployment/eks-trusted-node-label-qualification.md`
- `CHANGELOG.md`
- `pnpm-lock.yaml`
- `packages/{baseline,policies,drift,k8s-baseline,cloudflare-baseline,platform-patterns}/package.json`
- `docs/release/v3.1.0.md`
- `docs/slo/verify/eks-trusted-node-label-reconciler-m3.md`
- `docs/slo/lessons/eks-trusted-node-label-reconciler-m3.md`
- `docs/slo/completion/eks-trusted-node-label-reconciler-m3.md`

### Files to read before changing anything

- `docs/slo/lessons/eks-trusted-node-label-reconciler-m2.md`
- `SECURITY.md`
- `AGENTS.md`
- `packages/k8s-baseline/src/trusted-node-label-reconciler*.ts`
- `packages/k8s-baseline/src/trusted-node-label-controller*.ts`
- `.github/workflows/{ci,release,sign-and-publish,osv-dependency-gate}.yml`
- `scripts/osv-dependency-gate.py`
- `scripts/cleanup-e2e-stack.mjs`

### Secure Value & Security Contract

**Value wedge.** A maintainer can consume one official immutable controller
artifact and observe an eligible replacement node regain its protected identity
without a broad controller identity, mutable registry reference or unsupported
trust source.

**Security Definition of Ready (Operator Readiness).** Enforcement begins before
any registry or AWS mutation.

| Prerequisite                                                                                                               | Owner            | Needed by                 | Executable validation                                                                                                            | Current status                                                          |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Protected GitHub environment and sandbox secret/variable names exist                                                       | human/repository | repository implementation | `gh api repos/kerberosmansour/hulumi/environments/aws-weekly-integration`; `gh secret list`; `gh variable list`                  | pass on 2026-10-15                                                      |
| Main-branch GitHub OIDC can assume the sandbox role and identify the owned state bucket                                    | human/AWS        | readiness                 | workflow run `38735456670`, steps 7 and 8                                                                                        | pass on 2026-10-15                                                      |
| Dependency lock still passes the pinned OSV/MAL gate before installation                                                   | agent/CI         | every workflow            | reusable `osv-dependency-gate.yml`                                                                                               | required; fail closed                                                   |
| OIDC role has the exact documented EKS/VPC/IAM/CloudTrail lifecycle permissions and no production trust                    | human/AWS        | live provision            | read-only readiness job validates identity, policy surface and required Describe/List calls before its provision job is eligible | pending until the merged workflow runs; provision is blocked on failure |
| Public GHCR package exists at the exact digest with embedded runtime SBOM/provenance and zero final-image OSV/MAL findings | agent/CI         | live deploy               | image workflow output plus public anonymous pull and attestation verification                                                    | pending until image workflow                                            |
| Cleanup can enumerate only the exact run-scoped Pulumi stack/resources                                                     | agent/CI         | live provision            | preflight dry-run inventory and always-run destroy/remove/inventory check                                                        | pending until qualification workflow                                    |

`safe_to_continue_without_blockers: true` applies only to repository
implementation and local validation because those steps need no AWS mutation.
The degraded path is explicit: live provision, publication claims and the 3.1.0
tag remain blocked until every pending validation passes. No mock satisfies a
pending row.

**Threat summary.** The authoritative Markdown threat model rows are
`tm-eks-node-label-reconciler-abuse-1` through `-12`. The machine-readable
companion remains unavailable, so review records degraded ID-stability and does
not silently re-derive a schema artifact.

**Security test bundles.** Bundle B covers the Node runtime and dependency graph;
Bundle D covers GitHub OIDC, GHCR, AWS/Kubernetes IaC, container scanning,
CloudTrail and teardown. DAST is `not_applicable`: the controller exposes no HTTP
service or OpenAPI surface. SBOM and provenance are mandatory because M3 builds
a released artifact.

**Detected Work Ledger.** Initial dispositions: Chainguard OSV/Trivy disagreement
→ `fix_now` by rejection; candidate Trivy and attestation-action tool graphs with
known advisories → `fix_now` by rejecting those new CI dependencies and retaining
the pinned OSV/SBOM/provenance path; Azure Linux default root user → `fix_now` by explicit
numeric nonroot runtime and Kubernetes security context; scheduled protected
workflow backlog and no-op cleanup → `fix_now` inside the allow-list; missing
effective EKS permission proof → `operator_action` enforced by readiness;
Local Zone/Wavelength expansion → retained under parent issue #305 and excluded
from M3.

### Measurement contract

- Primary leading measure: elapsed seconds from an eligible replacement Node
  becoming Ready to the exact protected label appearing. Each rolling and
  scale-from-zero sample must be at most 180 seconds; the report records raw
  timestamps and calls one qualification sample a qualification, not a p95 SLO.
- Lagging outcome: after the bounded five-minute observation window, every
  eligible Ready Node in the exact test node group has the expected label and no
  ineligible Node has it.
- Guardrails: zero conflicting/incorrect labels; zero unexpected controller-role
  CloudTrail API names; zero credential/token/raw-response strings in logs or
  artifacts; zero known OSV/MAL findings; zero run-scoped resource or
  Pulumi-stack residue after teardown. The provision job is bounded at 50
  minutes, cleanup at 20 minutes and post-cleanup verification at 10 minutes;
  the complete workflow is bounded at 90 minutes even when every timeout is
  exhausted.
- Owners: repository maintainer for recovery/telemetry; sandbox owner for cost
  and cleanup. Readout date is the successful qualification run date.

### Outcome Validation Contract

- `oc-eks-node-label-reconciler-2`: an official digest-only image is anonymously
  pullable, cryptographically bound to repository build provenance and an SBOM,
  and both architectures plus the exact npm runtime graph have zero OSV/MAL
  findings. Registry substitution,
  scanner error or advisory blocks the outcome (`tm-...-abuse-9`, `-10`).
- `oc-eks-node-label-reconciler-3`: a real managed-node rolling replacement
  produces a new UID/instance that independently re-attests and receives only
  the configured protected label within 180 seconds; admission denies another
  principal and controller piggyback mutations (`tm-...-abuse-3`, `-6`).
- `oc-eks-node-label-reconciler-4`: deliberate desired size zero is healthy;
  scaling to one creates a new eligible Node that receives the label within 180
  seconds, while CloudWatch and CloudTrail show only the intended bounded path
  and teardown leaves no run-scoped resource (`tm-...-abuse-5`, `-8`, `-11`, `-12`).
- `cuj-eks-node-label-reconciler-2`: admitted base → build with script-disabled
  admitted lock → final dual scan → SBOM/provenance → public digest pull.
- `cuj-eks-node-label-reconciler-3`: readiness → disposable cluster → component
  deploy → initial label → rolling replacement → new label → telemetry evidence.
- `cuj-eks-node-label-reconciler-4`: scale to zero → healthy zero-capacity signal
  → scale to one → recovery → exact destroy/remove → empty inventory.
- Per-layer path: source/lock `applicable`; image registry `applicable`; AWS
  control plane `applicable`; Kubernetes admission/controller `applicable`;
  metrics/logs/CloudTrail `applicable`; Pulumi state/teardown `applicable`; UI
  `not_applicable (library/controller has no UI)`. The required cross-layer
  assertions span registry digest → deployed Pod imageID and AWS node-group/
  instance evidence → Kubernetes label plus CloudWatch/CloudTrail observations.
- Core regression matrix target resolutions: M1 forged evidence `pass required`;
  conflicting label refusal `pass required`; stale UID/resourceVersion/provider
  plan `pass required`; M2 exact IAM/RBAC/admission `pass required`; controller
  log redaction `pass required`; existing package/release lanes `pass required`;
  Local Zone/Wavelength `not_applicable (explicitly unsupported under #305)`.

### Step-by-step

1. Preserve a clean task branch; run baseline package/repository checks and the
   pinned dependency gate before any image or workflow execution.
2. Add failing structural/unit tests for the image contract, scanner failure
   handling, workflow authority separation, readiness fail-closed behavior and
   exact cleanup.
3. Implement the generic pinned OSV image gate and admitted nonroot multi-arch
   controller recipe without changing the M1/M2 runtime path.
4. Implement the isolated image publication workflow and verify final image,
   anonymous pull, SBOM and provenance are bound to one digest.
5. Replace the blocked weekly schedule with a lean contract-only cadence and
   keep all protected real-AWS mutation manual.
6. Implement the disposable EKS Pulumi fixture plus a separate manually
   dispatched qualification workflow with readiness, redacted evidence and
   always-run exact teardown.
7. Run local BDD/regression/security checks, adversarial diff review and exact
   allow-list verification; merge only an exact green signed+DCO head.
8. On merged `main`, run image publication, then the read-only/live qualification
   against its exact digest; fix regressions test-first and repeat until green.
9. Apply the coordinated 3.1.0 version/changelog/release-doc changes, re-run all
   gates, merge exact green head, tag, publish and verify registry/npm/GitHub
   release evidence.

### BDD acceptance scenarios

| ID        | Given / when                                                                                                                                     | Then                                                                                                                                                                                                                                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BDD-M3-1  | A candidate base/final image or runtime-SBOM scan has an OSV advisory, MAL identifier, parse/network error, omitted platform or empty inventory. | Fail closed before execution, push or deployment; the report preserves the complete inventory (`tm-...-abuse-9`, `-10`).                                                                                                                                                                                                          |
| BDD-M3-2  | The image job runs on merged main with the exact admitted base and unchanged lock.                                                               | Build amd64/arm64, run final OSV image and runtime-graph gates, embed the SBOM, emit provenance, push one public GHCR index digest and prove anonymous digest pull.                                                                                                                                                               |
| BDD-M3-3  | A fork, pull request, schedule, feature ref or mutable image input attempts a privileged workflow.                                               | No package-write or AWS OIDC job runs; qualification rejects the input before credential setup (`tm-...-abuse-10`).                                                                                                                                                                                                               |
| BDD-M3-4  | Identity/account/region/backend ownership or any required EKS/VPC/IAM permission validation fails.                                               | Provision is skipped, no cloud write occurs, and redacted evidence names the missing capability (`tm-...-abuse-11`).                                                                                                                                                                                                              |
| BDD-M3-5  | The admitted image deploys to the exact disposable node group.                                                                                   | Pod imageID equals the requested digest; it runs numeric nonroot with read-only root filesystem, no privilege/capabilities and `AWS_EC2_METADATA_DISABLED=true`; Pod Identity supplies the bounded role.                                                                                                                          |
| BDD-M3-6  | Another identity mutates the protected label, or the controller attempts a piggyback Node mutation.                                              | The live ValidatingAdmissionPolicy denies it while the exact absent-label addition remains allowed (`tm-...-abuse-6`).                                                                                                                                                                                                            |
| BDD-M3-7  | The managed node group rolls to a new launch-template version.                                                                                   | Old/new membership is handled, the replacement has a new UID/instance, and the label appears within 180 seconds through fresh M1 attestation (`oc-...-3`).                                                                                                                                                                        |
| BDD-M3-8  | Desired size is set to zero and then back to one.                                                                                                | Zero capacity is healthy without a missing-label alarm; the new Ready Node receives the label within 180 seconds (`oc-...-4`).                                                                                                                                                                                                    |
| BDD-M3-9  | Success, provider failure and concurrency-conflict paths occur.                                                                                  | Structured logs and fixed-dimension CloudWatch metrics/alarms appear with no credential/token/raw-response or high-cardinality leakage (`tm-...-abuse-8`).                                                                                                                                                                        |
| BDD-M3-10 | CloudTrail events for the controller role session are collected after the observation delay, and CloudWatch is queried independently.            | The controller-role CloudTrail event-name set is exactly EKS DescribeNodegroup, Auto Scaling DescribeAutoScalingGroups and EC2 DescribeInstances; any extra role-session call fails. CloudWatch must separately expose all three fixed-dimension metrics because `PutMetricData` is not a reliable management-event audit source. |
| BDD-M3-11 | Provision, assertion or cancellation fails at any point.                                                                                         | Always-run destroy/remove executes from exact Pulumi state, a second exact inventory proves no run-scoped stack/resource remains, and cleanup never matches by loose prefix alone (`tm-...-abuse-12`).                                                                                                                            |
| BDD-M3-12 | Live qualification and exact-head release checks are green.                                                                                      | All six package versions and latest changelog entry become 3.1.0 together; tag/release publication runs once and registry/npm artifacts are re-verified.                                                                                                                                                                          |

### Regression tests and E2E runtime validation

- Re-run all M1/M2 focused tests, TLA evidence, package tests and workspace build,
  typecheck, lint, exact-pin/workflow-governance and formatting gates.
- Image tests parse the Dockerfile and workflows, run the OSV gate's malformed,
  network-error, finding and clean-report fixtures, and inspect a locally built
  image for numeric nonroot/read-only execution plus the exact controller command.
- Live EKS validation is mandatory for BDD-M3-5 through BDD-M3-11. Mocks may test
  command construction but never satisfy a live outcome row.
- DAST is `not_applicable`: no listening web/API surface exists.

### Compatibility checklist

- [ ] Existing public component and controller interfaces are unchanged.
- [ ] Existing caller-supplied exact image digests remain supported.
- [ ] No new package identity or lifecycle script enters the lock graph.
- [ ] Node 22/24-compatible CommonJS artifacts remain the npm output.
- [ ] Six package versions and changelog stay atomic.
- [ ] Normal PR CI remains cloud-free; protected live work is manual only.

### Forbidden shortcuts

- Do not copy a bare Node binary into scratch or remove package metadata to hide
  dependencies from scanners.
- Do not accept an independent scanner in place of the pinned official OSV gate,
  ignore findings, filter by severity, waive `MAL-*`, or convert
  scanner/network/parser errors to success.
- Do not combine GHCR package-write and AWS cloud-mutation authority in one job or
  expose either to pull-request/fork code.
- Do not make the protected real-AWS workflow scheduled; do not approve a run
  that is not bound to the exact merged commit and image digest.
- Do not use cluster-admin, static AWS credentials, public `0.0.0.0/0` API access,
  mutable image tags, persisted kubeconfigs/tokens or raw provider logs.
- Do not treat a canceled job's no-op message as cleanup evidence; destruction
  and post-destroy inventory must execute and pass.
- Do not create the v3.1.0 tag or publish npm packages before every live outcome,
  exact-head check and Codex Security gate passes.

### Evidence log

| Evidence             | Expected                                                                                                                   | Actual result                                                                                                                                                                                                                                               | Status  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Repo hygiene         | M3 branch begins at merged M2 and only allow-listed files change.                                                          | Branch begins at merged M2 commit `a759f3d79784b5050f4f2af4437529dc84576288`; reviewable changes are confined to the approved M3 allow-list. The scanner cache is excluded from staging.                                                                    | pass    |
| Baseline             | M2/full repository checks pass before implementation.                                                                      | `pnpm -r build`, typecheck, test and lint; exact-pin and workflow-governance lint; format check and focused suites all pass locally on 2026-10-15.                                                                                                          | pass    |
| Dependency admission | Lock remains exact; pinned OSV/MAL and provenance review pass before any dependency execution.                             | Official OSV-Scanner 2.7.0 scanned both lockfiles and 574 packages with zero advisories or MAL findings; the reviewed report is `work/security/issue305-m3-final/dependencies.json`.                                                                        | pass    |
| Base image admission | Both architectures pass pinned official OSV, provenance/source review and nonroot runtime check before use.                | Azure Linux Node 24 base and final amd64/arm64 images each scanned 86 OS packages plus the exact 31-package runtime SBOM with zero OSV/MAL findings; both final configs use numeric user `65532:65532`.                                                     | pass    |
| Red tests            | Workflow/image/readiness/cleanup requirements fail before implementation.                                                  | Pending.                                                                                                                                                                                                                                                    | pending |
| Focused/local        | Image gate fixtures, Docker contract and live-fixture command construction pass.                                           | Eleven image-gate unit tests and five image/workflow structural tests pass; the EKS suite typechecks and its three live cases skip cleanly without the explicit live environment.                                                                           | pass    |
| Registry             | Final public multi-arch digest, anonymous pull, SBOM and provenance all bind.                                              | Pending.                                                                                                                                                                                                                                                    | pending |
| Live EKS outcomes    | Rolling, zero-capacity, scale-from-zero, admission, Pod Identity, CloudTrail, metrics/logs/alarms and exact teardown pass. | Pending.                                                                                                                                                                                                                                                    | pending |
| Regression/security  | Full workspace, Semgrep/secret scan, OSV, Codex Security and exact-head CI pass.                                           | Local workspace and OSV gates pass. Codex Security run `wfr_3b36f054b7fbfd82588209e2f84ea6ea4e05fbc9be4c55010362b52fdc871987` found 29 pre-existing findings on merged main; remediation and a clean exact-head scan are required before merge/publication. | blocked |
| Publication          | Coordinated 3.1.0 tag, six npm packages, SBOM/provenance and GitHub release verify.                                        | Pending.                                                                                                                                                                                                                                                    | pending |

### Definition of done

- Every BDD, Outcome Scenario, Critical User Journey and required regression row
  has real runtime evidence; mock-only evidence cannot close M3.
- Base and final multi-arch image plus runtime-SBOM reports contain complete
  inventories and zero OSV/MAL findings; public digest, embedded SBOM and
  provenance bind to one build.
- Live Pod imageID, nonroot/IMDS posture, exact admission decisions, rolling and
  scale-from-zero recovery, bounded telemetry and CloudTrail call set all pass.
- Destroy/remove and post-destroy inventory prove no run-scoped cloud, cluster,
  registry-candidate or local credential artifact remains.
- The detected-work ledger has no undisposed row; every changed path matches the
  allow-list; exact-head CI and Codex Security are clean.
- All six packages and changelog publish as 3.1.0 together, and npm/GitHub
  artifacts plus attestations are independently re-read after publication.

### Self-review gate

- Yes — the contract separates artifact and cloud authority and keeps PR CI
  cloud-free.
- Yes — scanner disagreement, operator readiness, cancel-safe cleanup and live
  outcome evidence are explicit fail-closed gates.
- Yes — rolling and scale-from-zero journeys are real cross-layer assertions,
  not mocked return values.
- Yes — publication is downstream of live qualification and exact-head review.
