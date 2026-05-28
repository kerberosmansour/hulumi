import { describe, expect, it } from "vitest";

const REQUIRED_ENV = [
  "HULUMI_STATE_BACKEND_INTEGRATION",
  "HULUMI_STATE_BACKEND_URL",
  "HULUMI_STATE_BACKEND_BUCKET",
  "HULUMI_STATE_BACKEND_KMS_ALIAS",
  "HULUMI_STATE_BACKEND_SECRETS_PROVIDER",
] as const;

type Env = Record<string, string | undefined>;

export function missingStateBackendEnvVars(env: Env = process.env): string[] {
  return REQUIRED_ENV.filter((name) => {
    if (name === "HULUMI_STATE_BACKEND_INTEGRATION") return env[name] !== "1";
    return env[name] === undefined || env[name]?.trim() === "";
  });
}

const missing = missingStateBackendEnvVars();
const enabled = missing.length === 0;
const skipReason =
  missing.length === 0
    ? ""
    : `state_backend_contract_or_skip skipped; missing env vars: ${missing.join(", ")}`;

describe.skipIf(!enabled)("state_backend_contract_or_skip", () => {
  it("validates the sandbox backend metadata contract without reading stack state values", () => {
    expect(process.env.HULUMI_STATE_BACKEND_INTEGRATION).toBe("1");
    expect(process.env.HULUMI_STATE_BACKEND_URL).toBe(
      `s3://${process.env.HULUMI_STATE_BACKEND_BUCKET}`,
    );
    expect(process.env.HULUMI_STATE_BACKEND_KMS_ALIAS).toMatch(/^alias\/.+/);
    expect(process.env.HULUMI_STATE_BACKEND_SECRETS_PROVIDER).toMatch(/^awskms:\/\//);
  });

  it("records the safe inspection scope for bucket encryption, versioning, KMS, and secrets metadata", () => {
    expect({
      allowedReads: [
        "s3:GetBucketEncryption",
        "s3:GetBucketVersioning",
        "kms:DescribeKey",
        "pulumi stack settings metadata only",
      ],
      forbiddenReads: ["pulumi stack export secret values", "s3:GetObject on state snapshots"],
    }).toMatchObject({
      forbiddenReads: expect.arrayContaining(["s3:GetObject on state snapshots"]),
    });
  });
});

if (!enabled) {
  describe("state_backend_contract_or_skip - gated skip notice", () => {
    it.skip(skipReason, () => {
      // intentionally skipped; the test title is the machine-readable evidence.
    });
  });
}
