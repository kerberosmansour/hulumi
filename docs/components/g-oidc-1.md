# G_OIDC_1 GitHub OIDC Trust Policy Guard

`G_OIDC_1` is the mandatory trust-policy rule used by
`HulumiGithubHardeningPack` H3. It rejects uninspectable, wildcard, or broadly
scoped GitHub Actions OIDC subjects across AWS IAM roles, Azure federated
identity credentials, and GCP Workload Identity Federation providers.

## AWS Condition Operators

For AWS IAM role trust policies, the rule requires exactly one scalar
`StringEquals` restriction for `token.actions.githubusercontent.com:sub`.
`StringLike`, set-qualified operators, `IfExists`, arrays, and duplicate
restrictions fail closed. AWS documents `sub` as a single-valued OIDC condition
key, `IfExists` can succeed when the claim is absent, and multiple policy values
are alternatives rather than cumulative restrictions.

The literal subject must contain unique key/value pairs for `repo`,
`job_workflow_ref`, and exactly one execution context: `environment` or `ref`.
The repository must be one exact `OWNER/REPOSITORY`, the workflow must name one
`.github/workflows/*` file at an exact branch or tag ref, and a `ref` context
must be one exact `refs/*` value. Missing, duplicate, malformed, empty,
wildcard, pull-request, array-valued, and overlong subjects fail closed.

## Expected Shape

AWS does not expose `job_workflow_ref` as an independent GitHub OIDC condition
key. Configure GitHub's customized `sub` template as follows so AWS can enforce
the workflow identity:

```json
{
  "include_claim_keys": ["repo", "context", "job_workflow_ref"]
}
```

This yields
`repo:OWNER/REPOSITORY:environment:ENVIRONMENT:job_workflow_ref:WORKFLOW@REF`
or `repo:OWNER/REPOSITORY:ref:REF:job_workflow_ref:WORKFLOW@REF`. The matching
positive component is
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
- [AWS OIDC federation condition keys](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_iam-condition-keys.html#condition-keys-wif)
- [AWS condition operators](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_condition_operators.html)
