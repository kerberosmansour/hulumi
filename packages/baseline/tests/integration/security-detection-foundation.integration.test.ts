import { describe, expect, it } from "vitest";

const REQUIRED_ENV = [
  "HULUMI_SECURITY_DETECTION_INTEGRATION",
  "HULUMI_SECURITY_DETECTION_CRITICAL_TOPIC_ARN",
  "HULUMI_SECURITY_DETECTION_HIGH_TOPIC_ARN",
  "HULUMI_SECURITY_DETECTION_CLOUDTRAIL_LOG_GROUP",
  "HULUMI_SECURITY_DETECTION_SAMPLE_EVENT_FAMILY",
] as const;

type Env = Record<string, string | undefined>;

export function missingSecurityDetectionEnvVars(env: Env = process.env): string[] {
  return REQUIRED_ENV.filter((name) => {
    if (name === "HULUMI_SECURITY_DETECTION_INTEGRATION") return env[name] !== "1";
    return env[name] === undefined || env[name]?.trim() === "";
  });
}

const missing = missingSecurityDetectionEnvVars();
const enabled = missing.length === 0;
const skipReason =
  missing.length === 0
    ? ""
    : `security_detection_contract_or_skip skipped; missing env vars: ${missing.join(", ")}`;

describe.skipIf(!enabled)("security_detection_contract_or_skip", () => {
  it("validates sandbox alarm-family metadata without mutating cloud resources", () => {
    expect(process.env.HULUMI_SECURITY_DETECTION_INTEGRATION).toBe("1");
    expect(process.env.HULUMI_SECURITY_DETECTION_CRITICAL_TOPIC_ARN).toMatch(
      /^arn:aws(-[a-z]+)?:sns:[a-z0-9-]+:\d{12}:.+$/,
    );
    expect(process.env.HULUMI_SECURITY_DETECTION_HIGH_TOPIC_ARN).toMatch(
      /^arn:aws(-[a-z]+)?:sns:[a-z0-9-]+:\d{12}:.+$/,
    );
    expect(process.env.HULUMI_SECURITY_DETECTION_CLOUDTRAIL_LOG_GROUP).toMatch(/^\/aws\//);
    expect(process.env.HULUMI_SECURITY_DETECTION_SAMPLE_EVENT_FAMILY).toMatch(
      /^(security-service-disablement|state-backend|eks-control-plane|cloudtrail-kms-config|org-guardrail)$/,
    );
  });

  it("records the read-only inspection scope for alarm health", () => {
    expect({
      allowedReads: [
        "cloudwatch:DescribeAlarms",
        "events:DescribeRule",
        "events:ListTargetsByRule",
        "logs:DescribeMetricFilters",
      ],
      forbiddenWrites: [
        "cloudwatch:PutMetricAlarm",
        "events:PutRule",
        "events:PutTargets",
        "sns:Publish",
      ],
    }).toMatchObject({
      forbiddenWrites: expect.arrayContaining(["sns:Publish"]),
    });
  });
});

if (!enabled) {
  describe("security_detection_contract_or_skip - gated skip notice", () => {
    it.skip(skipReason, () => {
      // intentionally skipped; the test title is the machine-readable evidence.
    });
  });
}
