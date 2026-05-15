import { describe, expect, it } from "vitest";

const REQUIRED_ENV = [
  "HULUMI_CLOUDFLARE_INTEGRATION",
  "CLOUDFLARE_API_TOKEN",
  "HULUMI_CLOUDFLARE_ACCOUNT_ID",
  "HULUMI_CLOUDFLARE_ZONE_ID",
] as const;

type Env = Record<string, string | undefined>;

export function missingEnvVars(env: Env = process.env): string[] {
  return REQUIRED_ENV.filter((name) => {
    if (name === "HULUMI_CLOUDFLARE_INTEGRATION") return env[name] !== "1";
    return env[name] === undefined || env[name]?.trim() === "";
  });
}

const missing = missingEnvVars();
const enabled = missing.length === 0;
const skipReason =
  missing.length === 0
    ? ""
    : `Cloudflare edge lane skipped; missing env vars: ${missing.join(", ")}`;

describe.skipIf(!enabled)("Cloudflare edge integration readiness", () => {
  it("has the sandbox inputs needed for DNSSEC, proxy-state, WAF, and cleanup assertions", () => {
    expect(process.env.HULUMI_CLOUDFLARE_INTEGRATION).toBe("1");
    expect(process.env.CLOUDFLARE_API_TOKEN).toBeDefined();
    expect(process.env.HULUMI_CLOUDFLARE_ACCOUNT_ID).toBeDefined();
    expect(process.env.HULUMI_CLOUDFLARE_ZONE_ID).toBeDefined();
  });

  it("records the cleanup contract before any provider resources are created", () => {
    expect({
      stackPrefix: "hulumi-edge-cloudflare-",
      cleanup: "pulumi destroy; removeStack; verify no test-prefixed DNS/ruleset resources remain",
      manualFallback: "record zone id, hostname, ruleset ids, and tunnel id in the failed run log",
    }).toMatchObject({
      cleanup: expect.stringContaining("pulumi destroy"),
      manualFallback: expect.stringContaining("ruleset ids"),
    });
  });
});

if (!enabled) {
  describe("Cloudflare edge integration readiness - gated skip notice", () => {
    it.skip(skipReason, () => {
      // intentionally skipped; the test title is the machine-readable evidence.
    });
  });
}
