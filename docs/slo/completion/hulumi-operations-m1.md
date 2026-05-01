# Completion Summary — hulumi-operations Milestone 1 (combined M7)

## Goal completed

`Ec2PatchBaseline` and `Ec2PatchWaves` exist as `@hulumi/baseline.aws` exports. The wedge: a Hulumi consumer can `pulumi up` an account-level wave-based patch posture in ~30 lines of TypeScript, with tier-aware reboot defaults and a CompositeAlarm health gate between waves.

## Files changed

### Added (source)

- `packages/baseline/src/aws/ec2-patch-baseline.{args,outputs,ts}.ts`.
- `packages/baseline/src/aws/ec2-patch-waves.{args,outputs,ts}.ts`.

### Added (tests)

- `packages/baseline/tests/ec2-patch-baseline.test.ts` — 10 BDD scenarios.
- `packages/baseline/tests/ec2-patch-waves.test.ts` — 4 BDD scenarios.

### Added (docs)

- `docs/components/ec2-patch-baseline.md`.
- `docs/components/ec2-patch-waves.md`.
- `docs/slo/lessons/hulumi-operations-m1.md`.
- `docs/slo/completion/hulumi-operations-m1.md`.

### Modified

- `packages/baseline/src/aws/index.ts` — re-exports.

## Tests added

14 BDD tests:

**Ec2PatchBaseline** (10):

- Emits all SSM resources + compliance alarm.
- `Patch:Group` tag enum tightened to `dev|staging|production`.
- Default reboot is `RebootIfNeeded`.
- `NoReboot` requires `hulumi_decision_comment >= 8 chars`.
- `NoReboot` at `startup-hardened` tier rejected.
- `NoReboot` at sandbox with comment succeeds and tags the comment.
- Invalid `scheduleCron` rejected.
- `durationHours` out of range rejected.
- `cutoffHours >= durationHours` rejected.
- `staggering.bucketCount > 16` rejected.
- `complianceMetric.severities > 4` rejected.

**Ec2PatchWaves** (4):

- `startup-hardened` with all three waves emits the composite alarm gate.
- `sandbox` degrades cleanly to single-wave (no composite alarm).
- `startup-hardened` without staging refused.
- `startup-hardened` without production refused.

## Static analysis evidence

| Check               | Result                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `pnpm -r typecheck` | green                                                                                                      |
| `pnpm -r build`     | green                                                                                                      |
| `pnpm -r lint`      | green                                                                                                      |
| license-boundary    | OK                                                                                                         |
| Full tests          | **74** baseline (was 59; +15) / 96 policies / 58 drift / 149 k8s-baseline / 28 skill-bdd / 4 example smoke |

## Compatibility

- No changes to existing `SecureBucket`, `AccountFoundation`, `MonitoringFoundation`, `IdentityAlarms`. All baseline tests still pass.
- New components are additive `@hulumi/baseline.aws` exports.

## Invariants and bounds

- `MAX_STAGGERING_BUCKETS = 16`, `MAX_COMPLIANCE_SEVERITIES = 4`.
- `Patch:Group ∈ {dev, staging, production}`.
- `RebootOption` is a discriminated union; `NoReboot` requires comment + non-startup-hardened tier.

## Documentation updated

- `docs/components/ec2-patch-baseline.md`, `docs/components/ec2-patch-waves.md` (new).

## Deferred follow-ups

- **Real-AWS sandbox integration tests** under `packages/baseline/tests/integration/aws-ops/` — the runbook anticipates them; deferred until AWS sandbox env is wired in.
- **End-to-end wiring example** showing `Ec2PatchWaves.healthGateAlarmArn` driving downstream `MaintenanceWindow.enabled` via `Output<bool>`.
- **Components index entry** for the two new components (M11's release readiness).

## Known non-blocking limitations

- Resource Data Sync defaults to `us-east-1` when `region` is unset. Consumers in other regions must pass `region` explicitly.
- The composite-alarm `alarmRule` uses string-concat over the per-wave alarm ARNs, which only resolves correctly at apply time. Mock-runtime tests don't verify the rule string shape.
