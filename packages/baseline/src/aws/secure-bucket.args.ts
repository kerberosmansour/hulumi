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
  objectLock?: SecureBucketObjectLockConfig;
  lifecycleRules?: pulumi.Input<
    pulumi.Input<aws.types.input.s3.BucketLifecycleConfigurationRule>[]
  >;
  replication?: SecureBucketReplicationConfig;
}
