// GuardDuty detector + protection toggles.
//
// Sandbox: basic detector (S3 + EKS audit logs OFF).
// Startup-Hardened: enables S3Protection + MalwareProtection +
// RuntimeMonitoring + RDSProtection + EKSAuditLogs as separate
// `aws.guardduty.DetectorFeature` resources (the modern API).
//
// Reuse path posture assertion (M-DETECTIVEREUSE):
// when `existingDetectorId` is supplied we import the detector via
// `Detector.get`, then call `aws.guardduty.getDetectorOutput` to
// observe its current posture. A `.apply` throws if the detector is
// not ENABLED + FIFTEEN_MINUTES so the deployment fails rather than
// silently inheriting a suspended / SIX_HOURS / non-Hulumi detector.
//
// The verified Output is exposed on the returned `Detector` resource
// as a non-enumerable `__hulumiVerifiedDetectorId` property and is
// consumed by `securityhub.ts` (which is the next baseline component
// AccountFoundation composes after GuardDuty). Threading the
// verification through ONE downstream consumer is intentional: it
// keeps the deployment-abort contract intact (Pulumi engine refuses
// to register the CIS standards subscription if verification fails)
// while minimising the fan-out of rejected-output observers that
// would otherwise emit spurious `unhandledRejection` events in the
// vitest mock runtime.

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

export const GUARDDUTY_REQUIRED_STATUS = "ENABLED";
export const GUARDDUTY_REQUIRED_FREQUENCY = "FIFTEEN_MINUTES";

export interface GuardDutyHelperArgs {
  tier: Tier;
  parent: pulumi.Resource;
  namePrefix: string;
  tags: Record<string, string>;
  existingDetectorId?: pulumi.Input<string>;
}

export interface GuardDutyHelperResult {
  detector: aws.guardduty.Detector;
  features: aws.guardduty.DetectorFeature[];
}

/**
 * Non-enumerable property stashed on a reused `Detector` resource to
 * carry the posture-verified id. Consumed by `securityhub.ts` to gate
 * the standards-subscription registration on the assertion succeeding.
 *
 * @internal
 */
export const VERIFIED_DETECTOR_ID_KEY = "__hulumiVerifiedDetectorId" as const;

export function createGuardDuty(args: GuardDutyHelperArgs): GuardDutyHelperResult {
  const parent = { parent: args.parent } as const;

  if (typeof args.existingDetectorId === "string" && args.existingDetectorId.length === 0) {
    throw new Error("AccountFoundation: existingGuardDutyDetectorId must be non-empty when set");
  }

  const detector =
    args.existingDetectorId !== undefined
      ? aws.guardduty.Detector.get(
          `${args.namePrefix}-guardduty-detector`,
          args.existingDetectorId,
          undefined,
          parent,
        )
      : new aws.guardduty.Detector(
          `${args.namePrefix}-guardduty-detector`,
          {
            enable: true,
            findingPublishingFrequency: "FIFTEEN_MINUTES",
            tags: args.tags,
          },
          parent,
        );

  if (args.existingDetectorId !== undefined) {
    // Posture assertion for the reuse path. `Detector.get` only verifies
    // EXISTENCE; AWS happily returns a SUSPENDED detector or one publishing
    // every SIX_HOURS. We invoke the read-only `getDetector` data source
    // and produce a `verifiedId` Output that throws via `.apply` if the
    // posture is non-compliant.
    //
    // Critical: build `verifiedId` from `pulumi.output(args.existingDetectorId)`
    // — NOT from `detector.id`. Pulumi's invoke path `await`s every
    // CustomResource dependency's `id.isKnown`, so threading the
    // invoke's own result back into `detector.id` would deadlock.
    // Reading the id from the user-supplied Input breaks any cycle —
    // the existingDetectorId is what we want to validate anyway.
    //
    // We stash `verifiedId` on the returned `Detector` resource via a
    // non-enumerable property (so it does not interfere with Pulumi's
    // resource serialization). `securityhub.ts` reads it and folds it
    // into the standards-subscription input chain, which gates the
    // deployment behind the assertion without fanning the rejected
    // output across every component output.
    const sourceId: pulumi.Output<string> = pulumi.output(args.existingDetectorId);
    const posture = aws.guardduty.getDetectorOutput({ id: sourceId }, { parent: args.parent });
    const verifiedId: pulumi.Output<string> = pulumi
      .all([sourceId, posture.status, posture.findingPublishingFrequency])
      .apply(([id, status, frequency]) => {
        if (status !== GUARDDUTY_REQUIRED_STATUS) {
          throw new Error(
            `AccountFoundation: reused GuardDuty detector ${id} has status="${status}"; ` +
              `Hulumi baseline requires status="${GUARDDUTY_REQUIRED_STATUS}". ` +
              `Re-enable the detector or omit existingGuardDutyDetectorId so Hulumi can create a baseline-compliant detector.`,
          );
        }
        if (frequency !== GUARDDUTY_REQUIRED_FREQUENCY) {
          throw new Error(
            `AccountFoundation: reused GuardDuty detector ${id} has findingPublishingFrequency="${frequency}"; ` +
              `Hulumi baseline requires findingPublishingFrequency="${GUARDDUTY_REQUIRED_FREQUENCY}". ` +
              `Update the detector's finding publishing frequency to FIFTEEN_MINUTES or omit existingGuardDutyDetectorId.`,
          );
        }
        return id;
      });
    Object.defineProperty(detector, VERIFIED_DETECTOR_ID_KEY, {
      value: verifiedId,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }

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
