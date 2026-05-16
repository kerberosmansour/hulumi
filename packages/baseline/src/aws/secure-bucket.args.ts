import type * as pulumi from "@pulumi/pulumi";
import type * as aws from "@pulumi/aws";
import type { Tier } from "./tier";

export interface SecureBucketObjectLockConfig {
  mode: "governance" | "compliance";
  days: number;
}

export interface SecureBucketReplicationConfig {
  role: pulumi.Input<string>;
  destinationBucketArn: pulumi.Input<string>;
  destinationKmsKeyArn?: pulumi.Input<string>;
}

export interface SecureBucketAwsServiceLogDeliveryConfig {
  cloudTrail?: boolean;
  config?: boolean;
}

export interface SecureBucketArgs {
  tier: Tier;
  kmsKeyArn?: pulumi.Input<string>;
  logBucketArn?: pulumi.Input<string>;
  forceDestroy?: pulumi.Input<boolean>;
  awsServiceLogDelivery?: SecureBucketAwsServiceLogDeliveryConfig;
  /**
   * Object Lock for the Startup-Hardened tier. Omit for the secure
   * default (GOVERNANCE, 30 days); pass a config to tune mode/days; pass
   * `false` to disable Object Lock entirely. `false` is required for AWS
   * Config / CloudTrail delivery buckets: AWS Config's PutDeliveryChannel
   * validation does a write-then-delete that Object Lock default
   * retention blocks, surfacing as InsufficientDeliveryPolicyException.
   */
  objectLock?: SecureBucketObjectLockConfig | false;
  lifecycleRules?: pulumi.Input<
    pulumi.Input<aws.types.input.s3.BucketLifecycleConfigurationRule>[]
  >;
  replication?: SecureBucketReplicationConfig;
}
