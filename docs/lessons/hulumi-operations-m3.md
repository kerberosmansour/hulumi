# Lessons Learned — hulumi-operations Milestone 3 (combined M9)

## What changed

- New `AuditTrail` component in `@hulumi/baseline.aws` — multi-region CloudTrail with log-file validation, KMS-encrypted CW Logs (configurable retention, default 365 days), and the CT-to-CWL IAM role.
- Existing `IdentityAlarms` component already covers the canonical 6 events the runbook calls out (root use, IAM key creation, MFA disabled, IAM policy change, CloudTrail tampered, console-no-MFA). M9 wires `AuditTrail.cloudWatchLogsGroupName` directly into `IdentityAlarms.trailLogGroupName`.

## Design decisions and why

- **Multi-region + log-file validation are NOT optional** — both encoded as `pulumi.output(true)` outputs. Single-region trails miss ops in other regions; log-file validation is the cryptographic anti-tampering signal that Identity Alarm 5 watches.
- **KMS key required, not AWS-managed default** — same pattern as M5's `EksBackupFoundation`. Forces explicit at-rest encryption choice.
- **SecureBucket-backed archive is consumer-supplied** — the component takes `archiveBucketName` + `archiveBucketArn` rather than constructing its own. Avoids a second SecureBucket inside this component (which would conflict with consumers who already manage their archive bucket lifecycle externally).
- **Retention defaults to 365 days** — covers a year of audit retention without forcing the consumer to think about it. Still configurable for shorter sandbox windows.

## Mistakes made

- Initial draft used `pulumi.all([logGroup.arn]).apply(([logGroupArn]: [string]) => ...)` for the role policy. TypeScript's overload resolution didn't match the tuple destructure. Switched to `pulumi.output(logGroup.arn).apply((arn: string) => ...)`.

## Invariants

- `kmsKeyArn` required.
- `archiveBucketName` and `archiveBucketArn` both required.
- `cloudWatchLogsRetentionDays > 0` (default 365).
- Multi-region + log-file validation always on (output-confirmed).

## Carry-forward

- `AuditTrail.cloudWatchLogsGroupName` is the canonical input for `IdentityAlarms.trailLogGroupName`. M11 docs should call this out as the recommended wiring pattern.
- The "always on" invariant pattern (multi-region, log-file validation) is the right shape for any future "this MUST be true" hardening — encode as a `pulumi.output(true)` output, no arg knob.
