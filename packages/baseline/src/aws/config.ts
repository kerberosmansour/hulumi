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
  recorderRoleArn: pulumi.Input<string>;
  logBucketName: pulumi.Input<string>;
  orgAccountIds?: readonly string[];
}

export interface ConfigHelperResult {
  recorder: aws.cfg.Recorder;
  deliveryChannel: aws.cfg.DeliveryChannel;
  aggregator?: aws.cfg.ConfigurationAggregator;
}

export function createConfigService(args: ConfigHelperArgs): ConfigHelperResult {
  const parent = { parent: args.parent } as const;

  const recorder = new aws.cfg.Recorder(
    `${args.namePrefix}-config-recorder`,
    {
      roleArn: args.recorderRoleArn,
      recordingGroup: {
        allSupported: true,
        includeGlobalResourceTypes: args.tier === "startup-hardened",
      },
    },
    parent,
  );

  const deliveryChannel = new aws.cfg.DeliveryChannel(
    `${args.namePrefix}-config-delivery`,
    {
      s3BucketName: args.logBucketName,
      snapshotDeliveryProperties: {
        deliveryFrequency: args.tier === "startup-hardened" ? "One_Hour" : "TwentyFour_Hours",
      },
    },
    { parent: args.parent, dependsOn: [recorder] },
  );

  const result: ConfigHelperResult = { recorder, deliveryChannel };

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
