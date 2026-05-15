# GitHubAwsOidcDeploymentRole

`GitHubAwsOidcDeploymentRole` creates a narrow AWS IAM role for GitHub Actions OIDC deployments.

## Behavior

- Trust policy binds exact repository, environment, reusable workflow ref, and audience.
- Wildcards are rejected before provider registration.
- Policy attachments use `RolePolicyAttachment`; no long-lived AWS access-key examples are emitted.
- The usage block uses `id-token: write` and a placeholder for a full-length pinned action SHA.

```ts
import { GitHubAwsOidcDeploymentRole } from "@hulumi/platform-patterns";

new GitHubAwsOidcDeploymentRole("deploy", {
  tier: "startup-hardened",
  owner: "kerberosmansour",
  repository: "hulumi",
  environment: "prod",
  reusableWorkflowRef: "kerberosmansour/hulumi/.github/workflows/deploy.yml@refs/heads/main",
  audience: "sts.amazonaws.com",
  roleName: "hulumi-prod-deploy",
  oidcProviderArn: "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com",
  policyArns: ["arn:aws:iam::aws:policy/ReadOnlyAccess"],
});
```

Attach least-privilege application policies in real stacks. The example policy ARN is only a shape placeholder.
