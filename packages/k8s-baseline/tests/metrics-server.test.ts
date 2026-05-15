import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  DEFAULT_METRICS_SERVER_CHART_VERSION,
  METRICS_SERVER_API_SERVICE_NAME,
  METRICS_SERVER_COMPONENT_TYPE,
  METRICS_SERVER_REPOSITORY,
  MetricsServer,
} from "../src/metrics-server";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

beforeEach(() => {
  resetRegistrations();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MetricsServer — happy paths", () => {
  test("registers a secure-by-default metrics-server Helm release", async () => {
    new MetricsServer("cluster-metrics");
    await settlePulumi();

    const componentReg = registrations.find((r) => r.type === METRICS_SERVER_COMPONENT_TYPE);
    const releaseReg = registrations.find((r) => r.type === "kubernetes:helm.sh/v3:Release");
    expect(componentReg, "component is registered").toBeDefined();
    expect(releaseReg, "child Release is registered").toBeDefined();
    expect(releaseReg!.inputs.chart).toBe("metrics-server");
    expect(releaseReg!.inputs.version).toBe(DEFAULT_METRICS_SERVER_CHART_VERSION);
    expect(releaseReg!.inputs.namespace).toBe("kube-system");
    expect(releaseReg!.inputs.name).toBe("metrics-server");
    expect(releaseReg!.inputs.repositoryOpts).toEqual({ repo: METRICS_SERVER_REPOSITORY });

    const values = releaseReg!.inputs.values as Record<string, unknown>;
    expect(values.apiService).toEqual({ create: true, insecureSkipTLSVerify: false });
    expect(values.tls).toEqual({
      type: "helm",
      helm: { lookup: true, certDurationDays: 365 },
    });
  });

  test("passes narrowly scoped scheduling and resource overrides", async () => {
    new MetricsServer("cluster-metrics", {
      replicas: 2,
      resources: { requests: { cpu: "100m", memory: "200Mi" } },
      nodeSelector: { "kubernetes.io/os": "linux" },
      tolerations: [{ key: "node-role.kubernetes.io/control-plane", operator: "Exists" }],
      extraArgs: ["--metric-resolution=30s"],
    });
    await settlePulumi();

    const releaseReg = registrations.find((r) => r.type === "kubernetes:helm.sh/v3:Release");
    const values = releaseReg!.inputs.values as Record<string, unknown>;
    expect(values.replicas).toBe(2);
    expect(values.resources).toEqual({ requests: { cpu: "100m", memory: "200Mi" } });
    expect(values.nodeSelector).toEqual({ "kubernetes.io/os": "linux" });
    expect(values.tolerations).toEqual([
      { key: "node-role.kubernetes.io/control-plane", operator: "Exists" },
    ]);
    expect(values.args).toEqual(["--metric-resolution=30s"]);
  });

  test("explicit insecure opt-ins set chart values and outputs", async () => {
    const metrics = new MetricsServer("cluster-metrics", {
      insecureKubeletTls: {
        enabled: true,
        reason: "temporary bootstrap while node serving certificates are rotated",
      },
      insecureApiServiceTls: {
        enabled: true,
        reason: "temporary bootstrap before cert-manager CA injection is available",
      },
    });
    await settlePulumi();

    const releaseReg = registrations.find((r) => r.type === "kubernetes:helm.sh/v3:Release");
    const values = releaseReg!.inputs.values as Record<string, unknown>;
    expect(values.args).toEqual(["--kubelet-insecure-tls"]);
    expect(values.apiService).toEqual({ create: true, insecureSkipTLSVerify: true });
    expect(await valueOf(metrics.insecureKubeletTlsReason)).toMatch(/temporary bootstrap/);
    expect(await valueOf(metrics.insecureApiServiceTlsReason)).toMatch(/temporary bootstrap/);
  });

  test("outputs expose the metrics APIService name and chart version", async () => {
    const metrics = new MetricsServer("cluster-metrics");
    await settlePulumi();
    expect(await valueOf(metrics.apiServiceName)).toBe(METRICS_SERVER_API_SERVICE_NAME);
    expect(await valueOf(metrics.chartVersion)).toBe(DEFAULT_METRICS_SERVER_CHART_VERSION);
  });
});

describe("MetricsServer — invalid input refusals", () => {
  test("latest version is refused", () => {
    expect(() => new MetricsServer("cluster-metrics", { version: "latest" })).toThrow(
      /version "latest" is forbidden/,
    );
  });

  test("semver range version is refused", () => {
    expect(() => new MetricsServer("cluster-metrics", { version: "^3.13.0" })).toThrow(
      /uses a semver range/,
    );
  });

  test("empty release name is refused", () => {
    expect(() => new MetricsServer("cluster-metrics", { releaseName: "" })).toThrow(
      /releaseName must be non-empty/,
    );
  });

  test("blank extra arg is refused", () => {
    expect(() => new MetricsServer("cluster-metrics", { extraArgs: [""] })).toThrow(
      /extraArgs must not contain empty strings/,
    );
  });

  test("raw kubelet insecure TLS flag requires explicit reason", () => {
    expect(
      () => new MetricsServer("cluster-metrics", { extraArgs: ["--kubelet-insecure-tls"] }),
    ).toThrow(/requires insecureKubeletTls with a non-empty reason/);
  });

  test("insecure opt-in requires a reason", () => {
    expect(
      () =>
        new MetricsServer("cluster-metrics", {
          insecureApiServiceTls: { enabled: true, reason: "" },
        }),
    ).toThrow(/insecureApiServiceTls.reason must be non-empty/);
  });
});
