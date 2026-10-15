import * as path from "path";
import { createHash } from "node:crypto";
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import type { GitHubAppCredentialArgs } from "./github-app-credential.args";
import type { GitHubAppCredentialOutputs } from "./github-app-credential.outputs";

export const GITHUB_APP_CREDENTIAL_COMPONENT_TYPE = "hulumi:k8s:GitHubAppCredential";

const SCRIPTS_DIR = path.resolve(__dirname, "..", "scripts");
const SCOPE_TAG = "hulumi:github-app-scope-sha256";
const MAX_REPOSITORIES = 500;
const MAX_PERMISSIONS = 100;
const MAX_SCOPE_BYTES = 16 * 1024;
const OWNER_REPOSITORY = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9_.-]{1,100}$/;
const PERMISSION_NAME = /^[a-z][a-z0-9_]{0,63}$/;
const PERMISSION_LEVELS = new Set(["read", "write", "admin"]);

interface NormalizedScope {
  repos: string[];
  permissions: Record<string, "read" | "write" | "admin">;
  digest: string;
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeScope(name: string, args: GitHubAppCredentialArgs): NormalizedScope {
  if (!Array.isArray(args.repos) || args.repos.length === 0) {
    throw new Error(`GitHubAppCredential: repos must be non-empty (component "${name}")`);
  }
  if (args.repos.length > MAX_REPOSITORIES) {
    throw new Error(`GitHubAppCredential: repos cannot exceed ${MAX_REPOSITORIES} entries`);
  }
  const repos = [...args.repos];
  if (new Set(repos).size !== repos.length) {
    throw new Error("GitHubAppCredential: repos must not contain duplicate entries");
  }
  if (repos.includes("*") && repos.length !== 1) {
    throw new Error("GitHubAppCredential: wildcard repo must be the only allowlist entry");
  }
  for (const repo of repos) {
    const repositoryName = repo.split("/")[1];
    if (
      repo !== "*" &&
      (!OWNER_REPOSITORY.test(repo) || repositoryName === "." || repositoryName === "..")
    ) {
      throw new Error(`GitHubAppCredential: repo "${repo}" must use a safe owner/name form`);
    }
  }

  if (
    args.permissions === null ||
    typeof args.permissions !== "object" ||
    Array.isArray(args.permissions)
  ) {
    throw new Error(`GitHubAppCredential: permissions must be a non-empty object`);
  }
  const permissionEntries = Object.entries(args.permissions);
  if (permissionEntries.length === 0) {
    throw new Error(`GitHubAppCredential: permissions must be non-empty (component "${name}")`);
  }
  if (permissionEntries.length > MAX_PERMISSIONS) {
    throw new Error(`GitHubAppCredential: permissions cannot exceed ${MAX_PERMISSIONS} entries`);
  }
  for (const [permission, level] of permissionEntries) {
    if (!PERMISSION_NAME.test(permission) || !PERMISSION_LEVELS.has(level)) {
      throw new Error(
        `GitHubAppCredential: permission "${permission}" must use a safe name and read, write, or admin level`,
      );
    }
  }

  const sortedPermissions = Object.fromEntries(
    permissionEntries.sort(([left], [right]) => compareAscii(left, right)),
  ) as Record<string, "read" | "write" | "admin">;
  const canonical = JSON.stringify({
    permissions: sortedPermissions,
    repos: repos.sort(compareAscii),
  });
  if (Buffer.byteLength(canonical, "utf8") > MAX_SCOPE_BYTES) {
    throw new Error(`GitHubAppCredential: canonical scope cannot exceed ${MAX_SCOPE_BYTES} bytes`);
  }
  return {
    repos: [...repos],
    permissions: sortedPermissions,
    digest: createHash("sha256").update(canonical).digest("hex"),
  };
}

function validateArgs(name: string, args: GitHubAppCredentialArgs): void {
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
  public readonly scopeDigest: pulumi.Output<string>;
  public readonly populateScriptPath: string;
  public readonly mintScriptPath: string;

  constructor(name: string, args: GitHubAppCredentialArgs, opts?: pulumi.ComponentResourceOptions) {
    super(GITHUB_APP_CREDENTIAL_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    validateArgs(name, args);
    const scope = normalizeScope(name, args);

    const secretName = args.secretName ?? `${name}-github-app`;
    const parent = { parent: this } as const;

    const secret = new aws.secretsmanager.Secret(
      `${name}-secret`,
      {
        name: secretName,
        description: `GitHub App credential (app_id + private_key) for ${scope.repos.join(", ")}`,
        kmsKeyId: args.kmsKeyAlias,
        tags: {
          "hulumi:component": "GitHubAppCredential",
          [SCOPE_TAG]: scope.digest,
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
    this.scopeDigest = pulumi.output(scope.digest);
    this.populateScriptPath = path.join(SCRIPTS_DIR, "populate-github-app-secret.sh");
    this.mintScriptPath = path.join(SCRIPTS_DIR, "mint-github-app-token.sh");

    this.registerOutputs({
      secretArn: this.secretArn,
      iamReadPolicyArn: this.iamReadPolicyArn,
      scopeDigest: this.scopeDigest,
      populateScriptPath: this.populateScriptPath,
      mintScriptPath: this.mintScriptPath,
    });
  }
}
