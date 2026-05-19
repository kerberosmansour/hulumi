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
//
// Reuse-destroy safety (M-DETECTIVEREUSE):
// When `useExistingAccount === true` we IMPORT the account-wide Security
// Hub via `Account.get` — destroying the stack does not disable the hub.
// But the CIS + NIST `StandardsSubscription` resources we register are
// net-new and their default destroy behaviour calls
// BatchDisableStandards account-wide. That would silently down-grade
// the reused account's monitoring posture on `pulumi destroy`. The fix
// is `retainOnDelete: true` on the subscription resources for the
// reuse path: destroy leaves the standards subscribed for whoever
// originally owned the account, while net-new deploys retain the
// original delete-and-unsubscribe semantics (Hulumi owns the lifecycle
// end-to-end, so destroy correctly cleans up everything it created).

import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import type { Tier } from "./tier";
import { VERIFIED_DETECTOR_ID_KEY } from "./guardduty";

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
  useExistingAccount?: boolean;
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

  const hub =
    args.useExistingAccount === true
      ? aws.securityhub.Account.get(
          `${args.namePrefix}-securityhub-account`,
          aws.getCallerIdentityOutput({}, { parent: args.parent }).accountId,
          undefined,
          { parent: args.parent, dependsOn: guardDutyReadyDeps },
        )
      : new aws.securityhub.Account(
          `${args.namePrefix}-securityhub-account`,
          { enableDefaultStandards: false },
          { parent: args.parent, dependsOn: guardDutyReadyDeps },
        );

  // Reuse path: retain subscriptions on destroy so a `pulumi destroy`
  // never executes BatchDisableStandards against an account-wide hub
  // Hulumi did not create. Net-new path: keep default delete semantics
  // — Hulumi owns the account and the subscriptions, and destroy
  // should clean them up symmetrically.
  const retainOnDelete = args.useExistingAccount === true;

  // Fold the GuardDuty reuse-path posture-verified Output (M-DETECTIVEREUSE)
  // into the standardsArn input of the CIS / NIST subscriptions when
  // present. The verified Output throws on bad posture, which Pulumi
  // propagates as a deployment failure when it tries to register the
  // subscription resource. Concentrating the assertion in this single
  // input chain (instead of overwriting `detector.id`, which fans out
  // through every Pulumi-engine-tracked downstream consumer) keeps the
  // deployment-abort contract intact while minimising spurious
  // unhandled-rejection noise from the mock runtime.
  const verifiedDetectorId = (
    args.guardDutyDetector as unknown as Record<string, pulumi.Output<string> | undefined>
  )[VERIFIED_DETECTOR_ID_KEY];

  const gatedCisArn: pulumi.Output<string> = pulumi
    .all([
      pulumi.interpolate`arn:aws:securityhub:${args.region}::${CIS_V5_STANDARD_ARN_PARTIAL}`,
      verifiedDetectorId ?? pulumi.output<string | undefined>(undefined),
    ])
    .apply(([arn]) => arn);

  const cisSubscription = new aws.securityhub.StandardsSubscription(
    `${args.namePrefix}-securityhub-cis-v5`,
    {
      standardsArn: gatedCisArn,
    },
    { parent: args.parent, dependsOn: [hub], retainOnDelete },
  );

  const result: SecurityHubHelperResult = { hub, cisSubscription };

  if (args.tier === "startup-hardened") {
    const gatedNistArn: pulumi.Output<string> = pulumi
      .all([
        pulumi.interpolate`arn:aws:securityhub:${args.region}::${NIST_800_53_R5_STANDARD_ARN_PARTIAL}`,
        verifiedDetectorId ?? pulumi.output<string | undefined>(undefined),
      ])
      .apply(([arn]) => arn);

    result.nistSubscription = new aws.securityhub.StandardsSubscription(
      `${args.namePrefix}-securityhub-nist-800-53-r5`,
      {
        standardsArn: gatedNistArn,
      },
      { parent: args.parent, dependsOn: [hub], retainOnDelete },
    );
  }

  return result;
}
