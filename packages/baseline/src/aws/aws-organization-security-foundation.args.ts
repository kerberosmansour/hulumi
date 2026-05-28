import type * as pulumi from "@pulumi/pulumi";

import type { Tier } from "./tier";

export const AWS_ORG_DELEGATED_ADMIN_SERVICES = [
  "guardduty.amazonaws.com",
  "securityhub.amazonaws.com",
  "config.amazonaws.com",
  "access-analyzer.amazonaws.com",
] as const;

export type AwsOrgDelegatedAdminService = (typeof AWS_ORG_DELEGATED_ADMIN_SERVICES)[number];

export const AWS_ORG_GUARDRAIL_IDS = [
  "deny-leave-organization",
  "deny-disable-security-services",
  "deny-public-s3-policy-changes",
] as const;

export type AwsOrgGuardrailId = (typeof AWS_ORG_GUARDRAIL_IDS)[number];

export interface AwsOrganizationSecurityFoundationArgs {
  tier: Tier;
  managementAccountId: pulumi.Input<string>;
  securityAccountId: pulumi.Input<string>;
  logArchiveAccountId: pulumi.Input<string>;
  homeRegion: pulumi.Input<string>;
  enabledRegions: readonly string[];
  configAggregatorRoleArn: pulumi.Input<string>;
  bootstrapRoleArn?: pulumi.Input<string>;
  steadyStateRoleArn?: pulumi.Input<string>;
  delegatedAdminServices?: readonly AwsOrgDelegatedAdminService[];
  scps?: readonly AwsOrgGuardrailId[];
  scpTargetIds?: readonly string[];
  attachScps?: boolean;
  tags?: pulumi.Input<Record<string, string>>;
}
