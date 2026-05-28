import type * as pulumi from "@pulumi/pulumi";

import type {
  AwsOrgDelegatedAdminService,
  AwsOrgGuardrailId,
} from "./aws-organization-security-foundation.args";

export interface AwsOrganizationSecurityFoundationOutputs {
  delegatedAdministratorServicePrincipals: pulumi.Output<AwsOrgDelegatedAdminService[]>;
  configAggregatorArn: pulumi.Output<string>;
  accountPublicAccessBlockId: pulumi.Output<string>;
  securityHubOrganizationConfigurationId: pulumi.Output<string>;
  guardrailIds: pulumi.Output<AwsOrgGuardrailId[]>;
  scpPolicyIds: pulumi.Output<Record<AwsOrgGuardrailId, string | undefined>>;
  scpAttachmentIds: pulumi.Output<string[]>;
}
