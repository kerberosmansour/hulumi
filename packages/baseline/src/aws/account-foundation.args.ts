import type * as pulumi from "@pulumi/pulumi";

import type { Tier } from "./tier";

export type CisVersion = "v5.0.0" | "v7.0.0";

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
  /** Member account IDs for the Config aggregator + KMS deny-without-tag policy. Required for those features. */
  orgAccountIds?: readonly string[];
}
