import { afterEach, describe, expect, it } from "vitest";

import { DeploymentRepositoryFoundation } from "../src";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

describe("DeploymentRepositoryFoundation", () => {
  afterEach(() => {
    resetRegistrations();
  });

  it("composes SecureRepository and protected deployment environments", async () => {
    const repo = new DeploymentRepositoryFoundation("deploy-repo", {
      tier: "startup-hardened",
      owner: "kerberosmansour",
      name: "deployments",
      environments: [
        { name: "dev", protectedBranches: true, customBranchPolicies: false },
        {
          name: "prod",
          protectedBranches: true,
          customBranchPolicies: false,
          requiredReviewerUserIds: [12345],
          variables: { AWS_REGION: "eu-west-2" },
          secretReferences: ["PROD_DEPLOY_ROLE_ARN"],
        },
      ],
    });

    await settlePulumi();

    expect(registrations.map((r) => r.type)).toContain("hulumi:baseline:github:SecureRepository");
    expect(
      registrations.filter(
        (r) => r.type === "github:index/repositoryEnvironment:RepositoryEnvironment",
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ inputs: expect.objectContaining({ environment: "dev" }) }),
        expect.objectContaining({
          inputs: expect.objectContaining({
            environment: "prod",
            preventSelfReview: true,
            deploymentBranchPolicy: {
              protectedBranches: true,
              customBranchPolicies: false,
            },
          }),
        }),
      ]),
    );
    expect(registrations.map((r) => r.type)).toContain(
      "github:index/actionsEnvironmentVariable:ActionsEnvironmentVariable",
    );
    await expect(valueOf(repo.secretReferences)).resolves.toEqual({
      prod: ["PROD_DEPLOY_ROLE_ARN"],
    });
    await expect(valueOf(repo.provenanceEnabled)).resolves.toBe(false);
  });

  it("rejects prod environments without reviewers and branch policy", () => {
    expect(() => {
      new DeploymentRepositoryFoundation("bad-repo", {
        tier: "startup-hardened",
        owner: "kerberosmansour",
        name: "deployments",
        environments: [{ name: "prod", protectedBranches: false, customBranchPolicies: false }],
      });
    }).toThrow(/prod environment/);
  });
});
