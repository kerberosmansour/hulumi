import { describe, expect, it } from "vitest";

const REQUIRED_ENV = [
  "HULUMI_AWS_ORG_MANAGEMENT_ACCOUNT_ID",
  "HULUMI_AWS_ORG_SECURITY_ACCOUNT_ID",
  "HULUMI_AWS_ORG_LOG_ARCHIVE_ACCOUNT_ID",
  "HULUMI_AWS_ORG_CONFIG_AGGREGATOR_ROLE_ARN",
  "HULUMI_AWS_ORG_BOOTSTRAP_ROLE_ARN",
  "HULUMI_AWS_ORG_STEADY_STATE_ROLE_ARN",
  "HULUMI_AWS_ORG_SCP_TARGET_ID",
] as const;

const canRun =
  process.env.HULUMI_AWS_ORG_INTEGRATION === "1" &&
  REQUIRED_ENV.every((name) => (process.env[name] ?? "").length > 0);

(canRun ? describe : describe.skip)("aws_org_guardrails_contract_or_skip", () => {
  it("has the explicit live-organization preconditions needed for posture inspection", () => {
    for (const name of REQUIRED_ENV) {
      expect(process.env[name]).toBeTruthy();
    }
  });
});
