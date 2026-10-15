# Critique: EKS trusted-node label revocation M4a

Reviewed contract: `docs/slo/current/RUNBOOK-eks-trusted-node-label-revocation-m4a.md`
Decision: proceed with amendments incorporated below.

## CEO pass

The change closes a concrete false-trust condition without expanding the component’s product surface or adding dependencies. Immediate revocation can reduce workload availability during evidence failure. That consequence matches the component’s security meaning: a positive trust label must not outlive proof. Operators retain stable audit reasons and metrics to diagnose the failure.

Amendment: documentation and tests must describe `patched` as a mutation count covering additions and removals. No new product claim is made for physical cluster validation in this milestone.

## Engineering-lead pass

Two selectors can double-count Nodes and can let revocation-only candidates distort desired-capacity classification. Pagination can also exceed the configured bound only after the second query.

Amendments:

- Deduplicate both selector streams by UID, reject one name mapping to different UIDs, and enforce one global `maxNodesPerCycle` bound.
- Apply the pagination bound across the union, not independently per selector.
- Classify capacity from exact node-group members only.
- Keep the mutation plan discriminated so add and remove validation cannot share an ambiguous label-state predicate.

## Security pass

The dangerous implementations are an unguarded remove, removal of a conflicting value, an admission exception based only on the controller username, and a current-state check that proves only label presence.

Amendments:

- Revoke only the exact configured value.
- Bind remove patches to UID, resourceVersion, providerID and exact current label value before the remove operation.
- Reject malformed or unsafe local identity before constructing a revocation; fail closed without mutation when the exact label path/value cannot be proven.
- Validate the full patch shape in the adapter before sending it.
- Admission must prove exact one-label removal or exact one-label addition plus no other Node mutation.
- Preserve the known ServiceAccount-token reuse finding as separate M4b work; do not describe username matching as a complete identity boundary.

Residual risk: Kubernetes authentication identifies the ServiceAccount, not the originating managed Pod. Anyone who can obtain that ServiceAccount token can exercise its RBAC. This milestone reduces stale trust but does not resolve that reusable identity boundary.

## SRE pass

A per-node EC2 evidence failure can cause fail-secure removal and scheduling disruption. A stale labeled Node that has lost its ordinary node-group selector must still be reconciled. A patch race must not remove a newly changed label.

Amendments:

- Emit `node_revoked` with a stable reason and hashed Node reference.
- Preserve `provider_failure`, `stale_plan` and `patch_rejected` signals.
- Re-read the Node and apply mutation-specific plan validation immediately before PATCH.
- Count a revoked expected node-group member as missing trust; do not let a revocation-only outsider change capacity.
- Tests must cover selector disappearance, deduplication, global bounds and resourceVersion/label races.

Residual risk: a shared EKS, Auto Scaling or Kubernetes discovery failure ends the cycle before a trustworthy candidate/evidence set exists. The controller reports that failure and makes no mutation. A later successful cycle evaluates and revokes stale trust; this milestone does not claim synchronous revocation during total discovery loss.

## Final review

The milestone is bounded and defensive. It changes no dependency graph or external authority. The implementation may proceed only within the exact AgentBus lease and file allow-list, with BDD failures captured before production changes and exact-head/merged-main evidence required before closure.
