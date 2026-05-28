import { AwsOrganizationSecurityFoundation } from "@hulumi/baseline/aws";

export const orgFoundation = new AwsOrganizationSecurityFoundation("org-smoke", {
  tier: "startup-hardened",
  managementAccountId: process.env.HULUMI_AWS_ORG_MANAGEMENT_ACCOUNT_ID ?? "111122223333",
  securityAccountId: process.env.HULUMI_AWS_ORG_SECURITY_ACCOUNT_ID ?? "222233334444",
  logArchiveAccountId: process.env.HULUMI_AWS_ORG_LOG_ARCHIVE_ACCOUNT_ID ?? "333344445555",
  homeRegion: process.env.HULUMI_AWS_ORG_HOME_REGION ?? "us-east-1",
  enabledRegions: ["us-east-1", "us-west-2"],
  configAggregatorRoleArn:
    process.env.HULUMI_AWS_ORG_CONFIG_AGGREGATOR_ROLE_ARN ??
    "arn:aws:iam::222233334444:role/hulumi-config-aggregator",
  bootstrapRoleArn:
    process.env.HULUMI_AWS_ORG_BOOTSTRAP_ROLE_ARN ??
    "arn:aws:iam::111122223333:role/hulumi-bootstrap",
  steadyStateRoleArn:
    process.env.HULUMI_AWS_ORG_STEADY_STATE_ROLE_ARN ??
    "arn:aws:iam::111122223333:role/hulumi-steady-state",
  scpTargetIds: [process.env.HULUMI_AWS_ORG_SCP_TARGET_ID ?? "r-root"],
});

export const orgGuardrailIds = orgFoundation.guardrailIds;
export const orgScpAttachmentIds = orgFoundation.scpAttachmentIds;
