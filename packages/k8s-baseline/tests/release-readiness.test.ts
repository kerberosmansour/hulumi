// Release-readiness BDD tests for `@hulumi/k8s-baseline` (Runbook
// `hulumi-operations-k8s-security` Milestone 1).
//
// Allow-list deviation rationale: M1's BDD acceptance table requires
// static-shape assertions on `.github/workflows/release.yml`,
// `packages/k8s-baseline/package.json`, and
// `packages/k8s-baseline/COMPATIBILITY.md`. The k8s-baseline vitest
// config excludes `tests/integration/**` from the default `pnpm test`
// run, so these scenarios cannot live under `tests/integration/kind/`
// without becoming dead checks. A new top-level package test file is
// the smallest deviation that encodes the BDD contract correctly. The
// kind- and EKS-gated scenarios remain in their explicit integration
// paths (`tests/integration/kind/release-readiness.kind.test.ts`,
// `tests/integration/eks/release-readiness.eks.test.ts`).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { TESTED_VERSIONS } from "../src/compatibility";

const repoRoot = resolve(__dirname, "..", "..", "..");

function readRepoFile(relPath: string): string {
  return readFileSync(resolve(repoRoot, relPath), "utf8");
}

describe("Feature: K8s package release readiness (Runbook M1)", () => {
  describe("Scenario: Release packs four packages", () => {
    it("release workflow pack loop names baseline, policies, drift, k8s-baseline", () => {
      const yml = readRepoFile(".github/workflows/release.yml");

      expect(yml).toMatch(/baseline policies drift k8s-baseline/);
      expect(yml).toMatch(/@hulumi\/k8s-baseline publish/);
    });

    it("release workflow generates a CycloneDX SBOM for k8s-baseline", () => {
      const yml = readRepoFile(".github/workflows/release.yml");
      expect(yml).toMatch(/sbom-k8s-baseline\.cdx\.json/);
      expect(yml).toMatch(/cyclonedx-npm.*packages\/k8s-baseline/);
    });
  });

  describe("Scenario: K8s package publishable", () => {
    it("k8s-baseline package.json drops `private:true` and keeps provenance:true", () => {
      const pkg = JSON.parse(readRepoFile("packages/k8s-baseline/package.json")) as {
        private?: boolean;
        publishConfig?: { provenance?: boolean; access?: string };
      };

      expect(pkg.private === undefined || pkg.private === false).toBe(true);
      expect(pkg.publishConfig?.provenance).toBe(true);
      expect(pkg.publishConfig?.access).toBe("public");
    });
  });

  describe("Scenario: Compatibility docs match code (invariant)", () => {
    it("COMPATIBILITY.md lists every chart name and version in TESTED_VERSIONS", () => {
      const compat = readRepoFile("packages/k8s-baseline/COMPATIBILITY.md");

      for (const [chartName, versions] of Object.entries(TESTED_VERSIONS)) {
        expect(
          compat,
          `COMPATIBILITY.md is missing chart "${chartName}" — keep in lockstep with src/compatibility.ts`,
        ).toMatch(new RegExp(`\\b${chartName}\\b`));

        for (const version of versions) {
          expect(
            compat,
            `COMPATIBILITY.md is missing version "${version}" for chart "${chartName}"`,
          ).toMatch(new RegExp(version.replace(/\./g, "\\.")));
        }
      }
    });
  });
});
