# Critique — Hulumi Aurora Identity Boundary M1

> Adversarial review per `/slo-critique`, completed 2026-07-28 against the
> accepted design and the M1 runbook. Persona order was CEO, engineering lead,
> security, then design. The accepted architecture remains brokered SQL.

## Security precondition

The first security pass hard-halted correctly: the frozen threat-model JSON on
plan head `d8cefb53574bcc94dda8875dc52ed61b5c65e20a` used an obsolete shape that
the strict current schema rejects. No security finding was accepted from that
unparseable input.

PR #257 migrated that one JSON file without changing frozen abuse IDs,
substantive attacker/step/outcome/control/classification text, or residual-risk
decisions. The correction landed on the plan branch as
`460cc2e932bfca86ab150f04164a31bd9082ed37`. The corrected artifact has SHA-256
`07f0cf57606df2dfbb6c69f3957d2a4f9309d5ad6fe3fcf5100530b2984a982f`.
The strict schema version:

~~~text
0.1.0
~~~

Contiguous abuse IDs 1–8, residual decisions `true,false,false`, and all four
provenance pins passed before the security persona resumed.

## Persona 1 — CEO

### C1 — Release classification had no publish-blocking owner

- **Category:** ask
- **Original surface:** pre-amendment runbook lines 124 and 236 deferred semver,
  while `.github/workflows/release.yml` publishes any matching tag after
  generic tests.
- **Concrete failure:** a maintainer could tag the role-kind migration as a
  patch before anyone owned the behavior-change classification or migration
  wording.
- **Decision:** accepted.
- **Resolution:** final runbook lines 124–136 and 247/255 make M5 release
  ownership explicit. M1 implementation may proceed, but no tag or publish may
  proceed until major/minor/patch, migration wording, six-package version
  equality, and tag equality are recorded.
- **Opportunity cost:** no new implementation in M1; one release-time decision
  replaces an unowned deferral.

## Persona 2 — Engineering lead

### E1 — M1 allow-list contradicted the accepted drift design

- **Category:** ask
- **Original surface:** accepted code map requires
  `packages/drift/src/classifier.ts` and reversibility requires a live
  CloudTrail classification test; pre-amendment M1 permitted only the
  classifier test and deferred CloudTrail evidence.
- **Concrete failure:** a tag migration could be normalized away by the
  classifier while the allowed test surface remained unable to implement the
  accepted attribution requirement.
- **Decision:** accepted.
- **Resolution:** final runbook lines 163–164 allow the classifier source and a
  dedicated CloudTrail integration test; line 212 requires the applied tag
  mutation and matching classifier result rather than final-state inference.

### E2 — N4 was two previews, not a migration proof

- **Category:** ask
- **Original surface:** the runbook required upgrade and rollback previews but
  did not freeze an old checkpoint, apply the candidate, identify a stack, or
  require teardown.
- **Concrete failure:** both previews could run against the old state, so the
  rollback preview would prove nothing.
- **Decision:** accepted.
- **Resolution:** final runbook lines 124–136 freeze old SHA
  `f2669f729e8006c71fbf483bc2cd14df10e6e640`, package train `1.5.0`, stack
  `hulumi-fixture-aurora-identity-migration`, candidate preview and apply,
  stable URN/name/ARN checks, rollback preview and apply, CloudTrail
  attribution, and teardown. Preview-only evidence is explicitly invalid.

### E3 — The IMDS control twin did not isolate the claimed boundary

- **Category:** ask
- **Original surface:** pre-amendment N3 combined IMDSv1/v2 negatives with one
  IMDSv2 control pod and no same-node requirement.
- **Concrete failure:** runtime and control pods could land on differently
  configured nodes; cluster-wide IMDSv1 disablement could also masquerade as a
  boundary-specific pass.
- **Decision:** accepted.
- **Resolution:** final runbook lines 204–205 split N3a/N3b and require
  same-node, identical-network-condition controls. Cluster-wide IMDSv1 denial
  is recorded as an environment control and cannot pass N3a.

## Persona 3 — Security

### S1 — Workload-accessible break-glass authority remained open

- **Category:** ask
- **Threat IDs:**

  ~~~text
  tm-hulumi-aurora-identity-boundary-abuse-3
  tm-hulumi-aurora-identity-boundary-abuse-4
  ~~~

- **Bug class:** V3 missing function-level authorization; CWE-284.
- **Class status before resolution:** residual. Ordinary B4/B6 fixtures did not
  enumerate policy suppressions, cluster-admin bindings, impersonation,
  `bind`/`escalate`, token minting, or EKS access-entry exceptions.
- **Concrete exploit trajectory:** a platform identity retains a suppressed
  cluster-admin or impersonation path, creates or mints the migrator identity,
  and bypasses ordinary fixture negatives.
- **Variant analysis:** `packages/policies/src/k8s/rbac-pack.ts` contains
  suppression-capable wildcard and cluster-admin paths; live discovery must
  cover every equivalent RBAC and EKS access-entry variant.
- **Decision:** accepted.
- **Resolution:** final runbook line 210 defines the workload-accessible
  exception inventory as empty, enumerates the relevant live surfaces, and
  fails on a matching fixture identity or unrecognized non-system exception.
  Operator orchestration authority cannot appear in manifests, suppression
  configuration, projected tokens, or component outputs.

### S2 — B10 did not prohibit the forbidden free-form IAM seam

- **Category:** ask
- **Threat ID:**

  ~~~text
  tm-hulumi-aurora-identity-boundary-abuse-8
  ~~~

- **Bug class:** V14 overly permissive IAM role; CWE-732.
- **Class status before resolution:** residual. Requiring a matrix and negative
  twin did not prevent an implementation from also accepting `policyArns` or
  `inlinePolicies`.
- **Concrete exploit trajectory:** an implementer extends or spreads an
  existing free-form role-args type into the boundary, supplies the required
  matrix/twin, and later attaches an administrative policy while B10 still
  passes.
- **Variant analysis:** the repo contains 11 free-form-policy sites, beginning
  at `packages/baseline/src/aws/secure-aws-primitives.args.ts:19`; they are
  anti-exemplars and none may flow into this boundary.
- **Decision:** accepted.
- **Resolution:** final runbook lines 201 and 214 require TypeScript-AST and
  compile-negative rejection of direct, inherited, intersection, or spread
  seams, plus exact equality between rendered IAM attachments and each closed
  capability matrix.
- **Class status after plan resolution:** mitigated by an executable contract;
  implementation evidence must still prove the tests before M1 can close.

## Persona 4 — Design

**N/A — no UI surface.** M1 is an internal, non-exported TypeScript/Pulumi and
CrossGuard boundary. It adds no CLI, API, app, browser, or user-visible state.

## Decisions and scope

The user directed the lead to choose the path of least resistance, power
through critical-path work, and avoid non-critical issue fan-out. All six asks
were therefore accepted together in one runbook-only amendment,
`dcd3a81c4fc5f02822439e724571ca6e948c211f` (PR #258).

| Finding | Decision | Contract result |
| --- | --- | --- |
| C1 | Accept | One M5 pre-tag owner; unresolved classification blocks publish |
| E1 | Accept | Classifier source and live CloudTrail attribution are in M1 |
| E2 | Accept | Frozen old → candidate apply → rollback lifecycle |
| E3 | Accept | Separate same-node IMDSv1/v2 twins |
| S1 | Accept | Empty workload exception inventory; unknown exceptions fail |
| S2 | Accept | AST/compile-negative ban plus exact rendered IAM inventory |

No issue was filed: every finding is resolved inside the existing five
milestones. No sixth milestone, second runbook, dependency, implementation
change, physical-isolation fork, or early broker/database closure was added.

## Verdict

**PASS — plan ready for `/slo-execute M1` once PR #258 is merged.** The schema
gate, all six persona asks, placeholder scan, Prettier 3.8.4 check, frozen
threat-model hash, and `git diff --check` pass. Implementation and live
operator evidence remain execution gates; this critique does not claim them
complete.
