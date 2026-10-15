# Lessons Learned — eks-trusted-node-label-reconciler Milestone 1

## What changed

- Added an internal deterministic kernel that independently reconciles Node,
  EKS node-group, Auto Scaling membership and EC2 identity evidence before it
  can plan one NodeRestriction-protected label addition.
- Added 17 abuse, concurrency, transition, empty-state and bounds tests plus the
  M1 threat model, critique, verification and completion evidence.

## Results vs thesis

- N/A — not a value-bearing milestone. M1 establishes the decision boundary and
  removes unsafe authorization classes before a deployable controller exists.

## Outcome vs promise

- N/A — no operator outcome is promised in M1. The production functions behave
  as specified, while real AWS/Kubernetes and recovery journeys remain explicit
  M2/M3 gates.

## Design decisions and why

- Full provider attestation precedes both `noop` and `patch` so a preloaded
  expected label cannot bypass identity checks.
- EKS supplies the exact allowed ASG set; a complete ASG snapshot set must show
  the instance in exactly one healthy, in-service membership. This makes rolling
  updates safe without first-match ambiguity.
- The JSON Patch tests Node UID, resourceVersion and provider ID before adding
  one escaped label path. The local plan validator repeats those checks for an
  earlier, cheaper stale-plan rejection.
- Ordinary zone and instance-type labels are agreement checks only. They never
  replace EKS/ASG/EC2 evidence as authority.
- M1 accepts standard regional AZ provider IDs only. Expanding to Local Zones or
  Wavelength requires an explicit policy and live evidence rather than a loose
  prefix comparison.

## Mistakes made

- The first baseline command ran before the new worktree had dependencies, so it
  failed with `vitest: command not found`. The exact existing lock graph was then
  installed offline with lifecycle scripts disabled before the real baseline.
- The first Semgrep attempt combined registry auto-configuration with metrics
  disabled, an unsupported CLI combination. It was recorded as a tool error and
  rerun successfully with the documented auto configuration.
- A hardening test initially expected an AZ-policy mismatch for a malformed
  provider ID. The parser correctly rejected it earlier as malformed; the test
  was corrected to isolate a real provider/EC2 AZ disagreement.

## Root causes

- Managed worktrees do not share `node_modules`, even when the repository object
  store and pnpm content store are available.
- Semgrep's `--config=auto` needs registry access and therefore cannot run with
  `--metrics=off`; a pinned local rule pack would avoid that coupling.
- Security failure ordering is observable through stable deny reasons, so each
  negative test must isolate one failed invariant.

## What was harder than expected

- Distinguishing evidence completeness from authorization was subtle during a
  rolling update: all EKS-listed ASGs need fresh snapshots, while exactly one of
  them may contain the node. Missing evidence and missing membership are separate
  closed states.

## Naming conventions established

- Trust decisions use `deny | noop | patch` and stable snake-case deny reasons.
- AWS inputs are named `*Attestation`; the Kubernetes object is a `NodeSnapshot`.
- Concurrency data travels in `ReconciliationPlan`, and capacity uses
  `zero_capacity | awaiting_nodes | reconciling | ready | invalid`.

## Test patterns that worked well

- Start with one fully valid cross-source fixture, then mutate one trust fact per
  test. This keeps the observed deny reason tied to the intended control.
- Assert the entire JSON Patch array and separately count non-test operations so
  accidental extra mutations cannot hide in a partial match.
- Exercise the expected-value `noop` again with missing membership to prove that
  attestation actually runs before the apparent no-op.

## Missing tests that should exist now

- M2 needs adapter tests that construct snapshots only from actual AWS SDK and
  Kubernetes client responses and fail closed on pagination, throttling, partial
  responses and credential/identity disagreement.
- M2 needs model-checking evidence for delete/recreate, concurrent label writes,
  stale AWS views and retry transitions before any patch authority ships.
- M3 needs isolated EKS tests for a real rolling replacement, deliberate zero
  capacity, scale-from-zero recovery, admission denial and audit/alert delivery.
- Local Zone/Wavelength provider IDs remain unsupported until their identity and
  policy semantics are designed and qualified.

## Rules for the next milestone

- Complete the TLA+ model before introducing a live patch loop.
- Keep AWS authority read-only and exact; never accept caller-supplied provider
  snapshots at the public boundary.
- Combine least-privilege RBAC with admission policy because RBAC cannot restrict
  a Node patch to one label key.
- Any new AWS/Kubernetes dependency must pass the repository's pinned OSV gate,
  provenance review and full graph-diff review before install, build or test.
- Preserve the M1 kernel as the only place that converts evidence into a mutation
  decision; adapters must not duplicate or weaken its controls.

## Template improvements suggested

- `/slo-plan` should reserve the matching `docs/slo/verify/<prefix>-m<N>.md`
  path in every exact allow-list so `/slo-verify` does not require a later scope
  amendment.

## Issue-filing disposition

- No new issue candidate was filed. Every product follow-up above is already in
  the open parent issue #305 and its M2/M3 tracker; filing duplicates would split
  ownership. The template improvement remains local process feedback rather than
  a public filing in this maintenance pass.
