import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

import { buildControlsTags } from "./tags";
import { assertValidTier } from "./tier";
import {
  AWS_ORG_DELEGATED_ADMIN_SERVICES,
  AWS_ORG_GUARDRAIL_IDS,
} from "./aws-organization-security-foundation.args";
import type {
  AwsOrganizationSecurityFoundationArgs,
  AwsOrgDelegatedAdminService,
  AwsOrgGuardrailId,
} from "./aws-organization-security-foundation.args";
import type { AwsOrganizationSecurityFoundationOutputs } from "./aws-organization-security-foundation.outputs";

export const AWS_ORGANIZATION_SECURITY_FOUNDATION_COMPONENT_TYPE =
  "hulumi:baseline:aws:AwsOrganizationSecurityFoundation";

const AWS_ORG_FOUNDATION_CONTROLS = [
  "CCM:IAM-01",
  "CCM:LOG-02",
  "CCM:SEF-03",
  "CIS-AWS-v5.0.0:1.6",
  "CIS-AWS-v5.0.0:2.1.5",
  "CIS-AWS-v5.0.0:3.1",
  "NIST-800-53-r5:AC-2",
  "NIST-800-53-r5:AU-2",
  "NIST-800-53-r5:CA-7",
] as const;

const MAX_ENABLED_REGIONS = 32;
const MAX_SCP_TARGETS = 64;

type NormalizedArgs = Required<
  Pick<
    AwsOrganizationSecurityFoundationArgs,
    "delegatedAdminServices" | "enabledRegions" | "scpTargetIds" | "scps" | "attachScps"
  >
> &
  AwsOrganizationSecurityFoundationArgs;

function assertNonEmptyLiteral(field: string, value: pulumi.Input<string>): void {
  if (typeof value === "string" && value.trim().length === 0) {
    throw new Error(`AwsOrganizationSecurityFoundation: ${field} must be a non-empty string.`);
  }
}

function assertBoundedList(field: string, values: readonly string[], max: number): void {
  if (values.length > max) {
    throw new Error(
      `AwsOrganizationSecurityFoundation: ${field} must contain at most ${max} items.`,
    );
  }
  for (const value of values) {
    if (value.trim().length === 0) {
      throw new Error(`AwsOrganizationSecurityFoundation: ${field} cannot contain empty values.`);
    }
  }
}

function assertValidDelegatedAdminServices(
  services: readonly string[],
): asserts services is readonly AwsOrgDelegatedAdminService[] {
  const allowed = new Set<string>(AWS_ORG_DELEGATED_ADMIN_SERVICES);
  const unknown = services.filter((service) => !allowed.has(service));
  if (unknown.length > 0) {
    throw new Error(
      `AwsOrganizationSecurityFoundation: Unknown delegated admin service: ${unknown.join(", ")}`,
    );
  }
}

function assertValidGuardrails(
  guardrails: readonly string[],
): asserts guardrails is readonly AwsOrgGuardrailId[] {
  const allowed = new Set<string>(AWS_ORG_GUARDRAIL_IDS);
  const unknown = guardrails.filter((guardrail) => !allowed.has(guardrail));
  if (unknown.length > 0) {
    throw new Error(
      `AwsOrganizationSecurityFoundation: Unknown AWS organization guardrail: ${unknown.join(
        ", ",
      )}`,
    );
  }
}

function normalizeArgs(args: AwsOrganizationSecurityFoundationArgs): NormalizedArgs {
  assertValidTier(args.tier);
  assertNonEmptyLiteral("managementAccountId", args.managementAccountId);
  assertNonEmptyLiteral("securityAccountId", args.securityAccountId);
  assertNonEmptyLiteral("logArchiveAccountId", args.logArchiveAccountId);
  assertNonEmptyLiteral("homeRegion", args.homeRegion);
  assertNonEmptyLiteral("configAggregatorRoleArn", args.configAggregatorRoleArn);
  if (args.bootstrapRoleArn !== undefined)
    assertNonEmptyLiteral("bootstrapRoleArn", args.bootstrapRoleArn);
  if (args.steadyStateRoleArn !== undefined)
    assertNonEmptyLiteral("steadyStateRoleArn", args.steadyStateRoleArn);
  if (
    typeof args.bootstrapRoleArn === "string" &&
    typeof args.steadyStateRoleArn === "string" &&
    args.bootstrapRoleArn === args.steadyStateRoleArn
  ) {
    throw new Error(
      "AwsOrganizationSecurityFoundation: bootstrapRoleArn and steadyStateRoleArn must be different.",
    );
  }
  assertBoundedList("enabledRegions", args.enabledRegions, MAX_ENABLED_REGIONS);
  if (typeof args.homeRegion === "string" && !args.enabledRegions.includes(args.homeRegion)) {
    throw new Error(
      "AwsOrganizationSecurityFoundation: homeRegion must be included in enabledRegions.",
    );
  }

  const delegatedAdminServices = [
    ...(args.delegatedAdminServices ?? AWS_ORG_DELEGATED_ADMIN_SERVICES),
  ];
  assertValidDelegatedAdminServices(delegatedAdminServices);

  const scps = [...(args.scps ?? (args.tier === "startup-hardened" ? AWS_ORG_GUARDRAIL_IDS : []))];
  assertValidGuardrails(scps);

  const scpTargetIds = [...(args.scpTargetIds ?? [])];
  assertBoundedList("scpTargetIds", scpTargetIds, MAX_SCP_TARGETS);

  const attachScps = args.attachScps ?? args.tier === "startup-hardened";
  if (args.tier === "startup-hardened" && scps.length === 0) {
    throw new Error(
      "AwsOrganizationSecurityFoundation: startup-hardened tier requires SCP guardrails.",
    );
  }
  if (args.tier === "startup-hardened" && attachScps && scpTargetIds.length === 0) {
    throw new Error(
      "AwsOrganizationSecurityFoundation: startup-hardened tier requires scpTargetIds.",
    );
  }

  return {
    ...args,
    delegatedAdminServices,
    scps,
    scpTargetIds,
    attachScps,
  };
}

function serviceKey(servicePrincipal: AwsOrgDelegatedAdminService): string {
  return servicePrincipal.replace(".amazonaws.com", "").replace(/[^a-z0-9]+/g, "-");
}

function guardrailKey(id: AwsOrgGuardrailId): string {
  return id.replace(/[^a-z0-9]+/g, "-");
}

function buildTags(
  tier: AwsOrganizationSecurityFoundationArgs["tier"],
  extraTags: pulumi.Input<Record<string, string>> | undefined,
): pulumi.Output<Record<string, string>> {
  const base: Record<string, string> = {
    "hulumi:component": "AwsOrganizationSecurityFoundation",
    "hulumi:tier": tier,
    ...buildControlsTags(AWS_ORG_FOUNDATION_CONTROLS),
  };
  return pulumi.output(extraTags ?? {}).apply((extra) => ({ ...base, ...extra }));
}

function deniedSecurityServiceActions(): string[] {
  return [
    "access-analyzer:DeleteAnalyzer",
    "access-analyzer:UpdateArchiveRule",
    "cloudtrail:DeleteTrail",
    "cloudtrail:StopLogging",
    "config:DeleteConfigurationAggregator",
    "config:DeleteConfigurationRecorder",
    "config:DeleteDeliveryChannel",
    "config:StopConfigurationRecorder",
    "guardduty:DeleteDetector",
    "guardduty:DisassociateFromMasterAccount",
    "guardduty:DisassociateMembers",
    "guardduty:StopMonitoringMembers",
    "securityhub:DeleteMembers",
    "securityhub:DisableImportFindingsForProduct",
    "securityhub:DisableOrganizationAdminAccount",
    "securityhub:DisableSecurityHub",
  ];
}

function renderScpStatement(
  sid: string,
  actions: readonly string[],
  exemptRoleArns: readonly pulumi.Input<string>[],
): pulumi.Output<Record<string, unknown>> {
  return pulumi.output(exemptRoleArns).apply((exemptions) => {
    const statement: Record<string, unknown> = {
      Sid: sid,
      Effect: "Deny",
      Action: actions,
      Resource: "*",
    };
    const literalExemptions = exemptions.filter(
      (arn): arn is string => typeof arn === "string" && arn.length > 0,
    );
    if (literalExemptions.length > 0) {
      statement.Condition = { ArnNotLike: { "aws:PrincipalArn": literalExemptions } };
    }
    return statement;
  });
}

function renderGuardrailScp(
  id: AwsOrgGuardrailId,
  exemptRoleArns: readonly pulumi.Input<string>[],
): pulumi.Output<string> {
  const statement =
    id === "deny-leave-organization"
      ? renderScpStatement(
          "DenyLeaveOrganization",
          ["organizations:LeaveOrganization"],
          exemptRoleArns,
        )
      : id === "deny-disable-security-services"
        ? renderScpStatement(
            "DenyDisableSecurityServices",
            deniedSecurityServiceActions(),
            exemptRoleArns,
          )
        : renderScpStatement(
            "DenyPublicS3PolicyChanges",
            [
              "s3:DeletePublicAccessBlock",
              "s3:PutAccountPublicAccessBlock",
              "s3:PutBucketAcl",
              "s3:PutBucketPolicy",
              "s3:PutBucketPublicAccessBlock",
            ],
            exemptRoleArns,
          );
  return statement.apply((resolvedStatement) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [resolvedStatement],
    }),
  );
}

export class AwsOrganizationSecurityFoundation
  extends pulumi.ComponentResource
  implements AwsOrganizationSecurityFoundationOutputs
{
  public readonly delegatedAdministratorServicePrincipals: pulumi.Output<
    AwsOrgDelegatedAdminService[]
  >;
  public readonly configAggregatorArn: pulumi.Output<string>;
  public readonly accountPublicAccessBlockId: pulumi.Output<string>;
  public readonly securityHubOrganizationConfigurationId: pulumi.Output<string>;
  public readonly guardrailIds: pulumi.Output<AwsOrgGuardrailId[]>;
  public readonly scpPolicyIds: pulumi.Output<Record<AwsOrgGuardrailId, string | undefined>>;
  public readonly scpAttachmentIds: pulumi.Output<string[]>;

  constructor(
    name: string,
    args: AwsOrganizationSecurityFoundationArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    const normalized = normalizeArgs(args);
    super(
      AWS_ORGANIZATION_SECURITY_FOUNDATION_COMPONENT_TYPE,
      name,
      normalized as pulumi.Inputs,
      opts,
    );

    const tags = buildTags(normalized.tier, normalized.tags);
    const exemptRoleArns = [normalized.bootstrapRoleArn, normalized.steadyStateRoleArn].filter(
      (arn): arn is pulumi.Input<string> => arn !== undefined,
    );

    const delegatedAdmins = normalized.delegatedAdminServices.map(
      (servicePrincipal) =>
        new aws.organizations.DelegatedAdministrator(
          `${name}-${serviceKey(servicePrincipal)}-delegated-admin`,
          {
            accountId: normalized.securityAccountId,
            servicePrincipal,
          },
          { parent: this },
        ),
    );

    const securityHubDelegatedAdmin = delegatedAdmins.find(
      (_, i) => normalized.delegatedAdminServices[i] === "securityhub.amazonaws.com",
    );
    const securityHubAdmin = new aws.securityhub.OrganizationAdminAccount(
      `${name}-securityhub-org-admin`,
      {
        adminAccountId: normalized.securityAccountId,
        region: normalized.homeRegion,
      },
      {
        parent: this,
        dependsOn: securityHubDelegatedAdmin !== undefined ? [securityHubDelegatedAdmin] : [],
      },
    );
    const securityHubAggregator = new aws.securityhub.FindingAggregator(
      `${name}-securityhub-finding-aggregator`,
      {
        linkingMode: "ALL_REGIONS",
        region: normalized.homeRegion,
      },
      { parent: this, dependsOn: [securityHubAdmin] },
    );
    const securityHubOrganizationConfiguration = new aws.securityhub.OrganizationConfiguration(
      `${name}-securityhub-org-config`,
      {
        autoEnable: false,
        autoEnableStandards: "NONE",
        organizationConfiguration: { configurationType: "CENTRAL" },
        region: normalized.homeRegion,
      },
      { parent: this, dependsOn: [securityHubAggregator] },
    );

    const configAggregator = new aws.cfg.ConfigurationAggregator(
      `${name}-config-aggregator`,
      {
        name: `${name}-organization-config`,
        organizationAggregationSource: {
          allRegions: true,
          roleArn: normalized.configAggregatorRoleArn,
        },
        region: normalized.homeRegion,
        tags,
      },
      { parent: this },
    );

    const accountPublicAccessBlock = new aws.s3.AccountPublicAccessBlock(
      `${name}-account-public-access-block`,
      {
        accountId: normalized.managementAccountId,
        blockPublicAcls: true,
        blockPublicPolicy: true,
        ignorePublicAcls: true,
        restrictPublicBuckets: true,
      },
      { parent: this },
    );

    const scpPolicies = normalized.scps.map((guardrailId) => ({
      guardrailId,
      policy: new aws.organizations.Policy(
        `${name}-${guardrailKey(guardrailId)}-scp`,
        {
          name: `hulumi-${guardrailId}`,
          description: `Hulumi organization guardrail ${guardrailId}`,
          type: "SERVICE_CONTROL_POLICY",
          content: renderGuardrailScp(guardrailId, exemptRoleArns),
          skipDestroy: true,
          tags: tags.apply((resolvedTags) => ({
            ...resolvedTags,
            "hulumi:org-guardrail-id": guardrailId,
          })),
        },
        { parent: this },
      ),
    }));

    const scpAttachments =
      normalized.attachScps === true
        ? scpPolicies.flatMap(({ guardrailId, policy }) =>
            normalized.scpTargetIds.map(
              (targetId) =>
                new aws.organizations.PolicyAttachment(
                  `${name}-${guardrailKey(guardrailId)}-${targetId}-attachment`,
                  {
                    policyId: policy.id,
                    targetId,
                    skipDestroy: true,
                  },
                  { parent: this, dependsOn: [policy] },
                ),
            ),
          )
        : [];

    this.delegatedAdministratorServicePrincipals = pulumi.output([
      ...normalized.delegatedAdminServices,
    ]);
    this.configAggregatorArn = configAggregator.arn;
    this.accountPublicAccessBlockId = accountPublicAccessBlock.id;
    this.securityHubOrganizationConfigurationId = securityHubOrganizationConfiguration.id;
    this.guardrailIds = pulumi.output([...normalized.scps]);
    this.scpPolicyIds = pulumi
      .all(scpPolicies.map(({ policy }) => policy.id))
      .apply((policyIds) => {
        const out: Record<AwsOrgGuardrailId, string | undefined> = {
          "deny-leave-organization": undefined,
          "deny-disable-security-services": undefined,
          "deny-public-s3-policy-changes": undefined,
        };
        normalized.scps.forEach((guardrailId, i) => {
          out[guardrailId] = policyIds[i];
        });
        return out;
      });
    this.scpAttachmentIds = pulumi.all(scpAttachments.map((attachment) => attachment.id));

    this.registerOutputs({
      delegatedAdministratorServicePrincipals: this.delegatedAdministratorServicePrincipals,
      configAggregatorArn: this.configAggregatorArn,
      accountPublicAccessBlockId: this.accountPublicAccessBlockId,
      securityHubOrganizationConfigurationId: this.securityHubOrganizationConfigurationId,
      guardrailIds: this.guardrailIds,
      scpPolicyIds: this.scpPolicyIds,
      scpAttachmentIds: this.scpAttachmentIds,
    });
  }
}
