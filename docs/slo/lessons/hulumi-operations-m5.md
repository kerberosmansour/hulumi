# Lessons Learned — hulumi-operations Milestone 5 (combined M11)

## What changed

- Three new threat-model scenarios under `skills/hulumi-threat-model/scenarios/`:
  - `operations-patch-compliance-lapse`
  - `operations-detective-services-disabled`
  - `operations-audit-pipeline-broken`
- `list-scenarios.mjs` updated to enumerate the 14 prebuilt scenarios in declared order.
- `tests/skill-bdd/hulumi-threat-model.test.ts` lister assertion bumped from 11 to 14 scenarios.
- Versions bumped: `@hulumi/baseline`, `@hulumi/policies`, `@hulumi/drift` from 1.1.0 → 1.2.0; `@hulumi/k8s-baseline` from 1.0.0-pre.1 → 1.0.0 (first stable).
- CHANGELOG.md `[1.2.0]` entry covering all M1–M10 deliverables + the M11 ops scenarios + the migration notes for K8s consumers (fail-closed defaults + explicit-selector requirement).

## Design decisions and why

- **Three scenarios, not one** — each Ops milestone (M7 patch, M8 detective, M9 audit) gets its own scenario. Splitting them lets consumers run focused threat-modeling sessions when adopting one component at a time.
- **`operations-detective-services-disabled` covers both "service off" AND "route broken"** — the failure mode isn't just disabled services; it's services emitting findings to a SNS topic nobody reads. STRIDE-T captures the "tampered route" path.
- **`operations-audit-pipeline-broken` includes StopLogging as the spoofed-source threat** — the most common attacker behavior in audit-evasion incidents. Maps directly to the existing `IdentityAlarms.cloudtrail-tampered` event.
- **Release version bump is the M11 deliverable, not an M11 release event** — actual `npm publish` happens at tag time. M11 ships the _readiness_: package.json versions, CHANGELOG, scenario lister, and the four-package release path (which already landed in M1).

## Mistakes made

- Initial CHANGELOG edit accidentally added a placeholder line "[no inline change to 1.1.0 entry]" that left a duplicate `## [1.1.0]` heading. Cleaned up before the test pass.

## Test patterns

- The skill-bdd lister test is a stability contract. New scenarios append at the end; the BDD test asserts the exact ordered list. Catches accidental reordering or accidental scenario-deletion.

## Carry-forward to v1.3.0

- The runbook flagged in `docs/v1.3-ideation.md` (committed earlier) as the v1.3 forward path: ECR pull-through cache, golden AMI pipeline, ASG instance refresh, image rebuild triggers. Out of M1-M11 scope; the v1.2.0 release closes the K8s + Operations security tranche.
- Real-AWS sandbox integration tests for M7 (Ec2PatchBaseline / Ec2PatchWaves), M8 (DetectiveServicesEnable), M9 (AuditTrail), M10 (HulumiOperationsHardeningPack) are deferred follow-ups. Each carries the same gating shape from M1 (env-flag + skip-or-fail).
- The kind cluster integration tests (deferred from M2 / M4) and EKS sandbox integration tests (deferred from M5 / M6) await CI infrastructure for kind binary + EKS sandbox secrets.

## Closing the runbook

All 11 milestones are `done` in the Milestone Tracker (Section 2 of the runbook). Final test totals: 86 baseline + 106 policies + 58 drift + 149 k8s-baseline + 28 skill-bdd + 4 example smoke = **431 passing tests**. Static analysis (typecheck, build, lint, license-boundary, exact-pin-guard) all green.
