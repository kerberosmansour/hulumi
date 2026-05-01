import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

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
    expect(content).not.toMatch(/echo\s+"?\$\{?PRIVATE_KEY/);
  });

  test("scripts shipped via package.json files array", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "package.json"), "utf8"));
    expect(pkg.files).toContain("scripts/");
  });
});
