import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import type { AuditTrailArgs } from "./audit-trail.args";
import type { AuditTrailOutputs } from "./audit-trail.outputs";
import { assertValidTier } from "./tier";

export const AUDIT_TRAIL_COMPONENT_TYPE = "hulumi:baseline:aws:AuditTrail";

export class AuditTrail extends pulumi.ComponentResource implements AuditTrailOutputs {
  public readonly trailArn: pulumi.Output<string>;
  public readonly trailName: pulumi.Output<string>;
  public readonly cloudWatchLogsGroupName: pulumi.Output<string>;
  public readonly cloudWatchLogsRoleArn: pulumi.Output<string>;
  public readonly multiRegion: pulumi.Output<boolean>;
  public readonly logFileValidationEnabled: pulumi.Output<boolean>;

  constructor(name: string, args: AuditTrailArgs, opts?: pulumi.ComponentResourceOptions) {
    super(AUDIT_TRAIL_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    assertValidTier(args.tier);
    if (args.kmsKeyArn === undefined) {
      throw new Error(`AuditTrail: kmsKeyArn is required (component "${name}")`);
    }
    if (args.archiveBucketName === undefined || args.archiveBucketArn === undefined) {
      throw new Error(
        `AuditTrail: archiveBucketName and archiveBucketArn are required (component "${name}")`,
      );
    }
    const retention = args.cloudWatchLogsRetentionDays ?? 365;
    if (retention <= 0) {
      throw new Error(
        `AuditTrail: cloudWatchLogsRetentionDays must be > 0 (got ${retention}) (component "${name}")`,
      );
    }
    const prefix = args.namePrefix ?? name;
    const baseTags: Record<string, string> = {
      ...(args.tags ?? {}),
      "hulumi:component": "AuditTrail",
      "hulumi:tier": args.tier,
    };

    const parent = { parent: this } as const;

    const logGroup = new aws.cloudwatch.LogGroup(
      `${name}-log-group`,
      {
        name: `/aws/cloudtrail/${prefix}`,
        retentionInDays: retention,
        kmsKeyId: args.kmsKeyArn,
        tags: baseTags,
      },
      parent,
    );

    const role = new aws.iam.Role(
      `${name}-cwlogs-role`,
      {
        name: `${prefix}-cwlogs-role`,
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
        tags: baseTags,
      },
      parent,
    );
    new aws.iam.RolePolicy(
      `${name}-cwlogs-policy`,
      {
        name: `${prefix}-cwlogs-policy`,
        role: role.id,
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

    const trail = new aws.cloudtrail.Trail(
      `${name}-trail`,
      {
        name: `${prefix}-trail`,
        s3BucketName: args.archiveBucketName,
        kmsKeyId: args.kmsKeyArn,
        cloudWatchLogsGroupArn: pulumi
          .output(logGroup.arn)
          .apply((arn: string) => `${arn}:*`),
        cloudWatchLogsRoleArn: role.arn,
        isMultiRegionTrail: true,
        includeGlobalServiceEvents: true,
        enableLogFileValidation: true,
        eventSelectors: [
          {
            readWriteType: "All",
            includeManagementEvents: true,
            dataResources: [
              { type: "AWS::S3::Object", values: [`${args.archiveBucketArn}/`] },
            ],
          },
        ],
        tags: baseTags,
      },
      parent,
    );

    this.trailArn = trail.arn;
    this.trailName = trail.name;
    this.cloudWatchLogsGroupName = logGroup.name;
    this.cloudWatchLogsRoleArn = role.arn;
    this.multiRegion = pulumi.output(true);
    this.logFileValidationEnabled = pulumi.output(true);

    this.registerOutputs({
      trailArn: this.trailArn,
      trailName: this.trailName,
      cloudWatchLogsGroupName: this.cloudWatchLogsGroupName,
      cloudWatchLogsRoleArn: this.cloudWatchLogsRoleArn,
      multiRegion: this.multiRegion,
      logFileValidationEnabled: this.logFileValidationEnabled,
    });
  }
}
