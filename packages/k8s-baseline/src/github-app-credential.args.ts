import type * as pulumi from "@pulumi/pulumi";

export type GitHubAppPermission = "read" | "write" | "admin";

export interface GitHubAppCredentialArgs {
  /**
   * GitHub `owner/name` repositories eligible for tokens. Refused if empty,
   * duplicated, malformed, over 500 entries, or mixed with `"*"`. `["*"]`
   * permits choosing any installation repository, while each minted token is
   * still restricted to its one requested repository.
   */
  repos: string[];
  /** GitHub App token permissions. Refused if empty, malformed, or over 100 entries. */
  permissions: Record<string, GitHubAppPermission>;
  /** KMS alias for at-rest encryption of the SM secret. Required, no default. */
  kmsKeyAlias: pulumi.Input<string>;
  /**
   * Exact KMS key ARN for the broker's constrained decrypt permission. When
   * omitted, the provider resolves `kmsKeyAlias` to its target key ARN.
   */
  kmsKeyArn?: pulumi.Input<string>;
  /** SM secret name. Default: `<componentName>-github-app`. Refused if contains `/` or `..`. */
  secretName?: string;
  /** IAM role principal that should be allowed to invoke the exact token broker. It never receives raw-secret access. */
  iamPrincipalArn?: pulumi.Input<string>;
}
