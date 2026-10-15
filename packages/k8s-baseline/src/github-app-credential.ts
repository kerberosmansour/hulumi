import * as path from "path";
import { createHash } from "node:crypto";
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import type { GitHubAppCredentialArgs, GitHubAppPermission } from "./github-app-credential.args";
import type { GitHubAppCredentialOutputs } from "./github-app-credential.outputs";

export const GITHUB_APP_CREDENTIAL_COMPONENT_TYPE = "hulumi:k8s:GitHubAppCredential";

const SCRIPTS_DIR = path.resolve(__dirname, "..", "scripts");
const SCOPE_TAG = "hulumi:github-app-scope-sha256";
const MAX_REPOSITORIES = 500;
const MAX_PERMISSIONS = 100;
const MAX_SCOPE_BYTES = 16 * 1024;
const MAX_SECRET_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 16 * 1024;
const MAX_TOKEN_BYTES = 4096;
const MAX_TOKEN_LIFETIME_SECONDS = 3700;
const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_API_VERSION = "2026-03-10";
const HTTP_TIMEOUT_MS = 10_000;
const SECRET_ARN_ENV = "HULUMI_GITHUB_APP_SECRET_ARN";
const OWNER_REPOSITORY = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9_.-]{1,100}$/;
const OWNER_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const REPOSITORY_NAME = /^[A-Za-z0-9_.-]{1,100}$/;
const PERMISSION_NAME = /^[a-z][a-z0-9_]{0,63}$/;
const PERMISSION_LEVELS = new Set(["read", "write", "admin"]);
const KMS_KEY_ARN =
  /^arn:(?:aws|aws-us-gov|aws-cn):kms:[a-z0-9-]+:[0-9]{12}:key\/[A-Za-z0-9-]{1,128}$/;

interface NormalizedScope {
  repos: string[];
  permissions: Record<string, "read" | "write" | "admin">;
  digest: string;
}

interface RuntimeScope {
  repos: string[];
  permissions: Record<string, GitHubAppPermission>;
  canonical: string;
}

export interface GitHubAppTokenBrokerConfig {
  secretArn: string;
  repos: string[];
  permissions: Record<string, GitHubAppPermission>;
  scopeDigest: string;
}

export interface GitHubAppTokenBrokerRequest {
  owner: string;
  repository: string;
}

export interface GitHubAppTokenBrokerResponse {
  token: string;
  expiresAt: string;
}

export interface GitHubAppTokenBrokerHttpRequest {
  method: "GET" | "POST";
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface GitHubAppTokenBrokerHttpResponse {
  status: number;
  contentType: string;
  body: string;
}

export interface GitHubAppTokenBrokerDependencies {
  getSecretValue(secretArn: string): Promise<string>;
  nowSeconds(): number;
  signRs256(signingInput: string, privateKey: string): Promise<string> | string;
  request(request: GitHubAppTokenBrokerHttpRequest): Promise<GitHubAppTokenBrokerHttpResponse>;
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeRuntimeScope(
  reposInput: unknown,
  permissionsInput: unknown,
): RuntimeScope | undefined {
  if (
    !Array.isArray(reposInput) ||
    reposInput.length === 0 ||
    reposInput.length > MAX_REPOSITORIES ||
    !reposInput.every((repo): repo is string => typeof repo === "string")
  ) {
    return undefined;
  }
  const repos = [...reposInput];
  if (new Set(repos).size !== repos.length || (repos.includes("*") && repos.length !== 1)) {
    return undefined;
  }
  if (
    repos.some((repo) => {
      const repositoryName = repo.split("/")[1];
      return (
        repo !== "*" &&
        (!OWNER_REPOSITORY.test(repo) || repositoryName === "." || repositoryName === "..")
      );
    })
  ) {
    return undefined;
  }
  if (!isRecord(permissionsInput)) {
    return undefined;
  }
  const permissionEntries = Object.entries(permissionsInput);
  if (permissionEntries.length === 0 || permissionEntries.length > MAX_PERMISSIONS) {
    return undefined;
  }
  if (
    permissionEntries.some(
      ([permission, level]) =>
        !PERMISSION_NAME.test(permission) ||
        typeof level !== "string" ||
        !PERMISSION_LEVELS.has(level),
    )
  ) {
    return undefined;
  }
  const permissions = Object.fromEntries(
    permissionEntries.sort(([left], [right]) => compareAscii(left, right)),
  ) as Record<string, GitHubAppPermission>;
  const sortedRepos = repos.sort(compareAscii);
  const canonical = JSON.stringify({ permissions, repos: sortedRepos });
  if (Buffer.byteLength(canonical, "utf8") > MAX_SCOPE_BYTES) {
    return undefined;
  }
  return {
    repos: [...sortedRepos],
    permissions,
    canonical,
  };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new globalThis.TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function brokerFailure(reason: string): never {
  throw new Error(`security_event.github_app_broker_failed reason=${reason}`);
}

function parseBrokerRequest(event: unknown): GitHubAppTokenBrokerRequest {
  if (!isRecord(event)) {
    return brokerFailure("invalid_request");
  }
  const keys = Object.keys(event).sort(compareAscii);
  if (keys.length !== 2 || keys[0] !== "owner" || keys[1] !== "repository") {
    return brokerFailure("invalid_request");
  }
  const owner = event.owner;
  const repository = event.repository;
  if (
    typeof owner !== "string" ||
    !OWNER_NAME.test(owner) ||
    typeof repository !== "string" ||
    !REPOSITORY_NAME.test(repository) ||
    repository === "." ||
    repository === ".."
  ) {
    return brokerFailure("invalid_request");
  }
  return { owner, repository };
}

function parseJsonResponse(
  response: GitHubAppTokenBrokerHttpResponse,
  expectedStatus: number,
  reason: string,
): Record<string, unknown> {
  if (
    response.status !== expectedStatus ||
    !response.contentType.toLowerCase().startsWith("application/json") ||
    Buffer.byteLength(response.body, "utf8") > MAX_RESPONSE_BYTES
  ) {
    return brokerFailure(reason);
  }
  try {
    const parsed: unknown = JSON.parse(response.body);
    return isRecord(parsed) ? parsed : brokerFailure(reason);
  } catch {
    return brokerFailure(reason);
  }
}

function exactPermissionMap(
  actual: unknown,
  expected: Record<string, GitHubAppPermission>,
): boolean {
  if (!isRecord(actual)) {
    return false;
  }
  const normalized = normalizeRuntimeScope(["owner/repository"], actual);
  return (
    normalized !== undefined && JSON.stringify(normalized.permissions) === JSON.stringify(expected)
  );
}

export function createGitHubAppTokenBrokerHandler(
  config: GitHubAppTokenBrokerConfig,
  dependencies: GitHubAppTokenBrokerDependencies,
): (event: unknown) => Promise<GitHubAppTokenBrokerResponse> {
  const configuredScope = normalizeRuntimeScope(config.repos, config.permissions);
  if (
    configuredScope === undefined ||
    !/^[0-9a-f]{64}$/.test(config.scopeDigest) ||
    typeof config.secretArn !== "string" ||
    config.secretArn.length === 0
  ) {
    brokerFailure("invalid_broker_configuration");
  }

  return async (event: unknown): Promise<GitHubAppTokenBrokerResponse> => {
    if ((await sha256Hex(configuredScope.canonical)) !== config.scopeDigest) {
      brokerFailure("invalid_broker_configuration");
    }
    const request = parseBrokerRequest(event);
    const target = `${request.owner}/${request.repository}`;
    if (!configuredScope.repos.includes("*") && !configuredScope.repos.includes(target)) {
      brokerFailure("repo_not_allowed");
    }

    let secretJson: string;
    try {
      secretJson = await dependencies.getSecretValue(config.secretArn);
    } catch {
      return brokerFailure("secret_read_failed");
    }
    if (Buffer.byteLength(secretJson, "utf8") > MAX_SECRET_BYTES) {
      return brokerFailure("secret_payload_too_large");
    }

    let secret: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(secretJson);
      secret = isRecord(parsed) ? parsed : brokerFailure("invalid_secret_payload");
    } catch {
      return brokerFailure("invalid_secret_payload");
    }
    const storedScope = normalizeRuntimeScope(secret.repos, secret.permissions);
    if (
      storedScope === undefined ||
      typeof secret.scope_sha256 !== "string" ||
      (await sha256Hex(storedScope.canonical)) !== secret.scope_sha256 ||
      secret.scope_sha256 !== config.scopeDigest ||
      JSON.stringify(storedScope.repos) !== JSON.stringify(configuredScope.repos) ||
      JSON.stringify(storedScope.permissions) !== JSON.stringify(configuredScope.permissions)
    ) {
      return brokerFailure("scope_mismatch");
    }
    if (
      typeof secret.app_id !== "string" ||
      !/^[0-9]+$/.test(secret.app_id) ||
      typeof secret.private_key !== "string" ||
      secret.private_key.length === 0
    ) {
      return brokerFailure("invalid_secret_payload");
    }

    const now = dependencies.nowSeconds();
    if (!Number.isSafeInteger(now) || now <= 0) {
      return brokerFailure("invalid_clock");
    }
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ iat: now - 60, exp: now + 540, iss: secret.app_id }),
    ).toString("base64url");
    const signingInput = `${header}.${payload}`;
    let signature: string;
    try {
      signature = await dependencies.signRs256(signingInput, secret.private_key);
    } catch {
      return brokerFailure("signing_failed");
    }
    if (!/^[A-Za-z0-9_-]{1,8192}$/.test(signature)) {
      return brokerFailure("signing_failed");
    }
    const jwt = `${signingInput}.${signature}`;
    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${jwt}`,
      "User-Agent": "hulumi-github-app-token-broker",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
    };

    let installationResponse: GitHubAppTokenBrokerHttpResponse;
    try {
      installationResponse = await dependencies.request({
        method: "GET",
        url: `${GITHUB_API_BASE}/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repository)}/installation`,
        headers,
      });
    } catch {
      return brokerFailure("installation_lookup_failed");
    }
    const installation = parseJsonResponse(installationResponse, 200, "installation_lookup_failed");
    if (
      typeof installation.id !== "number" ||
      !Number.isSafeInteger(installation.id) ||
      installation.id <= 0
    ) {
      return brokerFailure("installation_lookup_failed");
    }

    const tokenBody = JSON.stringify({
      repositories: [request.repository],
      permissions: configuredScope.permissions,
    });
    let tokenResponse: GitHubAppTokenBrokerHttpResponse;
    try {
      tokenResponse = await dependencies.request({
        method: "POST",
        url: `${GITHUB_API_BASE}/app/installations/${installation.id}/access_tokens`,
        headers: { ...headers, "Content-Type": "application/json" },
        body: tokenBody,
      });
    } catch {
      return brokerFailure("token_mint_failed");
    }
    const tokenPayload = parseJsonResponse(tokenResponse, 201, "token_mint_failed");
    const repositories = tokenPayload.repositories;
    const returnedTarget =
      Array.isArray(repositories) && repositories.length === 1 && isRecord(repositories[0])
        ? repositories[0].full_name
        : undefined;
    if (
      tokenPayload.repository_selection !== "selected" ||
      returnedTarget !== target ||
      !exactPermissionMap(tokenPayload.permissions, configuredScope.permissions)
    ) {
      return brokerFailure("token_scope_mismatch");
    }
    const expiresAtSeconds =
      typeof tokenPayload.expires_at === "string"
        ? Date.parse(tokenPayload.expires_at) / 1000
        : Number.NaN;
    if (
      typeof tokenPayload.token !== "string" ||
      tokenPayload.token.length === 0 ||
      Buffer.byteLength(tokenPayload.token, "utf8") > MAX_TOKEN_BYTES ||
      typeof tokenPayload.expires_at !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(tokenPayload.expires_at) ||
      !Number.isFinite(expiresAtSeconds) ||
      expiresAtSeconds <= now ||
      expiresAtSeconds > now + MAX_TOKEN_LIFETIME_SECONDS
    ) {
      return brokerFailure("invalid_token_response");
    }
    return { token: tokenPayload.token, expiresAt: tokenPayload.expires_at };
  };
}

async function readBoundedResponseBody(response: {
  body: {
    getReader(): {
      read(): Promise<{ done: boolean; value: Uint8Array }>;
      cancel(): Promise<void>;
    };
  } | null;
}): Promise<string> {
  if (response.body === null) {
    return "";
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const result = await reader.read();
    if (result.done) {
      break;
    }
    total += result.value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      return brokerFailure("github_response_too_large");
    }
    chunks.push(result.value);
  }
  return Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk)),
    total,
  ).toString("utf8");
}

function createProductionBrokerDependencies(): GitHubAppTokenBrokerDependencies {
  // CallbackFunction packages this exact-pinned dependency; runtime require keeps
  // Pulumi's closure serializer from walking native SDK constructors.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { GetSecretValueCommand, SecretsManagerClient } =
    require("@aws-sdk/client-secrets-manager") as typeof import("@aws-sdk/client-secrets-manager");
  const { createSign } = require("node:crypto") as typeof import("node:crypto");
  /* eslint-enable @typescript-eslint/no-require-imports */
  const secrets = new SecretsManagerClient({});
  return {
    getSecretValue: async (secretArn: string): Promise<string> => {
      const response = await secrets.send(new GetSecretValueCommand({ SecretId: secretArn }));
      if (typeof response.SecretString !== "string") {
        return brokerFailure("secret_read_failed");
      }
      return response.SecretString;
    },
    nowSeconds: () => Math.floor(Date.now() / 1000),
    signRs256: (signingInput: string, privateKey: string): string =>
      createSign("RSA-SHA256").update(signingInput).end().sign(privateKey).toString("base64url"),
    request: async (
      request: GitHubAppTokenBrokerHttpRequest,
    ): Promise<GitHubAppTokenBrokerHttpResponse> => {
      const response = await globalThis.fetch(request.url, {
        method: request.method,
        headers: request.headers,
        ...(request.body === undefined ? {} : { body: request.body }),
        redirect: "error",
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
      return {
        status: response.status,
        contentType: response.headers.get("content-type") ?? "",
        body: await readBoundedResponseBody(response),
      };
    },
  };
}

function createBrokerCallbackFactory(scope: NormalizedScope) {
  return (): ((event: unknown) => Promise<GitHubAppTokenBrokerResponse>) => {
    const secretArn = process.env[SECRET_ARN_ENV];
    if (secretArn === undefined || secretArn.length === 0) {
      return async () => brokerFailure("invalid_broker_configuration");
    }
    return createGitHubAppTokenBrokerHandler(
      {
        secretArn,
        repos: scope.repos,
        permissions: scope.permissions,
        scopeDigest: scope.digest,
      },
      createProductionBrokerDependencies(),
    );
  };
}

function brokerResourcePrefix(name: string, scopeDigest: string): string {
  const safeName =
    name
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "-")
      .slice(0, 20) || "github-app";
  const deployment = createHash("sha256")
    .update(`${pulumi.getProject()}/${pulumi.getStack()}/${name}`)
    .digest("hex")
    .slice(0, 10);
  return `${safeName}-${deployment}-${scopeDigest.slice(0, 8)}`;
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
  if (typeof args.kmsKeyArn === "string" && !KMS_KEY_ARN.test(args.kmsKeyArn)) {
    throw new Error(
      `GitHubAppCredential: kmsKeyArn must be an exact KMS key ARN (aliases and wildcards are not IAM resources)`,
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
  /** @deprecated Use iamInvokePolicyArn. Runtime callers cannot read the App private key. */
  public readonly iamReadPolicyArn: pulumi.Output<string>;
  public readonly iamInvokePolicyArn: pulumi.Output<string>;
  public readonly brokerFunctionArn: pulumi.Output<string>;
  public readonly brokerFunctionName: pulumi.Output<string>;
  public readonly scopeDigest: pulumi.Output<string>;
  public readonly populateScriptPath: string;
  public readonly mintScriptPath: string;

  constructor(name: string, args: GitHubAppCredentialArgs, opts?: pulumi.ComponentResourceOptions) {
    super(GITHUB_APP_CREDENTIAL_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    validateArgs(name, args);
    const scope = normalizeScope(name, args);

    const secretName = args.secretName ?? `${name}-github-app`;
    const resourcePrefix = brokerResourcePrefix(name, scope.digest);
    const brokerFunctionName = `${resourcePrefix}-broker`;
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

    const kmsKeyArnInput =
      args.kmsKeyArn ??
      aws.kms.getAliasOutput(
        {
          name: args.kmsKeyAlias,
        },
        { parent: this },
      ).targetKeyArn;
    const kmsKeyArn = pulumi.output(kmsKeyArnInput).apply((arn: string) => {
      if (!KMS_KEY_ARN.test(arn)) {
        throw new Error(
          `GitHubAppCredential: kmsKeyArn must resolve to an exact KMS key ARN (aliases and wildcards are not IAM resources)`,
        );
      }
      return arn;
    });

    const brokerRole = new aws.iam.Role(
      `${name}-broker-role`,
      {
        name: `${resourcePrefix}-broker-role`,
        description: `Execution role for the ${name} GitHub App token broker.`,
        assumeRolePolicy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "lambda.amazonaws.com" },
              Action: "sts:AssumeRole",
            },
          ],
        }),
      },
      parent,
    );

    const logGroup = new aws.cloudwatch.LogGroup(
      `${name}-broker-logs`,
      {
        name: `/aws/lambda/${brokerFunctionName}`,
        retentionInDays: 30,
      },
      parent,
    );

    const brokerRolePolicyDocument = pulumi
      .all([secret.arn, logGroup.arn, kmsKeyArn])
      .apply(([secretArn, logGroupArn, exactKmsKeyArn]: [string, string, string]) => {
        const arnParts = secretArn.split(":");
        const partition = arnParts[1];
        const region = arnParts[3];
        const dnsSuffix = partition === "aws-cn" ? "amazonaws.com.cn" : "amazonaws.com";
        return JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Sid: "ReadExactGitHubAppSecret",
              Effect: "Allow",
              Action: ["secretsmanager:GetSecretValue"],
              Resource: secretArn,
            },
            {
              Sid: "DecryptExactGitHubAppSecret",
              Effect: "Allow",
              Action: ["kms:Decrypt"],
              Resource: exactKmsKeyArn,
              Condition: {
                StringEquals: {
                  "kms:ViaService": `secretsmanager.${region}.${dnsSuffix}`,
                  "kms:EncryptionContext:SecretARN": secretArn,
                },
              },
            },
            {
              Sid: "WriteExactBrokerLogGroup",
              Effect: "Allow",
              Action: ["logs:CreateLogStream", "logs:PutLogEvents"],
              Resource: `${logGroupArn}:*`,
            },
          ],
        });
      });

    const brokerRolePolicy = new aws.iam.RolePolicy(
      `${name}-broker-policy`,
      {
        name: `${resourcePrefix}-broker`,
        role: brokerRole.name,
        policy: brokerRolePolicyDocument,
      },
      parent,
    );

    const broker = new aws.lambda.CallbackFunction<
      GitHubAppTokenBrokerRequest,
      GitHubAppTokenBrokerResponse
    >(
      `${name}-broker`,
      {
        name: brokerFunctionName,
        description: `Scope-enforcing GitHub App token broker for ${name}.`,
        role: brokerRole,
        callbackFactory: createBrokerCallbackFactory(scope),
        codePathOptions: {
          extraIncludePackages: ["@aws-sdk/client-secrets-manager"],
        },
        environment: {
          variables: {
            [SECRET_ARN_ENV]: secret.arn,
          },
        },
        memorySize: 128,
        reservedConcurrentExecutions: 10,
        runtime: aws.lambda.Runtime.NodeJS22dX,
        timeout: 15,
      },
      { parent: this, dependsOn: [brokerRolePolicy, logGroup] },
    );

    const policyDoc = broker.arn.apply((arn: string) =>
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: "lambda:InvokeFunction",
            Resource: arn,
          },
        ],
      }),
    );

    const policy = new aws.iam.Policy(
      `${name}-invoke-policy`,
      {
        name: `${resourcePrefix}-invoke`,
        description: `Invoke-only access to the ${name} GitHub App token broker.`,
        policy: policyDoc,
      },
      parent,
    );

    if (args.iamPrincipalArn !== undefined) {
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
    this.iamInvokePolicyArn = policy.arn;
    // Preserve the old output shape without preserving raw-secret authority.
    this.iamReadPolicyArn = policy.arn;
    this.brokerFunctionArn = broker.arn;
    this.brokerFunctionName = broker.name;
    this.scopeDigest = pulumi.output(scope.digest);
    this.populateScriptPath = path.join(SCRIPTS_DIR, "populate-github-app-secret.sh");
    this.mintScriptPath = path.join(SCRIPTS_DIR, "mint-github-app-token.sh");

    this.registerOutputs({
      secretArn: this.secretArn,
      iamReadPolicyArn: this.iamReadPolicyArn,
      iamInvokePolicyArn: this.iamInvokePolicyArn,
      brokerFunctionArn: this.brokerFunctionArn,
      brokerFunctionName: this.brokerFunctionName,
      scopeDigest: this.scopeDigest,
      populateScriptPath: this.populateScriptPath,
      mintScriptPath: this.mintScriptPath,
    });
  }
}
