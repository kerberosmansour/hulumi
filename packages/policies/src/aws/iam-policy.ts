export const AWS_ADMINISTRATOR_ACCESS_ARN = "arn:aws:iam::aws:policy/AdministratorAccess";

const AWS_ADMINISTRATOR_ACCESS_ARNS = new Set([
  AWS_ADMINISTRATOR_ACCESS_ARN,
  "arn:aws-us-gov:iam::aws:policy/AdministratorAccess",
  "arn:aws-cn:iam::aws:policy/AdministratorAccess",
]);

export type IamPolicyStatement = Record<string, unknown>;

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Parse an AWS IAM policy document and normalize its valid singleton/array
 * Statement representation. Undefined means the document cannot be inspected.
 */
export function iamPolicyStatements(policy: unknown): IamPolicyStatement[] | undefined {
  let document: Record<string, unknown> | undefined;
  if (typeof policy === "string") {
    if (policy.length === 0 || policy.length > 262_144) return undefined;
    try {
      document = record(JSON.parse(policy));
    } catch {
      return undefined;
    }
  } else {
    document = record(policy);
  }
  if (!document) return undefined;

  const raw = document.Statement;
  const values = Array.isArray(raw) ? raw : raw === undefined ? undefined : [raw];
  if (!values || values.length === 0 || values.length > 1_000) return undefined;

  const statements: IamPolicyStatement[] = [];
  for (const value of values) {
    const statement = record(value);
    if (!statement) return undefined;
    statements.push(statement);
  }
  return statements;
}

function includesExactWildcard(value: unknown): boolean {
  return value === "*" || (Array.isArray(value) && value.some((entry) => entry === "*"));
}

/** Exact full-administrator grant used by CIS 1.16 and G_OIDC_2. */
export function iamPolicyHasFullAdmin(policy: unknown): boolean {
  const statements = iamPolicyStatements(policy);
  if (!statements) return false;
  return statements.some(
    (statement) =>
      statement.Effect === "Allow" &&
      includesExactWildcard(statement.Action) &&
      includesExactWildcard(statement.Resource),
  );
}

/**
 * True when an Allow statement uses IAM complement operators. G_OIDC_2
 * rejects these forms instead of attempting to prove the residual action and
 * resource universe selected by attacker-controlled NotAction/NotResource
 * values. Deny statements are guardrails rather than permission grants.
 */
export function iamPolicyHasUnsafeAllowComplement(policy: unknown): boolean {
  const statements = iamPolicyStatements(policy);
  if (!statements) return false;
  return statements.some(
    (statement) =>
      statement.Effect === "Allow" &&
      (Object.prototype.hasOwnProperty.call(statement, "NotAction") ||
        Object.prototype.hasOwnProperty.call(statement, "NotResource")),
  );
}

export function containsAdministratorAccessArn(value: unknown): boolean {
  return (
    (typeof value === "string" && AWS_ADMINISTRATOR_ACCESS_ARNS.has(value)) ||
    (Array.isArray(value) &&
      value.some((entry) => typeof entry === "string" && AWS_ADMINISTRATOR_ACCESS_ARNS.has(entry)))
  );
}
