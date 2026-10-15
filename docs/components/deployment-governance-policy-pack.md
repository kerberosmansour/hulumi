# Deployment Governance Policy Pack

`HulumiDeploymentGovernancePack` adds repository-level deployment guardrails
for projects that can deploy to AWS.

## Entry Point

```bash
pulumi up --policy-pack node_modules/@hulumi/policies/platform/packs/deployment-governance
```

## Stable Rule IDs

| Rule ID                                          | Enforcement | Purpose                                                                                                                 |
| ------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| `DEPLOY_GOV_1_REQUIRE_PROTECTED_ENVIRONMENT`     | mandatory   | Require one exact repository-bound protected environment, reusable workflow, OIDC component, and child IAM trust tuple. |
| `DEPLOY_GOV_2_NO_LONG_LIVED_AWS_SECRETS`         | mandatory   | Reject GitHub secret resources named like long-lived AWS access credentials; violation messages omit secret values.     |
| `DEPLOY_GOV_3_NO_UNAPPROVED_SELF_HOSTED_RUNNERS` | mandatory   | Reject `RunnerGovernanceFoundation` contracts that allow self-hosted runners without finite label approval.             |
| `DEPLOY_GOV_4_PRIVILEGED_WORKFLOWS_REQUIRE_OIDC` | mandatory   | Reject privileged workflow metadata that disables OIDC or names long-lived cloud credential secrets.                    |

`DEPLOY_GOV_1_REQUIRE_PROTECTED_ENVIRONMENT` does not grant an exemption for a
component name, type, repository basename, or parent type-chain. For each
deployment-capable repository, one protected `RepositoryEnvironment` must have
an exact `repository` property dependency on that repository. A matching
environment-mode `GitHubAwsOidcDeploymentRole` must carry the same repository
and environment plus an exact reusable-workflow ref.

The policy also inspects the component's actual child IAM role. Its GitHub OIDC
provider, `sts.amazonaws.com` audience, environment subject,
`job_workflow_ref`, web-identity action, and Hulumi repository/environment tags
must all carry that same tuple. Missing property edges, ref-mode roles,
unrelated environments or roles, malformed/wider trust documents, and
component declarations without the exact child trust fail closed.

For raw GitHub resources, pass the exact repository resource's `name` output to
the environment `repository` property. A repeated string literal has the same
text but no property dependency and is deliberately insufficient evidence.

`RunnerGovernanceFoundation` evidence is checked as its own contract. The pack
does not create runner settings and does not inspect source code; it validates
the Pulumi resource metadata that describes privileged workflow posture.
