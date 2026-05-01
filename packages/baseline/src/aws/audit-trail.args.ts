import type * as pulumi from "@pulumi/pulumi";

import type { Tier } from "./tier";

export interface AuditTrailArgs {
  tier: Tier;
  /** KMS key ARN used to encrypt CloudTrail events at rest. Required (no default to AWS-managed). */
  kmsKeyArn: pulumi.Input<string>;
  /** Pre-existing SecureBucket-shaped S3 bucket for CT log archive. */
  archiveBucketName: pulumi.Input<string>;
  /** Pre-existing SecureBucket ARN — used in the bucket policy generated for CloudTrail. */
  archiveBucketArn: pulumi.Input<string>;
  /** Retention for the encrypted CW Logs group. Default 365 days. */
  cloudWatchLogsRetentionDays?: number;
  /** Optional name prefix. Default: the component instance name. */
  namePrefix?: string;
  tags?: Record<string, string>;
}
