// HulumiOperationsHardeningPack — CrossGuard rules for the Operations
// surface added in runbook hulumi-operations-k8s-security M10 / Ops M4.
//
//   O_PATCH_1     `Patch:Group` tag value must be in {dev, staging, production}.
//   O_AUDIT_1     `aws.cloudtrail.Trail` must enable log-file validation + multi-region.
//   O_AUDIT_2     CW Logs groups receiving CloudTrail events must be KMS-encrypted.
//   O_INSPECTOR_1 `aws.inspector2.Enabler.resourceTypes` must include EC2, ECR, LAMBDA.
//
// Each rule respects the existing `Suppression` API. Suppressions without a
// non-empty `reason` are ignored (M3 invariant carried forward).

import type { ResourceValidationPolicy } from "@pulumi/policy";

import type { PackMetadata } from "../metadata";
import { matchSuppression, type Suppression } from "./suppressions";

const DOCS_BASE = "https://github.com/kerberosmansour/hulumi/blob/main/docs/components/README.md";

const PATCH_GROUP_TAG = "Patch:Group";
const VALID_PATCH_GROUPS = new Set(["dev", "staging", "production"]);

const SSM_PATCHED_RESOURCE_TYPES = new Set([
  "aws:ssm/maintenanceWindowTarget:MaintenanceWindowTarget",
]);

const CLOUDTRAIL_TYPE = "aws:cloudtrail/trail:Trail";
const LOG_GROUP_TYPE = "aws:cloudwatch/logGroup:LogGroup";
const INSPECTOR_ENABLER_TYPE = "aws:inspector2/enabler:Enabler";

function readSuppressions(config: Record<string, unknown> | undefined): readonly Suppression[] {
  const raw = config?.suppressions;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is Suppression => {
    if (x === null || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    return (
      typeof o.ruleId === "string" && typeof o.reason === "string" && o.reason.trim().length > 0
    );
  });
}

export const oPatch1RestrictPatchGroupTag: ResourceValidationPolicy = {
  name: "HULUMI-O-PATCH-1-patch-group-enum",
  description:
    "SSM Maintenance Window targets that match the `Patch:Group` tag must restrict the value to {dev, staging, production}. Free-form values let consumers introduce un-tracked tiers that the wave-composer cannot reason about.",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (!SSM_PATCHED_RESOURCE_TYPES.has(args.type)) return;
    const targets = (args.props.targets ?? []) as Array<{ key?: string; values?: string[] }>;
    const suppressions = readSuppressions(
      (args.getConfig ? args.getConfig() : undefined) as Record<string, unknown> | undefined,
    );
    if (matchSuppression("HULUMI-O-PATCH-1", args.urn, suppressions).suppressed) return;
    for (const t of targets) {
      if (t.key !== `tag:${PATCH_GROUP_TAG}`) continue;
      const values = t.values ?? [];
      for (const v of values) {
        if (!VALID_PATCH_GROUPS.has(v)) {
          reportViolation(
            `HULUMI-O-PATCH-1: ${args.urn} Patch:Group target value "${v}" is not in {dev, staging, production}. Docs: ${DOCS_BASE}`,
          );
        }
      }
    }
  },
};

export const oAudit1CloudTrailPosture: ResourceValidationPolicy = {
  name: "HULUMI-O-AUDIT-1-cloudtrail-multi-region-validation",
  description:
    "CloudTrail must be multi-region and have log-file validation enabled. Single-region trails miss ops in other regions; without log-file validation, the cryptographic anti-tampering signal is lost.",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (args.type !== CLOUDTRAIL_TYPE) return;
    const suppressions = readSuppressions(
      (args.getConfig ? args.getConfig() : undefined) as Record<string, unknown> | undefined,
    );
    if (matchSuppression("HULUMI-O-AUDIT-1", args.urn, suppressions).suppressed) return;
    const props = args.props as {
      isMultiRegionTrail?: boolean;
      enableLogFileValidation?: boolean;
    };
    if (props.isMultiRegionTrail !== true) {
      reportViolation(
        `HULUMI-O-AUDIT-1: ${args.urn} is not multi-region (isMultiRegionTrail=true required). Docs: ${DOCS_BASE}`,
      );
    }
    if (props.enableLogFileValidation !== true) {
      reportViolation(
        `HULUMI-O-AUDIT-1: ${args.urn} does not enable log-file validation. Docs: ${DOCS_BASE}`,
      );
    }
  },
};

export const oAudit2CloudTrailLogGroupEncrypted: ResourceValidationPolicy = {
  name: "HULUMI-O-AUDIT-2-cloudtrail-cw-logs-kms",
  description:
    "CloudWatch Logs groups whose name begins with `/aws/cloudtrail/` must be KMS-encrypted (`kmsKeyId` set). Unencrypted CT log groups defeat the at-rest encryption posture of the trail.",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (args.type !== LOG_GROUP_TYPE) return;
    const props = args.props as { name?: string; kmsKeyId?: string };
    if (typeof props.name !== "string" || !props.name.startsWith("/aws/cloudtrail/")) return;
    const suppressions = readSuppressions(
      (args.getConfig ? args.getConfig() : undefined) as Record<string, unknown> | undefined,
    );
    if (matchSuppression("HULUMI-O-AUDIT-2", args.urn, suppressions).suppressed) return;
    if (props.kmsKeyId === undefined || props.kmsKeyId === "") {
      reportViolation(
        `HULUMI-O-AUDIT-2: ${args.urn} CloudTrail log group "${props.name}" is not KMS-encrypted (kmsKeyId required). Docs: ${DOCS_BASE}`,
      );
    }
  },
};

const REQUIRED_INSPECTOR_TYPES = ["EC2", "ECR", "LAMBDA"];

export const oInspector1FullCoverage: ResourceValidationPolicy = {
  name: "HULUMI-O-INSPECTOR-1-full-coverage",
  description:
    "Inspector v2 must cover EC2, ECR, and LAMBDA. Partial coverage is the blind-spot the runbook calls out: a vuln in a Lambda layer goes undetected if Lambda is not enabled.",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (args.type !== INSPECTOR_ENABLER_TYPE) return;
    const props = args.props as { resourceTypes?: string[] };
    const suppressions = readSuppressions(
      (args.getConfig ? args.getConfig() : undefined) as Record<string, unknown> | undefined,
    );
    if (matchSuppression("HULUMI-O-INSPECTOR-1", args.urn, suppressions).suppressed) return;
    const enabled = new Set(props.resourceTypes ?? []);
    for (const t of REQUIRED_INSPECTOR_TYPES) {
      if (!enabled.has(t)) {
        reportViolation(
          `HULUMI-O-INSPECTOR-1: ${args.urn} Inspector v2 does not cover "${t}". Required types: ${REQUIRED_INSPECTOR_TYPES.join(", ")}. Docs: ${DOCS_BASE}`,
        );
      }
    }
  },
};

export const hulumiOperationsHardeningPackMetadata: PackMetadata = {
  id: "hulumi-operations-hardening-pack",
  title: "Hulumi Operations Hardening Pack",
  framework: "hulumi-operations",
  frameworkVersion: "0.1.0",
  severity: "high",
  rules: [
    {
      id: "HULUMI-O-PATCH-1",
      title: "Patch:Group tag enum (dev | staging | production)",
      description: oPatch1RestrictPatchGroupTag.description!,
      severity: "high",
      enforcement: "mandatory",
      frameworkIds: ["CCM:CEK-08", "NIST-800-53-r5:CM-2", "CIS-AWS-v5.0.0:1.20"],
      docsUrl: DOCS_BASE,
    },
    {
      id: "HULUMI-O-AUDIT-1",
      title: "CloudTrail multi-region + log-file validation",
      description: oAudit1CloudTrailPosture.description!,
      severity: "critical",
      enforcement: "mandatory",
      frameworkIds: ["CCM:LOG-01", "NIST-800-53-r5:AU-2", "CIS-AWS-v5.0.0:3.1"],
      docsUrl: DOCS_BASE,
    },
    {
      id: "HULUMI-O-AUDIT-2",
      title: "CloudTrail CW Logs KMS-encrypted",
      description: oAudit2CloudTrailLogGroupEncrypted.description!,
      severity: "high",
      enforcement: "mandatory",
      frameworkIds: ["CCM:CEK-04", "NIST-800-53-r5:SC-28"],
      docsUrl: DOCS_BASE,
    },
    {
      id: "HULUMI-O-INSPECTOR-1",
      title: "Inspector v2 covers EC2 + ECR + LAMBDA",
      description: oInspector1FullCoverage.description!,
      severity: "high",
      enforcement: "mandatory",
      frameworkIds: ["CCM:VUL-01", "NIST-800-53-r5:RA-5"],
      docsUrl: DOCS_BASE,
    },
  ],
};
