# Lessons Learned — hulumi-operations Milestone 1 (combined M7)

## What changed

- New `Ec2PatchBaseline` component in `@hulumi/baseline.aws` — wraps SSM Patch Baseline + Patch Group + Maintenance Window + Target + RunCommand task + ResourceDataSync + compliance MetricAlarm. Discriminated-union `RebootOption`. CRC32-bucket staggering bound at 16.
- New `Ec2PatchWaves` component composes up to 3 `Ec2PatchBaseline` instances (dev → staging → production) with a `aws.cloudwatch.CompositeAlarm` health gate between waves. No Lambda.
- Tier semantics: `sandbox` allows single-wave (dev only); `startup-hardened` requires all three. `NoReboot` is forbidden at `startup-hardened`.

## Design decisions and why

- **`RebootOption` as a discriminated union with a required comment** — `{ kind: "NoReboot", hulumi_decision_comment: string }` forces the consumer to write the rationale in code. The 8-char minimum (same floor as M2's `publicJustification`) catches `""` and `"ok"` accidents without requiring prose.
- **`NoReboot` rejected at `startup-hardened`** — the breach risk (silent un-patching) is worse than a 04:00 UTC reboot. Per the design record's "Top risks: Breach" section. Type-system enforced via the constructor check.
- **`Patch:Group` tag enum tightened to `dev | staging | production`** — Flaw 2 fix from the runbook. Free-form was the foot-gun.
- **CompositeAlarm gate, not Step Functions / Lambda** — the runbook's "no-Lambda" wedge constraint. The composite alarm's OK state can be wired via Pulumi `Output<bool>` into a downstream wave's `MaintenanceWindow.enabled` field; consumer supplies the wiring (M11 docs may add a cookbook).
- **`Ec2PatchWaveArgs` type-elides `patchGroup` and `tier`** — `Omit<Ec2PatchBaselineArgs, "patchGroup" | "tier">`. The wave-composer fixes those two fields by position; consumers can't accidentally mismatch.

## Mistakes made

- Initial draft of `Ec2PatchWaves` had two unused locals (`stagingBaseline`, `productionBaseline`) and a `void` workaround for `noUnusedLocals`. Cleaner: just don't bind them. Removed.
- Initial CompositeAlarm `alarmRule` used `\"...\"` escapes inside a TypeScript template literal — eslint's `no-useless-escape` flagged. Switched to plain `"..."` since the literal is delimited by backticks.

## Invariants

- `patchGroup ∈ {dev, staging, production}`.
- `scheduleCron` must be `cron(...)` or `rate(...)`.
- `durationHours ∈ [1, 24]`, `cutoffHours ∈ [0, durationHours - 1]`.
- `staggering.bucketCount ∈ [1, 16]`.
- `complianceMetric.severities` length ≤ 4, non-empty.
- `rebootOption.kind === "NoReboot"` ⇒ `hulumi_decision_comment.length ≥ 8` AND `tier !== "startup-hardened"`.
- `Ec2PatchWaves` at `startup-hardened` requires all three waves.

## Bounds

- `MAX_STAGGERING_BUCKETS = 16`.
- `MAX_COMPLIANCE_SEVERITIES = 4`.

## Carry-forward

- The composite-alarm gate pattern is reusable for any future "wave-of-waves" orchestration without a runtime executor.
- `Patch:Group` tag enum is the canonical operating-tier shape; M8/M9/M10 should reuse the same `dev | staging | production` discriminator.
- `RebootOption` discriminated-union pattern (kind + required-comment) generalizes to other typed escape hatches the operations milestones might need.
