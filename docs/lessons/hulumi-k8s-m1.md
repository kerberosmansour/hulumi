# Lessons learned — Hulumi-K8s M1 (package skeleton + `HardenedHelmRelease` + `EksSubnetTagger`)

## Surprises

1. **`tagsApplied` output evaluation order.** Initial `EksSubnetTagger` implementation pushed `AppliedTag` entries onto a closure-captured array inside `pulumi.output(...).apply(...)` callbacks, then composed the output via `pulumi.all(collected)`. The composition ran synchronously during construction, before the apply callbacks fired — so the output resolved to `[]`. Fix: build the per-list arrays inside the `apply` (which now returns `AppliedTag[]`), then compose via `pulumi.all([publicTags, privateTags]).apply(...)`. The lesson is broader: closure-captured collections that depend on Pulumi `Output` resolution must NEVER be assembled outside an `apply` boundary.

2. **`Parameters<typeof Class>` doesn't work with class types.** TypeScript's `Parameters<>` requires a function type; classes need `ConstructorParameters<>`. Both test files initially used the wrong utility — typecheck caught it cleanly. Recorded so M2-M5 tests use the right shape from the start.

## Decisions

1. **Package layout: separate `@hulumi/k8s-baseline` package, NOT `@hulumi/baseline/k8s` subpath.** Per the design record. Implemented as a fourth workspace package alongside `baseline`, `policies`, `drift`. Workspace already includes `packages/*` so no `pnpm-workspace.yaml` edit was needed.

2. **`@pulumi/aws` as peer dep.** `EksSubnetTagger` is by definition AWS-specific (uses `aws.ec2.Tag`). Adding `@pulumi/aws` as a peer dep is acceptable — consumers using this component are already declaring AWS use by importing it. Documented in the package.json comments.

3. **`releaseName` defaults to component instance name verbatim.** The single most important M1 design call. Reverses Pulumi's "always add an 8-char random suffix" default. Two same-instance-name same-namespace components will collide loudly at preview time — this is a feature, not a bug. The migration cookbook for adopting the wrapper on existing suffixed releases lands in M5 (`docs/cookbooks/k8s-helm-release-rename.md`).

4. **`daemonSet: true` is opt-in, not auto-detected.** Per the design record's M1 commitment. Considered auto-detection via post-rendering Helm charts but rejected as fragile (charts that conditionally render DaemonSets on a values flag would mis-detect). Explicit opt-in is correct-by-construction.

5. **`COMPATIBILITY.md` + typed `TESTED_VERSIONS` const ship empty in M1.** First entries land in M2 with the three Istio charts. The warn-not-throw machinery is wired and tested even though no entries exist yet.

## Deltas from plan

- The runbook anticipated optionally adding `@pulumi/eks` as a peer dep for `EksSubnetTagger` typing. Decided NOT to add — the typed args don't need EKS-specific types (subnet IDs are plain strings; cluster name is a string). Keeps the install cost lower.
- The runbook anticipated possibly extending `pnpm-workspace.yaml`. The existing config already covered `packages/*` so no edit was needed. Recorded in Evidence Log.
- The kind integration test (`hardened-helm-release.kind.test.ts`) is **deferred to M5**. Rationale: writing it now requires `kind` available locally + a passing real Helm install round-trip, which adds a dev-environment dependency not currently expected of contributors. The mock-runtime BDD covers the wrapper's logic completely; the kind smoke test fits better as part of M5's CI integration sweep.

## What I'd do differently

- The output-evaluation timing bug in `EksSubnetTagger` would have been caught earlier by writing the `tagsApplied`-asserting test first (TDD discipline). Instead the initial implementation's `pulumi.all(collected)` shape looked plausible and shipped to `pnpm test` before being caught. The TDD ordering goes back into the M2 step-by-step.

## Carry-forward to M2

- The `chartClass: "istio"` enum extension in `HardenedHelmRelease` already lands here (mock-runtime test asserts the 480_000ms default). M2's `IstioFoundation` consumes it without needing a wrapper change.
- `@hulumi/baseline` and `@hulumi/k8s-baseline` are now two separate packages. The cross-package contract (K8s package may import _types_ from `baseline` but not runtime resources) is preserved.
