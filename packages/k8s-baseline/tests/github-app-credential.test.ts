import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import * as pulumi from "@pulumi/pulumi";

import {
  GITHUB_APP_CREDENTIAL_COMPONENT_TYPE,
  GitHubAppCredential,
} from "../src/github-app-credential";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

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

function runMintFixture(options: {
  repos: string[];
  permissions: Record<string, "read" | "write" | "admin">;
  owner?: string;
  repo?: string;
  tagDigest?: string;
  payloadDigest?: string;
}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hulumi-mint-scope-"));
  try {
    const digest = scopeDigest(options.repos, options.permissions);
    const secretJson = JSON.stringify({
      app_id: "123",
      private_key: "PUBLIC TEST FIXTURE ONLY",
      repos: options.repos,
      permissions: options.permissions,
      scope_sha256: options.payloadDigest ?? digest,
    });
    const requestResult = path.join(dir, "request.json");
    const requestMarker = path.join(dir, "request.called");
    const signMarker = path.join(dir, "sign.called");
    const realOpenssl = spawnSync("bash", ["-c", "command -v openssl"], {
      encoding: "utf8",
    }).stdout.trim();
    expect(realOpenssl).not.toBe("");
    writeExecutable(
      path.join(dir, "aws"),
      `#!/bin/sh
set -eu
if [ "$1" = "secretsmanager" ] && [ "$2" = "describe-secret" ]; then
  printf '%s\n' "$EXPECTED_SCOPE_SHA"
  exit 0
fi
if [ "$1" = "secretsmanager" ] && [ "$2" = "get-secret-value" ]; then
  printf '%s\n' "$SECRET_JSON"
  exit 0
fi
exit 3
`,
    );
    writeExecutable(
      path.join(dir, "openssl"),
      `#!/bin/sh
if [ "$1" = "dgst" ]; then
  for argument in "$@"; do
    if [ "$argument" = "-sign" ]; then
      : > "$SIGN_MARKER"
      printf 'synthetic-signature'
      exit 0
    fi
  done
fi
exec "$REAL_OPENSSL" "$@"
`,
    );
    writeExecutable(
      path.join(dir, "curl"),
      `#!/bin/sh
set -eu
case "$*" in
  *"/installation") printf '{"id":123}' ;;
  *"/access_tokens")
    while [ "$#" -gt 0 ]; do
      if [ "$1" = "--data" ]; then
        shift
        printf '%s' "$1" > "$REQUEST_RESULT"
      fi
      shift
    done
    : > "$REQUEST_MARKER"
    printf '{"token":"synthetic-token"}'
    ;;
  *) exit 4 ;;
esac
`,
    );
    const result = spawnSync(
      "bash",
      [
        path.resolve(__dirname, "../scripts/mint-github-app-token.sh"),
        "fixture-secret",
        options.owner ?? "example",
        options.repo ?? "repo",
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${dir}${path.delimiter}${process.env.PATH}`,
          EXPECTED_SCOPE_SHA: options.tagDigest ?? digest,
          SECRET_JSON: secretJson,
          REAL_OPENSSL: realOpenssl,
          REQUEST_RESULT: requestResult,
          REQUEST_MARKER: requestMarker,
          SIGN_MARKER: signMarker,
        },
      },
    );
    return {
      result,
      request: fs.existsSync(requestResult)
        ? (JSON.parse(fs.readFileSync(requestResult, "utf8")) as Record<string, unknown>)
        : undefined,
      requestCalled: fs.existsSync(requestMarker),
      signCalled: fs.existsSync(signMarker),
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("GitHubAppCredential — happy paths", () => {
  test("provisions one SM secret + one IAM policy with the documented kmsKeyId", async () => {
    const c = new GitHubAppCredential("private-deps", {
      repos: ["myorg/private-libs"],
      permissions: { contents: "read" },
      kmsKeyAlias: "alias/secrets",
    });
    await settlePulumi();
    expect(registrations.some((r) => r.type === GITHUB_APP_CREDENTIAL_COMPONENT_TYPE)).toBe(true);
    expect(smSecrets()).toHaveLength(1);
    expect(iamPolicies()).toHaveLength(1);
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
  });

  test("default secretName is <componentName>-github-app", async () => {
    new GitHubAppCredential("creds", {
      repos: ["a/b"],
      permissions: { contents: "read" },
      kmsKeyAlias: "alias/x",
    });
    await settlePulumi();
    expect(smSecrets()[0].inputs.name).toBe("creds-github-app");
  });

  test("explicit secretName overrides default", async () => {
    new GitHubAppCredential("creds", {
      repos: ["a/b"],
      permissions: { contents: "read" },
      kmsKeyAlias: "alias/x",
      secretName: "my-app-secret",
    });
    await settlePulumi();
    expect(smSecrets()[0].inputs.name).toBe("my-app-secret");
  });

  test("iamPrincipalArn supplied → emits one RolePolicyAttachment", async () => {
    new GitHubAppCredential("c", {
      repos: ["a/b"],
      permissions: { contents: "read" },
      kmsKeyAlias: "alias/x",
      iamPrincipalArn: "arn:aws:iam::111:role/buildkit",
    });
    await settlePulumi();
    expect(rolePolicyAttachments()).toHaveLength(1);
  });

  test("repos: ['*'] is allowed (means all installation repos to GitHub API)", async () => {
    new GitHubAppCredential("c", {
      repos: ["*"],
      permissions: { contents: "read" },
      kmsKeyAlias: "alias/x",
    });
    await settlePulumi();
    expect(smSecrets()).toHaveLength(1);
  });

  test("canonical scope digest is stable across repository and permission order", async () => {
    const first = new GitHubAppCredential("first", {
      repos: ["example/z", "example/a"],
      permissions: { issues: "write", contents: "read" },
      kmsKeyAlias: "alias/x",
    });
    const second = new GitHubAppCredential("second", {
      repos: ["example/a", "example/z"],
      permissions: { contents: "read", issues: "write" },
      kmsKeyAlias: "alias/x",
    });
    await settlePulumi();

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
  test("IAM policy resource is the single SM ARN, not wildcard", async () => {
    new GitHubAppCredential("c", {
      repos: ["a/b"],
      permissions: { contents: "read" },
      kmsKeyAlias: "alias/x",
    });
    await settlePulumi();
    const policy = iamPolicies()[0];
    const rawPolicy = policy.inputs.policy;
    const policyJson: string =
      typeof rawPolicy === "string" ? rawPolicy : await valueOf(rawPolicy as pulumi.Output<string>);
    const policyDoc = JSON.parse(policyJson);
    const resource = policyDoc.Statement[0].Resource;
    expect(resource).not.toBe("*");
    expect(typeof resource).toBe("string");
    expect(resource).toMatch(/^arn:aws:secretsmanager:/);
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

  test("mint.sh is set -euo pipefail and never echoes the PEM to stdout/stderr", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const scriptPath = path.resolve(__dirname, "..", "scripts", "mint-github-app-token.sh");
    const content = fs.readFileSync(scriptPath, "utf8");
    expect(content).toMatch(/set -euo pipefail/);
    expect(content).toMatch(/trap cleanup/);
    // The PEM is read via `${scratch}` (file path), then piped into openssl.
    // It is never `cat`-ed or echoed.
    expect(content).not.toMatch(/cat\s+"\$\{scratch\}"/);
  });

  test.each([
    { label: "explicit", repos: ["example/repo", "example/other"] },
    { label: "wildcard", repos: ["*"] },
  ])("mint posts one target repository and exact permissions for $label allowlist", ({ repos }) => {
    const permissions = { contents: "read", issues: "write" } as const;
    const minted = runMintFixture({ repos, permissions });
    expect(minted.result.status, minted.result.stderr).toBe(0);
    expect(minted.result.stdout).toBe("synthetic-token\n");
    expect(minted.signCalled).toBe(true);
    expect(minted.requestCalled).toBe(true);
    expect(minted.request).toEqual({ repositories: ["repo"], permissions });
    expect(minted.result.stdout + minted.result.stderr).not.toContain("PUBLIC TEST FIXTURE ONLY");
  });

  test("mint refuses a target outside the component-bound allowlist before HTTP", () => {
    const minted = runMintFixture({
      repos: ["example/other"],
      permissions: { contents: "read" },
    });
    expect(minted.result.status).not.toBe(0);
    expect(minted.signCalled).toBe(false);
    expect(minted.requestCalled).toBe(false);
    expect(minted.result.stderr).toMatch(/repo_not_allowed/);
  });

  test.each([
    { label: "tag", tagDigest: "f".repeat(64) },
    { label: "payload", payloadDigest: "e".repeat(64) },
  ])("mint refuses a $label scope-digest mismatch before HTTP", (override) => {
    const minted = runMintFixture({
      repos: ["example/repo"],
      permissions: { contents: "read" },
      ...override,
    });
    expect(minted.result.status).not.toBe(0);
    expect(minted.signCalled).toBe(false);
    expect(minted.requestCalled).toBe(false);
    expect(minted.result.stderr).toMatch(/scope.*mismatch|mismatch.*scope/i);
    expect(minted.result.stdout + minted.result.stderr).not.toContain("PUBLIC TEST FIXTURE ONLY");
  });

  test.each([
    { label: "empty permissions", repos: ["example/repo"], permissions: {} },
    {
      label: "mixed wildcard",
      repos: ["*", "example/repo"],
      permissions: { contents: "read" as const },
    },
  ])("mint refuses $label stored scope before signing", ({ repos, permissions }) => {
    const minted = runMintFixture({ repos, permissions });
    expect(minted.result.status).not.toBe(0);
    expect(minted.signCalled).toBe(false);
    expect(minted.requestCalled).toBe(false);
  });

  test("scripts shipped via package.json files array", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "package.json"), "utf8"));
    expect(pkg.files).toContain("scripts/");
  });
});
