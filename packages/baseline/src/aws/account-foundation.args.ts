import type * as pulumi from "@pulumi/pulumi";

import type { Tier } from "./tier";

export type CisVersion = "v5.0.0" | "v7.0.0";
export const KMS_DENY_WITHOUT_TAG_MODES = ["auto", "force", "off"] as const;
export type KmsDenyWithoutTagMode = (typeof KMS_DENY_WITHOUT_TAG_MODES)[number];

export interface AccountFoundationArgs {
  tier: Tier;
  /** IAM role ARN running the Pulumi program. MUST carry hulumi:iac-role=true tag (H3 advisory in M3). */
  iacRoleArn: pulumi.Input<string>;
  /** CIS standard version subscribed to Security Hub. Default v5.0.0; v7.0.0 staged with warning. */
  cisVersion?: CisVersion;
  /** AWS region for the AccountFoundation resources. Defaults to the Pulumi provider's region. */
  region?: pulumi.Input<string>;
  /** Test-only cleanup escape hatch for ephemeral stacks; defaults to false. */
  logBucketForceDestroy?: pulumi.Input<boolean>;
  /** Existing regional GuardDuty detector to reference instead of creating one. */
  existingGuardDutyDetectorId?: pulumi.Input<string>;
  /** Reference an already-enabled regional Security Hub account instead of enabling/disabling it. */
  useExistingSecurityHubAccount?: boolean;
  /** Member account IDs for the Config aggregator + KMS deny-without-tag policy. Required for those features. */
  orgAccountIds?: readonly string[];
  /**
   * Controls the Startup-Hardened KMS deny-without-tag statement.
   * - auto: preserve the orgAccountIds-gated default
   * - force: opt into the deny statement for single-account stacks
   * - off: suppress the deny statement
   */
  kmsDenyWithoutTag?: KmsDenyWithoutTagMode;
}
