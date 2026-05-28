import { afterEach, describe, expect, it } from "vitest";

import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

describe("RunnerGovernanceFoundation", () => {
  afterEach(() => {
    resetRegistrations();
  });

  it("registers a bounded runner-governance contract for protected OIDC deployments", async () => {
    const mod = (await import("../src")) as Record<string, unknown>;
    expect(mod.RunnerGovernanceFoundation).toBeTypeOf("function");
    const RunnerGovernanceFoundation = mod.RunnerGovernanceFoundation as new (
      name: string,
      args: {
        tier: "startup-hardened";
        owner: string;
        repository: string;
        environments: Array<{
          name: "prod";
          requiredReviewers: true;
          protectedBranches: true;
        }>;
        privilegedWorkflows: Array<{
          workflowPath: string;
          jobName: string;
          environmentName: "prod";
          runsOn: string[];
          oidcRequired: true;
        }>;
      },
    ) => {
      repoFullName: import("@pulumi/pulumi").Output<string>;
      requiredEnvironmentNames: import("@pulumi/pulumi").Output<string[]>;
      workflowGovernanceCliArgs: import("@pulumi/pulumi").Output<string[]>;
    };

    const governance = new RunnerGovernanceFoundation("runner-governance", {
      tier: "startup-hardened",
      owner: "kerberosmansour",
      repository: "hulumi",
      environments: [{ name: "prod", requiredReviewers: true, protectedBranches: true }],
      privilegedWorkflows: [
        {
          workflowPath: ".github/workflows/deploy.yml",
          jobName: "deploy",
          environmentName: "prod",
          runsOn: ["ubuntu-latest"],
          oidcRequired: true,
        },
      ],
    });

    await settlePulumi();

    expect(registrations.map((r) => r.type)).toContain(
      "hulumi:platform:RunnerGovernanceFoundation",
    );
    await expect(valueOf(governance.repoFullName)).resolves.toBe("kerberosmansour/hulumi");
    await expect(valueOf(governance.requiredEnvironmentNames)).resolves.toEqual(["prod"]);
    await expect(valueOf(governance.workflowGovernanceCliArgs)).resolves.toContain(
      "--check-settings",
    );
  });

  it("rejects production environments without reviewer protection", async () => {
    const mod = (await import("../src")) as Record<string, unknown>;
    const RunnerGovernanceFoundation = mod.RunnerGovernanceFoundation as new (
      name: string,
      args: unknown,
    ) => unknown;

    expect(() => {
      new RunnerGovernanceFoundation("bad-prod", {
        tier: "startup-hardened",
        owner: "kerberosmansour",
        repository: "hulumi",
        environments: [{ name: "prod", protectedBranches: true }],
      });
    }).toThrow(/prod environment requires reviewer/i);
  });

  it("blocks self-hosted runners by default for privileged jobs", async () => {
    const mod = (await import("../src")) as Record<string, unknown>;
    const RunnerGovernanceFoundation = mod.RunnerGovernanceFoundation as new (
      name: string,
      args: unknown,
    ) => unknown;

    expect(() => {
      new RunnerGovernanceFoundation("self-hosted-denied", {
        tier: "startup-hardened",
        owner: "kerberosmansour",
        repository: "hulumi",
        environments: [{ name: "prod", requiredReviewers: true, protectedBranches: true }],
        privilegedWorkflows: [
          {
            workflowPath: ".github/workflows/deploy.yml",
            jobName: "deploy",
            environmentName: "prod",
            runsOn: ["self-hosted", "linux", "x64", "deploy-prod"],
            oidcRequired: true,
          },
        ],
      });
    }).toThrow(/self-hosted runner/i);
  });

  it("allows self-hosted runners only when every label is explicitly approved", async () => {
    const mod = (await import("../src")) as Record<string, unknown>;
    const RunnerGovernanceFoundation = mod.RunnerGovernanceFoundation as new (
      name: string,
      args: unknown,
    ) => {
      approvedSelfHostedRunnerLabels: import("@pulumi/pulumi").Output<string[]>;
    };

    const governance = new RunnerGovernanceFoundation("self-hosted-approved", {
      tier: "startup-hardened",
      owner: "kerberosmansour",
      repository: "hulumi",
      environments: [{ name: "prod", requiredReviewers: true, protectedBranches: true }],
      approvedSelfHostedRunnerLabels: ["linux", "x64", "deploy-prod"],
      privilegedWorkflows: [
        {
          workflowPath: ".github/workflows/deploy.yml",
          jobName: "deploy",
          environmentName: "prod",
          runsOn: ["self-hosted", "linux", "x64", "deploy-prod"],
          oidcRequired: true,
        },
      ],
    });

    await settlePulumi();
    await expect(valueOf(governance.approvedSelfHostedRunnerLabels)).resolves.toEqual([
      "deploy-prod",
      "linux",
      "x64",
    ]);
  });

  it("rejects privileged workflow metadata that disables OIDC or declares cloud secrets", async () => {
    const mod = (await import("../src")) as Record<string, unknown>;
    const RunnerGovernanceFoundation = mod.RunnerGovernanceFoundation as new (
      name: string,
      args: unknown,
    ) => unknown;

    expect(() => {
      new RunnerGovernanceFoundation("long-lived-secret", {
        tier: "startup-hardened",
        owner: "kerberosmansour",
        repository: "hulumi",
        environments: [{ name: "prod", requiredReviewers: true, protectedBranches: true }],
        privilegedWorkflows: [
          {
            workflowPath: ".github/workflows/deploy.yml",
            jobName: "deploy",
            environmentName: "prod",
            runsOn: ["ubuntu-latest"],
            oidcRequired: false,
            longLivedCloudSecretNames: ["AWS_ACCESS_KEY_ID"],
          },
        ],
      });
    }).toThrow(/OIDC|long-lived cloud secret/i);
  });
});
