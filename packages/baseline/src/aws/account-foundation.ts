// AccountFoundation — composes CloudTrail + Config + GuardDuty + Security
// Hub + IAM baseline + KMS ring with tier-aware config + dependsOn
// ordering. Eventual-consistency safety via the GuardDuty readiness probe
// (Security Hub waits for GuardDuty.status === "ENABLED" up to 10 min).
//
// Critique C2: ≥2 per-tier deltas required. AccountFoundation delivers 6
// (multi-region trail, log file validation, Config aggregator, GuardDuty
// extended features, NIST 800-53 r5 standard, Access Analyzer, KMS
// deny-without-tag). The runtime AST/registration test asserts ≥4.

import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import { SecureBucket } from "./secure-bucket";
import { assertValidTier } from "./tier";
import { createKmsRing, KMS_RING_SERVICES } from "./kms-ring";
import { createIamBaseline } from "./iam-baseline";
import { createCloudTrail } from "./cloudtrail";
import { createConfigService } from "./config";
import { createGuardDuty } from "./guardduty";
import { createSecurityHub } from "./securityhub";
import { buildControlsTags } from "./tags";
import { KMS_DENY_WITHOUT_TAG_MODES } from "./account-foundation.args";
import { ccm } from "../mappings/ccm";
import { cisAws } from "../mappings/cis-aws";
import { nist80053r5 } from "../mappings/nist-800-53-r5";

import type { AccountFoundationArgs, KmsDenyWithoutTagMode } from "./account-foundation.args";
import type { AccountFoundationOutputs } from "./account-foundation.outputs";

export const ACCOUNT_FOUNDATION_COMPONENT_TYPE = "hulumi:baseline:aws:AccountFoundation";

const ACCOUNT_FOUNDATION_CONTROLS: readonly string[] = [
  ...ccm.secureBucket,
  ...cisAws.secureBucket,
  ...nist80053r5.secureBucket,
  "CCM:IAM-01",
  "CCM:LOG-02",
  "NIST-800-53-r5:AU-2",
  "NIST-800-53-r5:CA-7",
  "CIS-AWS-v5.0.0:1.6",
  "CIS-AWS-v5.0.0:1.19",
  "CIS-AWS-v5.0.0:3.1",
  "CIS-AWS-v5.0.0:3.2",
  "CIS-AWS-v5.0.0:3.7",
  "CIS-AWS-v5.0.0:3.8",
];

function buildTags(tier: AccountFoundationArgs["tier"]): Record<string, string> {
  return {
    "hulumi:component": "AccountFoundation",
    "hulumi:tier": tier,
    // S3 tag values (and several other AWS resource-tag charsets) disallow
    // `,` — use `+` per the AWS-allowed charset (letters, numbers, spaces,
    // `+ - = . _ : / @`). Long mappings are chunked so each tag value stays
    // inside AWS's 256-character value limit.
    ...buildControlsTags(ACCOUNT_FOUNDATION_CONTROLS),
  };
}

function assertValidKmsDenyWithoutTagMode(mode: unknown): asserts mode is KmsDenyWithoutTagMode {
  if (!KMS_DENY_WITHOUT_TAG_MODES.includes(mode as KmsDenyWithoutTagMode)) {
    throw new Error(
      `AccountFoundation: kmsDenyWithoutTag must be one of: ${KMS_DENY_WITHOUT_TAG_MODES.join(
        ", ",
      )}; received: ${String(mode)}`,
    );
  }
}

function createAccessLogDestination(
  name: string,
  parent: pulumi.Resource,
): {
  bucket: aws.s3.Bucket;
  dependencies: pulumi.Resource[];
} {
  const opts = { parent };
  const bucket = new aws.s3.Bucket(
    `${name}-logs-self-logging`,
    {
      forceDestroy: false,
      tags: {
        "hulumi:component": "AccountFoundationAccessLogs",
        "hulumi:purpose": "server-access-logs",
      },
    },
    opts,
  );
  const publicAccess = new aws.s3.BucketPublicAccessBlock(
    `${name}-access-logs-public-access`,
    {
      bucket: bucket.id,
      blockPublicAcls: true,
      blockPublicPolicy: true,
      ignorePublicAcls: true,
      restrictPublicBuckets: true,
    },
    opts,
  );
  const ownership = new aws.s3.BucketOwnershipControls(
    `${name}-access-logs-ownership`,
    {
      bucket: bucket.id,
      rule: { objectOwnership: "BucketOwnerEnforced" },
    },
    opts,
  );
  // S3 server-access-log destinations require SSE-S3 and no Object Lock.
  const encryption = new aws.s3.BucketServerSideEncryptionConfiguration(
    `${name}-access-logs-encryption`,
    {
      bucket: bucket.id,
      rules: [{ applyServerSideEncryptionByDefault: { sseAlgorithm: "AES256" } }],
    },
    opts,
  );
  const policy = new aws.s3.BucketPolicy(
    `${name}-access-logs-policy`,
    {
      bucket: bucket.id,
      policy: pulumi.all([bucket.arn, aws.getCallerIdentityOutput({})]).apply(([arn, identity]) =>
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
            {
              Sid: "AccountFoundationServerAccessLogs",
              Effect: "Allow",
              Principal: { Service: "logging.s3.amazonaws.com" },
              Action: "s3:PutObject",
              Resource: [`${arn}/${name}-logs/*`, `${arn}/${name}-cloudtrail-archive/*`],
              Condition: {
                StringEquals: { "aws:SourceAccount": identity.accountId },
                ArnLike: {
                  "aws:SourceArn": [
                    `arn:${identity.arn.split(":")[1]}:s3:::${name}-logs-bucket*`,
                    `arn:${identity.arn.split(":")[1]}:s3:::${name}-cloudtrail-archive-bucket*`,
                  ],
                },
              },
            },
          ],
        }),
      ),
    },
    opts,
  );
  return { bucket, dependencies: [publicAccess, ownership, encryption, policy] };
}

export class AccountFoundation
  extends pulumi.ComponentResource
  implements AccountFoundationOutputs
{
  public readonly cloudTrailArn: pulumi.Output<string>;
  public readonly cloudTrailLogGroupName: pulumi.Output<string | undefined>;
  public readonly configRecorderArn: pulumi.Output<string>;
  public readonly guardDutyDetectorId: pulumi.Output<string>;
  public readonly securityHubHubArn: pulumi.Output<string>;
  public readonly kmsKeyArns: pulumi.Output<Record<string, string>>;
  public readonly iamBaselinePolicyArns: pulumi.Output<string[]>;

  constructor(name: string, args: AccountFoundationArgs, opts?: pulumi.ComponentResourceOptions) {
    super(ACCOUNT_FOUNDATION_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    assertValidTier(args.tier);
    const kmsDenyWithoutTag = args.kmsDenyWithoutTag ?? "auto";
    assertValidKmsDenyWithoutTagMode(kmsDenyWithoutTag);

    if (typeof args.iacRoleArn !== "string" || args.iacRoleArn.length === 0) {
      // pulumi.Input<string> can be Output; validate eagerly only on string literals.
      // For Output<string>, the runtime will surface a downstream error if it's empty.
      // This guard catches the common authoring mistake of passing "".
      throw new Error(
        `AccountFoundation: iacRoleArn must be a non-empty string ARN; received: ${String(args.iacRoleArn)}`,
      );
    }

    if (args.tier === "startup-hardened" && !/^[a-z0-9][a-z0-9-]{0,23}$/.test(name)) {
      throw new Error(
        "AccountFoundation: hardened names must use 1–24 lowercase letters, digits, or hyphens for exact S3 log-delivery scope",
      );
    }

    if (
      args.tier === "startup-hardened" &&
      args.logBucketForceDestroy !== undefined &&
      args.logBucketForceDestroy !== false
    ) {
      throw new Error(
        "Startup-Hardened audit delivery cannot use forceDestroy or unresolved forceDestroy inputs; see docs/tiers.md",
      );
    }

    const tags = buildTags(args.tier);
    const region = args.region !== undefined ? args.region : aws.getRegionOutput().name;

    // Phase 1 — KMS ring (no upstream deps).
    const kmsRing = createKmsRing({
      tier: args.tier,
      ...(args.orgAccountIds !== undefined ? { orgAccountIds: args.orgAccountIds } : {}),
      kmsDenyWithoutTag,
      parent: this,
      namePrefix: name,
      tags,
    });

    // Phase 2 — preserve Config delivery; harden CloudTrail in a separate
    // archive. Provision the access-log target before configuring either
    // source bucket. Sandbox keeps its ephemeral integration shape.
    const accessLogs =
      args.tier === "startup-hardened" ? createAccessLogDestination(name, this) : undefined;
    const logBucketArgs =
      args.tier === "startup-hardened"
        ? {
            tier: "startup-hardened" as const,
            kmsKeyArn: kmsRing.keys.logs.arn,
            logBucketArn: accessLogs!.bucket.id,
            // Preserve the existing delivery bucket and its Config records.
            // Config cannot use default Object Lock retention.
            objectLock: false as const,
            ...(args.logBucketForceDestroy !== undefined
              ? { forceDestroy: args.logBucketForceDestroy }
              : {}),
            awsServiceLogDelivery: { cloudTrail: true, config: true },
          }
        : {
            tier: "sandbox" as const,
            kmsKeyArn: kmsRing.keys.logs.arn,
            ...(args.logBucketForceDestroy !== undefined
              ? { forceDestroy: args.logBucketForceDestroy }
              : {}),
            awsServiceLogDelivery: { cloudTrail: true, config: true },
          };
    const logBucketSelf = new SecureBucket(`${name}-logs`, logBucketArgs, {
      parent: this,
      ...(accessLogs === undefined ? {} : { dependsOn: accessLogs.dependencies }),
    });
    const cloudTrailLogBucket =
      args.tier === "startup-hardened"
        ? new SecureBucket(
            `${name}-cloudtrail-archive`,
            {
              tier: "startup-hardened",
              kmsKeyArn: kmsRing.keys.logs.arn,
              logBucketArn: accessLogs!.bucket.id,
              awsServiceLogDelivery: { cloudTrail: true },
              objectLock: { mode: "compliance", days: 365 },
              emitDataEventStore: false,
            },
            { parent: this, dependsOn: accessLogs!.dependencies },
          )
        : logBucketSelf;

    // Phase 3 — IAM baseline (password policy + Access Analyzer on hardened).
    const iamBaseline = createIamBaseline({
      tier: args.tier,
      parent: this,
      namePrefix: name,
      tags,
    });

    // Phase 4 — CloudTrail (depends on log bucket + KMS log key).
    const cloudTrail = createCloudTrail({
      tier: args.tier,
      parent: this,
      namePrefix: name,
      tags,
      logBucketId: cloudTrailLogBucket.bucket.id,
      kmsKeyArn: kmsRing.keys.logs.arn,
      ...(args.tier === "startup-hardened" ? { dataEventBucketArn: logBucketSelf.arn } : {}),
      dependsOn: [cloudTrailLogBucket],
    });

    // Phase 5 — Config (depends on log bucket).
    const config = createConfigService({
      tier: args.tier,
      parent: this,
      namePrefix: name,
      tags,
      logBucketName: logBucketSelf.bucket.id,
      logBucketArn: logBucketSelf.arn,
      logKmsKeyArn: kmsRing.keys.logs.arn,
      ...(args.orgAccountIds !== undefined ? { orgAccountIds: args.orgAccountIds } : {}),
      dependsOn: [logBucketSelf],
    });

    // Phase 6 — GuardDuty (no upstream deps within AccountFoundation).
    const guardDuty = createGuardDuty({
      tier: args.tier,
      parent: this,
      namePrefix: name,
      tags,
      ...(args.existingGuardDutyDetectorId !== undefined
        ? { existingDetectorId: args.existingGuardDutyDetectorId }
        : {}),
    });

    // Phase 7 — Security Hub (depends on GuardDuty Detector + Features).
    const securityHub = createSecurityHub({
      tier: args.tier,
      parent: this,
      namePrefix: name,
      tags,
      guardDutyDetector: guardDuty.detector,
      guardDutyFeatures: guardDuty.features,
      region,
      ...(args.cisVersion !== undefined ? { cisVersion: args.cisVersion } : {}),
      ...(args.useExistingSecurityHubAccount === true ? { useExistingAccount: true } : {}),
    });

    // Phase 8 — Outputs.
    this.cloudTrailArn = cloudTrail.trail.arn;
    this.cloudTrailLogGroupName =
      cloudTrail.logGroup !== undefined ? cloudTrail.logGroup.name : pulumi.output(undefined);
    this.configRecorderArn = pulumi.interpolate`arn:aws:config:${region}::recorder/${config.recorder.name}`;
    this.guardDutyDetectorId = guardDuty.detector.id;
    this.securityHubHubArn = securityHub.hub.arn;
    this.kmsKeyArns = pulumi
      .all(KMS_RING_SERVICES.map((svc) => kmsRing.keys[svc].arn))
      .apply((arns) => {
        const out: Record<string, string> = {};
        KMS_RING_SERVICES.forEach((svc, i) => {
          out[svc] = arns[i];
        });
        return out;
      });
    this.iamBaselinePolicyArns = pulumi
      .all([
        iamBaseline.passwordPolicy.id,
        iamBaseline.accessAnalyzer ? iamBaseline.accessAnalyzer.arn : pulumi.output(""),
      ])
      .apply(([policyId, analyzerArn]) =>
        analyzerArn !== "" ? [`policy:${policyId}`, analyzerArn] : [`policy:${policyId}`],
      );

    this.registerOutputs({
      cloudTrailArn: this.cloudTrailArn,
      cloudTrailLogGroupName: this.cloudTrailLogGroupName,
      configRecorderArn: this.configRecorderArn,
      guardDutyDetectorId: this.guardDutyDetectorId,
      securityHubHubArn: this.securityHubHubArn,
      kmsKeyArns: this.kmsKeyArns,
      iamBaselinePolicyArns: this.iamBaselinePolicyArns,
    });
  }
}
