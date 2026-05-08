import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

import type {
  AutomountTokenMode,
  NamespaceFoundationArgs,
  NamespaceFoundationNetworkDefaults,
  NamespaceFoundationQuota,
  PsaLevel,
} from "./namespace-foundation.args";
import {
  MAX_NAMESPACE_LABELS,
  MAX_NETWORK_POLICY_PEERS,
  MAX_QUOTA_ENTRIES,
} from "./namespace-foundation.args";
import type { NamespaceFoundationOutputs } from "./namespace-foundation.outputs";

export const NAMESPACE_FOUNDATION_COMPONENT_TYPE = "hulumi:k8s:NamespaceFoundation";

const PSA_LEVELS: ReadonlySet<PsaLevel> = new Set(["privileged", "baseline", "restricted"]);
const KUBE_SYSTEM_NS = "kube-system";

function validateName(name: string): void {
  if (typeof name !== "string" || name.trim() === "") {
    throw new Error("NamespaceFoundation: name is required and must be non-empty");
  }
  if (name.includes("/") || name.includes("..")) {
    throw new Error(
      `NamespaceFoundation: name "${name}" must not contain "/" or ".." (path-traversal-like names rejected)`,
    );
  }
}

function validatePsa(level: PsaLevel | undefined, field: string, fallback: PsaLevel): PsaLevel {
  if (level === undefined) return fallback;
  if (!PSA_LEVELS.has(level)) {
    throw new Error(
      `NamespaceFoundation: ${field} must be one of "privileged" | "baseline" | "restricted" (got "${String(level)}")`,
    );
  }
  return level;
}

function validateLabels(labels: Record<string, string> | undefined, name: string): void {
  if (labels === undefined) return;
  const count = Object.keys(labels).length;
  if (count > MAX_NAMESPACE_LABELS) {
    throw new Error(
      `NamespaceFoundation: labels has ${count} entries; max ${MAX_NAMESPACE_LABELS} (component "${name}")`,
    );
  }
}

function validateQuota(
  quota: NamespaceFoundationQuota | undefined,
  name: string,
): NamespaceFoundationQuota | undefined {
  if (quota === undefined) return undefined;
  if (quota.hard === undefined || quota.hard === null) {
    throw new Error(
      `NamespaceFoundation: quota.hard is required when quota is supplied (component "${name}")`,
    );
  }
  const count = Object.keys(quota.hard).length;
  if (count === 0) {
    throw new Error(`NamespaceFoundation: quota.hard must be non-empty (component "${name}")`);
  }
  if (count > MAX_QUOTA_ENTRIES) {
    throw new Error(
      `NamespaceFoundation: quota.hard has ${count} entries; max ${MAX_QUOTA_ENTRIES} (component "${name}")`,
    );
  }
  return quota;
}

function validateNetworkDefaults(
  net: NamespaceFoundationNetworkDefaults | undefined,
  name: string,
): NamespaceFoundationNetworkDefaults {
  const def = net ?? {};
  // Bound peers when allowMeshEgress is asserted: a single mesh-egress policy
  // emits at most one peer (the mesh-ingress namespace selector), so we
  // bound the structural shape — defensive against future expansion.
  const peerCount = (def.allowMeshEgress ? 1 : 0) + (def.allowDnsEgress ? 1 : 0);
  if (peerCount > MAX_NETWORK_POLICY_PEERS) {
    throw new Error(
      `NamespaceFoundation: network policy peer count ${peerCount} exceeds bound ${MAX_NETWORK_POLICY_PEERS} (component "${name}")`,
    );
  }
  if (def.allowMeshEgress === true && def.meshIngressNamespace === undefined) {
    throw new Error(
      `NamespaceFoundation: networkDefaults.allowMeshEgress: true requires meshIngressNamespace (component "${name}")`,
    );
  }
  return def;
}

export class NamespaceFoundation
  extends pulumi.ComponentResource
  implements NamespaceFoundationOutputs
{
  public readonly namespaceName: pulumi.Output<string>;
  public readonly defaultServiceAccountName: pulumi.Output<string>;
  public readonly networkPolicyNames: pulumi.Output<string[]>;
  public readonly defaultServiceAccountAutomountDisabled: pulumi.Output<boolean>;

  constructor(name: string, args: NamespaceFoundationArgs, opts?: pulumi.ComponentResourceOptions) {
    super(NAMESPACE_FOUNDATION_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    validateName(args.name);
    validateLabels(args.labels, name);
    const enforce = validatePsa(args.podSecurity, "podSecurity", "baseline");
    // Default audit/warn one level above enforce: surface what restricted
    // would catch even when only baseline is enforced.
    const auditWarn = validatePsa(
      args.podSecurityAuditAndWarn,
      "podSecurityAuditAndWarn",
      "restricted",
    );
    const quota = validateQuota(args.quota, name);
    const net = validateNetworkDefaults(args.networkDefaults, name);
    const automount: AutomountTokenMode = args.defaultServiceAccountAutomount ?? "disabled";

    const parent = { parent: this } as const;
    const nsName = args.name;
    const psaLabels: Record<string, string> = {
      "pod-security.kubernetes.io/enforce": enforce,
      "pod-security.kubernetes.io/audit": auditWarn,
      "pod-security.kubernetes.io/warn": auditWarn,
    };
    const labels: Record<string, string> = { ...(args.labels ?? {}), ...psaLabels };

    new k8s.core.v1.Namespace(
      `${name}-ns`,
      {
        metadata: {
          name: nsName,
          labels,
          ...(args.annotations !== undefined ? { annotations: args.annotations } : {}),
        },
      },
      parent,
    );

    // Default-namespace ServiceAccount: explicitly disable token automount.
    new k8s.core.v1.ServiceAccount(
      `${name}-default-sa`,
      {
        metadata: { name: "default", namespace: nsName },
        automountServiceAccountToken: automount === "disabled" ? false : true,
      },
      parent,
    );

    if (quota !== undefined) {
      new k8s.core.v1.ResourceQuota(
        `${name}-quota`,
        {
          metadata: { name: `${nsName}-quota`, namespace: nsName },
          spec: { hard: quota.hard },
        },
        parent,
      );
    }

    if (args.limitRanges !== undefined && args.limitRanges.length > 0) {
      new k8s.core.v1.LimitRange(
        `${name}-limits`,
        {
          metadata: { name: `${nsName}-limits`, namespace: nsName },
          spec: {
            limits: args.limitRanges.map((lr) => ({
              type: lr.type,
              ...(lr.defaults !== undefined ? { default: lr.defaults } : {}),
              ...(lr.defaultRequests !== undefined ? { defaultRequest: lr.defaultRequests } : {}),
              ...(lr.max !== undefined ? { max: lr.max } : {}),
              ...(lr.min !== undefined ? { min: lr.min } : {}),
            })),
          },
        },
        parent,
      );
    }

    const policyNames: string[] = [];
    const defaultDeny = net.defaultDeny !== false;
    const allowDnsEgress = net.allowDnsEgress !== false;
    const denyImdsEgress = net.denyImdsEgress !== false;
    const allowMeshEgress = net.allowMeshEgress === true;

    if (defaultDeny) {
      const polName = `${nsName}-default-deny`;
      new k8s.networking.v1.NetworkPolicy(
        `${name}-default-deny`,
        {
          metadata: { name: polName, namespace: nsName },
          spec: {
            podSelector: {},
            policyTypes: ["Ingress", "Egress"],
          },
        },
        parent,
      );
      policyNames.push(polName);
    }

    if (allowDnsEgress) {
      const polName = `${nsName}-allow-dns-egress`;
      new k8s.networking.v1.NetworkPolicy(
        `${name}-allow-dns-egress`,
        {
          metadata: { name: polName, namespace: nsName },
          spec: {
            podSelector: {},
            policyTypes: ["Egress"],
            egress: [
              {
                to: [
                  {
                    namespaceSelector: {
                      matchLabels: { "kubernetes.io/metadata.name": KUBE_SYSTEM_NS },
                    },
                    podSelector: { matchLabels: { "k8s-app": "kube-dns" } },
                  },
                ],
                ports: [
                  { protocol: "UDP", port: 53 },
                  { protocol: "TCP", port: 53 },
                ],
              },
            ],
          },
        },
        parent,
      );
      policyNames.push(polName);
    }

    if (denyImdsEgress && !defaultDeny) {
      throw new Error(
        "networkDefaults.denyImdsEgress requires networkDefaults.defaultDeny=true because Kubernetes NetworkPolicy cannot express standalone deny rules.",
      );
    }

    if (allowMeshEgress && net.meshIngressNamespace !== undefined) {
      const polName = `${nsName}-allow-mesh-egress`;
      new k8s.networking.v1.NetworkPolicy(
        `${name}-allow-mesh-egress`,
        {
          metadata: { name: polName, namespace: nsName },
          spec: {
            podSelector: {},
            policyTypes: ["Egress"],
            egress: [
              {
                to: [
                  {
                    namespaceSelector: {
                      matchExpressions: [
                        {
                          key: "kubernetes.io/metadata.name",
                          operator: "In",
                          values: [
                            pulumi.output(net.meshIngressNamespace).apply((ns) => ns),
                          ] as unknown as string[],
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        },
        parent,
      );
      policyNames.push(polName);
    }

    this.namespaceName = pulumi.output(nsName);
    this.defaultServiceAccountName = pulumi.output("default");
    this.networkPolicyNames = pulumi.output(policyNames);
    this.defaultServiceAccountAutomountDisabled = pulumi.output(automount === "disabled");

    this.registerOutputs({
      namespaceName: this.namespaceName,
      defaultServiceAccountName: this.defaultServiceAccountName,
      networkPolicyNames: this.networkPolicyNames,
      defaultServiceAccountAutomountDisabled: this.defaultServiceAccountAutomountDisabled,
    });
  }
}
