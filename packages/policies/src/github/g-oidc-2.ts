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
// Stack-level: correlates an `aws:iam/role:Role` whose `assumeRolePolicy`
// trusts `token.actions.githubusercontent.com` with cluster-scoped EKS admin,
// AWS AdministratorAccess, and exact full-admin inline/customer-managed
// policies through the bounded Pulumi IAM authority shapes documented in
// docs/components/g-oidc-2.md.

import type { PolicyResource, StackValidationPolicy } from "@pulumi/policy";

import {
  containsAdministratorAccessArn,
  iamPolicyHasFullAdmin,
  iamPolicyStatements,
} from "../aws/iam-policy";
import { federatedIsGithubOidc } from "./github-oidc-issuer";
import { matchSuppression, type Suppression } from "./suppressions";

const DOCS_URL = "https://github.com/kerberosmansour/hulumi/blob/main/docs/components/g-oidc-2.md";

const AWS_IAM_ROLE_TYPE = "aws:iam/role:Role";
const EKS_ACCESS_POLICY_ASSOCIATION_TYPE =
  "aws:eks/accessPolicyAssociation:AccessPolicyAssociation";
const IAM_ROLE_POLICY_ATTACHMENT_TYPE = "aws:iam/rolePolicyAttachment:RolePolicyAttachment";
const IAM_ROLE_POLICY_ATTACHMENTS_EXCLUSIVE_TYPE =
  "aws:iam/rolePolicyAttachmentsExclusive:RolePolicyAttachmentsExclusive";
const IAM_POLICY_ATTACHMENT_TYPE = "aws:iam/policyAttachment:PolicyAttachment";
const IAM_ROLE_POLICY_TYPE = "aws:iam/rolePolicy:RolePolicy";
const IAM_POLICY_TYPE = "aws:iam/policy:Policy";

const EKS_CLUSTER_ADMIN_POLICY_SUFFIX = "AmazonEKSClusterAdminPolicy";
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
  const statements = iamPolicyStatements(assumeRolePolicy);
  if (!statements) return false;
  for (const statement of statements) {
    const principal = statement.Principal as Record<string, unknown> | undefined;
    if (!principal || principal.Federated === undefined) continue;
    if (federatedIsGithubOidc(principal.Federated)) return true;
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
    const values = Array.isArray(v) ? v : [v];
    for (const value of values) {
      if (typeof value === "string" && ghOidcRolesByValue.has(value)) {
        return ghOidcRolesByValue.get(value);
      }
    }
  }
  return undefined;
}

function policyReferenceIsFullAdmin(
  resource: PolicyResource,
  propName: string,
  fullAdminPolicyUrns: Set<string>,
  fullAdminPolicyValues: Set<string>,
): boolean {
  for (const dep of resource.propertyDependencies?.[propName] ?? []) {
    if (dep && fullAdminPolicyUrns.has(dep.urn)) return true;
  }
  const raw = (resource.props as Record<string, unknown>)[propName];
  if (containsAdministratorAccessArn(raw)) return true;
  const values = Array.isArray(raw) ? raw : [raw];
  return values.some((value) => typeof value === "string" && fullAdminPolicyValues.has(value));
}

/**
 * Public CrossGuard rule. Wired into HulumiGithubHardeningPack as H4
 * (mirrors the H3 = G_OIDC_1 aliasing for cookbook symmetry).
 */
export const G_OIDC_2: StackValidationPolicy = {
  name: "G_OIDC_2",
  description:
    "Reject cluster-scoped EKS admin, AWS AdministratorAccess, or an in-stack exact full-admin equivalent on an IAM role assumable via GitHub Actions OIDC. The blast radius of an OIDC role is set by what it can do, not only by who can assume it.",
  enforcementLevel: "mandatory",
  validateStack: (args, reportViolation) => {
    const suppressions = readSuppressions(
      (args.getConfig ? args.getConfig() : undefined) as Record<string, unknown> | undefined,
    );
    if (matchSuppression("G_OIDC_2", "stack", suppressions).suppressed) return;
    if (matchSuppression("HULUMI-H4", "stack", suppressions).suppressed) return;

    const ghOidcRoleUrns = new Set<string>();
    const ghOidcRolesByValue = new Map<string, string>(); // arn|name|id -> urn
    const ghOidcRoles = new Map<string, PolicyResource>();
    for (const r of args.resources) {
      if (r.type !== AWS_IAM_ROLE_TYPE) continue;
      const props = r.props as Record<string, unknown>;
      if (!trustPolicyTrustsGithubOidc(props.assumeRolePolicy)) continue;
      ghOidcRoleUrns.add(r.urn);
      ghOidcRoles.set(r.urn, r);
      for (const key of ["arn", "name", "id"]) {
        const v = props[key];
        if (typeof v === "string" && v.length > 0) ghOidcRolesByValue.set(v, r.urn);
      }
      if (typeof r.name === "string" && r.name.length > 0) {
        ghOidcRolesByValue.set(r.name, r.urn);
      }
    }
    if (ghOidcRoleUrns.size === 0) return;

    const fullAdminPolicyUrns = new Set<string>();
    const fullAdminPolicyValues = new Set<string>();
    for (const resource of args.resources) {
      if (resource.type !== IAM_POLICY_TYPE || !iamPolicyHasFullAdmin(resource.props.policy))
        continue;
      fullAdminPolicyUrns.add(resource.urn);
      for (const key of ["arn", "id"]) {
        const value = resource.props[key];
        if (typeof value === "string" && value.length > 0) fullAdminPolicyValues.add(value);
      }
    }

    const reported = new Set<string>();
    const reportAdmin = (resource: PolicyResource, roleUrn: string, authority: string): void => {
      const key = `${resource.urn}\u0000${roleUrn}\u0000${authority}`;
      if (reported.has(key)) return;
      reported.add(key);
      reportViolation(
        `G_OIDC_2: ${resource.urn} grants ${authority} to GitHub-OIDC-trusted IAM role ${roleUrn} — full account authority can be reached from the repository trust boundary. Attach a least-privilege policy or remove the OIDC trust. Docs: ${DOCS_URL}`,
      );
    };

    for (const [roleUrn, role] of ghOidcRoles) {
      if (
        policyReferenceIsFullAdmin(
          role,
          "managedPolicyArns",
          fullAdminPolicyUrns,
          fullAdminPolicyValues,
        )
      ) {
        reportAdmin(role, roleUrn, "AdministratorAccess or an exact full-admin managed policy");
      }
      const inlinePolicies = role.props.inlinePolicies;
      if (
        Array.isArray(inlinePolicies) &&
        inlinePolicies.some(
          (entry) =>
            entry !== null &&
            typeof entry === "object" &&
            !Array.isArray(entry) &&
            iamPolicyHasFullAdmin((entry as Record<string, unknown>).policy),
        )
      ) {
        reportAdmin(role, roleUrn, "an exact full-admin inline policy");
      }
    }

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
      } else if (r.type === IAM_ROLE_POLICY_TYPE) {
        if (iamPolicyHasFullAdmin(props.policy)) {
          const roleUrn = linkedGithubOidcRole(r, ["role"], ghOidcRoleUrns, ghOidcRolesByValue);
          if (roleUrn) reportAdmin(r, roleUrn, "an exact full-admin inline policy");
        }
      } else if (r.type === IAM_ROLE_POLICY_ATTACHMENT_TYPE) {
        if (
          policyReferenceIsFullAdmin(r, "policyArn", fullAdminPolicyUrns, fullAdminPolicyValues)
        ) {
          const roleUrn = linkedGithubOidcRole(r, ["role"], ghOidcRoleUrns, ghOidcRolesByValue);
          if (roleUrn) reportAdmin(r, roleUrn, "AdministratorAccess or an exact full-admin policy");
        }
      } else if (r.type === IAM_ROLE_POLICY_ATTACHMENTS_EXCLUSIVE_TYPE) {
        if (
          policyReferenceIsFullAdmin(r, "policyArns", fullAdminPolicyUrns, fullAdminPolicyValues)
        ) {
          const roleUrn = linkedGithubOidcRole(r, ["roleName"], ghOidcRoleUrns, ghOidcRolesByValue);
          if (roleUrn) reportAdmin(r, roleUrn, "AdministratorAccess or an exact full-admin policy");
        }
      } else if (r.type === IAM_POLICY_ATTACHMENT_TYPE) {
        if (
          policyReferenceIsFullAdmin(r, "policyArn", fullAdminPolicyUrns, fullAdminPolicyValues)
        ) {
          const roleUrn = linkedGithubOidcRole(r, ["roles"], ghOidcRoleUrns, ghOidcRolesByValue);
          if (roleUrn) reportAdmin(r, roleUrn, "AdministratorAccess or an exact full-admin policy");
        }
      }
    }
  },
};

export const G_OIDC_2_AWS_IAM_ROLE_TYPE = AWS_IAM_ROLE_TYPE;
export const G_OIDC_2_EKS_ACCESS_POLICY_ASSOCIATION_TYPE = EKS_ACCESS_POLICY_ASSOCIATION_TYPE;
export const G_OIDC_2_IAM_ROLE_POLICY_ATTACHMENT_TYPE = IAM_ROLE_POLICY_ATTACHMENT_TYPE;
