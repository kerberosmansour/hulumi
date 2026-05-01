// BDD scenarios for NamespaceFoundation (Runbook M4).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { NamespaceFoundation, NAMESPACE_FOUNDATION_COMPONENT_TYPE } from "../src";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

beforeEach(() => {
  resetRegistrations();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function namespaces() {
  return registrations.filter((r) => r.type === "kubernetes:core/v1:Namespace");
}
function networkPolicies() {
  return registrations.filter((r) => r.type === "kubernetes:networking.k8s.io/v1:NetworkPolicy");
}
function findNetPolicyByName(name: string) {
  return networkPolicies().find((r) => {
    const meta = r.inputs.metadata as { name: string };
    return meta.name === name;
  });
}
function serviceAccounts() {
  return registrations.filter((r) => r.type === "kubernetes:core/v1:ServiceAccount");
}
function resourceQuotas() {
  return registrations.filter((r) => r.type === "kubernetes:core/v1:ResourceQuota");
}
function limitRanges() {
  return registrations.filter((r) => r.type === "kubernetes:core/v1:LimitRange");
}

describe("NamespaceFoundation — happy path defaults", () => {
  test("Scenario: Namespace defaults to PSA baseline (enforce baseline, audit/warn restricted)", async () => {
    new NamespaceFoundation("foundation", { name: "team-a" });
    await settlePulumi();
    expect(namespaces()).toHaveLength(1);
    const meta = namespaces()[0].inputs.metadata as {
      name: string;
      labels: Record<string, string>;
    };
    expect(meta.name).toBe("team-a");
    expect(meta.labels["pod-security.kubernetes.io/enforce"]).toBe("baseline");
    expect(meta.labels["pod-security.kubernetes.io/audit"]).toBe("restricted");
    expect(meta.labels["pod-security.kubernetes.io/warn"]).toBe("restricted");
  });

  test('Scenario: Restricted namespace opt-in works (enforce becomes "restricted")', async () => {
    new NamespaceFoundation("foundation", { name: "team-b", podSecurity: "restricted" });
    await settlePulumi();
    const meta = namespaces()[0].inputs.metadata as { labels: Record<string, string> };
    expect(meta.labels["pod-security.kubernetes.io/enforce"]).toBe("restricted");
  });

  test("Scenario: Default ServiceAccount has automountServiceAccountToken: false by default", async () => {
    const c = new NamespaceFoundation("foundation", { name: "team-c" });
    await settlePulumi();
    expect(serviceAccounts()).toHaveLength(1);
    const sa = serviceAccounts()[0];
    expect(sa.inputs.automountServiceAccountToken).toBe(false);
    expect(await valueOf(c.defaultServiceAccountAutomountDisabled)).toBe(true);
  });

  test("Scenario: Default ServiceAccount automount: required is opt-in", async () => {
    new NamespaceFoundation("foundation", {
      name: "team-d",
      defaultServiceAccountAutomount: "required",
    });
    await settlePulumi();
    expect(serviceAccounts()[0].inputs.automountServiceAccountToken).toBe(true);
  });

  test("Scenario: Quota and limits emitted when args supplied", async () => {
    new NamespaceFoundation("foundation", {
      name: "team-e",
      quota: { hard: { "requests.cpu": "10", "requests.memory": "32Gi", pods: "100" } },
      limitRanges: [
        {
          type: "Container",
          defaults: { cpu: "500m", memory: "256Mi" },
          defaultRequests: { cpu: "100m", memory: "128Mi" },
        },
      ],
    });
    await settlePulumi();
    expect(resourceQuotas()).toHaveLength(1);
    expect(limitRanges()).toHaveLength(1);
  });
});

describe("NamespaceFoundation — network defaults", () => {
  test("Scenario: Default deny emitted (Ingress + Egress)", async () => {
    new NamespaceFoundation("foundation", { name: "team-f" });
    await settlePulumi();
    const deny = findNetPolicyByName("team-f-default-deny");
    expect(deny).toBeDefined();
    const spec = deny!.inputs.spec as {
      podSelector: Record<string, unknown>;
      policyTypes: string[];
    };
    expect(spec.podSelector).toEqual({});
    expect(spec.policyTypes).toEqual(["Ingress", "Egress"]);
  });

  test("Scenario: DNS egress allowed (CoreDNS NetworkPolicy emitted)", async () => {
    new NamespaceFoundation("foundation", { name: "team-g" });
    await settlePulumi();
    const dns = findNetPolicyByName("team-g-allow-dns-egress");
    expect(dns).toBeDefined();
    const spec = dns!.inputs.spec as {
      egress: Array<{
        to: Array<{ namespaceSelector?: { matchLabels?: Record<string, string> } }>;
        ports: Array<{ protocol: string; port: number }>;
      }>;
    };
    expect(spec.egress[0].to[0].namespaceSelector?.matchLabels).toEqual({
      "kubernetes.io/metadata.name": "kube-system",
    });
    expect(spec.egress[0].ports.some((p) => p.port === 53)).toBe(true);
  });

  test("Scenario: IMDS deny NetworkPolicy emitted with `0.0.0.0/0` except 169.254.169.254/32", async () => {
    new NamespaceFoundation("foundation", { name: "team-h" });
    await settlePulumi();
    const imds = findNetPolicyByName("team-h-deny-imds-egress");
    expect(imds).toBeDefined();
    const spec = imds!.inputs.spec as {
      egress: Array<{ to: Array<{ ipBlock?: { cidr: string; except: string[] } }> }>;
    };
    expect(spec.egress[0].to[0].ipBlock).toEqual({
      cidr: "0.0.0.0/0",
      except: ["169.254.169.254/32"],
    });
  });

  test("Scenario: CNI caveat documented as annotation on the IMDS-deny policy by default", async () => {
    new NamespaceFoundation("foundation", { name: "team-i" });
    await settlePulumi();
    const imds = findNetPolicyByName("team-i-deny-imds-egress");
    expect(imds).toBeDefined();
    const meta = imds!.inputs.metadata as { annotations: Record<string, string> };
    expect(meta.annotations["hulumi.dev/cni-caveat"]).toMatch(
      /CNI plugin.*supports it.*hostNetwork/,
    );
  });

  test("Scenario: allowMeshEgress: true emits the mesh-egress policy", async () => {
    new NamespaceFoundation("foundation", {
      name: "team-j",
      networkDefaults: { allowMeshEgress: true, meshIngressNamespace: "istio-ingress" },
    });
    await settlePulumi();
    const mesh = findNetPolicyByName("team-j-allow-mesh-egress");
    expect(mesh).toBeDefined();
  });
});

describe("NamespaceFoundation — invalid input refusals", () => {
  test('Scenario: empty name refused', () => {
    expect(() => new NamespaceFoundation("c", { name: "" })).toThrow(
      /name is required/,
    );
  });

  test('Scenario: name with "/" refused', () => {
    expect(() => new NamespaceFoundation("c", { name: "ns/x" })).toThrow(
      /must not contain/,
    );
  });

  test('Scenario: invalid PSA level refused', () => {
    expect(
      () =>
        new NamespaceFoundation("c", {
          name: "x",
          podSecurity: "wonky" as unknown as "baseline",
        }),
    ).toThrow(/podSecurity must be one of/);
  });

  test('Scenario: allowMeshEgress without meshIngressNamespace refused', () => {
    expect(
      () =>
        new NamespaceFoundation("c", {
          name: "x",
          networkDefaults: { allowMeshEgress: true },
        }),
    ).toThrow(/allowMeshEgress.*requires meshIngressNamespace/);
  });

  test('Scenario: Label bound enforced (33 labels → reject)', () => {
    const tooMany: Record<string, string> = {};
    for (let i = 0; i < 33; i++) tooMany[`label-${i}`] = `v${i}`;
    expect(() => new NamespaceFoundation("c", { name: "x", labels: tooMany })).toThrow(
      /labels has 33.*max 32/,
    );
  });

  test('Scenario: Quota entry bound enforced (33 entries → reject)', () => {
    const tooMany: Record<string, string> = {};
    for (let i = 0; i < 33; i++) tooMany[`requests.cpu-${i}`] = "1";
    expect(
      () => new NamespaceFoundation("c", { name: "x", quota: { hard: tooMany } }),
    ).toThrow(/quota.hard has 33.*max 32/);
  });
});

describe("NamespaceFoundation — outputs lock", () => {
  test("emits the expected component type and policy names", async () => {
    const c = new NamespaceFoundation("foundation", { name: "team-z" });
    await settlePulumi();
    expect(registrations.some((r) => r.type === NAMESPACE_FOUNDATION_COMPONENT_TYPE)).toBe(true);
    const polNames = await valueOf(c.networkPolicyNames);
    expect(polNames.sort()).toEqual(
      ["team-z-default-deny", "team-z-allow-dns-egress", "team-z-deny-imds-egress"].sort(),
    );
  });
});
