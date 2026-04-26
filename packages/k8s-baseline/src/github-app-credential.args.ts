import type * as pulumi from "@pulumi/pulumi";

export type GitHubAppPermission = "read" | "write" | "admin";

export interface GitHubAppCredentialArgs {
  /** GitHub repos the App is installed on. Refused if empty. `["*"]` means all installation repos. */
  repos: string[];
  /** GitHub App permissions. Refused if empty. */
  permissions: Record<string, GitHubAppPermission>;
  /** KMS alias for at-rest encryption of the SM secret. Required, no default. */
  kmsKeyAlias: pulumi.Input<string>;
  /** SM secret name. Default: `<componentName>-github-app`. Refused if contains `/` or `..`. */
  secretName?: string;
  /** IAM principal that should get secretsmanager:GetSecretValue. Optional; consumer typically supplies the BuildKit IAM role ARN. */
  iamPrincipalArn?: pulumi.Input<string>;
}
