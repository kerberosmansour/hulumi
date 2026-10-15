# G_OIDC_1 GitHub OIDC Trust Policy Guard

`G_OIDC_1` is the mandatory trust-policy rule used by
`HulumiGithubHardeningPack` H3. It rejects uninspectable, wildcard, or broadly
scoped GitHub Actions OIDC subjects across AWS IAM roles, Azure federated
identity credentials, and GCP Workload Identity Federation providers.

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

Each GitHub-federated statement must contain exactly one supported equality
restriction for `sub`. Missing conditions or claims, multiple attempted
restrictions, unsupported operators, non-string values, malformed JSON, and
invalid singleton/array statement structures fail closed. Singleton and array
`Statement` forms receive the same checks. This keeps omission, type confusion,
and decoy operators from bypassing the mandatory hardening pack.

## Expected Shape

Use exact equality for the repository, workflow, and environment axes. The
matching positive component is
[`GitHubAwsOidcDeploymentRole`](./github-aws-oidc-deployment-role.md), which
renders the narrow AWS trust policy and usage block for GitHub Actions.

For Azure, the literal subject must contain unique `repo`,
`job_workflow_ref`, and `environment` key/value pairs. Safe extra claim pairs,
including immutable numeric identity claims, are accepted. Missing,
non-string, empty, malformed, duplicated, or wildcard values fail closed.

For GCP, `attributeCondition` must use the rule's bounded CEL subset:
parentheses, `&&`, and exact `==` comparisons between a direct `assertion.*`
claim and a non-empty string literal. It must bind
`assertion.repository`, `assertion.job_workflow_ref`, and
`assertion.environment` exactly once. Extra direct exact equalities such as
`assertion.repository_id == '123456'` are accepted. Constant expressions,
disjunctions, functions, negation, wildcard values, missing/non-string input,
and unsupported syntax fail closed.

This stricter GCP grammar is deliberate. Text containing the expected claim
names does not prove they constrain the whole condition: for example, an
`|| true` suffix would otherwise make the condition authorize every token.
Use direct conjunctions and keep live provider attribute mappings aligned
with the asserted GitHub claims.

`G_OIDC_1` validates the GitHub OIDC subject boundary. It does not replace
`G_OIDC_2`, which correlates a trusted role with exact full-administrator
authority in the same Pulumi stack.

## Provider references

- [Microsoft Entra workload identity trust for GitHub Actions](https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation-create-trust?pivots=identity-wif-app-reg-github-actions)
- [Google Cloud workload identity federation for deployment pipelines](https://cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines)
- [GitHub OpenID Connect reference](https://docs.github.com/en/actions/reference/security/oidc)
