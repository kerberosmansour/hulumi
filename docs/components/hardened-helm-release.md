---
title: HardenedHelmRelease
description: Helm release wrapper enforcing exact version + https/oci repository + stable instance-name release default + opt-in Fargate-exclusion affinity. Full reference at M5.
---

# `HardenedHelmRelease`

`@hulumi/k8s-baseline.HardenedHelmRelease` — wraps `@pulumi/kubernetes` `helm.v3.Release` with five universal policies any IaC user rebuilds:

1. Required `version` — refuses missing, `"latest"`, and semver ranges (`^`, `~`, `>=`).
2. Required `repository` — refuses anything that doesn't start with `https://` or `oci://`.
3. Stable release name — defaults to the ComponentResource instance name verbatim. **No random suffix.** Override with explicit `releaseName`.
4. Opt-in Fargate-exclusion `nodeAffinity` — `daemonSet: true` injects the `eks.amazonaws.com/compute-type NotIn fargate` selector into `values.affinity`. Refuses to clobber a pre-set `values.affinity`.
5. Chart-class-aware timeout — `chartClass: "default" | "istio"` selects 300s vs 480s.

Untested chart versions emit a `pulumi.log.warn` (not an error). See [`COMPATIBILITY.md`](../../packages/k8s-baseline/COMPATIBILITY.md).

Full reference doc lands at M5 alongside the v1.0.0 release. Source: [packages/k8s-baseline/src/hardened-helm-release.ts](../../packages/k8s-baseline/src/hardened-helm-release.ts).
