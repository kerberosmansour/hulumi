import type * as pulumi from "@pulumi/pulumi";

export interface GitHubAppCredentialOutputs {
  secretArn: pulumi.Output<string>;
  iamReadPolicyArn: pulumi.Output<string>;
  /** Canonical SHA-256 binding for the declared repository and permission scope. */
  scopeDigest: pulumi.Output<string>;
  /** Filesystem path to packaged scripts/populate-github-app-secret.sh. */
  populateScriptPath: string;
  /** Filesystem path to packaged scripts/mint-github-app-token.sh. */
  mintScriptPath: string;
}
