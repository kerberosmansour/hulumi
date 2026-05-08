// Security Hub account + standards subscriptions.
//
// Sandbox: account enabled, CIS AWS Foundations v5.0.0 standard
// subscribed.
// Startup-Hardened: also subscribes to NIST 800-53 Rev 5.
//
// Eventual-consistency: AWS Security Hub's `subscribeToStandards` API
// fails if GuardDuty isn't ENABLED yet. The original M3 design used a
// `pulumi.dynamic.Resource` polling probe; we replace that with a direct
// dependsOn chain (Security Hub Account → GuardDuty Detector + all
// DetectorFeatures) because Pulumi's @pulumi/pulumi.dynamic closure
// serialization conflicts with vitest's worker pool (the required
// `trace_events` module is unavailable in test workers). AWS's
// CreateDetector API resolves only after status === ENABLED, so the
// dependsOn chain provides equivalent ordering for real deployments.
// Documented in docs/slo/lessons/hulumi-m3.md.

import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import type { Tier } from "./tier";

export const CIS_V5_STANDARD_ARN_PARTIAL = "standards/cis-aws-foundations-benchmark/v/5.0.0";
export const NIST_800_53_R5_STANDARD_ARN_PARTIAL = "standards/nist-800-53/v/5.0.0";

export interface SecurityHubHelperArgs {
  tier: Tier;
  parent: pulumi.Resource;
  namePrefix: string;
  tags: Record<string, string>;
  guardDutyDetector: aws.guardduty.Detector;
  guardDutyFeatures: readonly aws.guardduty.DetectorFeature[];
  region: pulumi.Input<string>;
  cisVersion?: "v5.0.0" | "v7.0.0";
}

export interface SecurityHubHelperResult {
  hub: aws.securityhub.Account;
  cisSubscription: aws.securityhub.StandardsSubscription;
  nistSubscription?: aws.securityhub.StandardsSubscription;
}

export function createSecurityHub(args: SecurityHubHelperArgs): SecurityHubHelperResult {
  const cisVersion = args.cisVersion ?? "v5.0.0";
  if (cisVersion === "v7.0.0") {
    pulumi.log.warn(
      `AccountFoundation: cisVersion="v7.0.0" requested; AWS Security Hub currently maxes at v5.0.0. Falling back to v5.0.0 with a roadmap pointer.`,
    );
  }

  const guardDutyReadyDeps: pulumi.Resource[] = [args.guardDutyDetector, ...args.guardDutyFeatures];

  const hub = new aws.securityhub.Account(
    `${args.namePrefix}-securityhub-account`,
    { enableDefaultStandards: false },
    { parent: args.parent, dependsOn: guardDutyReadyDeps },
  );

  const cisSubscription = new aws.securityhub.StandardsSubscription(
    `${args.namePrefix}-securityhub-cis-v5`,
    {
      standardsArn: pulumi.interpolate`arn:aws:securityhub:${args.region}::${CIS_V5_STANDARD_ARN_PARTIAL}`,
    },
    { parent: args.parent, dependsOn: [hub] },
  );

  const result: SecurityHubHelperResult = { hub, cisSubscription };

  if (args.tier === "startup-hardened") {
    result.nistSubscription = new aws.securityhub.StandardsSubscription(
      `${args.namePrefix}-securityhub-nist-800-53-r5`,
      {
        standardsArn: pulumi.interpolate`arn:aws:securityhub:${args.region}::${NIST_800_53_R5_STANDARD_ARN_PARTIAL}`,
      },
      { parent: args.parent, dependsOn: [hub] },
    );
  }

  return result;
}
