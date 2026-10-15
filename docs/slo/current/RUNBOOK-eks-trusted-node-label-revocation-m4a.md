# Runbook: EKS trusted-node label revocation M4a

Status: executing
Owner: repository maintainers
Base revision: `9680af864a0b1dd375a1477480914a17ce017103`
AgentBus task: `t2_mva4kixq_f0241a8b-ab6`

## Problem and security invariant

The controller currently adds the configured NodeRestriction-prefixed trust label after EKS, Auto Scaling, EC2, zone, instance-type, taint and freshness checks. A Node that already has that exact label keeps it when later evidence fails. Candidate discovery also selects only the EKS node-group label, so a trusted Node can disappear from reconciliation after that ordinary label changes.

The invariant for this milestone is: whenever a bounded cycle can safely identify a candidate and its complete attestation evaluation denies it, or per-node EC2 evidence cannot be obtained, the exact configured trust value is removed with UID, resourceVersion, providerID and label-value compare-and-swap tests. A conflicting value is never removed. A shared provider-discovery failure remains fail closed and observable, but does not authorize mutation without a bounded candidate/evidence set.

## Scope contract

Only the following files may change:

- `docs/slo/current/RUNBOOK-eks-trusted-node-label-revocation-m4a.md`
- `docs/slo/critique/eks-trusted-node-label-revocation-m4a.md`
- `docs/slo/verify/eks-trusted-node-label-revocation-m4a.md`
- `docs/slo/lessons/eks-trusted-node-label-revocation-m4a.md`
- `docs/slo/completion/eks-trusted-node-label-revocation-m4a.md`
- `packages/k8s-baseline/src/trusted-node-label-reconciler-core.ts`
- `packages/k8s-baseline/src/trusted-node-label-controller.ts`
- `packages/k8s-baseline/src/trusted-node-label-controller-kubernetes.ts`
- `packages/k8s-baseline/src/trusted-node-label-reconciler.ts`
- `packages/k8s-baseline/tests/trusted-node-label-reconciler-core.test.ts`
- `packages/k8s-baseline/tests/trusted-node-label-controller.test.ts`
- `packages/k8s-baseline/tests/trusted-node-label-reconciler.test.ts`
- `packages/k8s-baseline/tests/trusted-node-label-runtime-boundary.test.ts`

No dependency, manifest, lockfile, version, publication, cloud, GitHub or live Kubernetes mutation is permitted. The reusable ServiceAccount authority issue is a separate architecture milestone and is not claimed fixed here.

## BDD contract

1. Given an unlabeled Node with complete fresh evidence, the kernel emits the existing four-operation exact add patch.
2. Given a Node holding the exact configured trust value and any malformed, missing, stale, mismatched, unhealthy or denied attestation, the kernel emits a five-operation revoke patch: test UID, test resourceVersion, test providerID, test the exact label value, then remove only that label path.
3. Given a conflicting protected-label value, the kernel denies and never emits removal.
4. Given a plan whose current Node changes identity, resourceVersion, providerID, mutation-specific label state or label value, validation rejects it before patch.
5. Candidate discovery returns the bounded, deduplicated union of exact node-group members and Nodes holding the exact configured protected value. A Node whose node-group selector disappears remains visible for revocation.
6. The Kubernetes adapter accepts only the exact add or revoke patch shape and rejects truncated, reordered, piggybacked or mismatched removal patches.
7. Admission permits the exact reconciler username to perform only the exact configured add or exact configured removal while all other Node fields remain unchanged. Every other principal must leave the protected label unchanged.
8. Successful revocation emits a stable `node_revoked` audit event with a hashed Node reference and the stable denial reason. Provider errors and audit records do not expose raw Node identity or provider responses.
9. Capacity uses node-group members rather than the revocation-only union, so a stale labeled outsider cannot make the node group appear ready.

## Implementation sequence

- Write the failing kernel, adapter, controller and admission regressions first.
- Add a discriminated add/remove reconciliation plan and exact JSON Patch shapes.
- Centralize fail-secure conversion from denial to revocation only when local Node and protected-label identity are safe to mutate.
- Expand candidate discovery to two exact selectors with one global deduplication and size bound.
- Recheck mutation-specific state immediately before PATCH.
- Extend admission and audit behavior without widening RBAC or cloud authority.
- Run focused tests, package tests, typecheck, build, lint, workspace checks and the existing dependency/security gates.
- Commit with signature and DCO, open a reviewed PR, require exact-head CI, merge only that head, then run Codex Security on the merged main revision.

## Evidence gates

- No manifest or lockfile diff.
- Official pinned OSV gate succeeds and preserves ordinary advisory reporting.
- Focused BDD regressions and the full `@hulumi/k8s-baseline` suite pass.
- Workspace build, typecheck, tests and lint pass.
- Semgrep, secret scanning and exact scope-drift checks pass.
- GitHub required checks all pass at the exact PR head.
- Merged-main Codex Security no longer reports “Trusted-node labels are never revoked when attestation fails”; independent findings remain tracked separately.

## Milestone tracker

| Milestone | State | Exit condition |
| --- | --- | --- |
| M4a plan and critique | done | Exact allow-list, BDD contract and adversarial review recorded |
| M4a implementation | done | BDD-first implementation stayed inside the allow-list |
| M4a verification | local done | Local evidence is recorded; exact-head GitHub and merged-main evidence remain ship gates |
| M4a retro and ship | local done | Lessons and completion records are ready; merge proof and merged-main scan are attached externally after shipping |
