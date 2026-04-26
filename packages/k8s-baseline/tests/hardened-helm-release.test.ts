import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as pulumi from "@pulumi/pulumi";

import {
  HardenedHelmRelease,
  HARDENED_HELM_RELEASE_COMPONENT_TYPE,
} from "../src/hardened-helm-release";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

const REPO = "https://charts.bitnami.com/bitnami";

beforeEach(() => {
  resetRegistrations();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HardenedHelmRelease — happy paths", () => {
  test("registers a helm.v3.Release with the instance name verbatim (no random suffix)", async () => {
    new HardenedHelmRelease("my-nginx", {
      chart: "nginx",
      version: "15.4.4",
      namespace: "default",
      repository: REPO,
    });
    await settlePulumi();
    const componentReg = registrations.find(
      (r) => r.type === HARDENED_HELM_RELEASE_COMPONENT_TYPE,
    );
    const releaseReg = registrations.find((r) => r.type === "kubernetes:helm.sh/v3:Release");
    expect(componentReg, "component is registered").toBeDefined();
    expect(releaseReg, "child Release is registered").toBeDefined();
    expect(releaseReg!.inputs.name).toBe("my-nginx");
    expect(releaseReg!.inputs.name).not.toMatch(/^my-nginx-[0-9a-f]{8}$/);
    expect(releaseReg!.inputs.chart).toBe("nginx");
    expect(releaseReg!.inputs.version).toBe("15.4.4");
    expect(releaseReg!.inputs.repositoryOpts).toEqual({ repo: REPO });
    expect(releaseReg!.inputs.timeout).toBe(300);
  });

  test("explicit releaseName overrides the instance name", async () => {
    new HardenedHelmRelease("instance-name", {
      chart: "nginx",
      version: "15.4.4",
      namespace: "default",
      repository: REPO,
      releaseName: "my-named",
    });
    await settlePulumi();
    const releaseReg = registrations.find((r) => r.type === "kubernetes:helm.sh/v3:Release");
    expect(releaseReg!.inputs.name).toBe("my-named");
  });

  test("daemonSet:true injects Fargate-exclusion affinity into values when no affinity is preset", async () => {
    new HardenedHelmRelease("cni", {
      chart: "cni",
      version: "1.24.2",
      namespace: "kube-system",
      repository: REPO,
      daemonSet: true,
    });
    await settlePulumi();
    const releaseReg = registrations.find((r) => r.type === "kubernetes:helm.sh/v3:Release");
    const values = releaseReg!.inputs.values as Record<string, unknown>;
    expect(values.affinity).toBeDefined();
    const affinity = values.affinity as {
      nodeAffinity: {
        requiredDuringSchedulingIgnoredDuringExecution: {
          nodeSelectorTerms: Array<{
            matchExpressions: Array<{ key: string; operator: string; values: string[] }>;
          }>;
        };
      };
    };
    const expr =
      affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[0]
        .matchExpressions[0];
    expect(expr.key).toBe("eks.amazonaws.com/compute-type");
    expect(expr.operator).toBe("NotIn");
    expect(expr.values).toEqual(["fargate"]);
  });

  test("daemonSet:true with excludeFargate:false skips affinity injection", async () => {
    new HardenedHelmRelease("cni-no-exclude", {
      chart: "cni",
      version: "1.24.2",
      namespace: "kube-system",
      repository: REPO,
      daemonSet: true,
      excludeFargate: false,
    });
    await settlePulumi();
    const releaseReg = registrations.find((r) => r.type === "kubernetes:helm.sh/v3:Release");
    const values = releaseReg!.inputs.values as Record<string, unknown>;
    expect(values.affinity).toBeUndefined();
  });

  test("chartClass:istio bumps default timeout to 480_000ms", async () => {
    new HardenedHelmRelease("istiod", {
      chart: "istiod",
      version: "1.24.2",
      namespace: "istio-system",
      repository: REPO,
      chartClass: "istio",
    });
    await settlePulumi();
    const releaseReg = registrations.find((r) => r.type === "kubernetes:helm.sh/v3:Release");
    expect(releaseReg!.inputs.timeout).toBe(480);
  });

  test("outputs expose releaseName, chartVersion", async () => {
    const r = new HardenedHelmRelease("nginx", {
      chart: "nginx",
      version: "15.4.4",
      namespace: "default",
      repository: REPO,
    });
    await settlePulumi();
    expect(await valueOf(r.releaseName)).toBe("nginx");
    expect(await valueOf(r.chartVersion)).toBe("15.4.4");
  });
});

describe("HardenedHelmRelease — invalid input refusals", () => {
  test("missing version is refused", () => {
    expect(
      () =>
        new HardenedHelmRelease("x", {
          chart: "nginx",
          namespace: "default",
          repository: REPO,
        } as unknown as ConstructorParameters<typeof HardenedHelmRelease>[1]),
    ).toThrow(/version is required and must be an exact chart version/);
  });

  test('version "latest" is refused', () => {
    expect(
      () =>
        new HardenedHelmRelease("x", {
          chart: "nginx",
          version: "latest",
          namespace: "default",
          repository: REPO,
        }),
    ).toThrow(/forbidden — pin to an exact chart version/);
  });

  test("semver-range version (^1.0.0) is refused", () => {
    expect(
      () =>
        new HardenedHelmRelease("x", {
          chart: "nginx",
          version: "^1.0.0",
          namespace: "default",
          repository: REPO,
        }),
    ).toThrow(/uses a semver range/);
  });

  test("semver-range version (~1.0.0) is refused", () => {
    expect(
      () =>
        new HardenedHelmRelease("x", {
          chart: "nginx",
          version: "~1.0.0",
          namespace: "default",
          repository: REPO,
        }),
    ).toThrow(/uses a semver range/);
  });

  test('repository "file:///tmp/charts/nginx" is refused', () => {
    expect(
      () =>
        new HardenedHelmRelease("x", {
          chart: "nginx",
          version: "1.0.0",
          namespace: "default",
          repository: "file:///tmp/charts/nginx",
        }),
    ).toThrow(/must start with https:\/\/ or oci:\/\//);
  });

  test('bare-name repository "nginx" is refused', () => {
    expect(
      () =>
        new HardenedHelmRelease("x", {
          chart: "nginx",
          version: "1.0.0",
          namespace: "default",
          repository: "nginx",
        }),
    ).toThrow(/must start with https:\/\/ or oci:\/\//);
  });

  test("daemonSet:true with pre-set values.affinity is refused", () => {
    expect(
      () =>
        new HardenedHelmRelease("x", {
          chart: "nginx",
          version: "1.0.0",
          namespace: "default",
          repository: REPO,
          daemonSet: true,
          values: { affinity: { nodeAffinity: {} } },
        }),
    ).toThrow(/cannot inject Fargate-exclusion affinity because values.affinity is already set/);
  });

  test("empty releaseName is refused", () => {
    expect(
      () =>
        new HardenedHelmRelease("x", {
          chart: "nginx",
          version: "1.0.0",
          namespace: "default",
          repository: REPO,
          releaseName: "",
        }),
    ).toThrow(/releaseName must be a non-empty string/);
  });
});

describe("HardenedHelmRelease — compatibility warn-not-throw", () => {
  test("untested chart emits pulumi.log.warn", async () => {
    const warnSpy = vi.spyOn(pulumi.log, "warn").mockResolvedValue();
    new HardenedHelmRelease("z", {
      chart: "totally-untested-chart",
      version: "0.0.0",
      namespace: "default",
      repository: REPO,
    });
    await settlePulumi();
    expect(warnSpy).toHaveBeenCalled();
    const message = warnSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(message).toMatch(/totally-untested-chart/);
    expect(message).toMatch(/COMPATIBILITY\.md/);
  });
});
