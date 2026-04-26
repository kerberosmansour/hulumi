# `@hulumi/k8s-baseline` — tested chart versions

This file is the human-readable companion to `src/compatibility.ts`'s `TESTED_VERSIONS` typed const. The typed const is the source of truth at runtime; this file documents the same data for human readers.

When `HardenedHelmRelease` (or any Hulumi K8s component installing a Helm chart) is given a chart version not listed here, it emits a `pulumi.log.warn` and proceeds. The consumer accepts the risk.

When this list is updated, update `src/compatibility.ts` in lockstep.

| Chart            | Repository                                            | Tested versions | Last verified | Notes                                       |
| ---------------- | ----------------------------------------------------- | --------------- | ------------- | ------------------------------------------- |
| _none yet at M1_ | _per-chart entries land in M2 with `IstioFoundation`_ | _—_             | _—_           | M1 ships the wrapper + warn machinery only. |

## How to add a chart entry

1. Run a kind integration test against the chart at the new version.
2. Update `src/compatibility.ts`'s `TESTED_VERSIONS` const with the chart name and version.
3. Append a row here documenting the verification date and any chart-class-specific notes (timeout overrides, required values).
4. Open a PR; the PR review confirms the kind test passed.
