# RunnerGovernanceFoundation

`RunnerGovernanceFoundation` records the GitHub deployment runner contract that the workflow-governance linter and live validator must prove before a privileged deployment is treated as startup-hardened.

It is intentionally infra-only: it models GitHub environments, deployment jobs, OIDC use, and runner labels. It does not author CodeQL queries, Semgrep rules, custom secret-scanning patterns, or per-PR scanning workflows.

## What It Enforces

- `prod` environments require reviewer protection plus branch policy.
- Privileged deployment jobs must reference a known environment.
- Privileged deployment jobs must use OIDC rather than long-lived cloud credential secrets.
- Self-hosted runners are blocked by default.
- Self-hosted runner approval is a finite label allow-list. Every non-`self-hosted` label on the job must be explicitly approved.
- The component emits validator-check descriptors and the matching workflow-governance CLI arguments.

## Minimal Example

```ts
import { RunnerGovernanceFoundation } from "@hulumi/platform-patterns";

export const runnerGovernance = new RunnerGovernanceFoundation("runner-governance", {
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
```

## Self-Hosted Runner Exception

Self-hosted runners remain denied unless the labels are explicit and finite:

```ts
new RunnerGovernanceFoundation("runner-governance", {
  tier: "startup-hardened",
  owner: "example",
  repository: "service",
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
```

The matching linter command is available as `workflowGovernanceCliArgs` and has the same shape as:

```bash
pnpm run lint:workflow-governance -- --check-settings \
  --allow-self-hosted-runner-label linux \
  --allow-self-hosted-runner-label x64 \
  --allow-self-hosted-runner-label deploy-prod
```

## Validator Evidence

The M7 live validator helper emits these finding IDs:

- `WF_ENV_2_LIVE_ENVIRONMENT_EXISTS`
- `WF_ENV_3_LIVE_ENVIRONMENT_REQUIRES_REVIEWERS`
- `WF_RUNNER_1_SELF_HOSTED_REQUIRES_APPROVAL`
- `GH_RUNNER_2_PAGE_CAP_COMPLETE`
- `DEPLOY_GOV_2_NO_LONG_LIVED_AWS_SECRETS`

Use them in scheduled governance artifacts alongside `hulumi validate live`. Resolver errors and page-cap truncation are findings, never clean passes.

## Policy Backstops

`@hulumi/policies/platform` adds:

- `DEPLOY_GOV_3_NO_UNAPPROVED_SELF_HOSTED_RUNNERS`
- `DEPLOY_GOV_4_PRIVILEGED_WORKFLOWS_REQUIRE_OIDC`

The metadata cites framework IDs only: `NIST-800-218A:PO.5`, `NIST-800-218A:PS.2`, `NIST-SSDF-v1.1:PW.6`, and `NIST-SSDF-v1.1:PS.2`.
