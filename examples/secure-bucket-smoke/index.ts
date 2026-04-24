// Minimal @hulumi/baseline.aws.SecureBucket example. Creates one sandbox
// bucket and one startup-hardened bucket under the same Pulumi program.
// Not intended for real AWS deployment — the M2 smoke test exercises this
// file under @pulumi/pulumi's mock runtime.

import { SecureBucket } from "@hulumi/baseline/aws";

const logBucketArn = "arn:aws:s3:::hulumi-smoke-logs";

export const sandbox = new SecureBucket("smoke-sandbox", { tier: "sandbox" });

export const startupHardened = new SecureBucket("smoke-hardened", {
  tier: "startup-hardened",
  logBucketArn,
  objectLock: { mode: "governance", days: 30 },
});

export const sandboxArn = sandbox.arn;
export const hardenedArn = startupHardened.arn;
