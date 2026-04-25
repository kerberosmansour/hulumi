// GuardDuty detector + protection toggles.
//
// Sandbox: basic detector (S3 + EKS audit logs OFF).
// Startup-Hardened: enables S3Protection + MalwareProtection +
// RuntimeMonitoring + RDSProtection + EKSAuditLogs as separate
// `aws.guardduty.DetectorFeature` resources (the modern API).

import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import type { Tier } from "./tier";

export const GUARDDUTY_HARDENED_FEATURES = [
  "S3_DATA_EVENTS",
  "EKS_AUDIT_LOGS",
  "EBS_MALWARE_PROTECTION",
  "RDS_LOGIN_EVENTS",
  "RUNTIME_MONITORING",
] as const;

export interface GuardDutyHelperArgs {
  tier: Tier;
  parent: pulumi.Resource;
  namePrefix: string;
  tags: Record<string, string>;
}

export interface GuardDutyHelperResult {
  detector: aws.guardduty.Detector;
  features: aws.guardduty.DetectorFeature[];
}

export function createGuardDuty(args: GuardDutyHelperArgs): GuardDutyHelperResult {
  const parent = { parent: args.parent } as const;

  const detector = new aws.guardduty.Detector(
    `${args.namePrefix}-guardduty-detector`,
    {
      enable: true,
      findingPublishingFrequency: "FIFTEEN_MINUTES",
      tags: args.tags,
    },
    parent,
  );

  const features: aws.guardduty.DetectorFeature[] = [];
  if (args.tier === "startup-hardened") {
    for (const feature of GUARDDUTY_HARDENED_FEATURES) {
      features.push(
        new aws.guardduty.DetectorFeature(
          `${args.namePrefix}-guardduty-feature-${feature.toLowerCase().replace(/_/g, "-")}`,
          {
            detectorId: detector.id,
            name: feature,
            status: "ENABLED",
          },
          parent,
        ),
      );
    }
  }

  return { detector, features };
}
