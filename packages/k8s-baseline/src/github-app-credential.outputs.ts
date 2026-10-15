import type * as pulumi from "@pulumi/pulumi";

export interface GitHubAppCredentialOutputs {
  secretArn: pulumi.Output<string>;
  /** @deprecated Compatibility alias for iamInvokePolicyArn; it no longer grants secret read access. */
  iamReadPolicyArn: pulumi.Output<string>;
  /** Invoke-only IAM policy for the exact scope-enforcing broker function. */
  iamInvokePolicyArn: pulumi.Output<string>;
  brokerFunctionArn: pulumi.Output<string>;
  brokerFunctionName: pulumi.Output<string>;
  /** Canonical SHA-256 binding for the declared repository and permission scope. */
  scopeDigest: pulumi.Output<string>;
  /** Filesystem path to packaged scripts/populate-github-app-secret.sh. */
  populateScriptPath: string;
  /** Filesystem path to packaged scripts/mint-github-app-token.sh. */
  mintScriptPath: string;
}
