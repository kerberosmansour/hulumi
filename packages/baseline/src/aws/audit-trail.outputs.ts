import type * as pulumi from "@pulumi/pulumi";

export interface AuditTrailOutputs {
  trailArn: pulumi.Output<string>;
  trailName: pulumi.Output<string>;
  /** CloudWatch Logs group name receiving the trail (consume from IdentityAlarms.trailLogGroupName). */
  cloudWatchLogsGroupName: pulumi.Output<string>;
  cloudWatchLogsRoleArn: pulumi.Output<string>;
  /** True if the trail is multi-region. */
  multiRegion: pulumi.Output<boolean>;
  /** True if log-file validation is on (M9 invariant: always on). */
  logFileValidationEnabled: pulumi.Output<boolean>;
}
