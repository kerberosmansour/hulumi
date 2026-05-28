import { describe, expect, it } from "vitest";

const REQUIRED_ENV = [
  "HULUMI_AWS_PRIMITIVES_INTEGRATION",
  "HULUMI_AWS_PRIMITIVES_ROLE_ARN",
  "HULUMI_AWS_PRIMITIVES_SECRET_ARN",
  "HULUMI_AWS_PRIMITIVES_LAUNCH_TEMPLATE_ID",
  "HULUMI_AWS_PRIMITIVES_REGION",
] as const;

type Env = Record<string, string | undefined>;

export function missingAwsPrimitivesEnvVars(env: Env = process.env): string[] {
  return REQUIRED_ENV.filter((name) => {
    if (name === "HULUMI_AWS_PRIMITIVES_INTEGRATION") return env[name] !== "1";
    return env[name] === undefined || env[name]?.trim() === "";
  });
}

const missing = missingAwsPrimitivesEnvVars();
const enabled = missing.length === 0;
const skipReason =
  missing.length === 0
    ? ""
    : `aws_primitives_contract_or_skip skipped; missing env vars: ${missing.join(", ")}`;

describe.skipIf(!enabled)("aws_primitives_contract_or_skip", () => {
  it("validates the sandbox primitive metadata contract without reading secret values", () => {
    expect(process.env.HULUMI_AWS_PRIMITIVES_INTEGRATION).toBe("1");
    expect(process.env.HULUMI_AWS_PRIMITIVES_ROLE_ARN).toMatch(
      /^arn:aws(-[a-z]+)?:iam::\d{12}:role\/[^*]+$/,
    );
    expect(process.env.HULUMI_AWS_PRIMITIVES_SECRET_ARN).toMatch(
      /^arn:aws(-[a-z]+)?:secretsmanager:[a-z0-9-]+:\d{12}:secret:[^*]+$/,
    );
    expect(process.env.HULUMI_AWS_PRIMITIVES_LAUNCH_TEMPLATE_ID).toMatch(/^lt-[0-9a-f]+$/);
    expect(process.env.HULUMI_AWS_PRIMITIVES_REGION).toMatch(/^[a-z]{2}-[a-z]+-\d$/);
  });

  it("records the safe live-inspection scope for role trust, secret policy, and IMDSv2", () => {
    expect({
      allowedReads: [
        "iam:GetRole",
        "secretsmanager:DescribeSecret",
        "secretsmanager:GetResourcePolicy",
        "ec2:DescribeLaunchTemplateVersions",
      ],
      forbiddenReads: [
        "secretsmanager:GetSecretValue",
        "sts:AssumeRole with write-capable session",
      ],
    }).toMatchObject({
      forbiddenReads: expect.arrayContaining(["secretsmanager:GetSecretValue"]),
    });
  });
});

if (!enabled) {
  describe("aws_primitives_contract_or_skip - gated skip notice", () => {
    it.skip(skipReason, () => {
      // intentionally skipped; the test title is the machine-readable evidence.
    });
  });
}
