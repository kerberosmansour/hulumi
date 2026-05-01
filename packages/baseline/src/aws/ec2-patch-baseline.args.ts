import type * as pulumi from "@pulumi/pulumi";

import type { Tier } from "./tier";

/** Patch:Group tag values are tightened to a 3-element enum (Flaw 2 fix in M1). */
export type PatchGroupTier = "dev" | "staging" | "production";
export const PATCH_GROUP_VALUES: ReadonlySet<PatchGroupTier> = new Set([
  "dev",
  "staging",
  "production",
]);

/** Reboot policy — discriminated union forcing the consumer to write a comment for `NoReboot`. */
export type RebootOption =
  | { kind: "RebootIfNeeded" }
  | {
      kind: "NoReboot";
      /** Required free-text rationale recorded as a tag for audit. */
      hulumi_decision_comment: string;
    };

export interface ComplianceMetric {
  /** SNS topic ARN to publish patch compliance changes to. Required. */
  topicArn: pulumi.Input<string>;
  /** Severities to route. Bounded at 4. */
  severities?: Array<"CRITICAL" | "IMPORTANT" | "MEDIUM" | "LOW">;
}

export interface StaggeringConfig {
  /** CRC32-mod bucket count for synchronized-reboot mitigation. Default 4. Max 16. */
  bucketCount?: number;
}

export const MAX_STAGGERING_BUCKETS = 16;
export const MAX_COMPLIANCE_SEVERITIES = 4;

export interface Ec2PatchBaselineArgs {
  /** Patch group tier (drives the `Patch:Group` tag value). */
  patchGroup: PatchGroupTier;
  /** Tier — drives default schedule cadence. */
  tier: Tier;
  /** Maintenance window cron expression (e.g. `"cron(0 4 ? * SUN *)"`). Required. */
  scheduleCron: string;
  /** Maintenance window duration in hours (1-24). */
  durationHours?: number;
  /** Cutoff before MW close (hours). Must be < durationHours. */
  cutoffHours?: number;
  /** Reboot policy. Default `{ kind: "RebootIfNeeded" }` at both tiers. */
  rebootOption?: RebootOption;
  /** ARN of the IAM role SSM Maintenance Windows assumes. Required. */
  serviceRoleArn: pulumi.Input<string>;
  /** ARN of the S3 bucket the Resource Data Sync writes to. Required. */
  resourceDataSyncBucketName: pulumi.Input<string>;
  /** Region for the Resource Data Sync. Defaults to provider region. */
  region?: pulumi.Input<string>;
  /** Compliance-metric SNS routing. Required. */
  complianceMetric: ComplianceMetric;
  /** CRC32-bucket staggering config. */
  staggering?: StaggeringConfig;
  /** Tags merged onto emitted resources. */
  tags?: Record<string, string>;
}
