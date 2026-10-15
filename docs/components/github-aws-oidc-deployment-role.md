# GitHubAwsOidcDeploymentRole

`GitHubAwsOidcDeploymentRole` creates a narrow AWS IAM role for GitHub Actions OIDC deployments.

## Behavior

- Trust policy binds exact repository, one environment/ref context, reusable workflow, and audience in one scalar customized `sub`.
- AWS conditions contain only supported `aud` and `sub` keys. The workflow ref is embedded in `sub`.
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

## Required GitHub OIDC template

Apply this repository subject template before a workflow uses the role:

```json
{
  "use_default": false,
  "include_claim_keys": ["repo", "context", "job_workflow_ref"]
}
```

The component emits the matching subject in that order. Environment mode emits
`repo:OWNER/REPOSITORY:environment:ENVIRONMENT:job_workflow_ref:WORKFLOW@REF`;
ref mode replaces the environment pair with `ref:refs/...`.

GitHub recommends creating the matching cloud trust before changing the token
template. For an existing role, plan a fail-closed interval or create a
separately named parallel role, apply the repository template, validate the new
path, then retire the old role. Do not add the old and new subjects as array
alternatives. Organization templates also require the repository to opt in with
`use_default: false`.

Attach least-privilege application policies in real stacks. The example policy ARN is only a shape placeholder.
