# Deployment Governance Policy Pack

`HulumiDeploymentGovernancePack` adds repository-level deployment guardrails
for projects that can deploy to AWS.

## Entry Point

```bash
pulumi up --policy-pack node_modules/@hulumi/policies/platform/packs/deployment-governance
```

## Stable Rule IDs

| Rule ID                                      | Enforcement | Purpose                                                                                                                           |
| -------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `DEPLOY_GOV_1_REQUIRE_PROTECTED_ENVIRONMENT` | mandatory   | Require deployment-capable repositories to have protected GitHub environment evidence and `GitHubAwsOidcDeploymentRole` evidence. |
| `DEPLOY_GOV_2_NO_LONG_LIVED_AWS_SECRETS`     | mandatory   | Reject GitHub secret resources named like long-lived AWS access credentials; violation messages omit secret values.               |

`DeploymentRepositoryFoundation` positive fixtures pass cleanly, since the
component owns environment protection and keeps deployment secret values out of
Pulumi state.
