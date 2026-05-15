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
