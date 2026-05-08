import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import { assertValidTier, type Tier } from "./tier";
import { buildControlsTags } from "./tags";
import type { SecureBucketArgs } from "./secure-bucket.args";
import type { SecureBucketOutputs } from "./secure-bucket.outputs";
import { ccm } from "../mappings/ccm";
import { cisAws } from "../mappings/cis-aws";
import { nist80053r5 } from "../mappings/nist-800-53-r5";

export const SECURE_BUCKET_COMPONENT_TYPE = "hulumi:baseline:aws:SecureBucket";

const CONTROLS_CLAIMED_BY_SECURE_BUCKET: readonly string[] = [
  ...ccm.secureBucket,
  ...cisAws.secureBucket,
  ...nist80053r5.secureBucket,
];

function buildTags(tier: Tier): Record<string, string> {
  return {
    "hulumi:component": "SecureBucket",
    "hulumi:tier": tier,
    // S3 tag values disallow `,` — use `+` per the AWS-allowed charset
    // (letters, numbers, spaces, `+ - = . _ : / @`). Long mappings are
    // chunked so each tag value stays inside AWS's 256-character limit.
    ...buildControlsTags(CONTROLS_CLAIMED_BY_SECURE_BUCKET),
  };
}

function bucketNameFromArnOrName(value: string | undefined): string {
  if (value === undefined || value.length === 0) {
    throw new Error("Startup-Hardened requires logBucketArn; see docs/tiers.md");
  }
  const prefix = "arn:aws:s3:::";
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

export class SecureBucket extends pulumi.ComponentResource implements SecureBucketOutputs {
  public readonly bucket: aws.s3.BucketV2;
  public readonly arn: pulumi.Output<string>;
  public readonly bucketDomainName: pulumi.Output<string>;
  public readonly logBucketArn: pulumi.Output<string | undefined>;
  public readonly kmsKeyArn: pulumi.Output<string | undefined>;

  constructor(name: string, args: SecureBucketArgs, opts?: pulumi.ComponentResourceOptions) {
    super(SECURE_BUCKET_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    assertValidTier(args.tier);

    if (args.tier === "startup-hardened" && args.logBucketArn === undefined) {
      throw new Error("Startup-Hardened requires logBucketArn; see docs/tiers.md");
    }

    const tags = buildTags(args.tier);
    const parent = { parent: this } as const;

    this.bucket = new aws.s3.BucketV2(
      `${name}-bucket`,
      {
        ...(args.tier === "startup-hardened" ? { objectLockEnabled: true } : {}),
        tags,
      },
      parent,
    );

    new aws.s3.BucketPublicAccessBlock(
      `${name}-pab`,
      {
        bucket: this.bucket.id,
        blockPublicAcls: true,
        blockPublicPolicy: true,
        ignorePublicAcls: true,
        restrictPublicBuckets: true,
      },
      parent,
    );

    new aws.s3.BucketServerSideEncryptionConfigurationV2(
      `${name}-sse`,
      {
        bucket: this.bucket.id,
        rules: [
          {
            applyServerSideEncryptionByDefault: {
              sseAlgorithm: "aws:kms",
              ...(args.kmsKeyArn !== undefined ? { kmsMasterKeyId: args.kmsKeyArn } : {}),
            },
            bucketKeyEnabled: true,
          },
        ],
      },
      parent,
    );

    new aws.s3.BucketOwnershipControls(
      `${name}-ownership`,
      {
        bucket: this.bucket.id,
        rule: { objectOwnership: "BucketOwnerEnforced" },
      },
      parent,
    );

    new aws.s3.BucketVersioningV2(
      `${name}-versioning`,
      {
        bucket: this.bucket.id,
        versioningConfiguration: { status: "Enabled" },
      },
      parent,
    );

    new aws.s3.BucketPolicy(
      `${name}-tls-only-policy`,
      {
        bucket: this.bucket.id,
        policy: this.bucket.arn.apply((arn: string) =>
          JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Sid: "DenyInsecureTransport",
                Effect: "Deny",
                Principal: "*",
                Action: "s3:*",
                Resource: [arn, `${arn}/*`],
                Condition: { Bool: { "aws:SecureTransport": "false" } },
              },
            ],
          }),
        ),
      },
      parent,
    );

    if (args.tier === "startup-hardened") {
      const lockMode = args.objectLock?.mode ?? "governance";
      const lockDays = args.objectLock?.days ?? 30;
      new aws.s3.BucketObjectLockConfigurationV2(
        `${name}-object-lock`,
        {
          bucket: this.bucket.id,
          rule: {
            defaultRetention: {
              mode: lockMode === "compliance" ? "COMPLIANCE" : "GOVERNANCE",
              days: lockDays,
            },
          },
        },
        parent,
      );

      new aws.s3.BucketLoggingV2(
        `${name}-logging`,
        {
          bucket: this.bucket.id,
          targetBucket: pulumi.output(args.logBucketArn).apply(bucketNameFromArnOrName),
          targetPrefix: `${name}/`,
        },
        parent,
      );

      new aws.cloudtrail.EventDataStore(
        `${name}-data-events`,
        {
          retentionPeriod: 7,
          advancedEventSelectors: [
            {
              name: `${name}-s3-data-events`,
              fieldSelectors: [
                { field: "eventCategory", equals: ["Data"] },
                { field: "resources.type", equals: ["AWS::S3::Object"] },
                {
                  field: "resources.ARN",
                  startsWiths: [this.bucket.arn.apply((arn) => arn)],
                },
              ],
            },
          ],
        },
        parent,
      );
    }

    if (args.replication !== undefined) {
      new aws.s3.BucketReplicationConfig(
        `${name}-replication`,
        {
          bucket: this.bucket.id,
          role: args.replication.role,
          rules: [
            {
              id: `${name}-replication-default`,
              status: "Enabled",
              destination: {
                bucket: args.replication.destinationBucketArn,
                ...(args.replication.destinationKmsKeyArn !== undefined
                  ? {
                      encryptionConfiguration: {
                        replicaKmsKeyId: args.replication.destinationKmsKeyArn,
                      },
                    }
                  : {}),
              },
            },
          ],
        },
        parent,
      );
    }

    if (args.lifecycleRules !== undefined) {
      new aws.s3.BucketLifecycleConfigurationV2(
        `${name}-lifecycle`,
        {
          bucket: this.bucket.id,
          rules: args.lifecycleRules,
        },
        parent,
      );
    }

    this.arn = this.bucket.arn;
    this.bucketDomainName = this.bucket.bucketDomainName;
    this.logBucketArn = pulumi.output(args.logBucketArn) as pulumi.Output<string | undefined>;
    this.kmsKeyArn = pulumi.output(args.kmsKeyArn) as pulumi.Output<string | undefined>;

    this.registerOutputs({
      bucket: this.bucket,
      arn: this.arn,
      bucketDomainName: this.bucketDomainName,
      logBucketArn: this.logBucketArn,
      kmsKeyArn: this.kmsKeyArn,
    });
  }
}
