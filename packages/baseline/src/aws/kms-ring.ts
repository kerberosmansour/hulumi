// KMS key ring — internal helper for AccountFoundation.
//
// Sandbox tier: 4 customer-managed keys (logs, data, secrets, config) with
// automatic rotation enabled (CIS §3.8). Each gets an alias.
//
// Startup-Hardened tier: same 4 keys PLUS an optional deny-without-tag policy
// that requires `hulumi:iac-role=true` on the calling principal. The default
// keeps the historical orgAccountIds-gated behavior; force mode lets
// single-account stacks opt in after their IaC role is tagged.

import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import type { KmsDenyWithoutTagMode } from "./account-foundation.args";
import type { Tier } from "./tier";

export const KMS_RING_SERVICES = ["logs", "data", "secrets", "config"] as const;
export type KmsRingService = (typeof KMS_RING_SERVICES)[number];

export interface KmsRingArgs {
  tier: Tier;
  orgAccountIds?: readonly string[];
  kmsDenyWithoutTag: KmsDenyWithoutTagMode;
  parent: pulumi.Resource;
  namePrefix: string;
  tags: Record<string, string>;
}

export interface KmsRingResult {
  keys: Record<KmsRingService, aws.kms.Key>;
  aliases: Record<KmsRingService, aws.kms.Alias>;
}

function buildKeyPolicy(
  tier: Tier,
  orgAccountIds: readonly string[] | undefined,
  kmsDenyWithoutTag: KmsDenyWithoutTagMode,
  service: KmsRingService,
  namePrefix: string,
): pulumi.Output<string> {
  const accountId = aws.getCallerIdentityOutput().accountId;
  const region = aws.getRegionOutput().name;
  const baseStatements: Record<string, unknown>[] = [
    {
      Sid: "EnableRootPermissions",
      Effect: "Allow",
      Principal: {
        AWS: pulumi.interpolate`arn:aws:iam::${accountId}:root`,
      },
      Action: "kms:*",
      Resource: "*",
    },
  ];
  if (service === "logs") {
    baseStatements.push(
      {
        Sid: "AllowCloudTrailEncryptLogs",
        Effect: "Allow",
        Principal: { Service: "cloudtrail.amazonaws.com" },
        Action: "kms:GenerateDataKey*",
        Resource: "*",
        Condition: {
          StringEquals: {
            "aws:SourceAccount": accountId,
          },
          StringLike: {
            "kms:EncryptionContext:aws:cloudtrail:arn": pulumi.interpolate`arn:aws:cloudtrail:*:${accountId}:trail/*`,
          },
        },
      },
      {
        Sid: "AllowCloudTrailDescribeKey",
        Effect: "Allow",
        Principal: { Service: "cloudtrail.amazonaws.com" },
        Action: "kms:DescribeKey",
        Resource: "*",
        Condition: {
          StringEquals: {
            "aws:SourceAccount": accountId,
          },
        },
      },
      {
        Sid: "AllowConfigLogDeliveryKms",
        Effect: "Allow",
        Principal: { Service: "config.amazonaws.com" },
        Action: ["kms:Decrypt", "kms:GenerateDataKey"],
        Resource: "*",
        Condition: {
          StringEquals: {
            "AWS:SourceAccount": accountId,
          },
          ArnLike: {
            "AWS:SourceArn": pulumi.interpolate`arn:aws:config:${region}:${accountId}:*`,
          },
        },
      },
      // Startup-Hardened delivers CloudTrail to a KMS-encrypted CloudWatch
      // Logs group (cloudtrail.ts). CloudWatch Logs calls KMS under its own
      // regional service principal, so without this grant CreateLogGroup
      // fails with AccessDeniedException ("KMS key ... not allowed to be
      // used"). Scoped by the aws:logs:arn encryption context to this
      // stack's CloudTrail log group only — least privilege, matching the
      // CloudTrail/Config statements above.
      {
        Sid: "AllowCloudWatchLogsEncryptLogGroup",
        Effect: "Allow",
        Principal: { Service: pulumi.interpolate`logs.${region}.amazonaws.com` },
        Action: [
          "kms:Encrypt*",
          "kms:Decrypt*",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey",
        ],
        Resource: "*",
        Condition: {
          ArnLike: {
            "kms:EncryptionContext:aws:logs:arn": pulumi.interpolate`arn:aws:logs:${region}:${accountId}:log-group:${namePrefix}-cloudtrail-logs*`,
          },
        },
      },
    );
  }
  const denyPrincipalAccounts =
    tier === "startup-hardened" && kmsDenyWithoutTag !== "off"
      ? orgAccountIds && orgAccountIds.length > 0
        ? orgAccountIds
        : kmsDenyWithoutTag === "force"
          ? [accountId]
          : undefined
      : undefined;

  if (denyPrincipalAccounts !== undefined) {
    baseStatements.push({
      Sid: "DenyKmsActionsWithoutHulumiIacRoleTag",
      Effect: "Deny",
      Principal: "*",
      Action: ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey", "kms:ReEncrypt*"],
      Resource: "*",
      Condition: {
        StringNotEquals: {
          "aws:PrincipalTag/hulumi:iac-role": "true",
        },
        StringEquals: {
          "aws:PrincipalAccount": denyPrincipalAccounts,
        },
      },
    });
  }
  return pulumi.jsonStringify({
    Version: "2012-10-17",
    Id: `hulumi-kms-${service}-${tier}`,
    Statement: baseStatements,
  });
}

export function createKmsRing(args: KmsRingArgs): KmsRingResult {
  const keys = {} as Record<KmsRingService, aws.kms.Key>;
  const aliases = {} as Record<KmsRingService, aws.kms.Alias>;
  const parent = { parent: args.parent } as const;

  for (const service of KMS_RING_SERVICES) {
    const key = new aws.kms.Key(
      `${args.namePrefix}-kms-${service}`,
      {
        description: `Hulumi AccountFoundation KMS key — service=${service}, tier=${args.tier}`,
        enableKeyRotation: true,
        deletionWindowInDays: 30,
        policy: buildKeyPolicy(
          args.tier,
          args.orgAccountIds,
          args.kmsDenyWithoutTag,
          service,
          args.namePrefix,
        ),
        tags: { ...args.tags, "hulumi:kms-service": service },
      },
      parent,
    );
    keys[service] = key;
    aliases[service] = new aws.kms.Alias(
      `${args.namePrefix}-kms-${service}-alias`,
      {
        name: `alias/hulumi/${args.namePrefix}/${service}`,
        targetKeyId: key.keyId,
      },
      parent,
    );
  }

  return { keys, aliases };
}
