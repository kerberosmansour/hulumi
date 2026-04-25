// Minimal @hulumi/baseline.aws.AccountFoundation example. Creates one
// sandbox stack and one startup-hardened stack under the same Pulumi
// program. Not intended for unattended real-AWS deployment — the M3
// weekly integration workflow drives this through Pulumi Automation API
// with OIDC + guaranteed teardown.

import { AccountFoundation } from "@hulumi/baseline/aws";

const IAC_ROLE_ARN =
  process.env.HULUMI_IAC_ROLE_ARN ?? "arn:aws:iam::111122223333:role/hulumi-sandbox-iac-role";

export const sandbox = new AccountFoundation("smoke-sandbox", {
  tier: "sandbox",
  iacRoleArn: IAC_ROLE_ARN,
});

export const startupHardened = new AccountFoundation("smoke-hardened", {
  tier: "startup-hardened",
  iacRoleArn: IAC_ROLE_ARN,
  orgAccountIds: ["111111111111"],
});

export const sandboxDetectorId = sandbox.guardDutyDetectorId;
export const hardenedDetectorId = startupHardened.guardDutyDetectorId;
