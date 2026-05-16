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
const LEGACY_BUCKET_V2_TYPE = "aws:s3/bucketV2:BucketV2";
const LEGACY_BUCKET_SSE_V2_TYPE =
  "aws:s3/bucketServerSideEncryptionConfigurationV2:BucketServerSideEncryptionConfigurationV2";
const LEGACY_BUCKET_VERSIONING_V2_TYPE = "aws:s3/bucketVersioningV2:BucketVersioningV2";
const LEGACY_BUCKET_OBJECT_LOCK_V2_TYPE =
  "aws:s3/bucketObjectLockConfigurationV2:BucketObjectLockConfigurationV2";
const LEGACY_BUCKET_LOGGING_V2_TYPE = "aws:s3/bucketLoggingV2:BucketLoggingV2";
const LEGACY_BUCKET_LIFECYCLE_V2_TYPE =
  "aws:s3/bucketLifecycleConfigurationV2:BucketLifecycleConfigurationV2";

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
  public readonly bucket: aws.s3.Bucket;
  public readonly bucketPolicy: aws.s3.BucketPolicy;
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

    // Object Lock is the Startup-Hardened default, but a consumer may
    // opt out with `objectLock: false` — e.g. the AWS Config / CloudTrail
    // delivery bucket, whose delivery validation is incompatible with
    // Object Lock default retention.
    const objectLockEnabled = args.tier === "startup-hardened" && args.objectLock !== false;

    const tags = buildTags(args.tier);
    const childOptions = (...legacyTypes: string[]): pulumi.CustomResourceOptions => ({
      parent: this,
      ...(legacyTypes.length > 0
        ? { aliases: legacyTypes.map((type): pulumi.Alias => ({ type })) }
        : {}),
    });

    this.bucket = new aws.s3.Bucket(
      `${name}-bucket`,
      {
        ...(objectLockEnabled ? { objectLockEnabled: true } : {}),
        ...(args.forceDestroy !== undefined ? { forceDestroy: args.forceDestroy } : {}),
        tags,
      },
      childOptions(LEGACY_BUCKET_V2_TYPE),
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
      childOptions(),
    );

    new aws.s3.BucketServerSideEncryptionConfiguration(
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
      childOptions(LEGACY_BUCKET_SSE_V2_TYPE),
    );

    new aws.s3.BucketOwnershipControls(
      `${name}-ownership`,
      {
        bucket: this.bucket.id,
        rule: { objectOwnership: "BucketOwnerEnforced" },
      },
      childOptions(),
    );

    new aws.s3.BucketVersioning(
      `${name}-versioning`,
      {
        bucket: this.bucket.id,
        versioningConfiguration: { status: "Enabled" },
      },
      childOptions(LEGACY_BUCKET_VERSIONING_V2_TYPE),
    );

    this.bucketPolicy = new aws.s3.BucketPolicy(
      `${name}-tls-only-policy`,
      {
        bucket: this.bucket.id,
        policy: pulumi
          .all([this.bucket.arn, aws.getCallerIdentityOutput().accountId])
          .apply(([arn, accountId]) => {
            const statements: Record<string, unknown>[] = [
              {
                Sid: "DenyInsecureTransport",
                Effect: "Deny",
                Principal: "*",
                Action: "s3:*",
                Resource: [arn, `${arn}/*`],
                Condition: { Bool: { "aws:SecureTransport": "false" } },
              },
            ];

            if (args.awsServiceLogDelivery?.cloudTrail === true) {
              statements.push(
                {
                  Sid: "AWSCloudTrailAclCheck",
                  Effect: "Allow",
                  Principal: { Service: "cloudtrail.amazonaws.com" },
                  Action: "s3:GetBucketAcl",
                  Resource: arn,
                  Condition: {
                    StringEquals: {
                      "aws:SourceAccount": accountId,
                    },
                  },
                },
                {
                  Sid: "AWSCloudTrailWrite",
                  Effect: "Allow",
                  Principal: { Service: "cloudtrail.amazonaws.com" },
                  Action: "s3:PutObject",
                  Resource: `${arn}/AWSLogs/${accountId}/*`,
                  Condition: {
                    StringEquals: {
                      "s3:x-amz-acl": "bucket-owner-full-control",
                      "aws:SourceAccount": accountId,
                    },
                  },
                },
              );
            }

            if (args.awsServiceLogDelivery?.config === true) {
              statements.push(
                {
                  Sid: "AWSConfigBucketPermissionsCheck",
                  Effect: "Allow",
                  Principal: { Service: "config.amazonaws.com" },
                  Action: "s3:GetBucketAcl",
                  Resource: arn,
                  Condition: {
                    StringEquals: {
                      "AWS:SourceAccount": accountId,
                    },
                  },
                },
                {
                  Sid: "AWSConfigBucketExistenceCheck",
                  Effect: "Allow",
                  Principal: { Service: "config.amazonaws.com" },
                  Action: "s3:ListBucket",
                  Resource: arn,
                  Condition: {
                    StringEquals: {
                      "AWS:SourceAccount": accountId,
                    },
                  },
                },
                {
                  Sid: "AWSConfigBucketDelivery",
                  Effect: "Allow",
                  Principal: { Service: "config.amazonaws.com" },
                  Action: "s3:PutObject",
                  Resource: `${arn}/AWSLogs/${accountId}/Config/*`,
                  // SecureBucket always sets Object Ownership =
                  // BucketOwnerEnforced (ACLs disabled). AWS Config does
                  // not send an x-amz-acl header when delivering to an
                  // ACL-disabled bucket, so requiring
                  // s3:x-amz-acl=bucket-owner-full-control here makes the
                  // Allow never match — PutDeliveryChannel then fails with
                  // InsufficientDeliveryPolicyException. The ACL condition
                  // is also redundant under BucketOwnerEnforced (the
                  // bucket owner owns every object regardless), so dropping
                  // it is security-neutral. (CloudTrail still sends the
                  // ACL, so AWSCloudTrailWrite keeps its condition.)
                  Condition: {
                    StringEquals: {
                      "AWS:SourceAccount": accountId,
                    },
                  },
                },
              );
            }

            return JSON.stringify({
              Version: "2012-10-17",
              Statement: statements,
            });
          }),
      },
      childOptions(),
    );

    if (objectLockEnabled) {
      const lockCfg = args.objectLock || undefined;
      const lockMode = lockCfg?.mode ?? "governance";
      const lockDays = lockCfg?.days ?? 30;
      new aws.s3.BucketObjectLockConfiguration(
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
        childOptions(LEGACY_BUCKET_OBJECT_LOCK_V2_TYPE),
      );
    }

    if (args.tier === "startup-hardened") {
      new aws.s3.BucketLogging(
        `${name}-logging`,
        {
          bucket: this.bucket.id,
          targetBucket: pulumi.output(args.logBucketArn).apply(bucketNameFromArnOrName),
          targetPrefix: `${name}/`,
        },
        childOptions(LEGACY_BUCKET_LOGGING_V2_TYPE),
      );

      new aws.cloudtrail.EventDataStore(
        `${name}-data-events`,
        {
          // AWS defaults terminationProtectionEnabled=true, which makes
          // the store impossible to `pulumi destroy`. Keep that protective
          // default for real deployments, but honour the component's
          // forceDestroy contract: when a consumer asks for a fully
          // tear-down-able bucket (e.g. ephemeral e2e stacks) the data
          // store must be deletable too.
          terminationProtectionEnabled: args.forceDestroy === true ? false : true,
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
        childOptions(),
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
        childOptions(),
      );
    }

    if (args.lifecycleRules !== undefined) {
      new aws.s3.BucketLifecycleConfiguration(
        `${name}-lifecycle`,
        {
          bucket: this.bucket.id,
          rules: args.lifecycleRules,
        },
        childOptions(LEGACY_BUCKET_LIFECYCLE_V2_TYPE),
      );
    }

    this.arn = this.bucket.arn;
    this.bucketDomainName = this.bucket.bucketDomainName;
    this.logBucketArn = pulumi.output(args.logBucketArn) as pulumi.Output<string | undefined>;
    this.kmsKeyArn = pulumi.output(args.kmsKeyArn) as pulumi.Output<string | undefined>;

    this.registerOutputs({
      bucket: this.bucket,
      bucketPolicy: this.bucketPolicy,
      arn: this.arn,
      bucketDomainName: this.bucketDomainName,
      logBucketArn: this.logBucketArn,
      kmsKeyArn: this.kmsKeyArn,
    });
  }
}
