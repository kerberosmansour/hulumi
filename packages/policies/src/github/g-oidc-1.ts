// G_OIDC_1 — declarative validation of GitHub Actions OIDC subject bindings
// on AWS / Azure / GCP IAM trust policies. UNC6426 (March 2026, ~500
// vulnerable role ARNs across 275 AWS accounts per CSA Labs and Unit 42
// OH-MY-DC analyses) weaponized broadly scoped trust.
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
const REQUIRED_SUBJECT_KEYS = ["repo", "job_workflow_ref", "environment"] as const;
const REQUIRED_GCP_ASSERTIONS = [
  "assertion.repository",
  "assertion.job_workflow_ref",
  "assertion.environment",
] as const;
const SUBJECT_KEY_PATTERN = /^[A-Za-z0-9_]+$/;
const GCP_ASSERTION_PATTERN = /^assertion\.[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_OIDC_INPUT_LENGTH = 4096;
const MAX_GCP_TOKENS = 128;
const MAX_GCP_PAREN_DEPTH = 16;

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

function hasAsciiControl(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function boundSubjectViolation(subject: unknown): string | undefined {
  if (typeof subject !== "string") return "subject must be a literal string";
  if (subject.length === 0) return "subject must not be empty";
  if (subject.length > MAX_OIDC_INPUT_LENGTH) return "subject exceeds the 4096-character limit";
  if (subClaimIsUnsafe(subject)) return "subject must not contain a wildcard";

  const parts = subject.split(":");
  if (parts.length < REQUIRED_SUBJECT_KEYS.length * 2 || parts.length % 2 !== 0) {
    return "subject must contain complete key/value pairs";
  }

  const seen = new Set<string>();
  for (let index = 0; index < parts.length; index += 2) {
    const key = parts[index];
    const value = parts[index + 1];
    if (!SUBJECT_KEY_PATTERN.test(key)) return `subject claim key \`${key}\` is malformed`;
    if (seen.has(key)) return `subject claim key \`${key}\` appears more than once`;
    if (
      value.length === 0 ||
      value !== value.trim() ||
      hasAsciiControl(value) ||
      subClaimIsUnsafe(value)
    ) {
      return `subject claim \`${key}\` must have one nonempty, literal, non-wildcard value`;
    }
    seen.add(key);
  }

  const missing = REQUIRED_SUBJECT_KEYS.filter((key) => !seen.has(key));
  return missing.length === 0
    ? undefined
    : `subject is missing required claim key(s): ${missing.join(", ")}`;
}

type GcpToken =
  | { readonly kind: "identifier"; readonly value: string }
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "and" | "equals" | "leftParen" | "rightParen" };

function tokenizeGcpCondition(condition: string): GcpToken[] | undefined {
  if (condition.length === 0 || condition.length > MAX_OIDC_INPUT_LENGTH) return undefined;
  const tokens: GcpToken[] = [];
  let cursor = 0;
  const push = (token: GcpToken): boolean => {
    tokens.push(token);
    return tokens.length <= MAX_GCP_TOKENS;
  };

  while (cursor < condition.length) {
    const char = condition[cursor];
    if (/\s/u.test(char)) {
      cursor += 1;
      continue;
    }
    if (condition.startsWith("&&", cursor)) {
      if (!push({ kind: "and" })) return undefined;
      cursor += 2;
      continue;
    }
    if (condition.startsWith("==", cursor)) {
      if (!push({ kind: "equals" })) return undefined;
      cursor += 2;
      continue;
    }
    if (char === "(") {
      if (!push({ kind: "leftParen" })) return undefined;
      cursor += 1;
      continue;
    }
    if (char === ")") {
      if (!push({ kind: "rightParen" })) return undefined;
      cursor += 1;
      continue;
    }
    if (char === "'" || char === '"') {
      const quote = char;
      const start = cursor + 1;
      cursor = start;
      while (cursor < condition.length && condition[cursor] !== quote) {
        const valueChar = condition[cursor];
        if (valueChar === "\\" || hasAsciiControl(valueChar)) return undefined;
        cursor += 1;
      }
      if (cursor >= condition.length) return undefined;
      const value = condition.slice(start, cursor);
      if (!push({ kind: "string", value })) return undefined;
      cursor += 1;
      continue;
    }
    if (/[A-Za-z_]/u.test(char)) {
      const start = cursor;
      cursor += 1;
      while (cursor < condition.length && /[A-Za-z0-9_.]/u.test(condition[cursor])) cursor += 1;
      if (!push({ kind: "identifier", value: condition.slice(start, cursor) })) return undefined;
      continue;
    }
    return undefined;
  }
  return tokens;
}

function gcpConditionViolation(condition: unknown): string | undefined {
  if (typeof condition !== "string") return "attributeCondition must be a literal string";
  const tokens = tokenizeGcpCondition(condition);
  if (!tokens || tokens.length === 0) {
    return "attributeCondition must use the bounded exact-equality grammar";
  }

  let cursor = 0;
  const bindings: Array<readonly [string, string]> = [];

  const parseEquality = (): boolean => {
    const first = tokens[cursor];
    const equals = tokens[cursor + 1];
    const second = tokens[cursor + 2];
    if (
      !first ||
      !second ||
      equals?.kind !== "equals" ||
      !(
        (first.kind === "identifier" && second.kind === "string") ||
        (first.kind === "string" && second.kind === "identifier")
      )
    ) {
      return false;
    }
    const identifier = first.kind === "identifier" ? first.value : second.value;
    const value = first.kind === "string" ? first.value : second.value;
    if (
      !GCP_ASSERTION_PATTERN.test(identifier) ||
      value.length === 0 ||
      value !== value.trim() ||
      value.includes("*") ||
      hasAsciiControl(value)
    ) {
      return false;
    }
    bindings.push([identifier, value]);
    cursor += 3;
    return true;
  };

  const parseExpression = (depth: number): boolean => {
    if (depth > MAX_GCP_PAREN_DEPTH) return false;
    const parseTerm = (): boolean => {
      if (tokens[cursor]?.kind !== "leftParen") return parseEquality();
      cursor += 1;
      if (!parseExpression(depth + 1) || tokens[cursor]?.kind !== "rightParen") return false;
      cursor += 1;
      return true;
    };

    if (!parseTerm()) return false;
    while (tokens[cursor]?.kind === "and") {
      cursor += 1;
      if (!parseTerm()) return false;
    }
    return true;
  };

  if (!parseExpression(0) || cursor !== tokens.length) {
    return "attributeCondition must be a conjunction of exact string equalities";
  }

  const seen = new Set<string>();
  for (const [identifier] of bindings) {
    if (seen.has(identifier)) return `attributeCondition binds \`${identifier}\` more than once`;
    seen.add(identifier);
  }
  const missing = REQUIRED_GCP_ASSERTIONS.filter((identifier) => !seen.has(identifier));
  return missing.length === 0
    ? undefined
    : `attributeCondition is missing required assertion(s): ${missing.join(", ")}`;
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
  const violation = boundSubjectViolation(args.props.subject);
  if (violation) {
    reportViolation(
      `G_OIDC_1: Azure federated identity credential ${args.urn} is unsafe: ${violation}; require exact repo, job_workflow_ref, and environment subject bindings. Docs: ${DOCS_URL}`,
    );
  }
}

function inspectGcpWifProvider(
  args: { type: string; urn: string; props: Record<string, unknown> },
  reportViolation: (msg: string) => void,
): void {
  const violation = gcpConditionViolation(args.props.attributeCondition);
  if (violation) {
    reportViolation(
      `G_OIDC_1: GCP Workload Identity Pool Provider ${args.urn} is unsafe: ${violation}; require a conjunction that exactly binds assertion.repository, assertion.job_workflow_ref, and assertion.environment. Docs: ${DOCS_URL}`,
    );
  }
}

/**
 * Public CrossGuard rule. Wired into HulumiGithubHardeningPack as H3.
 */
export const G_OIDC_1: ResourceValidationPolicy = {
  name: "G_OIDC_1",
  description:
    "Reject uninspectable, missing, multiple, unsupported, wildcard, or broadly scoped GitHub Actions OIDC subject restrictions across AWS, Azure, and GCP. Azure must bind `repo`, `job_workflow_ref`, and `environment`; GCP must bind the corresponding `repository`, `job_workflow_ref`, and `environment` assertions.",
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
