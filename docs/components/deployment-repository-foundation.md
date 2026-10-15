# DeploymentRepositoryFoundation

`DeploymentRepositoryFoundation` composes `SecureRepository` and adds protected deployment environments.

## Behavior

- Supports `dev`, `staging`, and `prod` environments.
- Requires at least one environment and rejects duplicate environment names.
- Requires reviewers and a branch policy for `prod`.
- Marks the child repository with the `deployment` topic so deployment
  governance cannot skip it.
- Creates environment variables when values are supplied.
- Records secret names as references only; it does not write secret values into Pulumi state.
- Provenance stays optional and is surfaced through `provenanceEnabled`.

```ts
import { DeploymentRepositoryFoundation } from "@hulumi/platform-patterns";

new DeploymentRepositoryFoundation("deploy-repo", {
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
```

Pair each governed environment with an environment-mode
`GitHubAwsOidcDeploymentRole` for the same owner, repository, and environment,
including an exact reusable workflow ref. Under DEPLOY_GOV_1, the environment's
repository property dependency and the role's child IAM trust must carry one
matching tuple. A foundation without a paired role does not satisfy deployment
governance.

Migration: callers that previously omitted `environments` must add at least one
unique environment. An empty list now throws before child resources are
registered.
