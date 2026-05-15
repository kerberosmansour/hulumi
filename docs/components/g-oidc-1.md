# G_OIDC_1 GitHub OIDC Trust Policy Guard

`G_OIDC_1` is the mandatory trust-policy rule used by
`HulumiGithubHardeningPack` H3. It rejects wildcard GitHub Actions OIDC
subjects across AWS IAM roles, Azure federated identity credentials, and GCP
Workload Identity Federation providers.

## AWS Condition Operators

For AWS IAM role trust policies, the rule checks the
`token.actions.githubusercontent.com:sub` condition under exact, set-qualified,
and `IfExists` string operators:

- `StringLike`, `ForAnyValue:StringLike`, `ForAllValues:StringLike`, and
  `StringLikeIfExists` are rejected whenever they target the GitHub `sub`
  claim.
- `StringEquals`, `ForAnyValue:StringEquals`, `ForAllValues:StringEquals`, and
  `StringEqualsIfExists` are accepted only when every `sub` value is
  non-empty and contains no wildcard.

This keeps a decoy condition operator from bypassing the mandatory hardening
pack.

## Expected Shape

Use exact equality for the repository, workflow, and environment axes. The
matching positive component is
[`GitHubAwsOidcDeploymentRole`](./github-aws-oidc-deployment-role.md), which
renders the narrow AWS trust policy and usage block for GitHub Actions.
