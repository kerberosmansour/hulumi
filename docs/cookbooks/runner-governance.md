---
title: Roll out GitHub runner governance
description: Prove protected environments, OIDC deployment identity, and self-hosted runner approval before privileged GitHub Actions deployments.
---

# Roll out GitHub runner governance

## When To Use This Recipe

Use this when a GitHub Actions workflow can deploy to cloud infrastructure, run `pulumi destroy`, or assume a cloud role. The goal is to make the workflow prove three things: the environment exists live in GitHub settings, reviewers are active for production, and runner usage is either GitHub-hosted or explicitly approved.

## Preconditions

- `@hulumi/platform-patterns` and `@hulumi/policies` installed.
- GitHub Actions workflows use SHA-pinned actions and top-level minimum permissions.
- Deployment jobs use GitHub OIDC for cloud access.
- For live checks, `gh auth status` succeeds or CI provides a token with read access to repo environments and runner metadata.

## Steps

1. Add the runner governance contract:

```ts
import { RunnerGovernanceFoundation } from "@hulumi/platform-patterns";

export const runnerGovernance = new RunnerGovernanceFoundation("runner-governance", {
  tier: "startup-hardened",
  owner: "example-org",
  repository: "service",
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

2. Keep self-hosted runners denied unless you have a finite label approval:

```ts
approvedSelfHostedRunnerLabels: ["linux", "x64", "deploy-prod"];
```

3. Run static workflow governance:

```bash
pnpm run lint:workflow-governance
```

4. Run live environment checks when `gh` can read repo settings:

```bash
pnpm run lint:workflow-governance -- --check-settings
```

5. If a self-hosted runner is intentionally approved, pass every non-`self-hosted` label:

```bash
pnpm run lint:workflow-governance -- --check-settings \
  --allow-self-hosted-runner-label linux \
  --allow-self-hosted-runner-label x64 \
  --allow-self-hosted-runner-label deploy-prod
```

6. Add the deployment governance policy pack so malformed component props are caught in preview:

```yaml
runtime: nodejs
policies:
  - name: hulumi-deployment-governance
    path: node_modules/@hulumi/policies/platform/packs/deployment-governance
```

## Verify

- `pnpm --filter @hulumi/platform-patterns test -- --run tests/runner-governance-foundation.test.ts`
- `pnpm --filter @hulumi/policies test -- --run tests/platform/deployment-governance-pack.test.ts`
- `pnpm --filter @hulumi/drift test -- --run tests/live-validator.test.ts`
- `pnpm run lint:workflow-governance`

## Incident Playbook: Suspected GitHub Action Compromise

1. Disable the affected workflow.
2. Inspect recent workflow runs, environment approvals, runner labels, and any newly registered self-hosted runners.
3. Rotate any cloud credentials that may have been reachable. Prefer deleting long-lived cloud secrets and restoring OIDC-only deployment.
4. Run:

```bash
pnpm run lint:workflow-governance -- --check-settings
```

5. Re-pin any replaced actions to full 40-character SHAs.
6. Re-enable the workflow only after environment reviewers and runner approvals match the governance contract.

## Troubleshooting

- `WF_ENV_2_LIVE_ENVIRONMENT_EXISTS`: the workflow names an environment that GitHub settings cannot resolve. Create or correct the environment before treating the workflow as protected.
- `WF_ENV_3_LIVE_ENVIRONMENT_REQUIRES_REVIEWERS`: production exists but lacks required reviewers. Add reviewers or narrow the environment contract.
- `WF_RUNNER_1_SELF_HOSTED_REQUIRES_APPROVAL`: a job uses `self-hosted` without a full finite label approval list.
- `GH_RUNNER_2_PAGE_CAP_COMPLETE`: the live runner scan hit its page cap. Increase the bounded cap or narrow repo scope; do not mark the check clean.

## See Also

- [RunnerGovernanceFoundation](../components/runner-governance-foundation.md)
- [Workflow governance linter](../components/workflow-governance-linter.md)
- [Deployment governance policy pack](../components/deployment-governance-policy-pack.md)
