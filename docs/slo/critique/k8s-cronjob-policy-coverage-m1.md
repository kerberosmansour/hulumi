# SLO critique: Kubernetes CronJob policy coverage M1

Decision: **READY**. The user's standing autonomous instruction confirms this bounded milestone.

## CEO pass

The defect contradicts the advertised rule coverage and can silently admit high-blast-radius CronJobs. A narrow extractor correction is appropriate before larger feature work. Publication remains a coordinated later milestone.

## Engineering lead pass

Use explicit resource-type branches rather than a recursive property search. The Kubernetes schema has one authoritative PodSpec path for each supported kind, and explicit paths prevent a decoy sibling object from winning. Preserve the existing Job, Deployment, StatefulSet, DaemonSet, ReplicaSet, and Pod paths.

## Security pass

Regression tests must exercise all four rules, application and init containers, all three host namespaces, and a decoy `spec.template.spec`. The change must not broaden suppression behavior or accept an alternate caller-selected path. No dependency admission is needed because manifests and lockfiles are frozen; OSV still provides full-graph evidence.

## Operations pass

This changes preview-time policy evaluation only. It does not create, update, or delete Kubernetes resources. Existing CronJobs that violate WL-1 through WL-4 may begin reporting violations on upgrade, so the rollout and component indexes must name the corrected path.

## Required adjustments incorporated

- The runbook names the authoritative CronJob path.
- The allow-list includes only implementation, direct BDD coverage, documentation, and SLO evidence.
- Exact-head CI and merged-main Codex Security validation are exit gates.
- Package publication and version changes remain outside M1.
