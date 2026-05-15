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

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { TESTED_VERSIONS } from "../src/compatibility";

const repoRoot = resolve(__dirname, "..", "..", "..");

function readRepoFile(relPath: string): string {
  return readFileSync(resolve(repoRoot, relPath), "utf8");
}

const PUBLISHABLE_PACKAGES = [
  "baseline",
  "policies",
  "drift",
  "k8s-baseline",
  "cloudflare-baseline",
  "platform-patterns",
] as const;
const CANONICAL_REPO_URL = "https://github.com/kerberosmansour/hulumi";

interface PublishablePackageJson {
  name?: string;
  version?: string;
  private?: boolean;
  license?: string;
  publishConfig?: { provenance?: boolean; access?: string };
  repository?: { type?: string; url?: string; directory?: string } | string;
  bugs?: { url?: string } | string;
  homepage?: string;
}

function readPackageJson(pkg: string): PublishablePackageJson {
  return JSON.parse(readRepoFile(`packages/${pkg}/package.json`)) as PublishablePackageJson;
}

describe("Feature: K8s package release readiness (Runbook M1)", () => {
  describe("Scenario: Release packs six packages", () => {
    it("release workflow pack loop names every publishable package", () => {
      const yml = readRepoFile(".github/workflows/release.yml");

      expect(yml).toContain(
        "baseline policies drift k8s-baseline cloudflare-baseline platform-patterns",
      );
      for (const pkg of PUBLISHABLE_PACKAGES) {
        expect(yml).toContain(`@hulumi/${pkg} publish`);
      }
    });

    it("release workflow generates a CycloneDX SBOM for every publishable package", () => {
      const yml = readRepoFile(".github/workflows/release.yml");
      // SBOM output filename per package: post-cdxgen-swap, release.yml
      // writes `.release-artifacts/sbom-${pkg}.cdx.json` inside a loop
      // that iterates the publishable package set. cdxgen is the
      // multi-package-manager CycloneDX generator that reads
      // pnpm-lock.yaml natively (sidesteps the Corepack interception
      // that broke the previous @cyclonedx/cyclonedx-npm approach).
      expect(yml).toContain(
        "for pkg in baseline policies drift k8s-baseline cloudflare-baseline platform-patterns",
      );
      expect(yml).toMatch(/@cyclonedx\/cdxgen@11\.10\.0/);
      // The output-file template uses the loop variable.
      expect(yml).toMatch(/sbom-\$\{pkg\}\.cdx\.json/);
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

describe("Feature: Atomic six-package publish-readiness", () => {
  describe("Scenario: All six packages declare publish-ready manifest shape", () => {
    it.each(PUBLISHABLE_PACKAGES)(
      "@hulumi/%s package.json has private unset/false and publishConfig.access=public + provenance=true",
      (pkg) => {
        const manifest = readPackageJson(pkg);

        expect(
          manifest.private,
          `packages/${pkg}/package.json has "private": true — npm publish will refuse`,
        ).not.toBe(true);
        expect(manifest.publishConfig?.access).toBe("public");
        expect(manifest.publishConfig?.provenance).toBe(true);
        expect(manifest.license).toBe("Apache-2.0");
      },
    );

    it.each(PUBLISHABLE_PACKAGES)(
      "@hulumi/%s declares repository, bugs, and homepage pointing to the canonical GitHub repo",
      (pkg) => {
        const manifest = readPackageJson(pkg);

        const repoUrl =
          typeof manifest.repository === "string" ? manifest.repository : manifest.repository?.url;
        expect(repoUrl, `packages/${pkg}/package.json missing repository.url`).toBeDefined();
        expect(repoUrl).toContain(CANONICAL_REPO_URL);

        const bugsUrl = typeof manifest.bugs === "string" ? manifest.bugs : manifest.bugs?.url;
        expect(bugsUrl, `packages/${pkg}/package.json missing bugs.url`).toBeDefined();
        expect(bugsUrl).toContain(CANONICAL_REPO_URL);

        expect(manifest.homepage, `packages/${pkg}/package.json missing homepage`).toBeDefined();
        expect(manifest.homepage).toContain(CANONICAL_REPO_URL);
      },
    );
  });

  describe("Scenario: All six packages ship the same atomic version", () => {
    it("all publishable packages declare the same version (atomic-release invariant)", () => {
      const versions = PUBLISHABLE_PACKAGES.map((pkg) => ({
        pkg,
        version: readPackageJson(pkg).version,
      }));

      const distinct = new Set(versions.map((v) => v.version));
      expect(distinct.size, `version skew across packages: ${JSON.stringify(versions)}`).toBe(1);
    });

    it("the atomic version matches the latest CHANGELOG entry (1.3.x)", () => {
      const changelog = readRepoFile("CHANGELOG.md");
      const versions = PUBLISHABLE_PACKAGES.map((pkg) => readPackageJson(pkg).version);
      // Latest changelog entry is the v1.3 train; assert all packages are 1.3.x.
      for (const version of versions) {
        expect(version, `package version "${version}" is not on the 1.3.x train`).toMatch(
          /^1\.3\.\d+/,
        );
      }
      // And the changelog has a [1.3.0] entry corresponding to that train.
      expect(changelog).toMatch(/\[1\.3\.0\]/);
    });
  });

  describe("Scenario: v1.3 security advisory registration is prepared", () => {
    it("release docs enumerate GHSA candidates before package publication", () => {
      const advisory = readRepoFile("docs/release/v1.3.0-security-advisories.md");

      expect(advisory).toContain("GitHub's repository security advisory API");
      expect(advisory).toContain("@hulumi/baseline");
      expect(advisory).toContain("@hulumi/policies");
      expect(advisory).toContain("@hulumi/drift");
      expect(advisory).toContain("< 1.3.0");
      expect(advisory).toContain("Patched version");
    });
  });

  describe("Scenario: Per-package README + LICENSE present and aligned with repo root", () => {
    it.each(PUBLISHABLE_PACKAGES)(
      "@hulumi/%s ships a non-empty README.md adjacent to source",
      (pkg) => {
        const readmePath = resolve(repoRoot, "packages", pkg, "README.md");
        expect(existsSync(readmePath), `packages/${pkg}/README.md is missing`).toBe(true);
        const stat = statSync(readmePath);
        expect(stat.size, `packages/${pkg}/README.md is empty`).toBeGreaterThan(0);
      },
    );

    it.each(PUBLISHABLE_PACKAGES)(
      "@hulumi/%s ships a LICENSE byte-identical to the repo-root LICENSE",
      (pkg) => {
        const root = readRepoFile("LICENSE");
        const adjacentPath = resolve(repoRoot, "packages", pkg, "LICENSE");
        expect(
          existsSync(adjacentPath),
          `packages/${pkg}/LICENSE missing — Apache-2.0 expects LICENSE adjacent to source`,
        ).toBe(true);
        const adjacent = readRepoFile(`packages/${pkg}/LICENSE`);
        expect(adjacent).toBe(root);
      },
    );
  });
});
