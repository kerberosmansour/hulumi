import * as path from "path";
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import type { GitHubAppCredentialArgs } from "./github-app-credential.args";
import type { GitHubAppCredentialOutputs } from "./github-app-credential.outputs";

export const GITHUB_APP_CREDENTIAL_COMPONENT_TYPE = "hulumi:k8s:GitHubAppCredential";

const SCRIPTS_DIR = path.resolve(__dirname, "..", "scripts");

function validateArgs(name: string, args: GitHubAppCredentialArgs): void {
  if (args.repos === undefined || args.repos.length === 0) {
    throw new Error(`GitHubAppCredential: repos must be non-empty (component "${name}")`);
  }
  if (args.permissions === undefined || Object.keys(args.permissions).length === 0) {
    throw new Error(`GitHubAppCredential: permissions must be non-empty (component "${name}")`);
  }
  if (args.kmsKeyAlias === undefined) {
    throw new Error(
      `GitHubAppCredential: kmsKeyAlias is required (no default; opt-out is forbidden) (component "${name}")`,
    );
  }
  if (args.secretName !== undefined) {
    if (typeof args.secretName !== "string" || args.secretName.trim() === "") {
      throw new Error(`GitHubAppCredential: secretName must be a non-empty string when supplied`);
    }
    if (args.secretName.includes("/") || args.secretName.includes("..")) {
      throw new Error(
        `GitHubAppCredential: secretName "${args.secretName}" must not contain "/" or ".."`,
      );
    }
  }
}

export class GitHubAppCredential
  extends pulumi.ComponentResource
  implements GitHubAppCredentialOutputs
{
  public readonly secretArn: pulumi.Output<string>;
  public readonly iamReadPolicyArn: pulumi.Output<string>;
  public readonly populateScriptPath: string;
  public readonly mintScriptPath: string;

  constructor(
    name: string,
    args: GitHubAppCredentialArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super(GITHUB_APP_CREDENTIAL_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    validateArgs(name, args);

    const secretName = args.secretName ?? `${name}-github-app`;
    const parent = { parent: this } as const;

    const secret = new aws.secretsmanager.Secret(
      `${name}-secret`,
      {
        name: secretName,
        description: `GitHub App credential (app_id + private_key) for ${args.repos.join(", ")}`,
        kmsKeyId: args.kmsKeyAlias,
        tags: {
          "hulumi:component": "GitHubAppCredential",
        },
      },
      parent,
    );

    const policyDoc = secret.arn.apply((arn: string) =>
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
            Resource: arn,
          },
        ],
      }),
    );

    const policy = new aws.iam.Policy(
      `${name}-read-policy`,
      {
        name: `${secretName}-read`,
        description: `Read access to the ${secretName} GitHub App credential.`,
        policy: policyDoc,
      },
      parent,
    );

    if (args.iamPrincipalArn !== undefined) {
      // We attach to a role assuming iamPrincipalArn is a role ARN. For
      // user/group ARNs, the consumer attaches manually via the policy ARN
      // output.
      new aws.iam.RolePolicyAttachment(
        `${name}-attachment`,
        {
          role: pulumi
            .output(args.iamPrincipalArn)
            .apply((arn: string) => arn.split("/").pop() ?? arn),
          policyArn: policy.arn,
        },
        parent,
      );
    }

    this.secretArn = secret.arn;
    this.iamReadPolicyArn = policy.arn;
    this.populateScriptPath = path.join(SCRIPTS_DIR, "populate-github-app-secret.sh");
    this.mintScriptPath = path.join(SCRIPTS_DIR, "mint-github-app-token.sh");

    this.registerOutputs({
      secretArn: this.secretArn,
      iamReadPolicyArn: this.iamReadPolicyArn,
      populateScriptPath: this.populateScriptPath,
      mintScriptPath: this.mintScriptPath,
    });
  }
}
