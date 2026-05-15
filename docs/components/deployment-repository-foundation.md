# DeploymentRepositoryFoundation

`DeploymentRepositoryFoundation` composes `SecureRepository` and adds protected deployment environments.

## Behavior

- Supports `dev`, `staging`, and `prod` environments.
- Requires reviewers and a branch policy for `prod`.
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
