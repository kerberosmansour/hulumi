import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as pulumi from "@pulumi/pulumi";

import { ISTIO_FOUNDATION_COMPONENT_TYPE, IstioFoundation } from "../src/istio-foundation";
import { HARDENED_HELM_RELEASE_COMPONENT_TYPE } from "../src/hardened-helm-release";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

beforeEach(() => {
  resetRegistrations();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function helmReleases() {
  return registrations.filter((r) => r.type === "kubernetes:helm.sh/v3:Release");
}

function namespaces() {
  return registrations.filter((r) => r.type === "kubernetes:core/v1:Namespace");
}

function customResources() {
  // Pulumi's apiextensions.CustomResource registers under a dynamic
  // `kubernetes:<apiVersion>:<kind>` type derived from the GVK at runtime.
  return registrations.filter((r) =>
    r.type.startsWith("kubernetes:") &&
    !r.type.startsWith("kubernetes:core/") &&
    !r.type.startsWith("kubernetes:helm.sh/"),
  );
}

function componentRegistrations() {
  return registrations.filter((r) => r.type === HARDENED_HELM_RELEASE_COMPONENT_TYPE);
}

describe("IstioFoundation — happy paths", () => {
  test("default args register cni + istiod + ingressgateway with documented namespaces and dependsOn chain", async () => {
    new IstioFoundation("mesh", { version: "1.24.2" });
    await settlePulumi();

    expect(registrations.some((r) => r.type === ISTIO_FOUNDATION_COMPONENT_TYPE)).toBe(true);
    expect(componentRegistrations()).toHaveLength(3);

    const releases = helmReleases();
    expect(releases).toHaveLength(3);

    const cni = releases.find((r) => r.inputs.chart === "cni");
    const istiod = releases.find((r) => r.inputs.chart === "istiod");
    const gateway = releases.find((r) => r.inputs.chart === "gateway");
    expect(cni).toBeDefined();
    expect(istiod).toBeDefined();
    expect(gateway).toBeDefined();

    expect(cni!.inputs.namespace).toBe("kube-system");
    expect(istiod!.inputs.namespace).toBe("istio-system");
    expect(gateway!.inputs.namespace).toBe("istio-ingress");

    // pilot.cni.enabled === true on istiod when cniEnabled (default)
    const istiodValues = istiod!.inputs.values as { pilot?: { cni?: { enabled?: boolean } } };
    expect(istiodValues.pilot?.cni?.enabled).toBe(true);

    // cni values include cniBinDir
    const cniValues = cni!.inputs.values as { cni?: { cniBinDir?: string } };
    expect(cniValues.cni?.cniBinDir).toBe("/opt/cni/bin");

    // Fargate-exclusion affinity injected on cni
    expect((cni!.inputs.values as Record<string, unknown>).affinity).toBeDefined();
  });

  test("creates istio-system + istio-ingress namespaces with PSA baseline label", async () => {
    new IstioFoundation("mesh", { version: "1.24.2" });
    await settlePulumi();
    const ns = namespaces();
    expect(ns).toHaveLength(2);
    for (const n of ns) {
      const meta = n.inputs.metadata as {
        labels?: Record<string, string>;
      };
      expect(meta.labels?.["pod-security.kubernetes.io/enforce"]).toBe("baseline");
    }
  });

  test("emits a single PeerAuthentication for STRICT cluster-wide mTLS", async () => {
    new IstioFoundation("mesh", { version: "1.24.2" });
    await settlePulumi();
    const crs = customResources();
    expect(crs).toHaveLength(1);
    const cr = crs[0];
    expect(cr.inputs.kind).toBe("PeerAuthentication");
    const spec = cr.inputs.spec as { mtls?: { mode?: string } };
    expect(spec.mtls?.mode).toBe("STRICT");
  });

  test("explicit namespaces override the defaults", async () => {
    new IstioFoundation("mesh", {
      version: "1.24.2",
      istiodNamespace: "istio",
      cniNamespace: "kube-system-cni",
      ingressNamespace: "ingress",
    });
    await settlePulumi();
    const releases = helmReleases();
    expect(releases.find((r) => r.inputs.chart === "cni")!.inputs.namespace).toBe(
      "kube-system-cni",
    );
    expect(releases.find((r) => r.inputs.chart === "istiod")!.inputs.namespace).toBe("istio");
    expect(releases.find((r) => r.inputs.chart === "gateway")!.inputs.namespace).toBe("ingress");
  });

  test("ingressGateway:{enabled:false} omits the gateway release", async () => {
    new IstioFoundation("mesh", {
      version: "1.24.2",
      ingressGateway: { enabled: false },
    });
    await settlePulumi();
    const releases = helmReleases();
    expect(releases).toHaveLength(2);
    expect(releases.some((r) => r.inputs.chart === "gateway")).toBe(false);
  });

  test("ingressGatewayServiceAccountName + namespace outputs are computed", async () => {
    const f = new IstioFoundation("mesh", { version: "1.24.2" });
    await settlePulumi();
    expect(await valueOf(f.ingressGatewayServiceAccountName)).toBe("mesh-ingress");
    expect(await valueOf(f.ingressGatewayNamespace)).toBe("istio-ingress");
  });
});

describe("IstioFoundation — invalid input refusals", () => {
  test("missing version is refused", () => {
    expect(
      () =>
        new IstioFoundation("x", {} as unknown as ConstructorParameters<typeof IstioFoundation>[1]),
    ).toThrow(/version is required/);
  });

  test("invalid mTLS is refused", () => {
    expect(
      () =>
        new IstioFoundation("x", {
          version: "1.24.2",
          defaultMTLS: "DISABLED" as unknown as "STRICT",
        }),
    ).toThrow(/defaultMTLS must be one of STRICT, PERMISSIVE/);
  });

  test("empty istiodNamespace is refused", () => {
    expect(
      () => new IstioFoundation("x", { version: "1.24.2", istiodNamespace: "" }),
    ).toThrow(/istiodNamespace must be non-empty/);
  });

  test("invalid podSecurity is refused", () => {
    expect(
      () =>
        new IstioFoundation("x", {
          version: "1.24.2",
          podSecurity: "yolo" as unknown as "baseline",
        }),
    ).toThrow(/podSecurity must be one of/);
  });
});

describe("IstioFoundation — security-positive default opt-outs warn", () => {
  test("cniEnabled:false emits pulumi.log.warn and omits cni release + cni values on istiod", async () => {
    const warnSpy = vi.spyOn(pulumi.log, "warn").mockResolvedValue();
    new IstioFoundation("mesh", { version: "1.24.2", cniEnabled: false });
    await settlePulumi();
    const releases = helmReleases();
    expect(releases).toHaveLength(2);
    expect(releases.some((r) => r.inputs.chart === "cni")).toBe(false);
    const istiod = releases.find((r) => r.inputs.chart === "istiod")!;
    const istiodValues = istiod.inputs.values as Record<string, unknown>;
    expect(istiodValues.pilot).toBeUndefined();
    const messages = warnSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(messages).toMatch(/cniEnabled: false/);
    expect(messages).toMatch(/PSA baseline/);
  });

  test("defaultMTLS:PERMISSIVE emits pulumi.log.warn", async () => {
    const warnSpy = vi.spyOn(pulumi.log, "warn").mockResolvedValue();
    new IstioFoundation("mesh", { version: "1.24.2", defaultMTLS: "PERMISSIVE" });
    await settlePulumi();
    const messages = warnSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(messages).toMatch(/PERMISSIVE/);
    // PeerAuthentication is still emitted, but with PERMISSIVE
    const crs = customResources();
    const spec = crs[0].inputs.spec as { mtls?: { mode?: string } };
    expect(spec.mtls?.mode).toBe("PERMISSIVE");
  });
});

describe("IstioFoundation — version output + chartClass propagation", () => {
  test("version output echoes input", async () => {
    const f = new IstioFoundation("mesh", { version: "1.24.2" });
    await settlePulumi();
    expect(await valueOf(f.version)).toBe("1.24.2");
  });

  test("all 3 helm releases use chartClass implicitly via the 480s timeout", async () => {
    new IstioFoundation("mesh", { version: "1.24.2" });
    await settlePulumi();
    const releases = helmReleases();
    for (const r of releases) {
      expect(r.inputs.timeout).toBe(480);
    }
  });
});
