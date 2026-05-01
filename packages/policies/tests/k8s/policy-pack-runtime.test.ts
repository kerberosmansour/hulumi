// E2E runtime validation for the K8s/EKS policy packs (Runbook M3).
// Constructs a synthetic Pulumi resource tree of safe AND unsafe shapes,
// runs each pack's rule handlers in sequence, and asserts the expected
// violation IDs fire (or do not fire) without invoking the @pulumi/policy
// gRPC server.

import { describe, expect, it } from "vitest";
import type { ResourceValidationArgs } from "@pulumi/policy";

import {
  k8sWl1NoPrivilegedContainer,
  k8sWl2NoHostNamespace,
  k8sWl3NoLatestImage,
  k8sWl4ResourcesRequired,
  k8sSvc1PublicLoadBalancerNeedsJustification,
  k8sRbac1NoWildcardVerbs,
  k8sRbac2NoSecretListWatch,
  k8sRbac3NoClusterAdminBinding,
  eksCl1NoBroadPublicEndpoint,
  eksCl2AuditLoggingRequired,
} from "../../src";

const ALL_K8S_RULES = [
  k8sWl1NoPrivilegedContainer,
  k8sWl2NoHostNamespace,
  k8sWl3NoLatestImage,
  k8sWl4ResourcesRequired,
  k8sSvc1PublicLoadBalancerNeedsJustification,
  k8sRbac1NoWildcardVerbs,
  k8sRbac2NoSecretListWatch,
  k8sRbac3NoClusterAdminBinding,
  eksCl1NoBroadPublicEndpoint,
  eksCl2AuditLoggingRequired,
];

interface SyntheticResource {
  type: string;
  urn: string;
  name: string;
  props: Record<string, unknown>;
}

function runPacksOver(resources: SyntheticResource[]): string[] {
  const fired: string[] = [];
  for (const res of resources) {
    const args = {
      type: res.type,
      urn: res.urn,
      name: res.name,
      props: res.props,
      opts: {} as ResourceValidationArgs["opts"],
      isType: (() => false) as ResourceValidationArgs["isType"],
      asType: ((): undefined => undefined) as ResourceValidationArgs["asType"],
      getConfig: (() => ({})) as ResourceValidationArgs["getConfig"],
    } as ResourceValidationArgs;
    for (const rule of ALL_K8S_RULES) {
      const handler = rule.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void;
      handler(args, (msg: string) => fired.push(msg));
    }
  }
  return fired;
}

describe("E2E: k8s_pack_reports_expected_violations on a synthetic unsafe stack", () => {
  it("fires every rule on a deliberately-unsafe stack", () => {
    const resources: SyntheticResource[] = [
      {
        type: "kubernetes:apps/v1:Deployment",
        urn: "urn:p::p::kubernetes:apps/v1:Deployment::evil",
        name: "evil",
        props: {
          spec: {
            template: {
              spec: {
                hostNetwork: true,
                containers: [
                  {
                    name: "evil",
                    image: "nginx:latest",
                    securityContext: { privileged: true },
                    // resources omitted → WL-4 advisory fires twice
                  },
                ],
              },
            },
          },
        },
      },
      {
        type: "kubernetes:core/v1:Service",
        urn: "urn:p::p::kubernetes:core/v1:Service::public",
        name: "public",
        props: { spec: { type: "LoadBalancer" }, metadata: {} },
      },
      {
        type: "kubernetes:rbac.authorization.k8s.io/v1:ClusterRole",
        urn: "urn:p::p::kubernetes:rbac.authorization.k8s.io/v1:ClusterRole::wild",
        name: "wild",
        props: {
          rules: [
            { apiGroups: ["*"], resources: ["*"], verbs: ["*"] },
            { apiGroups: [""], resources: ["secrets"], verbs: ["list"] },
          ],
        },
      },
      {
        type: "kubernetes:rbac.authorization.k8s.io/v1:ClusterRoleBinding",
        urn: "urn:p::p::kubernetes:rbac.authorization.k8s.io/v1:ClusterRoleBinding::admin",
        name: "admin",
        props: {
          roleRef: { kind: "ClusterRole", name: "cluster-admin" },
        },
      },
      {
        type: "aws:eks/cluster:Cluster",
        urn: "urn:p::p::aws:eks/cluster:Cluster::open",
        name: "open",
        props: {
          vpcConfig: { endpointPublicAccess: true, publicAccessCidrs: ["0.0.0.0/0"] },
          // enabledClusterLogTypes missing → CL-2 fires
        },
      },
    ];

    const fired = runPacksOver(resources);
    const ids = fired.map((m) => m.match(/^(HULUMI-[A-Z0-9-]+)/)?.[1] ?? "").filter(Boolean);

    // Every rule fires at least once.
    const expected = [
      "HULUMI-K8S-WL-1",
      "HULUMI-K8S-WL-2",
      "HULUMI-K8S-WL-3",
      "HULUMI-K8S-WL-4",
      "HULUMI-K8S-SVC-1",
      "HULUMI-K8S-RBAC-1",
      "HULUMI-K8S-RBAC-2",
      "HULUMI-K8S-RBAC-3",
      "HULUMI-EKS-CL-1",
      "HULUMI-EKS-CL-2",
    ];
    for (const ruleId of expected) {
      expect(ids, `expected ${ruleId} to fire on the unsafe stack`).toContain(ruleId);
    }
  });
});

describe("E2E: k8s_pack_allows_hardened_stack on a Hulumi-shaped safe stack", () => {
  it("emits zero violations across all 10 rules on a hardened stack", () => {
    const resources: SyntheticResource[] = [
      {
        type: "kubernetes:apps/v1:Deployment",
        urn: "urn:p::p::kubernetes:apps/v1:Deployment::good",
        name: "good",
        props: {
          spec: {
            template: {
              spec: {
                containers: [
                  {
                    name: "api",
                    image: "ghcr.io/example/api@sha256:abcdefabcdef",
                    securityContext: { privileged: false },
                    resources: {
                      requests: { cpu: "100m", memory: "128Mi" },
                      limits: { cpu: "500m", memory: "256Mi" },
                    },
                  },
                ],
              },
            },
          },
        },
      },
      {
        type: "kubernetes:core/v1:Service",
        urn: "urn:p::p::kubernetes:core/v1:Service::api",
        name: "api",
        props: { spec: { type: "ClusterIP" } },
      },
      {
        type: "kubernetes:rbac.authorization.k8s.io/v1:Role",
        urn: "urn:p::p::kubernetes:rbac.authorization.k8s.io/v1:Role::reader",
        name: "reader",
        props: {
          rules: [
            { apiGroups: [""], resources: ["pods"], verbs: ["get", "list"] },
            {
              apiGroups: [""],
              resources: ["secrets"],
              verbs: ["get"],
              resourceNames: ["api-creds"],
            },
          ],
        },
      },
      {
        type: "kubernetes:rbac.authorization.k8s.io/v1:RoleBinding",
        urn: "urn:p::p::kubernetes:rbac.authorization.k8s.io/v1:RoleBinding::reader-binding",
        name: "reader-binding",
        props: { roleRef: { kind: "Role", name: "reader" } },
      },
      {
        type: "aws:eks/cluster:Cluster",
        urn: "urn:p::p::aws:eks/cluster:Cluster::prod",
        name: "prod",
        props: {
          vpcConfig: { endpointPublicAccess: false, endpointPrivateAccess: true },
          enabledClusterLogTypes: [
            "api",
            "audit",
            "authenticator",
            "controllerManager",
            "scheduler",
          ],
        },
      },
    ];

    const fired = runPacksOver(resources);
    expect(fired, `unexpected violations on hardened stack: ${fired.join("\n")}`).toEqual([]);
  });
});
