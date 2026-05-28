import { PulumiStateBackendFoundation } from "@hulumi/platform-patterns";

export const stateBackend = new PulumiStateBackendFoundation("state-smoke", {
  tier: "startup-hardened",
  bucketName: process.env.HULUMI_STATE_BACKEND_BUCKET ?? "hulumi-state-example",
  kmsAliasName: process.env.HULUMI_STATE_BACKEND_KMS_ALIAS ?? "alias/hulumi/state/example",
  enableLeaseTable: true,
  objectLock: true,
});

export const backendUrl = stateBackend.backendUrl;
export const secretsProviderHint = stateBackend.secretsProviderHint;
export const drPosture = stateBackend.drPosture;
