import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "..", "..");

function readText(path: string): string {
  return readFileSync(join(repoRoot, path), "utf8");
}

function readJson<T>(path: string): T {
  return JSON.parse(readText(path)) as T;
}

interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

describe("M5 edge-platform integration contract", () => {
  it("adds opt-in integration scripts and skip harnesses for Cloudflare and platform packages", () => {
    const cloudflarePkg = readJson<PackageJson>("packages/cloudflare-baseline/package.json");
    const platformPkg = readJson<PackageJson>("packages/platform-patterns/package.json");

    expect(cloudflarePkg.scripts?.["test:integration"]).toBe("vitest run tests/integration");
    expect(platformPkg.scripts?.["test:integration"]).toBe("vitest run tests/integration");

    const cloudflareIntegrationPath =
      "packages/cloudflare-baseline/tests/integration/edge-platform.integration.test.ts";
    const platformIntegrationPath =
      "packages/platform-patterns/tests/integration/edge-platform.integration.test.ts";

    expect(existsSync(join(repoRoot, cloudflareIntegrationPath))).toBe(true);
    expect(existsSync(join(repoRoot, platformIntegrationPath))).toBe(true);

    const cloudflareIntegration = readText(cloudflareIntegrationPath);
    for (const envName of [
      "HULUMI_CLOUDFLARE_INTEGRATION",
      "CLOUDFLARE_API_TOKEN",
      "HULUMI_CLOUDFLARE_ACCOUNT_ID",
      "HULUMI_CLOUDFLARE_ZONE_ID",
    ]) {
      expect(cloudflareIntegration).toContain(envName);
    }
    expect(cloudflareIntegration).toContain("missingEnvVars");

    const platformIntegration = readText(platformIntegrationPath);
    for (const envName of [
      "HULUMI_GITHUB_EDGE_INTEGRATION",
      "HULUMI_GITHUB_SANDBOX_OWNER",
      "HULUMI_AWS_EDGE_INTEGRATION",
      "HULUMI_AWS_OIDC_PROVIDER_ARN",
    ]) {
      expect(platformIntegration).toContain(envName);
    }
    expect(platformIntegration).toContain("missingEnvVars");
  });

  it("adds an edge-platform smoke example that imports built package entrypoints", () => {
    const examplePkgPath = "examples/edge-platform-smoke/package.json";
    expect(existsSync(join(repoRoot, examplePkgPath))).toBe(true);

    const examplePkg = readJson<PackageJson>(examplePkgPath);
    expect(examplePkg.dependencies?.["@hulumi/cloudflare-baseline"]).toBe("workspace:*");
    expect(examplePkg.dependencies?.["@hulumi/platform-patterns"]).toBe("workspace:*");
    expect(examplePkg.dependencies?.["@hulumi/policies"]).toBe("workspace:*");

    const exampleIndex = readText("examples/edge-platform-smoke/index.ts");
    expect(exampleIndex).toContain('from "@hulumi/cloudflare-baseline"');
    expect(exampleIndex).toContain('from "@hulumi/platform-patterns"');
    expect(exampleIndex).toContain('from "@hulumi/policies"');
    expect(exampleIndex).toContain("GitHubAwsOidcDeploymentRole");
    expect(exampleIndex).not.toContain("AWS_ACCESS_KEY_ID");
    expect(exampleIndex).not.toContain("AWS_SECRET_ACCESS_KEY");
  });

  it("documents edge integration lanes, cookbooks, and battle-test handoff fields", () => {
    const integrationDocs = readText("docs/integration-testing.md");
    for (const phrase of [
      "Edge platform integration lanes",
      "Cloudflare edge lane",
      "GitHub deployment lane",
      "AWS origin lane",
      "docs/cookbooks/hulumi-edge-platform-battle-test.md",
    ]) {
      expect(integrationDocs).toContain(phrase);
    }

    for (const cookbook of [
      "docs/cookbooks/cloudflare-tunnel-eks-service.md",
      "docs/cookbooks/cloudflare-aop-alb-origin.md",
      "docs/cookbooks/github-oidc-deployment-pipeline.md",
      "docs/cookbooks/origin-ip-rotation-cloudflare-onboarding.md",
      "docs/cookbooks/build-provenance-edge-platform.md",
      "docs/cookbooks/hulumi-edge-platform-battle-test.md",
    ]) {
      expect(existsSync(join(repoRoot, cookbook))).toBe(true);
    }

    const handoff = readText("docs/cookbooks/hulumi-edge-platform-battle-test.md");
    for (const phrase of [
      "Package versions",
      "Cloudflare plan",
      "GitHub plan",
      "AWS runtime",
      "Unsupported controls",
      "Battle-test pending",
      "Mock/policy-only",
    ]) {
      expect(handoff).toContain(phrase);
    }
  });
});
