import type * as pulumi from "@pulumi/pulumi";

export interface Ec2PatchBaselineOutputs {
  patchBaselineId: pulumi.Output<string>;
  patchGroupTagValue: pulumi.Output<string>;
  maintenanceWindowId: pulumi.Output<string>;
  resourceDataSyncName: pulumi.Output<string>;
  rebootMode: pulumi.Output<"RebootIfNeeded" | "NoReboot">;
  noRebootDecisionComment: pulumi.Output<string | undefined>;
  /** ARN of the CloudWatch alarm that wires compliance metric → SNS. */
  complianceAlarmArn: pulumi.Output<string>;
  /** CRC32-bucket count actually used for stagger mitigation. */
  staggerBucketCount: pulumi.Output<number>;
}
