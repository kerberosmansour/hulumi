import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import * as pulumi from "@pulumi/pulumi";

import {
  createGitHubAppTokenBrokerHandler,
  GITHUB_APP_CREDENTIAL_COMPONENT_TYPE,
  GitHubAppCredential,
} from "../src/github-app-credential";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

const FIXTURE_KMS_KEY_ARN = "arn:aws:kms:us-east-1:111111111111:key/fixture-key";

beforeEach(() => {
  resetRegistrations();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function smSecrets() {
  return registrations.filter((r) => r.type === "aws:secretsmanager/secret:Secret");
}
function iamPolicies() {
  return registrations.filter((r) => r.type === "aws:iam/policy:Policy");
}
function rolePolicyAttachments() {
  return registrations.filter(
    (r) => r.type === "aws:iam/rolePolicyAttachment:RolePolicyAttachment",
  );
}
function iamRoles() {
  return registrations.filter((r) => r.type === "aws:iam/role:Role");
}
function iamRolePolicies() {
  return registrations.filter((r) => r.type === "aws:iam/rolePolicy:RolePolicy");
}
function lambdaFunctions() {
  return registrations.filter((r) => r.type === "aws:lambda/function:Function");
}
function logGroups() {
  return registrations.filter((r) => r.type === "aws:cloudwatch/logGroup:LogGroup");
}

function canonicalScope(
  repos: string[],
  permissions: Record<string, "read" | "write" | "admin">,
): string {
  const compare = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);
  return JSON.stringify({
    permissions: Object.fromEntries(Object.entries(permissions).sort(([a], [b]) => compare(a, b))),
    repos: [...repos].sort(compare),
  });
}

function scopeDigest(
  repos: string[],
  permissions: Record<string, "read" | "write" | "admin">,
): string {
  return createHash("sha256").update(canonicalScope(repos, permissions)).digest("hex");
}

function writeExecutable(file: string, contents: string): void {
  fs.writeFileSync(file, contents, { mode: 0o700 });
  fs.chmodSync(file, 0o700);
}

function runPopulateFixture(options: {
  repos?: string[];
  permissions?: Record<string, "read" | "write" | "admin">;
  tagDigest?: string;
}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hulumi-populate-scope-"));
  try {
    const repos = options.repos;
    const permissions = options.permissions;
    const pem = path.join(dir, "fixture.pem");
    const payloadResult = path.join(dir, "payload.json");
    const putMarker = path.join(dir, "put.called");
    fs.writeFileSync(pem, "PUBLIC TEST FIXTURE ONLY", { mode: 0o600 });
    writeExecutable(
      path.join(dir, "aws"),
      `#!/bin/sh
set -eu
if [ "$1" = "secretsmanager" ] && [ "$2" = "describe-secret" ]; then
  printf '%s\n' "$EXPECTED_SCOPE_SHA"
  exit 0
fi
if [ "$1" = "secretsmanager" ] && [ "$2" = "put-secret-value" ]; then
  while [ "$#" -gt 0 ]; do
    if [ "$1" = "--secret-string" ]; then
      shift
      cp "\${1#file://}" "$PAYLOAD_RESULT"
      : > "$PUT_MARKER"
      exit 0
    fi
    shift
  done
fi
exit 3
`,
    );
    const args = [
      path.resolve(__dirname, "../scripts/populate-github-app-secret.sh"),
      "fixture-secret",
      "123",
      pem,
    ];
    if (repos !== undefined && permissions !== undefined) {
      args.push(JSON.stringify(repos), JSON.stringify(permissions));
    }
    const result = spawnSync("bash", args, {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${dir}${path.delimiter}${process.env.PATH}`,
        EXPECTED_SCOPE_SHA:
          options.tagDigest ??
          (repos !== undefined && permissions !== undefined
            ? scopeDigest(repos, permissions)
            : "0".repeat(64)),
        PAYLOAD_RESULT: payloadResult,
        PUT_MARKER: putMarker,
      },
    });
    return {
      result,
      payload: fs.existsSync(payloadResult)
        ? (JSON.parse(fs.readFileSync(payloadResult, "utf8")) as Record<string, unknown>)
        : undefined,
      putCalled: fs.existsSync(putMarker),
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function runMintFixture(options: { owner?: string; repo?: string; functionError?: string }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hulumi-mint-scope-"));
  try {
    const requestResult = path.join(dir, "request.json");
    const requestMarker = path.join(dir, "request.called");
    writeExecutable(
      path.join(dir, "aws"),
      `#!/bin/sh
set -eu
if [ "$1" = "lambda" ] && [ "$2" = "invoke" ]; then
  shift 2
  payload=''
  output=''
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --function-name|--cli-binary-format)
        shift 2
        ;;
      --payload)
        payload="$2"
        shift 2
        ;;
      *)
        output="$1"
        shift
        ;;
    esac
  done
  printf '%s' "$payload" > "$REQUEST_RESULT"
  printf '%s' "$BROKER_RESPONSE" > "$output"
  : > "$REQUEST_MARKER"
  if [ -n "$FUNCTION_ERROR" ]; then
    printf '{"StatusCode":200,"FunctionError":"%s"}\n' "$FUNCTION_ERROR"
  else
    printf '{"StatusCode":200}\n'
  fi
  exit 0
fi
exit 3
`,
    );
    const result = spawnSync(
      "bash",
      [
        path.resolve(__dirname, "../scripts/mint-github-app-token.sh"),
        "fixture-broker",
        options.owner ?? "example",
        options.repo ?? "repo",
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${dir}${path.delimiter}${process.env.PATH}`,
          BROKER_RESPONSE: JSON.stringify({
            token: "synthetic-token",
            expiresAt: "2030-01-01T00:00:00Z",
          }),
          FUNCTION_ERROR: options.functionError ?? "",
          REQUEST_RESULT: requestResult,
          REQUEST_MARKER: requestMarker,
        },
      },
    );
    return {
      result,
      request: fs.existsSync(requestResult)
        ? (JSON.parse(fs.readFileSync(requestResult, "utf8")) as Record<string, unknown>)
        : undefined,
      requestCalled: fs.existsSync(requestMarker),
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function createBrokerFixture(options?: {
  repos?: string[];
  permissions?: Record<string, "read" | "write" | "admin">;
  payloadDigest?: string;
  responseRepositories?: string[];
  responsePermissions?: Record<string, "read" | "write" | "admin">;
  expiresAt?: string;
}) {
  const repos = options?.repos ?? ["example/repo"];
  const permissions = options?.permissions ?? { contents: "read" };
  const digest = scopeDigest(repos, permissions);
  const effects = {
    secretReads: 0,
    signs: 0,
    requests: [] as Array<{
      method: string;
      url: string;
      headers: Record<string, string>;
      body?: string;
    }>,
  };
  const handler = createGitHubAppTokenBrokerHandler(
    {
      secretArn: "arn:aws:secretsmanager:us-east-1:111:secret:fixture",
      repos,
      permissions,
      scopeDigest: digest,
    },
    {
      getSecretValue: async () => {
        effects.secretReads += 1;
        return JSON.stringify({
          app_id: "123",
          private_key: "PUBLIC TEST FIXTURE ONLY",
          repos,
          permissions,
          scope_sha256: options?.payloadDigest ?? digest,
        });
      },
      nowSeconds: () => 1_900_000_000,
      signRs256: () => {
        effects.signs += 1;
        return "synthetic-signature";
      },
      request: async (request) => {
        effects.requests.push(request);
        if (request.method === "GET") {
          return {
            status: 200,
            contentType: "application/json; charset=utf-8",
            body: JSON.stringify({ id: 123 }),
          };
        }
        return {
          status: 201,
          contentType: "application/json; charset=utf-8",
          body: JSON.stringify({
            token: "synthetic-token",
            expires_at: options?.expiresAt ?? "2030-03-17T18:46:40Z",
            permissions: options?.responsePermissions ?? permissions,
            repository_selection: "selected",
            repositories: (options?.responseRepositories ?? ["example/repo"]).map((full_name) => ({
              full_name,
            })),
          }),
        };
      },
    },
  );
  return { effects, handler, permissions };
}

describe("GitHubAppCredential — happy paths", () => {
  test("provisions one secret, one least-privilege broker, and one invoke policy", async () => {
    const c = new GitHubAppCredential("private-deps", {
      repos: ["myorg/private-libs"],
      permissions: { contents: "read" },
      kmsKeyAlias: "alias/secrets",
      kmsKeyArn: FIXTURE_KMS_KEY_ARN,
    });
    await valueOf(c.iamInvokePolicyArn);
    await settlePulumi();
    expect(registrations.some((r) => r.type === GITHUB_APP_CREDENTIAL_COMPONENT_TYPE)).toBe(true);
    expect(smSecrets()).toHaveLength(1);
    expect(iamPolicies()).toHaveLength(1);
    expect(iamRoles()).toHaveLength(1);
    expect(iamRolePolicies()).toHaveLength(1);
    expect(lambdaFunctions()).toHaveLength(1);
    expect(logGroups()).toHaveLength(1);
    const sec = smSecrets()[0];
    expect(sec.inputs.kmsKeyId).toBe("alias/secrets");
    expect((sec.inputs.tags as Record<string, string>)["hulumi:component"]).toBe(
      "GitHubAppCredential",
    );
    // No PolicyAttachment when iamPrincipalArn is omitted.
    expect(rolePolicyAttachments()).toHaveLength(0);
    expect(typeof c.populateScriptPath).toBe("string");
    expect(c.populateScriptPath).toMatch(/populate-github-app-secret\.sh$/);
    expect(c.mintScriptPath).toMatch(/mint-github-app-token\.sh$/);
    expect(await valueOf(c.iamReadPolicyArn)).toBe(await valueOf(c.iamInvokePolicyArn));
    expect(await valueOf(c.brokerFunctionArn)).toMatch(/^arn:aws:/);
    expect(await valueOf(c.brokerFunctionName)).not.toBe("");
  });

  test("default secretName is <componentName>-github-app", async () => {
    const c = new GitHubAppCredential("creds", {
      repos: ["a/b"],
      permissions: { contents: "read" },
      kmsKeyAlias: "alias/x",
      kmsKeyArn: FIXTURE_KMS_KEY_ARN,
    });
    await valueOf(c.iamInvokePolicyArn);
    expect(smSecrets()[0].inputs.name).toBe("creds-github-app");
  });

  test("explicit secretName overrides default", async () => {
    const c = new GitHubAppCredential("creds", {
      repos: ["a/b"],
      permissions: { contents: "read" },
      kmsKeyAlias: "alias/x",
      kmsKeyArn: FIXTURE_KMS_KEY_ARN,
      secretName: "my-app-secret",
    });
    await valueOf(c.iamInvokePolicyArn);
    expect(smSecrets()[0].inputs.name).toBe("my-app-secret");
  });

  test("iamPrincipalArn supplied → emits one RolePolicyAttachment", async () => {
    const c = new GitHubAppCredential("c", {
      repos: ["a/b"],
      permissions: { contents: "read" },
      kmsKeyAlias: "alias/x",
      kmsKeyArn: FIXTURE_KMS_KEY_ARN,
      iamPrincipalArn: "arn:aws:iam::111:role/buildkit",
    });
    await valueOf(c.iamInvokePolicyArn);
    await settlePulumi();
    expect(rolePolicyAttachments()).toHaveLength(1);
  });

  test("repos: ['*'] is allowed (means all installation repos to GitHub API)", async () => {
    const c = new GitHubAppCredential("c", {
      repos: ["*"],
      permissions: { contents: "read" },
      kmsKeyAlias: "alias/x",
      kmsKeyArn: FIXTURE_KMS_KEY_ARN,
    });
    await valueOf(c.iamInvokePolicyArn);
    expect(smSecrets()).toHaveLength(1);
  });

  test("canonical scope digest is stable across repository and permission order", async () => {
    const first = new GitHubAppCredential("first", {
      repos: ["example/z", "example/a"],
      permissions: { issues: "write", contents: "read" },
      kmsKeyAlias: "alias/x",
      kmsKeyArn: FIXTURE_KMS_KEY_ARN,
    });
    const second = new GitHubAppCredential("second", {
      repos: ["example/a", "example/z"],
      permissions: { contents: "read", issues: "write" },
      kmsKeyAlias: "alias/x",
      kmsKeyArn: FIXTURE_KMS_KEY_ARN,
    });
    await Promise.all([valueOf(first.iamInvokePolicyArn), valueOf(second.iamInvokePolicyArn)]);

    const expected = scopeDigest(["example/a", "example/z"], { contents: "read", issues: "write" });
    expect(
      (smSecrets()[0].inputs.tags as Record<string, string>)["hulumi:github-app-scope-sha256"],
    ).toBe(expected);
    expect(
      (smSecrets()[1].inputs.tags as Record<string, string>)["hulumi:github-app-scope-sha256"],
    ).toBe(expected);
    expect(await valueOf(first.scopeDigest)).toBe(expected);
    expect(await valueOf(second.scopeDigest)).toBe(expected);
  });
});

describe("GitHubAppCredential — invalid input refusals", () => {
  test("empty repos refused", () => {
    expect(
      () =>
        new GitHubAppCredential("c", {
          repos: [],
          permissions: { contents: "read" },
          kmsKeyAlias: "alias/x",
        }),
    ).toThrow(/repos must be non-empty/);
  });

  test("empty permissions refused", () => {
    expect(
      () =>
        new GitHubAppCredential("c", {
          repos: ["a/b"],
          permissions: {},
          kmsKeyAlias: "alias/x",
        }),
    ).toThrow(/permissions must be non-empty/);
  });

  test("missing kmsKeyAlias refused (no default)", () => {
    expect(
      () =>
        new GitHubAppCredential("c", {
          repos: ["a/b"],
          permissions: { contents: "read" },
        } as unknown as ConstructorParameters<typeof GitHubAppCredential>[1]),
    ).toThrow(/kmsKeyAlias is required/);
  });

  test('secretName with "/" refused', () => {
    expect(
      () =>
        new GitHubAppCredential("c", {
          repos: ["a/b"],
          permissions: { contents: "read" },
          kmsKeyAlias: "alias/x",
          secretName: "ns/x",
        }),
    ).toThrow(/must not contain/);
  });

  test('secretName with ".." refused', () => {
    expect(
      () =>
        new GitHubAppCredential("c", {
          repos: ["a/b"],
          permissions: { contents: "read" },
          kmsKeyAlias: "alias/x",
          secretName: "../etc",
        }),
    ).toThrow(/must not contain/);
  });

  test("wildcard kmsKeyArn is refused before child resources", () => {
    expect(
      () =>
        new GitHubAppCredential("c", {
          repos: ["a/b"],
          permissions: { contents: "read" },
          kmsKeyAlias: "alias/x",
          kmsKeyArn: "*",
        }),
    ).toThrow(/exact KMS key ARN/);
  });

  test.each([
    { repos: ["*", "example/repo"], reason: /wildcard/i },
    { repos: ["example/repo", "example/repo"], reason: /duplicate/i },
    { repos: ["missing-owner"], reason: /owner\/name/i },
    { repos: ["bad owner/repo"], reason: /owner\/name/i },
  ])("invalid repository allowlist is refused: $repos", ({ repos, reason }) => {
    expect(
      () =>
        new GitHubAppCredential("c", {
          repos,
          permissions: { contents: "read" },
          kmsKeyAlias: "alias/x",
        }),
    ).toThrow(reason);
  });

  test.each(["", "owner", "superuser"])("invalid permission level is refused: %j", (level) => {
    expect(
      () =>
        new GitHubAppCredential("c", {
          repos: ["example/repo"],
          permissions: { contents: level } as never,
          kmsKeyAlias: "alias/x",
        }),
    ).toThrow(/permission/i);
  });

  test("invalid permission name is refused", () => {
    expect(
      () =>
        new GitHubAppCredential("c", {
          repos: ["example/repo"],
          permissions: { "Contents Admin": "read" },
          kmsKeyAlias: "alias/x",
        }),
    ).toThrow(/permission/i);
  });

  test("repository count above GitHub's 500-entry token limit is refused", () => {
    expect(
      () =>
        new GitHubAppCredential("c", {
          repos: Array.from({ length: 501 }, (_, index) => `example/repo-${index}`),
          permissions: { contents: "read" },
          kmsKeyAlias: "alias/x",
        }),
    ).toThrow(/500/);
  });
});

describe("GitHubAppCredential — abuse cases", () => {
  test("runtime policy invokes only the exact broker and cannot read Secrets Manager", async () => {
    const c = new GitHubAppCredential("c", {
      repos: ["a/b"],
      permissions: { contents: "read" },
      kmsKeyAlias: "alias/x",
      kmsKeyArn: FIXTURE_KMS_KEY_ARN,
    });
    await valueOf(c.iamInvokePolicyArn);
    const policy = iamPolicies()[0];
    const rawPolicy = policy.inputs.policy;
    const policyJson: string =
      typeof rawPolicy === "string" ? rawPolicy : await valueOf(rawPolicy as pulumi.Output<string>);
    const policyDoc = JSON.parse(policyJson);
    const statement = policyDoc.Statement[0];
    const resource = statement.Resource;
    expect(resource).not.toBe("*");
    expect(typeof resource).toBe("string");
    expect(resource).toMatch(/^arn:aws:.*lambda/);
    expect(statement.Action).toEqual("lambda:InvokeFunction");
    expect(policyJson).not.toMatch(/secretsmanager/i);
  });

  test("broker role trusts only Lambda and reads only the exact secret", async () => {
    const c = new GitHubAppCredential("c", {
      repos: ["a/b"],
      permissions: { contents: "read" },
      kmsKeyAlias: "alias/x",
      kmsKeyArn: FIXTURE_KMS_KEY_ARN,
    });
    await valueOf(c.iamInvokePolicyArn);

    const trust = JSON.parse(iamRoles()[0].inputs.assumeRolePolicy as string);
    expect(trust.Statement).toEqual([
      {
        Effect: "Allow",
        Principal: { Service: "lambda.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    ]);

    const rawPolicy = iamRolePolicies()[0].inputs.policy;
    const policyJson =
      typeof rawPolicy === "string" ? rawPolicy : await valueOf(rawPolicy as pulumi.Output<string>);
    const policy = JSON.parse(policyJson) as {
      Statement: Array<{
        Action: string[];
        Resource: string;
        Condition?: { StringEquals?: Record<string, string> };
      }>;
    };
    const secretStatement = policy.Statement.find((entry) =>
      entry.Action.includes("secretsmanager:GetSecretValue"),
    );
    expect(secretStatement?.Action).toEqual(["secretsmanager:GetSecretValue"]);
    expect(secretStatement?.Resource).toMatch(/^arn:aws:secretsmanager:/);
    expect(secretStatement?.Resource).not.toBe("*");
    const decryptStatement = policy.Statement.find((entry) => entry.Action.includes("kms:Decrypt"));
    expect(decryptStatement).toMatchObject({
      Resource: FIXTURE_KMS_KEY_ARN,
      Condition: {
        StringEquals: {
          "kms:ViaService": "secretsmanager.us-east-1.amazonaws.com",
        },
      },
    });
    expect(decryptStatement?.Condition?.StringEquals?.["kms:EncryptionContext:SecretARN"]).toMatch(
      /^arn:aws:secretsmanager:/,
    );
    expect(policy.Statement.every((entry) => entry.Resource !== "*")).toBe(true);
    expect(rolePolicyAttachments()).toHaveLength(0);
  });

  test("populate requires explicit scope and binds its digest to the component tag", () => {
    const repos = ["example/repo"];
    const permissions = { contents: "read" } as const;
    const populated = runPopulateFixture({ repos, permissions });
    expect(populated.result.status, populated.result.stderr).toBe(0);
    expect(populated.putCalled).toBe(true);
    expect(populated.payload).toMatchObject({
      repos,
      permissions,
      scope_sha256: scopeDigest(repos, permissions),
    });
    expect(populated.result.stdout + populated.result.stderr).not.toContain(
      "PUBLIC TEST FIXTURE ONLY",
    );
  });

  test("populate refuses omitted scope instead of defaulting to wildcard and empty permissions", () => {
    const populated = runPopulateFixture({});
    expect(populated.result.status).not.toBe(0);
    expect(populated.putCalled).toBe(false);
  });

  test("populate refuses scope whose digest differs from the component tag", () => {
    const populated = runPopulateFixture({
      repos: ["example/repo"],
      permissions: { contents: "read" },
      tagDigest: "f".repeat(64),
    });
    expect(populated.result.status).not.toBe(0);
    expect(populated.putCalled).toBe(false);
    expect(populated.result.stderr).toMatch(/scope.*mismatch|mismatch.*scope/i);
  });

  test("populate.sh is set -euo pipefail with PEM-scrubbing trap", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const scriptPath = path.resolve(__dirname, "..", "scripts", "populate-github-app-secret.sh");
    const content = fs.readFileSync(scriptPath, "utf8");
    expect(content).toMatch(/set -euo pipefail/);
    expect(content).toMatch(/trap cleanup/);
    expect(content).toMatch(/shred|rm -f/);
  });

  test("mint.sh invokes only the broker and contains no raw-key or GitHub exchange path", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const scriptPath = path.resolve(__dirname, "..", "scripts", "mint-github-app-token.sh");
    const content = fs.readFileSync(scriptPath, "utf8");
    expect(content).toMatch(/set -euo pipefail/);
    expect(content).toMatch(/trap cleanup/);
    expect(content).toMatch(/aws\s+lambda\s+invoke/);
    expect(content).not.toMatch(/secretsmanager|get-secret-value|openssl|api\.github\.com|curl/i);
  });

  test("mint invokes the broker with the exact target and emits only its token", () => {
    const minted = runMintFixture({});
    expect(minted.result.status, minted.result.stderr).toBe(0);
    expect(minted.result.stdout).toBe("synthetic-token\n");
    expect(minted.requestCalled).toBe(true);
    expect(minted.request).toEqual({ owner: "example", repository: "repo" });
  });

  test("mint refuses a broker FunctionError without printing its payload", () => {
    const minted = runMintFixture({ functionError: "Unhandled" });
    expect(minted.result.status).not.toBe(0);
    expect(minted.requestCalled).toBe(true);
    expect(minted.result.stdout).toBe("");
    expect(minted.result.stderr).toMatch(/broker_function_error/);
    expect(minted.result.stderr).not.toContain("synthetic-token");
  });

  test("broker rejects an unallowed target before reading the secret", async () => {
    const fixture = createBrokerFixture();
    await expect(fixture.handler({ owner: "example", repository: "other" })).rejects.toThrow(
      /repo_not_allowed/,
    );
    expect(fixture.effects).toMatchObject({ secretReads: 0, signs: 0, requests: [] });
  });

  test("broker rejects a payload digest mismatch before signing or GitHub HTTP", async () => {
    const fixture = createBrokerFixture({ payloadDigest: "e".repeat(64) });
    await expect(fixture.handler({ owner: "example", repository: "repo" })).rejects.toThrow(
      /scope_mismatch/,
    );
    expect(fixture.effects).toMatchObject({ secretReads: 1, signs: 0, requests: [] });
  });

  test.each([
    { responseRepositories: ["example/repo", "example/other"] },
    { responsePermissions: { contents: "write" as const } },
  ])("broker refuses broader returned authority: %j", async (override) => {
    const fixture = createBrokerFixture(override);
    await expect(fixture.handler({ owner: "example", repository: "repo" })).rejects.toThrow(
      /token_scope_mismatch/,
    );
    expect(fixture.effects.secretReads).toBe(1);
    expect(fixture.effects.signs).toBe(1);
    expect(fixture.effects.requests).toHaveLength(2);
  });

  test.each([
    { label: "explicit", repos: ["example/repo"] },
    { label: "wildcard", repos: ["*"] },
  ])(
    "broker sends and verifies one repository plus exact permissions for $label scope",
    async ({ repos }) => {
      const fixture = createBrokerFixture({ repos });
      await expect(fixture.handler({ owner: "example", repository: "repo" })).resolves.toEqual({
        token: "synthetic-token",
        expiresAt: "2030-03-17T18:46:40Z",
      });
      expect(fixture.effects.requests).toHaveLength(2);
      const tokenRequest = fixture.effects.requests[1];
      expect(JSON.parse(tokenRequest.body ?? "null")).toEqual({
        repositories: ["repo"],
        permissions: fixture.permissions,
      });
      expect(tokenRequest.url).toBe("https://api.github.com/app/installations/123/access_tokens");
      expect(tokenRequest.headers).toMatchObject({
        Accept: "application/vnd.github+json",
        "User-Agent": "hulumi-github-app-token-broker",
        "X-GitHub-Api-Version": "2026-03-10",
      });
    },
  );

  test.each(["2030-03-17T17:46:39Z", "2030-03-17T19:48:21Z"])(
    "broker refuses an invalid token lifetime: %s",
    async (expiresAt) => {
      const fixture = createBrokerFixture({ expiresAt });
      await expect(fixture.handler({ owner: "example", repository: "repo" })).rejects.toThrow(
        /invalid_token_response/,
      );
    },
  );

  test("broker converts provider failures to a bounded reason without leaking the cause", async () => {
    const leak = "SYNTHETIC_PRIVATE_KEY_TEST_ONLY";
    const handler = createGitHubAppTokenBrokerHandler(
      {
        secretArn: "arn:aws:secretsmanager:us-east-1:111:secret:fixture",
        repos: ["example/repo"],
        permissions: { contents: "read" },
        scopeDigest: scopeDigest(["example/repo"], { contents: "read" }),
      },
      {
        getSecretValue: async () => {
          throw new Error(leak);
        },
        nowSeconds: () => 1_900_000_000,
        signRs256: () => "unused",
        request: async () => {
          throw new Error("unused");
        },
      },
    );
    let message = "";
    try {
      await handler({ owner: "example", repository: "repo" });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/secret_read_failed/);
    expect(message).not.toContain(leak);
  });

  test("scripts shipped via package.json files array", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "package.json"), "utf8"));
    expect(pkg.files).toContain("scripts/");
  });
});
