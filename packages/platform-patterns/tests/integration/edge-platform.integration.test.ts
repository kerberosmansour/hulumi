import { describe, expect, it } from "vitest";

const GITHUB_REQUIRED_ENV = [
  "HULUMI_GITHUB_EDGE_INTEGRATION",
  "HULUMI_GITHUB_SANDBOX_OWNER",
  "HULUMI_GITHUB_SANDBOX_REPOSITORY",
] as const;

const AWS_REQUIRED_ENV = [
  "HULUMI_AWS_EDGE_INTEGRATION",
  "HULUMI_AWS_OIDC_PROVIDER_ARN",
  "HULUMI_AWS_DEPLOY_POLICY_ARN",
  "HULUMI_AWS_TEST_REGION",
] as const;

type Env = Record<string, string | undefined>;

export function missingEnvVars(env: Env = process.env): string[] {
  const missingGithub = GITHUB_REQUIRED_ENV.filter((name) => {
    if (name === "HULUMI_GITHUB_EDGE_INTEGRATION") return env[name] !== "1";
    return env[name] === undefined || env[name]?.trim() === "";
  });
  const missingAws = AWS_REQUIRED_ENV.filter((name) => {
    if (name === "HULUMI_AWS_EDGE_INTEGRATION") return env[name] !== "1";
    return env[name] === undefined || env[name]?.trim() === "";
  });
  return [...missingGithub, ...missingAws];
}

const missing = missingEnvVars();
const enabled = missing.length === 0;
const skipReason =
  missing.length === 0 ? "" : `Platform edge lane skipped; missing env vars: ${missing.join(", ")}`;

describe.skipIf(!enabled)("Platform edge integration readiness", () => {
  it("has the sandbox inputs needed for GitHub environment and AWS OIDC assertions", () => {
    expect(process.env.HULUMI_GITHUB_EDGE_INTEGRATION).toBe("1");
    expect(process.env.HULUMI_GITHUB_SANDBOX_OWNER).toBeDefined();
    expect(process.env.HULUMI_GITHUB_SANDBOX_REPOSITORY).toBeDefined();
    expect(process.env.HULUMI_AWS_EDGE_INTEGRATION).toBe("1");
    expect(process.env.HULUMI_AWS_OIDC_PROVIDER_ARN).toBeDefined();
    expect(process.env.HULUMI_AWS_DEPLOY_POLICY_ARN).toBeDefined();
    expect(process.env.HULUMI_AWS_TEST_REGION).toBeDefined();
  });

  it("records the cleanup contract for temporary GitHub/AWS resources", () => {
    expect({
      stackPrefix: "hulumi-edge-platform-",
      cleanup:
        "pulumi destroy; removeStack; verify test-prefixed GitHub environments and IAM role attachments are gone",
      manualFallback: "record repository, environment, role name, and policy attachment ids",
    }).toMatchObject({
      cleanup: expect.stringContaining("pulumi destroy"),
      manualFallback: expect.stringContaining("role name"),
    });
  });
});

if (!enabled) {
  describe("Platform edge integration readiness - gated skip notice", () => {
    it.skip(skipReason, () => {
      // intentionally skipped; the test title is the machine-readable evidence.
    });
  });
}
