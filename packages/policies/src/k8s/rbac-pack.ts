// HulumiK8sRbacPack — RBAC rule handlers. Targets escalation paths:
//   K8S-RBAC-1  wildcard verbs (`verbs: ["*"]`) — mandatory
//   K8S-RBAC-2  Secret list/watch — mandatory unless suppressed
//   K8S-RBAC-3  cluster-admin binding — mandatory unless suppressed
//
// Inspects `Role`, `ClusterRole`, `RoleBinding`, and `ClusterRoleBinding`.

import type { ResourceValidationPolicy } from "@pulumi/policy";

import type { PackMetadata } from "../metadata";
import { matchSuppression, type Suppression } from "../aws/suppressions";

const DOCS_BASE = "https://github.com/kerberosmansour/hulumi/blob/main/docs/components/README.md";

const ROLE_TYPES = new Set([
  "kubernetes:rbac.authorization.k8s.io/v1:Role",
  "kubernetes:rbac.authorization.k8s.io/v1:ClusterRole",
]);
const BINDING_TYPES = new Set([
  "kubernetes:rbac.authorization.k8s.io/v1:RoleBinding",
  "kubernetes:rbac.authorization.k8s.io/v1:ClusterRoleBinding",
]);

interface PolicyRule {
  apiGroups?: string[];
  resources?: string[];
  verbs?: string[];
  resourceNames?: string[];
  nonResourceURLs?: string[];
}

interface RoleRef {
  apiGroup?: string;
  kind?: string;
  name?: string;
}

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

export const k8sRbac1NoWildcardVerbs: ResourceValidationPolicy = {
  name: "HULUMI-K8S-RBAC-1-no-wildcard-verbs",
  description:
    'RBAC rules with `verbs: ["*"]` grant unbounded permissions on the targeted resources, including escalation primitives (`bind`, `escalate`, `impersonate`). Mandatory violation; the typed escape hatch is a suppression with a reason.',
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (!ROLE_TYPES.has(args.type)) return;
    const rules = (args.props.rules ?? []) as PolicyRule[];
    const suppressions = readSuppressions(
      (args.getConfig ? args.getConfig() : undefined) as Record<string, unknown> | undefined,
    );
    if (matchSuppression("HULUMI-K8S-RBAC-1", args.urn, suppressions).suppressed) return;
    for (const r of rules) {
      const verbs = r.verbs ?? [];
      if (verbs.includes("*")) {
        const resources = (r.resources ?? []).join(",") || "<unspecified>";
        reportViolation(
          `HULUMI-K8S-RBAC-1: ${args.urn} grants verbs:["*"] on resources [${resources}]. Wildcard verbs include privilege-escalation primitives. Docs: ${DOCS_BASE}`,
        );
      }
    }
  },
};

const SECRET_RESOURCE_PATTERNS = ["secrets", "*"];
const SECRET_OVERREACH_VERBS = ["list", "watch", "*"];

export const k8sRbac2NoSecretListWatch: ResourceValidationPolicy = {
  name: "HULUMI-K8S-RBAC-2-no-secret-list-watch",
  description:
    "RBAC rules that grant `list` or `watch` on `secrets` enable an attacker who compromises a workload to read every Secret in scope. Hulumi rejects this by default; specific secrets should use `get` with `resourceNames` instead. Suppress with a reason for legitimate operators (e.g. external-secrets).",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (!ROLE_TYPES.has(args.type)) return;
    const rules = (args.props.rules ?? []) as PolicyRule[];
    const suppressions = readSuppressions(
      (args.getConfig ? args.getConfig() : undefined) as Record<string, unknown> | undefined,
    );
    if (matchSuppression("HULUMI-K8S-RBAC-2", args.urn, suppressions).suppressed) return;
    for (const r of rules) {
      const apiGroups = r.apiGroups ?? [""];
      // Empty string means core API group (where Secret lives).
      const includesCore = apiGroups.includes("") || apiGroups.includes("*");
      if (!includesCore) continue;
      const resources = r.resources ?? [];
      const matchesSecrets = resources.some((res) => SECRET_RESOURCE_PATTERNS.includes(res));
      if (!matchesSecrets) continue;
      const verbs = r.verbs ?? [];
      const overreach = verbs.filter((v) => SECRET_OVERREACH_VERBS.includes(v));
      if (overreach.length > 0) {
        reportViolation(
          `HULUMI-K8S-RBAC-2: ${args.urn} grants ${overreach.join(", ")} on secrets in core API group. Use \`get\` with explicit \`resourceNames\` instead. Docs: ${DOCS_BASE}`,
        );
      }
    }
  },
};

export const k8sRbac3NoClusterAdminBinding: ResourceValidationPolicy = {
  name: "HULUMI-K8S-RBAC-3-no-cluster-admin-binding",
  description:
    "Bindings to the built-in `cluster-admin` ClusterRole give the bound subject full control over the cluster. Mandatory violation; suppress with a reason for explicitly-acknowledged platform-team subjects.",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (!BINDING_TYPES.has(args.type)) return;
    const roleRef = (args.props.roleRef ?? {}) as RoleRef;
    if (roleRef.name !== "cluster-admin") return;
    const suppressions = readSuppressions(
      (args.getConfig ? args.getConfig() : undefined) as Record<string, unknown> | undefined,
    );
    if (matchSuppression("HULUMI-K8S-RBAC-3", args.urn, suppressions).suppressed) return;
    reportViolation(
      `HULUMI-K8S-RBAC-3: ${args.urn} binds to the cluster-admin ClusterRole. Prefer a least-privilege ClusterRole. Docs: ${DOCS_BASE}`,
    );
  },
};

export const hulumiK8sRbacPackMetadata: PackMetadata = {
  id: "hulumi-k8s-rbac-pack",
  title: "Hulumi K8s RBAC Pack",
  framework: "hulumi-k8s",
  frameworkVersion: "0.1.0",
  severity: "critical",
  rules: [
    {
      id: "HULUMI-K8S-RBAC-1",
      title: "No wildcard verbs in Role / ClusterRole",
      description: k8sRbac1NoWildcardVerbs.description!,
      severity: "critical",
      enforcement: "mandatory",
      frameworkIds: ["CCM:IAM-09", "NIST-800-53-r5:AC-6", "CIS-K8S:5.1.1"],
      docsUrl: DOCS_BASE,
    },
    {
      id: "HULUMI-K8S-RBAC-2",
      title: "No `list` / `watch` on Secrets",
      description: k8sRbac2NoSecretListWatch.description!,
      severity: "critical",
      enforcement: "mandatory",
      frameworkIds: ["CCM:DSP-12", "NIST-800-53-r5:AC-6", "CIS-K8S:5.1.2"],
      docsUrl: DOCS_BASE,
    },
    {
      id: "HULUMI-K8S-RBAC-3",
      title: "No cluster-admin RoleBinding / ClusterRoleBinding",
      description: k8sRbac3NoClusterAdminBinding.description!,
      severity: "critical",
      enforcement: "mandatory",
      frameworkIds: ["CCM:IAM-09", "CIS-K8S:5.1.3"],
      docsUrl: DOCS_BASE,
    },
  ],
};
