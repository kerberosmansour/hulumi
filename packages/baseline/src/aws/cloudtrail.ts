// CloudTrail — internal helper.
//
// Sandbox tier: single-region trail with management events.
// Startup-Hardened tier: multi-region + log-file validation + data events
// scoped to the supplied log bucket (CIS §3.1, §3.2, §3.7).

import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import type { Tier } from "./tier";

export interface CloudTrailHelperArgs {
  tier: Tier;
  parent: pulumi.Resource;
  namePrefix: string;
  tags: Record<string, string>;
  logBucketId: pulumi.Input<string>;
  kmsKeyArn: pulumi.Input<string>;
  dataEventBucketArn?: pulumi.Input<string>;
  dependsOn?: pulumi.Input<pulumi.Resource>[];
}

export interface CloudTrailHelperResult {
  trail: aws.cloudtrail.Trail;
  /** CloudWatch Logs group for CloudTrail (Startup-Hardened only). */
  logGroup?: aws.cloudwatch.LogGroup;
}

export function createCloudTrail(args: CloudTrailHelperArgs): CloudTrailHelperResult {
  const isStartupHardened = args.tier === "startup-hardened";
  const parent = { parent: args.parent } as const;
  const eventSelectors =
    isStartupHardened && args.dataEventBucketArn !== undefined
      ? [
          {
            readWriteType: "All",
            includeManagementEvents: true,
            dataResources: [
              {
                type: "AWS::S3::Object",
                values: [args.dataEventBucketArn],
              },
            ],
          },
        ]
      : [
          {
            readWriteType: "All",
            includeManagementEvents: true,
          },
        ];

  const result: CloudTrailHelperResult = {
    trail: undefined as unknown as aws.cloudtrail.Trail,
  };

  // Startup-Hardened: emit a CloudWatch Logs group for CloudTrail integration
  // (CIS §3.4 advisory; foundational for downstream metric filters in v1.1+).
  // This is the 4th tier-delta sub-resource kind beyond Access Analyzer,
  // GuardDuty DetectorFeatures, and Config aggregator.
  if (isStartupHardened) {
    result.logGroup = new aws.cloudwatch.LogGroup(
      `${args.namePrefix}-cloudtrail-logs`,
      {
        retentionInDays: 365,
        kmsKeyId: args.kmsKeyArn,
        tags: args.tags,
      },
      parent,
    );
  }

  const trailOpts: pulumi.CustomResourceOptions = {
    parent: args.parent,
    ...(args.dependsOn !== undefined ? { dependsOn: args.dependsOn } : {}),
  };

  result.trail = new aws.cloudtrail.Trail(
    `${args.namePrefix}-trail`,
    {
      s3BucketName: args.logBucketId,
      kmsKeyId: args.kmsKeyArn,
      isMultiRegionTrail: isStartupHardened,
      includeGlobalServiceEvents: true,
      enableLogFileValidation: isStartupHardened,
      enableLogging: true,
      eventSelectors,
      tags: args.tags,
    },
    trailOpts,
  );

  return result;
}
