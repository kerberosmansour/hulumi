import { afterEach, describe, expect, it } from "vitest";

import { GitHubAwsOidcDeploymentRole } from "../src";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

function roleInputs(): Record<string, unknown> {
  const role = registrations.find((r) => r.type === "aws:iam/role:Role");
  if (role === undefined) throw new Error("expected IAM role registration");
  return role.inputs;
}

describe("GitHubAwsOidcDeploymentRole", () => {
  afterEach(() => {
    resetRegistrations();
  });

  it("renders exact GitHub OIDC trust and usage output", async () => {
    const role = new GitHubAwsOidcDeploymentRole("deploy", {
      tier: "startup-hardened",
      owner: "kerberosmansour",
      repository: "hulumi",
      environment: "prod",
      reusableWorkflowRef: "kerberosmansour/hulumi/.github/workflows/deploy.yml@refs/heads/main",
      audience: "sts.amazonaws.com",
      roleName: "hulumi-prod-deploy",
      oidcProviderArn:
        "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com",
      policyArns: ["arn:aws:iam::aws:policy/ReadOnlyAccess"],
    });

    await settlePulumi();

    const trust = JSON.parse(String(roleInputs().assumeRolePolicy)) as {
      Statement: Array<{ Condition: Record<string, Record<string, string>> }>;
    };
    expect(trust.Statement[0]?.Condition.StringEquals).toMatchObject({
      "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
      "token.actions.githubusercontent.com:sub": "repo:kerberosmansour/hulumi:environment:prod",
      "token.actions.githubusercontent.com:job_workflow_ref":
        "kerberosmansour/hulumi/.github/workflows/deploy.yml@refs/heads/main",
    });
    expect(registrations.map((r) => r.type)).toContain(
      "aws:iam/rolePolicyAttachment:RolePolicyAttachment",
    );
    await expect(valueOf(role.githubActionsUsageBlock)).resolves.toContain(
      "role-to-assume: arn:mock:aws:iam/role:Role:deploy-role",
    );
  });

  it("ref subjectMode renders an exact StringEquals ref subject (no environment)", async () => {
    new GitHubAwsOidcDeploymentRole("deploy", {
      tier: "startup-hardened",
      owner: "kerberosmansour",
      repository: "sunlit-guardian",
      audience: "sts.amazonaws.com",
      roleName: "sg-workloads-deploy",
      oidcProviderArn:
        "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com",
      subjectMode: { kind: "ref", ref: "refs/heads/main" },
    });
    await settlePulumi();
    const trust = JSON.parse(String(roleInputs().assumeRolePolicy)) as {
      Statement: Array<{ Condition: Record<string, Record<string, string>> }>;
    };
    const se = trust.Statement[0]?.Condition.StringEquals ?? {};
    expect(se["token.actions.githubusercontent.com:sub"]).toBe(
      "repo:kerberosmansour/sunlit-guardian:ref:refs/heads/main",
    );
    expect(se["token.actions.githubusercontent.com:aud"]).toBe("sts.amazonaws.com");
    // No environment scoping, no job_workflow_ref unless provided.
    expect(Object.keys(se)).not.toContain("token.actions.githubusercontent.com:job_workflow_ref");
    expect(trust.Statement[0]?.Condition.StringLike).toBeUndefined();
  });

  it("ref subjectMode still pins job_workflow_ref when reusableWorkflowRef is given", async () => {
    new GitHubAwsOidcDeploymentRole("deploy", {
      tier: "startup-hardened",
      owner: "kerberosmansour",
      repository: "sunlit-guardian",
      audience: "sts.amazonaws.com",
      roleName: "sg-workloads-deploy",
      oidcProviderArn:
        "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com",
      reusableWorkflowRef:
        "kerberosmansour/sunlit-guardian/.github/workflows/deploy.yml@refs/heads/main",
      subjectMode: { kind: "ref", ref: "refs/tags/v1.4.2" },
    });
    await settlePulumi();
    const trust = JSON.parse(String(roleInputs().assumeRolePolicy)) as {
      Statement: Array<{ Condition: Record<string, Record<string, string>> }>;
    };
    const se = trust.Statement[0]?.Condition.StringEquals ?? {};
    expect(se["token.actions.githubusercontent.com:sub"]).toBe(
      "repo:kerberosmansour/sunlit-guardian:ref:refs/tags/v1.4.2",
    );
    expect(se["token.actions.githubusercontent.com:job_workflow_ref"]).toBe(
      "kerberosmansour/sunlit-guardian/.github/workflows/deploy.yml@refs/heads/main",
    );
  });

  it("rejects a wildcard ref, a pull_request subject, and a non-refs/* ref", () => {
    const base = {
      tier: "startup-hardened" as const,
      owner: "kerberosmansour",
      repository: "sunlit-guardian",
      audience: "sts.amazonaws.com",
      roleName: "bad",
      oidcProviderArn:
        "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com",
    };
    expect(
      () =>
        new GitHubAwsOidcDeploymentRole("b1", {
          ...base,
          subjectMode: { kind: "ref", ref: "refs/tags/v*" },
        }),
    ).toThrow(/wildcard/);
    expect(
      () =>
        new GitHubAwsOidcDeploymentRole("b2", {
          ...base,
          subjectMode: { kind: "ref", ref: "pull_request" },
        }),
    ).toThrow(/pull_request/);
    expect(
      () =>
        new GitHubAwsOidcDeploymentRole("b3", {
          ...base,
          subjectMode: { kind: "ref", ref: "main" },
        }),
    ).toThrow(/exact refs\/\* ref/);
    expect(registrations.filter((r) => !r.type.startsWith("hulumi:"))).toHaveLength(0);
  });

  it("errors when neither subjectMode nor the legacy environment field is given", () => {
    expect(
      () =>
        new GitHubAwsOidcDeploymentRole("nope", {
          tier: "startup-hardened",
          owner: "kerberosmansour",
          repository: "sunlit-guardian",
          audience: "sts.amazonaws.com",
          roleName: "nope",
          oidcProviderArn:
            "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com",
        }),
    ).toThrow(/provide `subjectMode`/);
  });

  it("rejects wildcard OIDC claim inputs before provider registration", () => {
    expect(() => {
      new GitHubAwsOidcDeploymentRole("bad", {
        tier: "startup-hardened",
        owner: "kerberosmansour",
        repository: "*",
        environment: "prod",
        reusableWorkflowRef: "kerberosmansour/hulumi/.github/workflows/deploy.yml@refs/heads/*",
        audience: "sts.amazonaws.com",
        roleName: "bad",
        oidcProviderArn:
          "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com",
      });
    }).toThrow(/wildcard/);
    expect(registrations.filter((r) => !r.type.startsWith("hulumi:"))).toHaveLength(0);
  });
});
