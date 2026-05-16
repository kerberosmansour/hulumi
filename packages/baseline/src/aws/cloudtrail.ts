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

  let cloudWatchLogsGroupArn: pulumi.Output<string> | undefined;
  let cloudWatchLogsRoleArn: pulumi.Output<string> | undefined;
  const extraDeps: pulumi.Resource[] = [];

  // Startup-Hardened: emit a CloudWatch Logs group for CloudTrail integration
  // (CIS §3.4 advisory; foundational for downstream metric filters in v1.1+).
  // This is the 4th tier-delta sub-resource kind beyond Access Analyzer,
  // GuardDuty DetectorFeatures, and Config aggregator.
  if (isStartupHardened) {
    const logGroup = new aws.cloudwatch.LogGroup(
      `${args.namePrefix}-cloudtrail-logs`,
      {
        retentionInDays: 365,
        kmsKeyId: args.kmsKeyArn,
        tags: args.tags,
      },
      parent,
    );
    result.logGroup = logGroup;

    // CloudTrail only writes to a CloudWatch Logs group when the trail
    // carries cloudWatchLogsGroupArn + cloudWatchLogsRoleArn and that
    // role can write to the group. Without this the group exists but
    // receives zero events, so downstream IdentityAlarms metric filters
    // (root use, MFA-off, CloudTrail tampering, IAM policy changes,
    // console login without MFA) silently never fire — a false security
    // signal. Mirrors the AuditTrail component's proven wiring.
    const cwlRole = new aws.iam.Role(
      `${args.namePrefix}-cloudtrail-cwlogs-role`,
      {
        name: `${args.namePrefix}-cloudtrail-cwlogs-role`,
        assumeRolePolicy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "cloudtrail.amazonaws.com" },
              Action: "sts:AssumeRole",
            },
          ],
        }),
        tags: args.tags,
      },
      parent,
    );
    const cwlRolePolicy = new aws.iam.RolePolicy(
      `${args.namePrefix}-cloudtrail-cwlogs-policy`,
      {
        name: `${args.namePrefix}-cloudtrail-cwlogs-policy`,
        role: cwlRole.id,
        policy: pulumi.output(logGroup.arn).apply((logGroupArn: string) =>
          JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Action: ["logs:CreateLogStream", "logs:PutLogEvents"],
                Resource: `${logGroupArn}:*`,
              },
            ],
          }),
        ),
      },
      parent,
    );
    cloudWatchLogsGroupArn = pulumi.output(logGroup.arn).apply((arn: string) => `${arn}:*`);
    cloudWatchLogsRoleArn = cwlRole.arn;
    // CloudTrail validates the role can write to the group at create
    // time, so the inline policy must exist first.
    extraDeps.push(cwlRolePolicy);
  }

  const dependsOn = [...(args.dependsOn ?? []), ...extraDeps];
  const trailOpts: pulumi.CustomResourceOptions = {
    parent: args.parent,
    ...(dependsOn.length > 0 ? { dependsOn } : {}),
  };

  const cwlTrailArgs =
    cloudWatchLogsGroupArn !== undefined && cloudWatchLogsRoleArn !== undefined
      ? { cloudWatchLogsGroupArn, cloudWatchLogsRoleArn }
      : {};

  result.trail = new aws.cloudtrail.Trail(
    `${args.namePrefix}-trail`,
    {
      s3BucketName: args.logBucketId,
      kmsKeyId: args.kmsKeyArn,
      ...cwlTrailArgs,
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
