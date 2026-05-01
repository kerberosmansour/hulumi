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
      acknowledgeInferredSelector: true,
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
      acknowledgeInferredSelector: true,
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
      acknowledgeInferredSelector: true,
      alb: {
        certificateArn: "arn:aws:acm:us-east-1:111:certificate/abc",
        publicJustification: "Public marketing site; HTTPS-only.",
      },
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
      acknowledgeInferredSelector: true,
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
      acknowledgeInferredSelector: true,
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
      acknowledgeInferredSelector: true,
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
      acknowledgeInferredSelector: true,
      alb: {
        certificateArn: "arn:aws:acm:us-east-1:111:certificate/abc",
        publicJustification: "Public marketing site; HTTPS-only.",
      },
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
      acknowledgeInferredSelector: true,
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
      acknowledgeInferredSelector: true,
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

describe("AlbMeshedHttpEntrypoint — M2 explicit-selector default", () => {
  test("Scenario: Explicit selector used (workloadSelector wins over inferred app:name)", async () => {
    const mesh = new IstioFoundation("mesh-sel", { version: "1.24.2" });
    new AlbMeshedHttpEntrypoint("api", {
      mesh,
      host: "api.example.internal",
      serviceRef: { namespace: "prod", name: "api", port: 9090 },
      workloadSelector: { matchLabels: { "app.kubernetes.io/name": "api", tier: "frontend" } },
    });
    await settlePulumi();
    const ap = findCustomResourceByKind("AuthorizationPolicy")[0];
    const spec = ap.inputs.spec as { selector: { matchLabels: Record<string, string> } };
    expect(spec.selector.matchLabels).toEqual({
      "app.kubernetes.io/name": "api",
      tier: "frontend",
    });
  });

  test("Scenario: Inferred selector requires acknowledgement (M2 default rejects implicit inference)", () => {
    const mesh = new IstioFoundation("mesh-impl", { version: "1.24.2" });
    expect(
      () =>
        new AlbMeshedHttpEntrypoint("api", {
          mesh,
          host: "api.example.internal",
          serviceRef: { namespace: "prod", name: "api", port: 9090 },
        }),
    ).toThrow(/workloadSelector|acknowledgeInferredSelector/);
  });

  test("Scenario: Inferred selector with explicit acknowledgement still constructs and warns", async () => {
    const warnSpy = vi.spyOn(pulumi.log, "warn").mockResolvedValue();
    const mesh = new IstioFoundation("mesh-ack", { version: "1.24.2" });
    new AlbMeshedHttpEntrypoint("api", {
      mesh,
      host: "api.example.internal",
      serviceRef: { namespace: "prod", name: "api", port: 9090 },
      acknowledgeInferredSelector: true,
    });
    await settlePulumi();
    const messages = warnSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(messages).toMatch(/acknowledgeInferredSelector|inferred selector/i);
    const ap = findCustomResourceByKind("AuthorizationPolicy")[0];
    const spec = ap.inputs.spec as { selector: { matchLabels: Record<string, string> } };
    expect(spec.selector.matchLabels).toEqual({ app: "api" });
  });

  test("Scenario: Selector label bound enforced (33 labels → constructor rejects)", () => {
    const mesh = new IstioFoundation("mesh-labels", { version: "1.24.2" });
    const tooMany: Record<string, string> = {};
    for (let i = 0; i < 33; i++) tooMany[`label-${i}`] = `v${i}`;
    expect(
      () =>
        new AlbMeshedHttpEntrypoint("api", {
          mesh,
          host: "api.example.internal",
          serviceRef: { namespace: "prod", name: "api", port: 9090 },
          workloadSelector: { matchLabels: tooMany },
        }),
    ).toThrow(/workloadSelector.*labels.*max 32/i);
  });

  test("Scenario: extraPrincipals bound enforced (65 → constructor rejects)", () => {
    const mesh = new IstioFoundation("mesh-pr", { version: "1.24.2" });
    const tooMany: string[] = [];
    for (let i = 0; i < 65; i++) tooMany.push(`spiffe://example.org/sa/svc-${i}`);
    expect(
      () =>
        new AlbMeshedHttpEntrypoint("api", {
          mesh,
          host: "api.example.internal",
          serviceRef: { namespace: "prod", name: "api", port: 9090 },
          acknowledgeInferredSelector: true,
          authorizationPolicy: { extraPrincipals: tooMany },
        }),
    ).toThrow(/extraPrincipals.*max 64/i);
  });
});

describe("AlbMeshedHttpEntrypoint — M2 internet-facing posture", () => {
  test("Scenario: internet-facing without certificateArn refused", () => {
    const mesh = new IstioFoundation("mesh-pub-1", { version: "1.24.2" });
    expect(
      () =>
        new AlbMeshedHttpEntrypoint("api", {
          mesh,
          host: "api.example.com",
          serviceRef: { namespace: "prod", name: "api", port: 80 },
          scheme: "internet-facing",
          acknowledgeInferredSelector: true,
        }),
    ).toThrow(/internet-facing.*certificateArn/i);
  });

  test("Scenario: internet-facing without publicJustification refused", () => {
    const mesh = new IstioFoundation("mesh-pub-2", { version: "1.24.2" });
    expect(
      () =>
        new AlbMeshedHttpEntrypoint("api", {
          mesh,
          host: "api.example.com",
          serviceRef: { namespace: "prod", name: "api", port: 80 },
          scheme: "internet-facing",
          acknowledgeInferredSelector: true,
          alb: { certificateArn: "arn:aws:acm:us-east-1:111:certificate/abc" },
        }),
    ).toThrow(/internet-facing.*publicJustification/i);
  });

  test("Scenario: internet-facing with cert + justification records it on ingress annotation", async () => {
    const mesh = new IstioFoundation("mesh-pub-3", { version: "1.24.2" });
    new AlbMeshedHttpEntrypoint("api", {
      mesh,
      host: "api.example.com",
      serviceRef: { namespace: "prod", name: "api", port: 80 },
      scheme: "internet-facing",
      acknowledgeInferredSelector: true,
      alb: {
        certificateArn: "arn:aws:acm:us-east-1:111:certificate/abc",
        publicJustification: "Public marketing site; HTTPS-only; no PII handled.",
      },
    });
    await settlePulumi();
    const ing = ingresses()[0];
    const meta = ing.inputs.metadata as { annotations: Record<string, string> };
    expect(meta.annotations["hulumi.dev/public-justification"]).toBe(
      "Public marketing site; HTTPS-only; no PII handled.",
    );
  });

  test("Scenario: short publicJustification (< 8 chars) refused", () => {
    const mesh = new IstioFoundation("mesh-pub-short", { version: "1.24.2" });
    expect(
      () =>
        new AlbMeshedHttpEntrypoint("api", {
          mesh,
          host: "api.example.com",
          serviceRef: { namespace: "prod", name: "api", port: 80 },
          scheme: "internet-facing",
          acknowledgeInferredSelector: true,
          alb: {
            certificateArn: "arn:aws:acm:us-east-1:111:certificate/abc",
            publicJustification: "ok",
          },
        }),
    ).toThrow(/publicJustification.*length|publicJustification.*8/i);
  });
});
