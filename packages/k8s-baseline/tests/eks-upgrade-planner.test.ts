import { describe, expect, test } from "vitest";

import { planUpgrade, reportToMarkdown, type EksUpgradeInventory } from "../src";

const baseInv: EksUpgradeInventory = {
  clusterName: "prod-eks",
  currentK8sVersion: "1.30",
  targetK8sVersion: "1.31",
  currentSupportStatus: "standard",
  targetSupportStatus: "standard",
  addons: [
    {
      name: "vpc-cni",
      currentVersion: "v1.19.0",
      targetVersion: "v1.20.0",
      targetCompatibleWithK8sTarget: true,
    },
  ],
  backupEvidence: { recent: true, mostRecentISO: "2026-04-30T05:00:00Z" },
};

describe("EksUpgradePlanner — verdict matrix", () => {
  test("Scenario: safe upgrade (one minor, supported, compatible add-ons, recent backup)", () => {
    const r = planUpgrade(baseInv);
    expect(r.verdict).toBe("safe");
    expect(r.reasons).toEqual([]);
  });

  test("Scenario: Unsupported target version not safe", () => {
    const r = planUpgrade({ ...baseInv, targetSupportStatus: "unsupported" });
    expect(r.verdict).toBe("unsafe");
    expect(r.reasons.some((s) => /unsupported/.test(s))).toBe(true);
  });

  test("Scenario: Extended support warns but does not block", () => {
    const r = planUpgrade({ ...baseInv, currentSupportStatus: "extended" });
    expect(r.verdict).toBe("safe");
    expect(r.warnings.some((s) => /Extended Support/.test(s))).toBe(true);
  });

  test("Scenario: Skipping minor versions rejected", () => {
    const r = planUpgrade({ ...baseInv, currentK8sVersion: "1.28", targetK8sVersion: "1.31" });
    expect(r.verdict).toBe("unsafe");
    expect(r.reasons.some((s) => /Skipping minor/.test(s))).toBe(true);
  });

  test("Scenario: Downgrade rejected", () => {
    const r = planUpgrade({ ...baseInv, currentK8sVersion: "1.31", targetK8sVersion: "1.30" });
    expect(r.verdict).toBe("unsafe");
    expect(r.reasons.some((s) => /Downgrade/.test(s))).toBe(true);
  });

  test("Scenario: Backup preflight required (no recent backup → unsafe)", () => {
    const r = planUpgrade({ ...baseInv, backupEvidence: { recent: false } });
    expect(r.verdict).toBe("unsafe");
    expect(r.reasons.some((s) => /Backup preflight/.test(s))).toBe(true);
  });

  test("Scenario: Add-on incompatible with target → unsafe", () => {
    const r = planUpgrade({
      ...baseInv,
      addons: [
        {
          name: "vpc-cni",
          currentVersion: "v1.19.0",
          targetVersion: "v1.20.0",
          targetCompatibleWithK8sTarget: false,
        },
      ],
    });
    expect(r.verdict).toBe("unsafe");
    expect(r.addonNotes[0].status).toBe("incompatible");
  });

  test("Unknown target support → degraded with warning", () => {
    const r = planUpgrade({ ...baseInv, targetSupportStatus: "unknown" });
    expect(r.verdict).toBe("degraded");
    expect(r.warnings.some((s) => /support status is unknown/.test(s))).toBe(true);
  });

  test("Bound: 33 add-ons → rejects", () => {
    const tooMany: Array<{
      name: string;
      currentVersion: string;
      targetVersion: string;
      targetCompatibleWithK8sTarget: boolean;
    }> = [];
    for (let i = 0; i < 33; i++) {
      tooMany.push({
        name: `a-${i}`,
        currentVersion: "v1.0.0",
        targetVersion: "v1.1.0",
        targetCompatibleWithK8sTarget: true,
      });
    }
    expect(() => planUpgrade({ ...baseInv, addons: tooMany })).toThrow(/max 32 per call/);
  });

  test("reportToMarkdown produces a structured report", () => {
    const r = planUpgrade(baseInv);
    const md = reportToMarkdown(r);
    expect(md).toMatch(/# EKS Upgrade Report — prod-eks/);
    expect(md).toMatch(/\*\*Verdict\*\*: `safe`/);
  });
});
