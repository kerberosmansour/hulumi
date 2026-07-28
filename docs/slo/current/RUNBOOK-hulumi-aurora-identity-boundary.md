# Hulumi Aurora Identity Boundary — AI-First Runbook v4

Feature: [#255](https://github.com/kerberosmansour/hulumi/issues/255) — secure Aurora application principal.

**Only M1 is fully specified.** M2–M5 are named with scope and owner surfaces so no gate is silently dropped, but their contracts are deliberately sparse until the lead accepts M1.

---

## 1. Runbook Metadata

| Field                                       | Value                                                                              |
| ------------------------------------------- | ---------------------------------------------------------------------------------- |
| Runbook ID                                  | `hulumi-aurora-identity-boundary`                                                  |
| Project name                                | `hulumi`                                                                           |
| Primary stack                               | TypeScript on Node, pnpm workspaces, Pulumi + CrossGuard, Vitest, Apache-2.0       |
| Primary package/app names                   | `@hulumi/k8s-baseline`, `@hulumi/baseline`, `@hulumi/policies`, `@hulumi/drift`    |
| Prefix for tests and lesson files           | `hulumi-aurora-identity-boundary`                                                  |
| Default unit test command                   | `pnpm -r test`                                                                     |
| Default integration/BDD test command        | `HULUMI_INTEGRATION=1 pnpm test:integration`                                       |
| Default build/boot command                  | `pnpm -r build`                                                                    |
| Default formatter command                   | `pnpm run format:check`                                                            |
| Default static analysis / lint command      | `pnpm -r lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`  |
| Default dependency / security audit command | `pnpm audit --prod`                                                                |
| Default debugger or state-inspection tool   | `pulumi preview --json`; `aws iam simulate-principal-policy`; `kubectl auth can-i` |
| Allowed new dependencies by default         | `none`                                                                             |
| Schema/config migration allowed by default  | `no`                                                                               |
| Public interfaces stable by default         | `yes`                                                                              |
| Base commit                                 | `f2669f729e8006c71fbf483bc2cd14df10e6e640`                                         |
| Accepted design                             | `a0008e2740c0` on `slo/hulumi-aurora-identity-boundary-design`                     |

### Accepted design inputs (do not re-derive)

- `docs/slo/design/hulumi-aurora-identity-boundary-{overview,stack-decision,interfaces,threat-model,reversibility,code-map,verified}.md`
- `docs/slo/design/hulumi-aurora-identity-boundary-threat-model.slo.json` — frozen `tm-hulumi-aurora-identity-boundary-abuse-1..8`
- `specs/HulumiAuroraIdentityBoundary.{tla,cfg,trace.md}` + `HulumiAuroraIdentityBoundaryNaive.cfg`

---

## 2. Milestone Tracker

| #   | Milestone                                                                                | State                                     |
| --- | ---------------------------------------------------------------------------------------- | ----------------------------------------- |
| M1  | Non-interchangeable workload identities + runtime credential/network denial              | **specified, awaiting lead confirmation** |
| M2  | Broker workload + non-forgeable capability + exhaustive live identity/subresource matrix | named only                                |
| M3  | PostgreSQL 16 authority allowlist, RLS end-to-end, sequences/routines/extensions closure | named only                                |
| M4  | Alternating-user rotation + global locks + `LISTEN`/`NOTIFY`                             | named only                                |
| M5  | Value-free receipts, release-time discovery fail-closed, live certification              | named only                                |

Five milestones. No sixth, and no second runbook.

---

## 3. End-to-End Architecture

Three non-interchangeable Kubernetes identities against one Aurora cluster:

- **runtime** — serves requests. **No database credential. No Aurora/RDS-Proxy network path.**
- **migrator** — schema migration Job. Holds a bounded credential.
- **broker** — mediates SQL. Holds a bounded credential and validates a non-forgeable tenant/operation capability. _(M2)_

The reviewed boundary rejects direct runtime DML as insufficient because `FORCE ROW LEVEL SECURITY` cannot tenant-scope global locks or `LISTEN`/`NOTIFY`.

---

## 4. Carmack-Style Reliability Goal

**Make invalid states unrepresentable.** M1's hardened TLA+ config does not _guard_ the weak transitions — it **removes** them. There is no `AttemptAssume` rule at all, and serving is enabled only by the complete validated aggregate. A boolean-typed Pulumi output that a consumer may decline to read is a convention, not a barrier; M1 therefore ships **no public constructor and no runnable outputs**.

---

## 5. Formal Verification

**Verified, not planned.** `specs/HulumiAuroraIdentityBoundary.tla` on the pinned toolchain (`d5d07d5d…`, build 2026-04-22):

| Config   | Result                                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------------------------- |
| naive    | exit 12 — `IdentitiesNonInterchangeable` violated at State 2 by `AttemptAssume(Runtime, Migrator)`, 7/7 states, depth 2 |
| hardened | exit 0 — 201 generated / 68 distinct / **0 left on queue**, depth 8                                                     |

Invariants: `TypeOK`, `RuntimeNeverHoldsCredential`, `IdentitiesNonInterchangeable`, `NoServingBeforeValidated`.

**Kani: N/A.** Measured 381 `.ts`, 0 `.rs`, 0 `Cargo.toml`; Kani is a Rust model checker. Recording an obligation would be fabricating one.

**Liveness is not claimed.** A bootstrap that never serves is a _safe_ outcome here.

**Reserved for implementation:** `packages/k8s-baseline/tests/aurora-identity-boundary-tla-alignment.test.ts` — dedicated, and deliberately **not** an overload of `packages/drift/tests/tla-alignment.test.ts`, which checks reconciler state and is unrelated.

---

## 6–8. Global Execution / Entry / Exit Rules

**Entry.** Read every accepted design artifact above before touching a file. Confirm the operator fixture is reachable; if it is not, the milestone is **`blocked_by_operator`** — never skipped, never reported as pass.

**Execution.** RED first. Every negative carries a same-run intended-success twin. Every assertion names the _deny reason_, not a bare non-200.

**Exit.** Evidence Log complete, Definition of Done satisfied, `git diff --check` clean, no angle-bracket placeholder anywhere in the runbook or evidence.

---

## 9. Background — constraints read out of the code

1. `packages/policies/src/aws/hulumi-hardening-pack.ts:36` sets `H3_ENFORCEMENT_LEVEL = "mandatory"`, and the rule violates for **every** IAM role lacking `hulumi:iac-role=true`. `commonRoleArgs` (`secure-aws-primitives.ts:138`) injects that tag at `:155` for **both** role classes (call sites `:209`, `:290`). So inheriting the tag misclassifies workload identities, and simply removing it fails a mandatory policy.
2. `SecureWorkloadRole` cannot be reused: `workloadTrustPolicy` (`:262-275`) is `Principal: { Service }` + `sts:AssumeRole` with no federated principal and no condition block, so it cannot express EKS OIDC with an exact `sub`.

---

## 10. Carry-forward

- `.gitignore:25` blanket-ignores `docs/slo/` with no exceptions while 129 files are tracked there — new files need `git add -f`.
- The upstream threat model ships no `.slo.json` and no stable `tm-*` IDs. Stable IDs originate in the architect pair and are frozen; renumbering is forbidden.

---

## 11. BDD and Runtime Validation Rules

Categories required in M1: **structural** (construction barrier), **authorization** (effective deny), **network** (reachability), **admission** (RBAC/template), **classification** (role-kind/H3), **migration** (upgrade/rollback — proved by N4, not left to Definition of Done alone).

**A negative is INVALID, not passing, if:** the principal is deny-all, the target returns `NotFound`/`NoSuchEntity`, a DNS name fails to resolve, or the target does not exist in the same run.

---

## 12. Dependency, Migration, Refactor Policy

`hulumi:role-kind` is a **behaviour-changing** release. A tag removal on existing roles is an in-place diff — it cannot be both a behaviour change and a no-op. Resource identity (URN/name/ARN) stays stable; no replacement. The stack-decision artifact **defers** the semver level; **release classification owns it**, and it does not block M1. Upgrade **and** rollback previews are both captured and diffed; any resource _replacement_ in a preview is a stop condition.

---

## 13–16. Evidence Log / Self-Review / Lessons / Completion

Evidence Log template per milestone: exact source SHA, baseline, RED, implementation diff, format/build/lint, audit, full scoped tests, live outcome, cleanup. Lessons file prefix `hulumi-aurora-identity-boundary`.

---

## 17. Milestone Plan

### Milestone 1 — `Non-interchangeable workload identities + runtime credential/network denial`

**Goal**: the serving runtime provably holds no database credential and has no Aurora/RDS-Proxy network path; runtime, migrator and broker identities are non-interchangeable; no serving workload can be constructed from partial outputs; and IAM role classification is correct under mandatory H3.

**Context**: gates 1–3 of the merged threat model. Gates 4–11 are unverifiable until these hold, which is why M1 stops here and does **not** claim broker or database closure.

**Refactor budget**: `Minimal local refactor permitted in listed files only`.

#### Contract Block

| Field                      | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inputs                     | Hulumi main `f2669f72`; accepted design at `a0008e2740c0`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Outputs                    | internal `AuroraWorkloadIdentityBoundary`; persisted `hulumi:role-kind` discriminator; H3 narrowed; new K8s policy pack registered and enforcing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Interfaces touched         | `commonRoleArgs` (additive closed discriminator); H3 rule predicate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Files allowed to change    | `packages/baseline/src/aws/secure-aws-primitives.ts`, `packages/baseline/tests/secure-aws-primitives.test.ts`, `packages/policies/src/aws/hulumi-hardening-pack.ts`, `packages/policies/tests/hulumi-hardening-pack.test.ts`, `packages/policies/src/index.ts` (export line only), `packages/policies/tests/k8s/policy-pack-runtime.test.ts`, `packages/drift/tests/classifier-fail-closed.test.ts`                                                                                                                                                                                                                                |
| New files allowed          | `packages/k8s-baseline/src/aurora-workload-identity-boundary.{args,outputs}.ts` and impl; `packages/k8s-baseline/tests/aurora-workload-identity-boundary.test.ts`; `packages/k8s-baseline/tests/aurora-identity-boundary-tla-alignment.test.ts`; `packages/policies/src/k8s/aurora-identity-boundary-pack.ts`; `packages/policies/src/k8s/packs/hulumi-aurora-identity-boundary.ts`; `packages/policies/tests/k8s/aurora-identity-boundary-pack.test.ts`; `packages/k8s-baseline/tests/integration/eks/aurora-identity-boundary.eks.test.ts`; `packages/k8s-baseline/tests/integration/kind/aurora-identity-boundary.kind.test.ts` |
| **Explicitly NOT allowed** | `packages/k8s-baseline/src/index.ts` — M1 is **internal and non-exported**; `packages/k8s-baseline/src/kubernetes-secret-from-asm.ts` and `tests/rds-credential-secret.test.ts` (read-only anti-exemplars); root `SECURITY.md`; any `.github/workflows`; any Guardian path                                                                                                                                                                                                                                                                                                                                                         |
| New dependencies allowed   | `none`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Data classification        | **restricted** — assets are database credentials and KMS decrypt paths                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

#### §5A User-facing behaviour — **N/A**

M1 ships no user-facing surface. The component is internal and non-exported; there is no CLI, API or UI change. Marked N/A with reason rather than left blank, so absence is a decision and not an omission.

#### §5B Security — **MANDATORY, complete**

**Abuse cases** (frozen architect IDs; do not renumber):

| ID                                          | Covered by                                                                                                                                                |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `…-abuse-1` re-read master secret           | B1                                                                                                                                                        |
| `…-abuse-2` assume migrator/broker          | B2 (transitive, every hop)                                                                                                                                |
| `…-abuse-3` mint/mount another SA's token   | B4                                                                                                                                                        |
| `…-abuse-4` template naming a privileged SA | B6                                                                                                                                                        |
| `…-abuse-5` direct Aurora reach             | B7                                                                                                                                                        |
| `…-abuse-6` Pod Identity / agent / IMDS     | N1, N2, N3 — each RED-first with a same-run twin; design classification **mitigated** preserved (reachability is an environment property, not a code one) |
| `…-abuse-7` serving from partial outputs    | B9 structural                                                                                                                                             |
| `…-abuse-8` free-form policy extension      | B10 closed union                                                                                                                                          |

**RED-first BDDs, each with its same-run positive twin:**

|     | Negative                                                                                                                                                         | Twin                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | runtime DENIED `secretsmanager:GetSecretValue` + `kms:Decrypt`                                                                                                   | migrator SUCCEEDS on both                                                                                                                                                   |
| B2  | runtime DENIED `sts:AssumeRole` to migrator/broker/rotation, transitively                                                                                        | runtime SUCCEEDS at `sts:GetCallerIdentity` — proves the principal is live, not dead                                                                                        |
| B3  | trust uses `StringEquals` on exact `sub` **and** `aud`; any `StringLike` fails                                                                                   | a wildcard fixture must make B3 fail                                                                                                                                        |
| B4  | no identity may create `serviceaccounts/token` for, impersonate, or mount another's token Secret                                                                 | each identity succeeds on its own                                                                                                                                           |
| B5  | canary planted in a fixture master secret appears in **no** rendered K8s Secret and **no** Pulumi state                                                          | canary is present in the fixture secret itself                                                                                                                              |
| B6  | admission rejects a template naming a privileged SA from a non-owning identity                                                                                   | the owning identity succeeds                                                                                                                                                |
| B7  | runtime has no route to Aurora                                                                                                                                   | migrator connects over the identical probe                                                                                                                                  |
| B8  | no rendered identity carries `hulumi:iac-role=true`                                                                                                              | a fixture inheriting `commonRoleArgs` makes B8 fail                                                                                                                         |
| B9  | the module is unreachable from the package entrypoint; no consumer can instantiate it                                                                            | importing it via its internal path succeeds inside the package                                                                                                              |
| B10 | a capability member without both its matrix and its negative twin fails the build                                                                                | each valid member builds                                                                                                                                                    |
| N1  | no EKS Pod Identity association exists for the runtime ServiceAccount, and `eks:CreatePodIdentityAssociation` is denied to the runtime and deployment identities | an association for the **migrator** SA exists and is listable in the same run, proving the API and cluster are reachable and the absence is scoping                         |
| N2  | the Pod Identity Agent credential endpoint is unreachable from the runtime pod, or returns no role carrying secret/KMS authority                                 | the identical probe from the **migrator** pod reaches the agent and returns its bounded role                                                                                |
| N3  | the node instance profile and IMDS (**v1 and v2**) are unreachable from the runtime pod, or yield no role with database authority                                | IMDSv2 token retrieval succeeds from a **control fixture pod without the boundary applied**, proving the path exists on this cluster and is closed for runtime specifically |
| N4  | **migration**: upgrading an existing stack emits a tag **update** on workload roles with **no replacement**; rolling back restores the prior tag set             | both previews resolve the **same URN, role name and ARN** before and after; any `replace` in either preview fails the test                                                  |

**H3 classification tests** (`packages/policies/tests/hulumi-hardening-pack.test.ts`): `iac-deployment`+tag → pass; `iac-deployment` no tag → violation; `workload`+role-kind no IaC tag → pass; role-kind **absent** → violation; role-kind **unknown** → violation. Fail-closed on missing/unknown is an explicit design decision.

**Secret handling**: `aws secretsmanager get-secret-value` is **forbidden** in the evidence path — it prints secret material into logs, turning verification into disclosure. Use `describe-secret` / `list-secret-version-ids` plus a harness asserting the typed decision.

**Operator readiness**: EKS fixture cluster `hulumi-fixture-aurora-identity`, namespace `hulumi-fixture-aurora`, SAs `aurora-runtime` / `aurora-migrator` / `aurora-broker`, roles `hulumi-fixture-aurora-{runtime,migrator,broker}`, secrets `hulumi-fixture-aurora-{master,app}`. **Unavailable ⇒ `blocked_by_operator`.**

**Proactive controls**: closed discriminated capability union (no `policyArns`, no `inlinePolicies`); fail-closed unknown role-kind; structural construction barrier.

#### §5C AI/LLM — **N/A**

No model, prompt, embedding or inference path. `ai_component: false` in the architect decisions.

#### Resource bounds and invariants

4 identities (2 privileged), 4 validation elements, Boolean serving; exhaustive BFS, 201/68/0-left at depth 8. Invariants as §5.

#### Gates

`pnpm -r lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`; `pnpm run format:check`; `pnpm audit --prod`; `pnpm -F @hulumi/k8s-baseline test`; `pnpm -F @hulumi/policies test`; `pnpm -F @hulumi/drift test`; `HULUMI_INTEGRATION=1 pnpm -F @hulumi/k8s-baseline test -- tests/integration/`; `pulumi preview --json` asserting the canary is absent from state.

#### Forbidden shortcuts (frozen)

No generic `policyArns`/`inlinePolicies`; no raw `SecretVersion`; no plaintext Kubernetes Secret; no inherited `hulumi:iac-role=true` on workload roles; **no source export of the M1 component**; no serving Deployment from partial outputs; **no mock-only closure**; policy-text absence is **not** effective denial; `SET ROLE`, same-password logins and session-timeout-as-lock-bound remain forbidden throughout.

#### Definition of Done

All B1–B10 green with twins and invalidation conditions honoured; five H3 cases green; the K8s pack **registered and demonstrated violating** in `policy-pack-runtime.test.ts` (export alone is not enforcement); upgrade and rollback previews captured with stable resource identity; live EKS/kind outcomes recorded or the milestone is `blocked_by_operator`; Evidence Log complete; **no claim of broker or database closure**.

### Milestones 2–5 — named, contracts deferred

**M2** broker workload + non-forgeable tenant/operation capability + the exhaustive live identity/subresource matrix (pairwise negatives across every discovered `pods/*`, `services/*`, `nodes/*` subresource, impersonate, CSR create/approve/sign, `aws-auth`, EKS access-entry, RBAC bind/escalate, with release-time discovery failing closed).
**M3** PostgreSQL 16 authority allowlist, privileged-session matrix, RLS end-to-end, sequences/routines/extensions closure.
**M4** alternating-user rotation with observed `AWSPENDING`, bounded overlap, live session retirement — plus global locks and `LISTEN`/`NOTIFY`, the two surfaces `FORCE RLS` provably cannot scope.
**M5** value-free receipts, release-time Kubernetes API subresource discovery failing closed, CloudTrail/endpoint evidence, live certification.

---

## 18. Lead decisions (answered — recorded, not re-opened)

**Architecture is locked: BROKERED SQL.** Physical isolation is rejected for this programme — the accepted interfaces, TLA spec and this runbook are already broker-shaped, and isolation would require new tenant provisioning, routing, migration/cutover and operations design.

1. **Semver** — deferred to release classification. Does **not** block M1.
2. **M2 sizing — YES.** M2 carries the broker **plus only the mandatory exhaustive live identity/subresource matrix already required by the accepted threat model**. No optional breadth is to be added.
3. **Operator fixture** — `hulumi-fixture-aurora-identity` readiness is owned by the lead/operator after critique. An absent fixture remains **`blocked_by_operator`**, never a pass.
