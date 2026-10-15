// G_OIDC_1 — declarative rejection of wildcard / StringLike `sub`
// conditions on AWS / Azure / GCP IAM trust policies for GitHub Actions
// OIDC. UNC6426 (March 2026, ~500 vulnerable role ARNs across 275 AWS
// accounts per CSA Labs and Unit 42 OH-MY-DC analyses) weaponized exactly
// the wildcard shape this rule rejects.
//
// The rule covers three cloud providers in v1.x:
//   - AWS IAM Role assumeRolePolicy with token.actions.githubusercontent.com
//   - Azure Federated Identity Credential subject
//   - GCP Workload Identity Pool Provider attributeCondition
//
// Adding a fourth cloud (Oracle, IBM, etc.) is a v1.2+ extension per the
// v1.1 deferral D6.

import type { ResourceValidationPolicy } from "@pulumi/policy";

import { iamPolicyStatements } from "../aws/iam-policy";
import { federatedIsGithubOidc } from "./github-oidc-issuer";
import { matchSuppression, type Suppression } from "./suppressions";

const DOCS_URL = "https://github.com/kerberosmansour/hulumi/blob/main/docs/components/g-oidc-1.md";

const AWS_IAM_ROLE_TYPE = "aws:iam/role:Role";
const AZURE_FEDERATED_CRED_TYPE =
  "azuread:index/applicationFederatedIdentityCredential:ApplicationFederatedIdentityCredential";
const GCP_WIF_PROVIDER_TYPE = "gcp:iam/workloadIdentityPoolProvider:WorkloadIdentityPoolProvider";

const GITHUB_OIDC_ISSUER = "token.actions.githubusercontent.com";
const GITHUB_OIDC_SUB_CLAIM = `${GITHUB_OIDC_ISSUER}:sub`;

function readSuppressions(config: Record<string, unknown> | undefined): Suppression[] {
  const raw = config?.suppressions;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is Suppression => {
    if (x === null || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    return typeof o.ruleId === "string" && typeof o.reason === "string";
  });
}

/**
 * Internal — given a string from a `sub` condition, return true if it is
 * unsafe per UNC6426 / Hulumi G_OIDC_1 rules. Exported for direct unit
 * testing.
 */
export function subClaimIsUnsafe(claim: string): boolean {
  if (typeof claim !== "string" || claim.length === 0) return true;
  if (claim.includes("*")) return true;
  return false;
}

const SUPPORTED_STRING_EQUALS_OPERATORS = new Set([
  "StringEquals",
  "ForAnyValue:StringEquals",
  "ForAllValues:StringEquals",
  "StringEqualsIfExists",
]);

/**
 * Normalize a JSON-string-or-object AWS trust policy. Every statement for the
 * exact GitHub OIDC issuer must carry one supported StringEquals-family `sub`
 * restriction whose values are nonempty, strings, and wildcard-free. A policy
 * whose structure cannot be inspected fails closed.
 */
function inspectAwsIamTrustPolicy(
  args: { type: string; urn: string; props: Record<string, unknown> },
  reportViolation: (msg: string) => void,
): void {
  const policy = args.props.assumeRolePolicy;
  const statements = iamPolicyStatements(policy);
  if (!statements) {
    reportViolation(
      `G_OIDC_1: AWS IAM role ${args.urn} has an uninspectable assumeRolePolicy; mandatory GitHub OIDC trust validation failed closed. Docs: ${DOCS_URL}`,
    );
    return;
  }
  for (const s of statements) {
    const principal = s.Principal as Record<string, unknown> | undefined;
    if (!principal || principal.Federated === undefined) continue;
    if (!federatedIsGithubOidc(principal.Federated)) continue;

    const conds =
      s.Condition !== null && typeof s.Condition === "object" && !Array.isArray(s.Condition)
        ? (s.Condition as Record<string, unknown>)
        : undefined;
    if (!conds) {
      reportViolation(
        `G_OIDC_1: AWS IAM role ${args.urn} trusts GitHub OIDC without an inspectable Condition containing one exact \`${GITHUB_OIDC_SUB_CLAIM}\` equality restriction. Docs: ${DOCS_URL}`,
      );
      return;
    }

    const restrictions: Array<{ operator: string; value: unknown }> = [];
    for (const [operator, rawCondition] of Object.entries(conds)) {
      if (rawCondition === null || typeof rawCondition !== "object" || Array.isArray(rawCondition))
        continue;
      const condition = rawCondition as Record<string, unknown>;
      if (condition[GITHUB_OIDC_SUB_CLAIM] === undefined) continue;
      restrictions.push({ operator, value: condition[GITHUB_OIDC_SUB_CLAIM] });
    }

    if (restrictions.length !== 1) {
      reportViolation(
        `G_OIDC_1: AWS IAM role ${args.urn} GitHub OIDC statement must contain exactly one supported equality restriction for \`${GITHUB_OIDC_SUB_CLAIM}\`; found ${restrictions.length}. Docs: ${DOCS_URL}`,
      );
      return;
    }

    const [{ operator, value }] = restrictions;
    if (!SUPPORTED_STRING_EQUALS_OPERATORS.has(operator)) {
      reportViolation(
        `G_OIDC_1: AWS IAM role ${args.urn} uses unsupported ${operator} on \`${GITHUB_OIDC_SUB_CLAIM}\` — use StringEquals with the three-axis sub claim. Docs: ${DOCS_URL}`,
      );
      return;
    }

    const claims = Array.isArray(value) ? value : [value];
    if (
      claims.length === 0 ||
      claims.some((claim) => typeof claim !== "string" || subClaimIsUnsafe(claim))
    ) {
      reportViolation(
        `G_OIDC_1: AWS IAM role ${args.urn} ${operator} \`${GITHUB_OIDC_SUB_CLAIM}\` must contain only nonempty, non-wildcard strings; UNC6426 (March 2026) weaponized broader subjects. Docs: ${DOCS_URL}`,
      );
      return;
    }
  }
}

function inspectAzureFederatedCredential(
  args: { type: string; urn: string; props: Record<string, unknown> },
  reportViolation: (msg: string) => void,
): void {
  const subject = args.props.subject;
  if (typeof subject !== "string") return;
  if (subClaimIsUnsafe(subject)) {
    reportViolation(
      `G_OIDC_1: Azure federated identity credential ${args.urn} subject "${subject}" contains a wildcard; UNC6426 (March 2026) shape; require non-wildcard subject scoped by environment. Docs: ${DOCS_URL}`,
    );
  }
}

function inspectGcpWifProvider(
  args: { type: string; urn: string; props: Record<string, unknown> },
  reportViolation: (msg: string) => void,
): void {
  const cond = args.props.attributeCondition;
  if (typeof cond !== "string") return;
  // Reject any `*` in the attribute condition. GCP guidance says scope
  // by `assertion.repository`, `assertion.ref`, and
  // `assertion.job_workflow_ref` — none of those need a wildcard.
  if (cond.includes("*")) {
    reportViolation(
      `G_OIDC_1: GCP Workload Identity Pool Provider ${args.urn} attributeCondition "${cond}" contains a wildcard; UNC6426 (March 2026) shape; require attribute-equality scoping. Docs: ${DOCS_URL}`,
    );
  }
}

/**
 * Public CrossGuard rule. Wired into HulumiGithubHardeningPack as H3.
 */
export const G_OIDC_1: ResourceValidationPolicy = {
  name: "G_OIDC_1",
  description:
    "Reject uninspectable, missing, multiple, unsupported, or wildcard GitHub Actions OIDC subject restrictions in AWS trust policies, plus wildcard subjects in Azure and GCP federation. Use the three-axis safe subject shape (`repo` + `job_workflow_ref` + `environment`).",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    const suppressions = readSuppressions(
      (args.getConfig ? args.getConfig() : undefined) as Record<string, unknown> | undefined,
    );
    if (matchSuppression("G_OIDC_1", args.urn, suppressions).suppressed) return;
    if (args.type === AWS_IAM_ROLE_TYPE) {
      inspectAwsIamTrustPolicy(
        { type: args.type, urn: args.urn, props: args.props as Record<string, unknown> },
        reportViolation,
      );
    } else if (args.type === AZURE_FEDERATED_CRED_TYPE) {
      inspectAzureFederatedCredential(
        { type: args.type, urn: args.urn, props: args.props as Record<string, unknown> },
        reportViolation,
      );
    } else if (args.type === GCP_WIF_PROVIDER_TYPE) {
      inspectGcpWifProvider(
        { type: args.type, urn: args.urn, props: args.props as Record<string, unknown> },
        reportViolation,
      );
    }
  },
};

/**
 * Constants exported for reuse by callers that want to bind the same
 * cloud-provider type strings.
 */
export const G_OIDC_1_AWS_IAM_ROLE_TYPE = AWS_IAM_ROLE_TYPE;
export const G_OIDC_1_AZURE_FEDERATED_CRED_TYPE = AZURE_FEDERATED_CRED_TYPE;
export const G_OIDC_1_GCP_WIF_PROVIDER_TYPE = GCP_WIF_PROVIDER_TYPE;
