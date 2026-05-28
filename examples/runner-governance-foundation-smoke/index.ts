import { RunnerGovernanceFoundation } from "@hulumi/platform-patterns";

export const runnerGovernance = new RunnerGovernanceFoundation("runner-governance-smoke", {
  tier: "startup-hardened",
  owner: "kerberosmansour",
  repository: "hulumi",
  environments: [
    {
      name: "prod",
      requiredReviewers: true,
      protectedBranches: true,
    },
  ],
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

export const repoFullName = runnerGovernance.repoFullName;
export const validatorChecks = runnerGovernance.validatorChecks;
export const workflowGovernanceCliArgs = runnerGovernance.workflowGovernanceCliArgs;
