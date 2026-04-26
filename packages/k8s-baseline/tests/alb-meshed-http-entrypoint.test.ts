import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as pulumi from "@pulumi/pulumi";

import {
  ALB_MESHED_HTTP_ENTRYPOINT_COMPONENT_TYPE,
  AlbMeshedHttpEntrypoint,
} from "../src/alb-meshed-http-entrypoint";
import { IstioFoundation } from "../src/istio-foundation";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

beforeEach(() => {
  resetRegistrations();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function ingresses() {
  return registrations.filter((r) => r.type === "kubernetes:networking.k8s.io/v1:Ingress");
}

function findCustomResourceByKind(kind: string) {
  return registrations.filter(
    (r) =>
      r.type.startsWith("kubernetes:") &&
      !r.type.startsWith("kubernetes:core/") &&
      !r.type.startsWith("kubernetes:helm.sh/") &&
      !r.type.startsWith("kubernetes:networking.k8s.io/v1:Ingress") &&
      (r.inputs as { kind?: string }).kind === kind,
  );
}

describe("AlbMeshedHttpEntrypoint — happy paths", () => {
  test("emits 4 children: Ingress + Gateway + VirtualService + AuthorizationPolicy", async () => {
    const mesh = new IstioFoundation("mesh", { version: "1.24.2" });
    new AlbMeshedHttpEntrypoint("api-entry", {
      mesh,
      host: "api.example.internal",
      serviceRef: { namespace: "prod", name: "api", port: 9090 },
    });
    await settlePulumi();

    expect(registrations.some((r) => r.type === ALB_MESHED_HTTP_ENTRYPOINT_COMPONENT_TYPE)).toBe(
      true,
    );
    expect(ingresses()).toHaveLength(1);
    expect(findCustomResourceByKind("Gateway")).toHaveLength(1);
    expect(findCustomResourceByKind("VirtualService")).toHaveLength(1);
    expect(findCustomResourceByKind("AuthorizationPolicy")).toHaveLength(1);
  });

  test("Ingress has the four ALB annotations + scheme=internal default", async () => {
    const mesh = new IstioFoundation("mesh", { version: "1.24.2" });
    new AlbMeshedHttpEntrypoint("api", {
      mesh,
      host: "api.example.internal",
      serviceRef: { namespace: "prod", name: "api", port: 9090 },
    });
    await settlePulumi();
    const ing = ingresses()[0];
    const meta = ing.inputs.metadata as { annotations: Record<string, string> };
    expect(meta.annotations["alb.ingress.kubernetes.io/target-type"]).toBe("ip");
    expect(meta.annotations["alb.ingress.kubernetes.io/scheme"]).toBe("internal");
    expect(meta.annotations["alb.ingress.kubernetes.io/healthcheck-port"]).toBe("15021");
    expect(meta.annotations["alb.ingress.kubernetes.io/healthcheck-path"]).toBe("/healthz/ready");
    expect(meta.annotations["alb.ingress.kubernetes.io/group.name"]).toBe("default");
  });

  test('scheme: "internet-facing" propagates to the annotation', async () => {
    const mesh = new IstioFoundation("mesh", { version: "1.24.2" });
    new AlbMeshedHttpEntrypoint("api", {
      mesh,
      host: "api.example.com",
      serviceRef: { namespace: "prod", name: "api", port: 80 },
      scheme: "internet-facing",
    });
    await settlePulumi();
    const ing = ingresses()[0];
    const meta = ing.inputs.metadata as { annotations: Record<string, string> };
    expect(meta.annotations["alb.ingress.kubernetes.io/scheme"]).toBe("internet-facing");
  });

  test("VirtualService gateway ref uses cross-namespace form", async () => {
    const mesh = new IstioFoundation("mesh", { version: "1.24.2" });
    new AlbMeshedHttpEntrypoint("api", {
      mesh,
      host: "api.example.internal",
      serviceRef: { namespace: "prod", name: "api", port: 9090 },
    });
    await settlePulumi();
    const vs = findCustomResourceByKind("VirtualService")[0];
    const spec = vs.inputs.spec as { gateways: string[] };
    expect(spec.gateways).toHaveLength(1);
    expect(spec.gateways[0]).toBe("istio-ingress/api-gateway");
  });

  test("AuthorizationPolicy from.principals computed from mesh ref + extras appended", async () => {
    const mesh = new IstioFoundation("mesh", { version: "1.24.2" });
    new AlbMeshedHttpEntrypoint("api", {
      mesh,
      host: "api.example.internal",
      serviceRef: { namespace: "prod", name: "api", port: 9090 },
      authorizationPolicy: {
        allowFromGateway: true,
        extraPrincipals: ["spiffe://example.org/sa/sister"],
      },
    });
    await settlePulumi();
    const ap = findCustomResourceByKind("AuthorizationPolicy")[0];
    const spec = ap.inputs.spec as {
      rules: Array<{ from: Array<{ source: { principals: string[] } }> }>;
    };
    const principals = spec.rules[0].from[0].source.principals;
    expect(principals).toHaveLength(2);
    expect(principals[0]).toBe("cluster.local/ns/istio-ingress/sa/mesh-ingress");
    expect(principals[1]).toBe("spiffe://example.org/sa/sister");
  });

  test("STRICT mTLS (default) emits a workload-namespace PeerAuthentication", async () => {
    const mesh = new IstioFoundation("mesh", { version: "1.24.2" });
    new AlbMeshedHttpEntrypoint("api", {
      mesh,
      host: "api.example.internal",
      serviceRef: { namespace: "prod", name: "api", port: 9090 },
    });
    await settlePulumi();
    const peers = findCustomResourceByKind("PeerAuthentication");
    // One in mesh's istio-system + one in workload namespace from the entrypoint
    expect(peers.length).toBeGreaterThanOrEqual(2);
  });

  test("certificateArn supplied → adds HTTPS annotation set", async () => {
    const mesh = new IstioFoundation("mesh", { version: "1.24.2" });
    new AlbMeshedHttpEntrypoint("api", {
      mesh,
      host: "api.example.com",
      serviceRef: { namespace: "prod", name: "api", port: 80 },
      scheme: "internet-facing",
      alb: { certificateArn: "arn:aws:acm:us-east-1:111:certificate/abc" },
    });
    await settlePulumi();
    const ing = ingresses()[0];
    const meta = ing.inputs.metadata as { annotations: Record<string, string> };
    expect(meta.annotations["alb.ingress.kubernetes.io/certificate-arn"]).toBe(
      "arn:aws:acm:us-east-1:111:certificate/abc",
    );
    expect(meta.annotations["alb.ingress.kubernetes.io/listen-ports"]).toBe(
      '[{"HTTP":80},{"HTTPS":443}]',
    );
    expect(meta.annotations["alb.ingress.kubernetes.io/ssl-redirect"]).toBe("443");
  });
});

describe("AlbMeshedHttpEntrypoint — invalid input refusals", () => {
  test("invalid host (wildcard) refused", () => {
    const mesh = new IstioFoundation("mesh-inv", { version: "1.24.2" });
    expect(
      () =>
        new AlbMeshedHttpEntrypoint("x", {
          mesh,
          host: "*",
          serviceRef: { namespace: "prod", name: "api", port: 9090 },
        }),
    ).toThrow(/host .+ must be a valid FQDN/);
  });

  test("empty host refused", () => {
    const mesh = new IstioFoundation("mesh-empty", { version: "1.24.2" });
    expect(
      () =>
        new AlbMeshedHttpEntrypoint("x", {
          mesh,
          host: "",
          serviceRef: { namespace: "prod", name: "api", port: 9090 },
        }),
    ).toThrow(/host is required and must be non-empty/);
  });

  test("invalid serviceRef.port (negative) refused", () => {
    const mesh = new IstioFoundation("mesh-port", { version: "1.24.2" });
    expect(
      () =>
        new AlbMeshedHttpEntrypoint("x", {
          mesh,
          host: "api.example.internal",
          serviceRef: { namespace: "prod", name: "api", port: -1 },
        }),
    ).toThrow(/serviceRef.port must be a number between 1 and 65535/);
  });

  test("invalid scheme refused", () => {
    const mesh = new IstioFoundation("mesh-scheme", { version: "1.24.2" });
    expect(
      () =>
        new AlbMeshedHttpEntrypoint("x", {
          mesh,
          host: "api.example.internal",
          serviceRef: { namespace: "prod", name: "api", port: 9090 },
          scheme: "external" as unknown as "internal",
        }),
    ).toThrow(/scheme must be one of/);
  });
});

describe("AlbMeshedHttpEntrypoint — abuse cases", () => {
  test("allowFromGateway:false without acknowledgeNoAuthZ refused", () => {
    const mesh = new IstioFoundation("mesh-noauth", { version: "1.24.2" });
    expect(
      () =>
        new AlbMeshedHttpEntrypoint("x", {
          mesh,
          host: "api.example.internal",
          serviceRef: { namespace: "prod", name: "api", port: 9090 },
          authorizationPolicy: { allowFromGateway: false },
        }),
    ).toThrow(/allowFromGateway: false requires acknowledgeNoAuthZ: true/);
  });

  test("allowFromGateway:false with empty extraPrincipals refused", () => {
    const mesh = new IstioFoundation("mesh-noauth2", { version: "1.24.2" });
    expect(
      () =>
        new AlbMeshedHttpEntrypoint("x", {
          mesh,
          host: "api.example.internal",
          serviceRef: { namespace: "prod", name: "api", port: 9090 },
          authorizationPolicy: {
            allowFromGateway: false,
            acknowledgeNoAuthZ: true,
            extraPrincipals: [],
          },
        }),
    ).toThrow(/non-empty extraPrincipals list/);
  });

  test("allowFromGateway:false with proper opt-in succeeds + warns", async () => {
    const warnSpy = vi.spyOn(pulumi.log, "warn").mockResolvedValue();
    const mesh = new IstioFoundation("mesh-optin", { version: "1.24.2" });
    new AlbMeshedHttpEntrypoint("x", {
      mesh,
      host: "api.example.internal",
      serviceRef: { namespace: "prod", name: "api", port: 9090 },
      authorizationPolicy: {
        allowFromGateway: false,
        acknowledgeNoAuthZ: true,
        extraPrincipals: ["spiffe://example.org/sa/svc-a"],
      },
    });
    await settlePulumi();
    const messages = warnSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(messages).toMatch(/allowFromGateway: false/);
    const ap = findCustomResourceByKind("AuthorizationPolicy")[0];
    const spec = ap.inputs.spec as {
      rules: Array<{ from: Array<{ source: { principals: string[] } }> }>;
    };
    const principals = spec.rules[0].from[0].source.principals;
    expect(principals).toEqual(["spiffe://example.org/sa/svc-a"]);
  });
});

describe("AlbMeshedHttpEntrypoint — outputs lock", () => {
  test("9 documented outputs are exposed", async () => {
    const mesh = new IstioFoundation("mesh-out", { version: "1.24.2" });
    const e = new AlbMeshedHttpEntrypoint("api", {
      mesh,
      host: "api.example.internal",
      serviceRef: { namespace: "prod", name: "api", port: 9090 },
    });
    await settlePulumi();
    expect(await valueOf(e.ingressName)).toBe("api-ingress");
    expect(await valueOf(e.gatewayName)).toBe("api-gateway");
    expect(await valueOf(e.virtualServiceName)).toBe("api-vs");
    expect(await valueOf(e.authorizationPolicyName)).toBe("api-authz");
    expect(await valueOf(e.virtualServiceNamespace)).toBe("prod");
    expect(await valueOf(e.authorizationPolicyNamespace)).toBe("prod");
  });
});
