// G_OIDC_2 — reject binding cluster-scoped EKS admin (or AWS
// AdministratorAccess) to an IAM role that is assumable via GitHub
// Actions OIDC. G_OIDC_1 / HULUMI-H3 rejects the *who-can-assume*
// wildcard shape; but the blast radius of an OIDC role is also set by
// *what it can do*. A single repo push to a GitHub-OIDC-trusted role
// bound to `AmazonEKSClusterAdminPolicy` (accessScope: cluster) yields
// Kubernetes cluster-admin; bound to `AdministratorAccess`, full account
// compromise. Motivated by a real downstream finding (a stale
// legacy-repo OIDC role bound to cluster-admin).
//
// Stack-level: correlates an `aws:iam/role:Role` whose
// `assumeRolePolicy` trusts `token.actions.githubusercontent.com` with
// an `aws:eks/accessPolicyAssociation:AccessPolicyAssociation`
// (cluster-admin) or an `aws:iam/rolePolicyAttachment:RolePolicyAttachment`
// of `AdministratorAccess` that targets it — via Pulumi dependency edges,
// with a value fallback for harnesses/stacks where edges are absent.

import type { PolicyResource, StackValidationPolicy } from "@pulumi/policy";

import { federatedIsGithubOidc } from "./github-oidc-issuer";
import { matchSuppression, type Suppression } from "./suppressions";

const DOCS_URL = "https://github.com/kerberosmansour/hulumi/blob/main/docs/components/g-oidc-2.md";

const AWS_IAM_ROLE_TYPE = "aws:iam/role:Role";
const EKS_ACCESS_POLICY_ASSOCIATION_TYPE =
  "aws:eks/accessPolicyAssociation:AccessPolicyAssociation";
const IAM_ROLE_POLICY_ATTACHMENT_TYPE = "aws:iam/rolePolicyAttachment:RolePolicyAttachment";

const EKS_CLUSTER_ADMIN_POLICY_SUFFIX = "AmazonEKSClusterAdminPolicy";
const ADMINISTRATOR_ACCESS_ARN = "arn:aws:iam::aws:policy/AdministratorAccess";

function readSuppressions(config: Record<string, unknown> | undefined): Suppression[] {
  const raw = config?.suppressions;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is Suppression => {
    if (x === null || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    return typeof o.ruleId === "string" && typeof o.reason === "string";
  });
}

/** True if an IAM trust policy (string or object) federates the GitHub
 * Actions OIDC issuer in any statement. */
export function trustPolicyTrustsGithubOidc(assumeRolePolicy: unknown): boolean {
  let parsed: Record<string, unknown> | undefined;
  if (typeof assumeRolePolicy === "string") {
    try {
      parsed = JSON.parse(assumeRolePolicy) as Record<string, unknown>;
    } catch {
      return false;
    }
  } else if (assumeRolePolicy !== null && typeof assumeRolePolicy === "object") {
    parsed = assumeRolePolicy as Record<string, unknown>;
  } else {
    return false;
  }
  const stmts = (parsed as { Statement?: unknown }).Statement;
  if (!Array.isArray(stmts)) return false;
  for (const stmt of stmts) {
    if (typeof stmt !== "object" || stmt === null) continue;
    const principal = (stmt as Record<string, unknown>).Principal as
      | Record<string, unknown>
      | undefined;
    if (!principal || principal.Federated === undefined) continue;
    if (federatedIsGithubOidc(String(principal.Federated))) return true;
  }
  return false;
}

// A resource is "linked to" a gh-oidc role if any named property
// dependency, or a general dependency, resolves to one; with a value
// fallback (the prop equals a known role arn/name/id) for harnesses or
// stacks where the dependency edges are not populated.
function linkedGithubOidcRole(
  resource: PolicyResource,
  propNames: string[],
  ghOidcRoleUrns: Set<string>,
  ghOidcRolesByValue: Map<string, string>,
): string | undefined {
  const pd = resource.propertyDependencies ?? {};
  for (const prop of propNames) {
    for (const dep of pd[prop] ?? []) {
      if (dep && ghOidcRoleUrns.has(dep.urn)) return dep.urn;
    }
  }
  for (const dep of resource.dependencies ?? []) {
    if (dep && ghOidcRoleUrns.has(dep.urn)) return dep.urn;
  }
  const props = resource.props as Record<string, unknown>;
  for (const prop of propNames) {
    const v = props[prop];
    if (typeof v === "string" && ghOidcRolesByValue.has(v)) {
      return ghOidcRolesByValue.get(v);
    }
  }
  return undefined;
}

/**
 * Public CrossGuard rule. Wired into HulumiGithubHardeningPack as H4
 * (mirrors the H3 = G_OIDC_1 aliasing for cookbook symmetry).
 */
export const G_OIDC_2: StackValidationPolicy = {
  name: "G_OIDC_2",
  description:
    "Reject binding cluster-scoped EKS admin (AmazonEKSClusterAdminPolicy, accessScope cluster) or AWS AdministratorAccess to an IAM role assumable via GitHub Actions OIDC. The blast radius of an OIDC role is set by what it can do, not only by who can assume it.",
  enforcementLevel: "mandatory",
  validateStack: (args, reportViolation) => {
    const suppressions = readSuppressions(
      (args.getConfig ? args.getConfig() : undefined) as Record<string, unknown> | undefined,
    );
    if (matchSuppression("G_OIDC_2", "stack", suppressions).suppressed) return;
    if (matchSuppression("HULUMI-H4", "stack", suppressions).suppressed) return;

    const ghOidcRoleUrns = new Set<string>();
    const ghOidcRolesByValue = new Map<string, string>(); // arn|name|id -> urn
    for (const r of args.resources) {
      if (r.type !== AWS_IAM_ROLE_TYPE) continue;
      const props = r.props as Record<string, unknown>;
      if (!trustPolicyTrustsGithubOidc(props.assumeRolePolicy)) continue;
      ghOidcRoleUrns.add(r.urn);
      for (const key of ["arn", "name", "id"]) {
        const v = props[key];
        if (typeof v === "string" && v.length > 0) ghOidcRolesByValue.set(v, r.urn);
      }
      if (typeof r.name === "string" && r.name.length > 0) {
        ghOidcRolesByValue.set(r.name, r.urn);
      }
    }
    if (ghOidcRoleUrns.size === 0) return;

    for (const r of args.resources) {
      const props = r.props as Record<string, unknown>;
      if (r.type === EKS_ACCESS_POLICY_ASSOCIATION_TYPE) {
        const policyArn = String(props.policyArn ?? "");
        const scope = props.accessScope as Record<string, unknown> | undefined;
        const scopeType = scope ? String(scope.type ?? "") : "";
        if (policyArn.endsWith(EKS_CLUSTER_ADMIN_POLICY_SUFFIX) && scopeType === "cluster") {
          const roleUrn = linkedGithubOidcRole(
            r,
            ["principalArn"],
            ghOidcRoleUrns,
            ghOidcRolesByValue,
          );
          if (roleUrn) {
            reportViolation(
              `G_OIDC_2: AccessPolicyAssociation ${r.urn} binds ${EKS_CLUSTER_ADMIN_POLICY_SUFFIX} (accessScope: cluster) to GitHub-OIDC-trusted IAM role ${roleUrn} — a single repo push obtains Kubernetes cluster-admin. Scope to a namespace (e.g. AmazonEKSEditPolicy) or remove the OIDC trust. Docs: ${DOCS_URL}`,
            );
          }
        }
      } else if (r.type === IAM_ROLE_POLICY_ATTACHMENT_TYPE) {
        if (String(props.policyArn ?? "") === ADMINISTRATOR_ACCESS_ARN) {
          const roleUrn = linkedGithubOidcRole(r, ["role"], ghOidcRoleUrns, ghOidcRolesByValue);
          if (roleUrn) {
            reportViolation(
              `G_OIDC_2: RolePolicyAttachment ${r.urn} attaches AdministratorAccess to GitHub-OIDC-trusted IAM role ${roleUrn} — full account compromise from a repo push. Attach a least-privilege policy or remove the OIDC trust. Docs: ${DOCS_URL}`,
            );
          }
        }
      }
    }
  },
};

export const G_OIDC_2_AWS_IAM_ROLE_TYPE = AWS_IAM_ROLE_TYPE;
export const G_OIDC_2_EKS_ACCESS_POLICY_ASSOCIATION_TYPE = EKS_ACCESS_POLICY_ASSOCIATION_TYPE;
export const G_OIDC_2_IAM_ROLE_POLICY_ATTACHMENT_TYPE = IAM_ROLE_POLICY_ATTACHMENT_TYPE;
