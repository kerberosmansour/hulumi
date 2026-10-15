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

Configure the repository's GitHub Actions OIDC subject customization with the
matching template:

```json
{
  "use_default": false,
  "include_claim_keys": ["repo", "context", "job_workflow_ref"]
}
```

For an existing deployment role, update AWS to the customized subject first,
then apply the repository template. This creates a fail-closed interval. If the
deployment cannot tolerate that interval, create a separately named parallel
role, apply the template, verify the new path, and retire the old role. Do not
place default and customized subjects in one array because each value is an
alternative authority.

Battle-test notes:

- Keep `owner`, `repository`, environment name, and the repository portion of
  `reusableWorkflowRef` identical across the two components. DEPLOY_GOV_1 checks
  the generated environment's exact repository dependency and the child IAM
  role's trust policy and tags; matching component names alone do not count.
- Use environment subject mode for this protected-environment pattern. A
  ref-mode role is a different authority contract and does not satisfy
  DEPLOY_GOV_1.
- Confirm the generated IAM condition contains only `aud` and one customized
  scalar `sub`; AWS does not expose `job_workflow_ref` as a standalone key.
- Run `node scripts/workflow-governance-lint.mjs --repo-root <consumer-repo>`.
- Verify the generated usage block uses a full-length action SHA.
- Do not add `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` secrets.
