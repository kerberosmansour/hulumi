// AWS Config recorder + delivery channel + optional aggregator.
//
// Sandbox: recorder + delivery to log bucket; basic recording group.
// Startup-Hardened with orgAccountIds: also a ConfigurationAggregator
// pulling from the supplied org account IDs.

import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import type { Tier } from "./tier";

export interface ConfigHelperArgs {
  tier: Tier;
  parent: pulumi.Resource;
  namePrefix: string;
  tags: Record<string, string>;
  logBucketName: pulumi.Input<string>;
  logBucketArn: pulumi.Input<string>;
  logKmsKeyArn: pulumi.Input<string>;
  orgAccountIds?: readonly string[];
  dependsOn?: pulumi.Input<pulumi.Resource>[];
}

export interface ConfigHelperResult {
  recorderRole: aws.iam.Role;
  recorderRolePolicyAttachment: aws.iam.RolePolicyAttachment;
  recorder: aws.cfg.Recorder;
  deliveryChannel: aws.cfg.DeliveryChannel;
  aggregator?: aws.cfg.ConfigurationAggregator;
}

export function createConfigService(args: ConfigHelperArgs): ConfigHelperResult {
  const parent = { parent: args.parent } as const;
  const accountId = aws.getCallerIdentityOutput().accountId;
  const region = aws.getRegionOutput().name;

  const recorderRole = new aws.iam.Role(
    `${args.namePrefix}-config-recorder-role`,
    {
      assumeRolePolicy: pulumi.jsonStringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: "config.amazonaws.com" },
            Action: "sts:AssumeRole",
            Condition: {
              StringEquals: {
                "AWS:SourceAccount": accountId,
              },
              ArnLike: {
                "AWS:SourceArn": pulumi.interpolate`arn:aws:config:${region}:${accountId}:*`,
              },
            },
          },
        ],
      }),
      tags: args.tags,
    },
    parent,
  );

  const recorderRolePolicyAttachment = new aws.iam.RolePolicyAttachment(
    `${args.namePrefix}-config-recorder-policy`,
    {
      role: recorderRole.name,
      policyArn: "arn:aws:iam::aws:policy/service-role/AWS_ConfigRole",
    },
    parent,
  );

  // AWS Config retries delivery as config.amazonaws.com when this
  // recorder role cannot write to S3/KMS. SecureBucket and the log key
  // already grant that service principal access for this exact account.
  // Keep the deployment role free of iam:PutRolePolicy/DeleteRolePolicy.

  const recorder = new aws.cfg.Recorder(
    `${args.namePrefix}-config-recorder`,
    {
      roleArn: recorderRole.arn,
      recordingGroup: {
        allSupported: true,
        includeGlobalResourceTypes: args.tier === "startup-hardened",
      },
    },
    {
      parent: args.parent,
      dependsOn: [recorderRolePolicyAttachment, ...(args.dependsOn ?? [])],
    },
  );

  const deliveryChannel = new aws.cfg.DeliveryChannel(
    `${args.namePrefix}-config-delivery`,
    {
      s3BucketName: args.logBucketName,
      // The log bucket has SSE-KMS default encryption (SecureBucket), so
      // AWS Config must be told the CMK or PutDeliveryChannel fails with
      // InsufficientDeliveryPolicyException ("provided kms key is
      // 'null'"). The recorder role policy already grants this key.
      s3KmsKeyArn: args.logKmsKeyArn,
      snapshotDeliveryProperties: {
        deliveryFrequency: args.tier === "startup-hardened" ? "One_Hour" : "TwentyFour_Hours",
      },
    },
    { parent: args.parent, dependsOn: [recorder, ...(args.dependsOn ?? [])] },
  );

  const result: ConfigHelperResult = {
    recorderRole,
    recorderRolePolicyAttachment,
    recorder,
    deliveryChannel,
  };

  if (args.tier === "startup-hardened" && args.orgAccountIds && args.orgAccountIds.length > 0) {
    result.aggregator = new aws.cfg.ConfigurationAggregator(
      `${args.namePrefix}-config-aggregator`,
      {
        accountAggregationSource: {
          accountIds: args.orgAccountIds as pulumi.Input<string>[],
          allRegions: true,
        },
        tags: args.tags,
      },
      parent,
    );
  }

  return result;
}
