import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import { assertValidTier } from "./tier";
import type {
  PulumiOutputSummary,
  PulumiOutputSummaryInput,
  PulumiStateBackendDrPosture,
  PulumiStateBackendFoundationArgs,
  PulumiStateLeaseRecord,
  PulumiStateLeaseRequest,
  PulumiStateLeaseResult,
  StateBackendEvent,
  StateBackendPostureSummary,
} from "./pulumi-state-backend-foundation.args";
import type { PulumiStateBackendFoundationOutputs } from "./pulumi-state-backend-foundation.outputs";

export const PULUMI_STATE_BACKEND_FOUNDATION_COMPONENT_TYPE =
  "hulumi:platform:PulumiStateBackendFoundation";

function validateArgs(args: PulumiStateBackendFoundationArgs): void {
  assertValidTier(args.tier);
  if (typeof args.bucketName === "string" && args.bucketName.trim().length === 0) {
    throw new Error("PulumiStateBackendFoundation: bucketName must be non-empty");
  }
  if (args.kmsAliasName.trim().length === 0) {
    throw new Error("PulumiStateBackendFoundation: kmsAliasName must be non-empty");
  }
  if (!args.kmsAliasName.startsWith("alias/")) {
    throw new Error("PulumiStateBackendFoundation: kmsAliasName must start with alias/");
  }
  if (args.tier === "startup-hardened" && args.forceDestroy === true) {
    throw new Error(
      "PulumiStateBackendFoundation: startup-hardened state bucket cannot set forceDestroy",
    );
  }
  if (typeof args.objectLock === "object") {
    if (args.objectLock.days !== undefined && args.objectLock.days < 1) {
      throw new Error("PulumiStateBackendFoundation: objectLock.days must be at least 1");
    }
  }
}

function stateBackendTags(
  tier: PulumiStateBackendFoundationArgs["tier"],
  tags?: pulumi.Input<Record<string, string>>,
): pulumi.Input<Record<string, string>> {
  return pulumi.output(tags ?? {}).apply((extra) => ({
    ...extra,
    "hulumi:component": "PulumiStateBackendFoundation",
    "hulumi:tier": tier,
  }));
}

function objectLockEnabled(args: PulumiStateBackendFoundationArgs): boolean {
  return args.objectLock !== undefined && args.objectLock !== false;
}

function objectLockMode(
  objectLock: PulumiStateBackendFoundationArgs["objectLock"],
): "GOVERNANCE" | "COMPLIANCE" {
  if (typeof objectLock === "object" && objectLock.mode === "compliance") return "COMPLIANCE";
  return "GOVERNANCE";
}

function objectLockDays(objectLock: PulumiStateBackendFoundationArgs["objectLock"]): number {
  return typeof objectLock === "object" ? (objectLock.days ?? 30) : 30;
}

function drPostureFor(args: PulumiStateBackendFoundationArgs): PulumiStateBackendDrPosture {
  const hasObjectLock = objectLockEnabled(args);
  const hasReplication = args.replication !== undefined;
  if (hasObjectLock && hasReplication) return "object-lock-and-replication";
  if (hasObjectLock) return "object-lock";
  if (hasReplication) return "replication";
  return "advisory-degraded";
}

function caveatsFor(args: PulumiStateBackendFoundationArgs): readonly string[] {
  const caveats: string[] = [
    "Optional lease table serializes CI applies only; it does not change Pulumi backend semantics.",
  ];
  if (drPostureFor(args) === "advisory-degraded") {
    caveats.push(
      "No object lock or replication configured; state recovery posture is advisory-degraded.",
    );
  }
  return caveats;
}

export class PulumiStateBackendFoundation
  extends pulumi.ComponentResource
  implements PulumiStateBackendFoundationOutputs
{
  public readonly bucket: aws.s3.Bucket;
  public readonly kmsKey: aws.kms.Key;
  public readonly kmsAlias: aws.kms.Alias;
  public readonly leaseTable?: aws.dynamodb.Table;
  public readonly bucketName: pulumi.Output<string>;
  public readonly bucketArn: pulumi.Output<string>;
  public readonly kmsKeyArn: pulumi.Output<string>;
  public readonly kmsAliasName: pulumi.Output<string>;
  public readonly backendUrl: pulumi.Output<string>;
  public readonly secretsProviderHint: pulumi.Output<string>;
  public readonly leaseTableName: pulumi.Output<string | undefined>;
  public readonly drPosture: pulumi.Output<PulumiStateBackendDrPosture>;
  public readonly caveats: pulumi.Output<readonly string[]>;

  constructor(
    name: string,
    args: PulumiStateBackendFoundationArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    validateArgs(args);
    super(PULUMI_STATE_BACKEND_FOUNDATION_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);

    const tags = stateBackendTags(args.tier, args.tags);

    this.kmsKey = new aws.kms.Key(
      `${name}-state-key`,
      {
        description: `Hulumi Pulumi state backend key - tier=${args.tier}`,
        enableKeyRotation: true,
        deletionWindowInDays: 30,
        tags,
      },
      { parent: this },
    );

    this.kmsAlias = new aws.kms.Alias(
      `${name}-state-key-alias`,
      {
        name: args.kmsAliasName,
        targetKeyId: this.kmsKey.keyId,
      },
      { parent: this },
    );

    this.bucket = new aws.s3.Bucket(
      `${name}-bucket`,
      {
        bucket: args.bucketName,
        ...(objectLockEnabled(args) ? { objectLockEnabled: true } : {}),
        ...(args.forceDestroy !== undefined ? { forceDestroy: args.forceDestroy } : {}),
        tags,
      },
      { parent: this },
    );

    new aws.s3.BucketPublicAccessBlock(
      `${name}-bucket-pab`,
      {
        bucket: this.bucket.id,
        blockPublicAcls: true,
        ignorePublicAcls: true,
        blockPublicPolicy: true,
        restrictPublicBuckets: true,
      },
      { parent: this },
    );

    new aws.s3.BucketServerSideEncryptionConfiguration(
      `${name}-bucket-sse`,
      {
        bucket: this.bucket.id,
        rules: [
          {
            applyServerSideEncryptionByDefault: {
              sseAlgorithm: "aws:kms",
              kmsMasterKeyId: this.kmsKey.arn,
            },
            bucketKeyEnabled: true,
          },
        ],
      },
      { parent: this },
    );

    new aws.s3.BucketOwnershipControls(
      `${name}-bucket-ownership`,
      {
        bucket: this.bucket.id,
        rule: { objectOwnership: "BucketOwnerEnforced" },
      },
      { parent: this },
    );

    new aws.s3.BucketVersioning(
      `${name}-bucket-versioning`,
      {
        bucket: this.bucket.id,
        versioningConfiguration: { status: "Enabled" },
      },
      { parent: this },
    );

    new aws.s3.BucketPolicy(
      `${name}-bucket-tls-only`,
      {
        bucket: this.bucket.id,
        policy: this.bucket.arn.apply((arn) =>
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
      { parent: this },
    );

    if (objectLockEnabled(args)) {
      new aws.s3.BucketObjectLockConfiguration(
        `${name}-bucket-object-lock`,
        {
          bucket: this.bucket.id,
          rule: {
            defaultRetention: {
              mode: objectLockMode(args.objectLock),
              days: objectLockDays(args.objectLock),
            },
          },
        },
        { parent: this },
      );
    }

    if (args.replication !== undefined) {
      new aws.s3.BucketReplicationConfig(
        `${name}-bucket-replication`,
        {
          bucket: this.bucket.id,
          role: args.replication.roleArn,
          rules: [
            {
              id: `${name}-state-replication`,
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
        { parent: this },
      );
    }

    if (args.enableLeaseTable === true) {
      this.leaseTable = new aws.dynamodb.Table(
        `${name}-lease-table`,
        {
          ...(args.leaseTableName !== undefined ? { name: args.leaseTableName } : {}),
          billingMode: "PAY_PER_REQUEST",
          hashKey: "stackKey",
          attributes: [{ name: "stackKey", type: "S" }],
          pointInTimeRecovery: { enabled: true },
          serverSideEncryption: { enabled: true, kmsKeyArn: this.kmsKey.arn },
          tags,
        },
        { parent: this },
      );
    }

    this.bucketName = pulumi.output(args.bucketName);
    this.bucketArn = this.bucket.arn;
    this.kmsKeyArn = this.kmsKey.arn;
    this.kmsAliasName = pulumi.output(args.kmsAliasName);
    this.backendUrl = this.bucketName.apply((bucketName) => `s3://${bucketName}`);
    this.secretsProviderHint = this.kmsAliasName.apply((aliasName) => `awskms://${aliasName}`);
    this.leaseTableName =
      this.leaseTable === undefined
        ? pulumi.output(undefined)
        : (this.leaseTable.name as pulumi.Output<string | undefined>);
    this.drPosture = pulumi.output(drPostureFor(args));
    this.caveats = pulumi.output(caveatsFor(args));

    this.registerOutputs({
      bucket: this.bucket,
      kmsKey: this.kmsKey,
      kmsAlias: this.kmsAlias,
      leaseTable: this.leaseTable,
      bucketName: this.bucketName,
      bucketArn: this.bucketArn,
      kmsKeyArn: this.kmsKeyArn,
      kmsAliasName: this.kmsAliasName,
      backendUrl: this.backendUrl,
      secretsProviderHint: this.secretsProviderHint,
      leaseTableName: this.leaseTableName,
      drPosture: this.drPosture,
      caveats: this.caveats,
    });
  }
}

export function claimPulumiStateLease(
  current: readonly PulumiStateLeaseRecord[],
  request: PulumiStateLeaseRequest,
): PulumiStateLeaseResult {
  if (request.stackKey.trim().length === 0 || request.holderId.trim().length === 0) {
    return { status: "blocked", reason: "stackKey and holderId are required" };
  }
  const active = current.find(
    (lease) => lease.stackKey === request.stackKey && lease.status === "active",
  );
  if (active !== undefined && active.holderId !== request.holderId) {
    return {
      status: "blocked",
      reason: `Pulumi state lease for ${request.stackKey} is already held by ${active.holderId}`,
    };
  }
  return { status: "claimed" };
}

export function classifyStateBackendEvents(
  events: readonly StateBackendEvent[],
): StateBackendPostureSummary {
  const findings = events.flatMap((event) => {
    const isDelete =
      event.eventName === "DeleteObject" || event.eventName === "DeleteObjectVersion";
    const key = event.objectKey ?? "";
    if (!isDelete || !key.includes(".pulumi/")) return [];
    const actor = event.actor !== undefined ? ` by ${event.actor}` : "";
    return [`${event.eventName} observed for Pulumi state object ${key}${actor}`];
  });
  return {
    status: findings.length > 0 ? "unsafe-degraded" : "clean",
    findings,
  };
}

export function summarizePulumiOutput(input: PulumiOutputSummaryInput): PulumiOutputSummary {
  if (input.secret === true) {
    return {
      name: input.name,
      secret: true,
      valuePreview: "[pulumi-secret-redacted]",
    };
  }
  const value = typeof input.value === "string" ? input.value : JSON.stringify(input.value);
  return {
    name: input.name,
    secret: false,
    valuePreview: value.length > 128 ? `${value.slice(0, 125)}...` : value,
  };
}
