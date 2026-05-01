import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { EksAddonFoundation, EKS_ADDON_FOUNDATION_COMPONENT_TYPE } from "../src";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

beforeEach(() => {
  resetRegistrations();
});
afterEach(() => {
  vi.restoreAllMocks();
});

function addons() {
  return registrations.filter((r) => r.type === "aws:eks/addon:Addon");
}

describe("EksAddonFoundation — happy path", () => {
  test("emits one Addon resource per spec with exact pinned version", async () => {
    const c = new EksAddonFoundation("addons", {
      clusterName: "prod-eks",
      addons: [
        { name: "vpc-cni", version: "v1.20.0-eksbuild.1" },
        { name: "coredns", version: "v1.11.4-eksbuild.2" },
      ],
    });
    await settlePulumi();
    expect(registrations.some((r) => r.type === EKS_ADDON_FOUNDATION_COMPONENT_TYPE)).toBe(true);
    expect(addons()).toHaveLength(2);
    const versions = await valueOf(c.pinnedVersions);
    expect(versions).toEqual({
      "vpc-cni": "v1.20.0-eksbuild.1",
      coredns: "v1.11.4-eksbuild.2",
    });
  });
});

describe("EksAddonFoundation — invalid input refusals", () => {
  test('Scenario: Add-on version exact required ("latest" rejected)', () => {
    expect(
      () =>
        new EksAddonFoundation("c", {
          clusterName: "x",
          addons: [{ name: "vpc-cni", version: "latest" }],
        }),
    ).toThrow(/cannot be "latest"/);
  });

  test("non-semver version rejected", () => {
    expect(
      () =>
        new EksAddonFoundation("c", {
          clusterName: "x",
          addons: [{ name: "vpc-cni", version: "main" }],
        }),
    ).toThrow(/must match exact-version regex/);
  });

  test("Scenario: Add-on count bound enforced (33 → reject)", () => {
    const tooMany = [];
    for (let i = 0; i < 33; i++) {
      tooMany.push({ name: `addon-${i}`, version: "1.0.0" });
    }
    expect(
      () => new EksAddonFoundation("c", { clusterName: "x", addons: tooMany }),
    ).toThrow(/addons has 33.*max 32/);
  });

  test("empty addons rejected", () => {
    expect(
      () => new EksAddonFoundation("c", { clusterName: "x", addons: [] }),
    ).toThrow(/addons must be non-empty/);
  });
});
