import type {
  PolicyResource,
  ResourceValidationPolicy,
  StackValidationPolicy,
} from "@pulumi/policy";

import type { PackMetadata } from "../metadata";

const DOCS_BASE = "https://github.com/kerberosmansour/hulumi/blob/main/docs/components/README.md";

const FOUNDATION_TYPE = "hulumi:baseline:aws:AwsOrganizationSecurityFoundation";
const DELEGATED_ADMIN_TYPE = "aws:organizations/delegatedAdministrator:DelegatedAdministrator";
const ORG_POLICY_TYPE = "aws:organizations/policy:Policy";
const S3_ACCOUNT_BPA_TYPE = "aws:s3/accountPublicAccessBlock:AccountPublicAccessBlock";

const REQUIRED_DELEGATED_ADMIN_SERVICES = [
  "guardduty.amazonaws.com",
  "securityhub.amazonaws.com",
  "config.amazonaws.com",
  "access-analyzer.amazonaws.com",
] as const;

const REQUIRED_GUARDRAILS = [
  "deny-leave-organization",
  "deny-disable-security-services",
  "deny-public-s3-policy-changes",
] as const;

function isStartupHardenedFoundation(resource: PolicyResource): boolean {
  return resource.type === FOUNDATION_TYPE && resource.props.tier === "startup-hardened";
}

function hasStartupHardenedFoundation(resources: readonly PolicyResource[]): boolean {
  return resources.some(isStartupHardenedFoundation);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function policyGuardrailId(resource: PolicyResource): string | undefined {
  const tags = resource.props.tags;
  if (tags !== null && typeof tags === "object") {
    const id = (tags as Record<string, unknown>)["hulumi:org-guardrail-id"];
    if (typeof id === "string") return id;
  }
  const name = resource.props.name;
  if (typeof name === "string" && name.startsWith("hulumi-")) {
    return name.slice("hulumi-".length);
  }
  return undefined;
}

export const org1DelegatedAdminsRequired: StackValidationPolicy = {
  name: "HULUMI-ORG-1-delegated-admins-required",
  description:
    "Startup-hardened AWS organizations must delegate GuardDuty, Security Hub, Config, and Access Analyzer administration to the security account.",
  enforcementLevel: "mandatory",
  validateStack: (args, reportViolation) => {
    if (!hasStartupHardenedFoundation(args.resources)) return;
    const present = new Set(
      args.resources
        .filter((resource) => resource.type === DELEGATED_ADMIN_TYPE)
        .map((resource) => resource.props.servicePrincipal)
        .filter((service): service is string => typeof service === "string"),
    );
    const missing = REQUIRED_DELEGATED_ADMIN_SERVICES.filter((service) => !present.has(service));
    if (missing.length > 0) {
      reportViolation(
        `HULUMI-ORG-1: startup-hardened AWS organization foundation is missing delegated admin service(s): ${missing.join(
          ", ",
        )}. Docs: ${DOCS_BASE}`,
      );
    }
  },
};

export const org2RoleSeparationRequired: StackValidationPolicy = {
  name: "HULUMI-ORG-2-bootstrap-steady-state-role-separation",
  description:
    "Bootstrap and steady-state Pulumi roles must be different so one long-lived role cannot both install and operate organization-wide guardrails.",
  enforcementLevel: "mandatory",
  validateStack: (args, reportViolation) => {
    for (const resource of args.resources.filter(isStartupHardenedFoundation)) {
      const bootstrapRoleArn = resource.props.bootstrapRoleArn;
      const steadyStateRoleArn = resource.props.steadyStateRoleArn;
      if (
        typeof bootstrapRoleArn === "string" &&
        typeof steadyStateRoleArn === "string" &&
        bootstrapRoleArn === steadyStateRoleArn
      ) {
        reportViolation(
          `HULUMI-ORG-2: ${resource.urn} uses the same role for bootstrapRoleArn and steadyStateRoleArn. Docs: ${DOCS_BASE}`,
          resource.urn,
        );
      }
    }
  },
};

export const org3ApprovedScpSetRequired: StackValidationPolicy = {
  name: "HULUMI-ORG-3-approved-scp-set-required",
  description:
    "Startup-hardened AWS organization foundations must include the approved Hulumi SCP guardrail set.",
  enforcementLevel: "mandatory",
  validateStack: (args, reportViolation) => {
    const startupFoundations = args.resources.filter(isStartupHardenedFoundation);
    if (startupFoundations.length === 0) return;
    const present = new Set<string>();
    for (const foundation of startupFoundations) {
      for (const id of stringArray(foundation.props.scps ?? foundation.props.guardrailIds)) {
        present.add(id);
      }
    }
    for (const policy of args.resources.filter((resource) => resource.type === ORG_POLICY_TYPE)) {
      const id = policyGuardrailId(policy);
      if (id !== undefined) present.add(id);
    }
    const missing = REQUIRED_GUARDRAILS.filter((id) => !present.has(id));
    if (missing.length > 0) {
      reportViolation(
        `HULUMI-ORG-3: startup-hardened AWS organization foundation is missing required SCP guardrail(s): ${missing.join(
          ", ",
        )}. Docs: ${DOCS_BASE}`,
      );
    }
  },
};

export const org4AccountPublicAccessBlockRequired: ResourceValidationPolicy = {
  name: "HULUMI-ORG-4-account-public-access-block-all-switches",
  description:
    "Account-level S3 Public Access Block must enable all four switches to prevent public bucket or ACL drift at the account boundary.",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (args.type !== S3_ACCOUNT_BPA_TYPE) return;
    const props = args.props as {
      blockPublicAcls?: boolean;
      blockPublicPolicy?: boolean;
      ignorePublicAcls?: boolean;
      restrictPublicBuckets?: boolean;
    };
    const missing = [
      ["blockPublicAcls", props.blockPublicAcls],
      ["blockPublicPolicy", props.blockPublicPolicy],
      ["ignorePublicAcls", props.ignorePublicAcls],
      ["restrictPublicBuckets", props.restrictPublicBuckets],
    ]
      .filter(([, enabled]) => enabled !== true)
      .map(([field]) => field);
    if (missing.length > 0) {
      reportViolation(
        `HULUMI-ORG-4: ${args.urn} must set account-level S3 Public Access Block fields to true: ${missing.join(
          ", ",
        )}. Docs: ${DOCS_BASE}`,
      );
    }
  },
};

export const org5AccountPublicAccessBlockPresent: StackValidationPolicy = {
  name: "HULUMI-ORG-5-account-public-access-block-present",
  description:
    "Startup-hardened AWS organization foundations must include an account-level S3 Public Access Block resource.",
  enforcementLevel: "mandatory",
  validateStack: (args, reportViolation) => {
    if (!hasStartupHardenedFoundation(args.resources)) return;
    const hasAccountBlock = args.resources.some(
      (resource) => resource.type === S3_ACCOUNT_BPA_TYPE,
    );
    if (!hasAccountBlock) {
      reportViolation(
        `HULUMI-ORG-5: startup-hardened AWS organization foundation is missing account-level S3 Public Access Block. Docs: ${DOCS_BASE}`,
      );
    }
  },
};

export const org6SandboxScpAdvisory: StackValidationPolicy = {
  name: "HULUMI-ORG-6-sandbox-scp-advisory",
  description:
    "Sandbox AWS organization foundations without SCP attachments should surface an advisory so teams do not mistake sandbox posture for production posture.",
  enforcementLevel: "advisory",
  validateStack: (args, reportViolation) => {
    const sandboxFoundation = args.resources.find(
      (resource) => resource.type === FOUNDATION_TYPE && resource.props.tier === "sandbox",
    );
    if (sandboxFoundation === undefined) return;
    const scps = stringArray(sandboxFoundation.props.scps ?? sandboxFoundation.props.guardrailIds);
    if (scps.length === 0) {
      reportViolation(
        `HULUMI-ORG-6: ${sandboxFoundation.urn} is sandbox tier with no SCP guardrails. This is allowed for sandbox but must not be promoted as production posture. Docs: ${DOCS_BASE}`,
        sandboxFoundation.urn,
      );
    }
  },
};

export const hulumiAwsOrgHardeningPackMetadata: PackMetadata = {
  id: "hulumi-aws-org-hardening-pack",
  title: "Hulumi AWS Organization Hardening Pack",
  framework: "hulumi-aws-org",
  frameworkVersion: "0.1.0",
  severity: "critical",
  rules: [
    {
      id: "HULUMI-ORG-1",
      title: "Delegated security administrators required",
      description: org1DelegatedAdminsRequired.description!,
      severity: "critical",
      enforcement: "mandatory",
      frameworkIds: ["CCM:IAM-01", "NIST-800-53-r5:AC-2", "CIS-AWS-v5.0.0:1.6"],
      docsUrl: DOCS_BASE,
    },
    {
      id: "HULUMI-ORG-2",
      title: "Bootstrap and steady-state roles separated",
      description: org2RoleSeparationRequired.description!,
      severity: "critical",
      enforcement: "mandatory",
      frameworkIds: ["CCM:IAM-12", "NIST-800-53-r5:AC-6", "NIST-800-218A:PW.6"],
      docsUrl: DOCS_BASE,
    },
    {
      id: "HULUMI-ORG-3",
      title: "Approved SCP guardrail set",
      description: org3ApprovedScpSetRequired.description!,
      severity: "critical",
      enforcement: "mandatory",
      frameworkIds: ["CCM:SEF-03", "NIST-800-53-r5:CM-2", "CIS-AWS-v5.0.0:1.20"],
      docsUrl: DOCS_BASE,
    },
    {
      id: "HULUMI-ORG-4",
      title: "Account-level S3 Public Access Block",
      description: org4AccountPublicAccessBlockRequired.description!,
      severity: "high",
      enforcement: "mandatory",
      frameworkIds: ["CCM:DSP-10", "NIST-800-53-r5:SC-7", "CIS-AWS-v5.0.0:2.1.5"],
      docsUrl: DOCS_BASE,
    },
    {
      id: "HULUMI-ORG-5",
      title: "Account-level S3 Public Access Block present",
      description: org5AccountPublicAccessBlockPresent.description!,
      severity: "high",
      enforcement: "mandatory",
      frameworkIds: ["CCM:DSP-10", "NIST-800-53-r5:SC-7", "CIS-AWS-v5.0.0:2.1.5"],
      docsUrl: DOCS_BASE,
    },
    {
      id: "HULUMI-ORG-6",
      title: "Sandbox SCP posture advisory",
      description: org6SandboxScpAdvisory.description!,
      severity: "medium",
      enforcement: "advisory",
      frameworkIds: ["CCM:SEF-03", "NIST-800-53-r5:CM-2"],
      docsUrl: DOCS_BASE,
    },
  ],
};
