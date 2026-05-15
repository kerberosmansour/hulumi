# GitHub OIDC Deployment Pipeline

Pair `DeploymentRepositoryFoundation` with `GitHubAwsOidcDeploymentRole` so
deployments use protected environments and OIDC, not static cloud keys.

```ts
import {
  DeploymentRepositoryFoundation,
  GitHubAwsOidcDeploymentRole,
} from "@hulumi/platform-patterns";

new DeploymentRepositoryFoundation("deployments", {
  tier: "startup-hardened",
  owner: "example-org",
  name: "deployments",
  environments: [
    {
      name: "prod",
      requiredReviewerTeamIds: [1234],
      protectedBranches: true,
      customBranchPolicies: false,
      secretReferences: ["PROD_DEPLOY_ROLE_ARN"],
    },
  ],
});

new GitHubAwsOidcDeploymentRole("prod-deploy", {
  tier: "startup-hardened",
  owner: "example-org",
  repository: "deployments",
  environment: "prod",
  reusableWorkflowRef: "example-org/deployments/.github/workflows/deploy.yml@refs/heads/main",
  audience: "sts.amazonaws.com",
  roleName: "prod-deploy",
  oidcProviderArn: "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com",
});
```

Battle-test notes:

- Run `node scripts/workflow-governance-lint.mjs --repo-root <consumer-repo>`.
- Verify the generated usage block uses a full-length action SHA.
- Do not add `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` secrets.
