# Runbook: deployment governance evidence binding

Status: confirmed by the user's standing instruction to continue autonomously with the SLO skills on defensive cybersecurity work.
Runbook ID: `deployment-governance-evidence-binding`
Finding: `csf_f94795dde0b262c12cafc8ab` — DEPLOY_GOV_1 accepts independent or empty component evidence instead of one deployment-authority tuple.
Base: `d773186a3ccfebee1517b17c32cb3355cf77cbc9`
Data classification: repository names, environment names, workflow paths, Pulumi dependency edges, IAM role tags, and IAM trust policy documents are internal configuration. No credentials or token values are handled.

## 1. Architecture and provider evidence

GitHub documents environment subjects as `repo:ORG/REPO:environment:ENVIRONMENT` and `job_workflow_ref` as the exact reusable workflow path plus ref. AWS IAM documents GitHub OIDC trust conditions for the exact audience and subject, and added `job_workflow_ref` as a supported GitHub claim condition in May 2026. Pulumi policy resources expose property-specific dependencies, which allow an environment's `repository` input to be bound to the exact repository resource instead of a reusable basename.

DEPLOY_GOV_1 will accept a repository only when one correlated tuple exists:

1. a deployment-capable GitHub repository;
2. a protected GitHub environment whose `repository` property has a dependency on that exact repository URN;
3. an environment-scoped `GitHubAwsOidcDeploymentRole` naming the exact repository and environment and an exact reusable workflow ref for the same owner/repository;
4. an IAM role below that component whose tags and single GitHub OIDC trust statement carry the exact owner/repository/environment/workflow tuple, `sts.amazonaws.com` audience, GitHub OIDC provider, and `sts:AssumeRoleWithWebIdentity` action.

Provider references:

- <https://docs.github.com/en/actions/reference/security/oidc>
- <https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-with-reusable-workflows>
- <https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-idp_oidc.html>
- <https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_iam-condition-keys.html>
- <https://www.pulumi.com/docs/reference/pkg/python/pulumi_policy/>

## 2. Security contract

| Contract item       | Decision                                                                                                                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal                | Make deployment governance evidence one exact, inspectable repository/environment/workflow/IAM tuple.                                                                                                       |
| Threat              | An IaC author supplies an unrelated environment, a role for another environment, a same-basename component, an empty foundation, or forged component props and receives a false compliance result.          |
| Repository binding  | The environment's `repository` property must depend on the exact reviewed repository URN and carry the same concrete name.                                                                                  |
| Environment binding | The protected environment name, component subject environment, IAM `sub`, and role environment tag must be identical.                                                                                       |
| Workflow binding    | The reusable workflow ref must be an exact `OWNER/REPO/.github/workflows/...@refs/...` value and must equal the IAM `job_workflow_ref` condition.                                                           |
| Trust binding       | One child IAM role must contain exactly one Allow statement for the GitHub OIDC provider, web-identity action, exact audience, subject, and workflow. Its component/repository/environment tags must agree. |
| Component behavior  | `DeploymentRepositoryFoundation` requires at least one environment, rejects duplicates, and marks its child repository as deployment-capable so policy evaluation cannot skip it.                           |
| Failure behavior    | Unknown, malformed, unbound, ref-mode, multi-statement, wildcard, mismatched, or absent evidence produces a bounded mandatory violation without throwing.                                                   |
| Dependency contract | No dependency, manifest, lockfile, version, publication, or live GitHub/AWS change.                                                                                                                         |

## 3. M1 — bind the complete deployment-authority tuple

Started: 2026-10-15
Refactor budget: one policy implementation, one component and its input type, two focused test files, four operator documents, and SLO evidence.

### Allowed files

- `docs/RUNBOOK-deployment-governance-evidence-binding.md`
- `docs/slo/critique/deployment-governance-evidence-binding-m1.md`
- `docs/slo/verify/deployment-governance-evidence-binding-m1.md`
- `docs/slo/lessons/deployment-governance-evidence-binding-m1.md`
- `docs/slo/completion/deployment-governance-evidence-binding-m1.md`
- `packages/policies/src/platform/deployment-governance-pack.ts`
- `packages/policies/tests/platform/deployment-governance-pack.test.ts`
- `packages/platform-patterns/src/deployment-repository-foundation.ts`
- `packages/platform-patterns/src/deployment-repository-foundation.args.ts`
- `packages/platform-patterns/tests/deployment-repository-foundation.test.ts`
- `docs/components/deployment-governance-policy-pack.md`
- `docs/components/deployment-repository-foundation.md`
- `docs/cookbooks/github-oidc-deployment-pipeline.md`
- `packages/platform-patterns/README.md`

### BDD acceptance

| ID       | Given/when                                                                                                             | Then                                                                                                                  |
| -------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| BDD-M1-1 | an exact repository, bound protected environment, environment-mode component, and child IAM trust/tags carry one tuple | DEPLOY_GOV_1 emits no violation                                                                                       |
| BDD-M1-2 | environment and role evidence share only a repository basename or come from different resources/environments           | the repository receives one mandatory violation                                                                       |
| BDD-M1-3 | environment `repository` is a literal or depends on another repository                                                 | the evidence is rejected even when its string value matches                                                           |
| BDD-M1-4 | component props match but the child IAM role is missing, unrelated, malformed, wider, or has mismatched trust/tags     | the evidence is rejected without throwing                                                                             |
| BDD-M1-5 | a foundation is created without environments or with duplicate names                                                   | construction fails before child resources are registered                                                              |
| BDD-M1-6 | a valid foundation is created                                                                                          | its child repository is marked deployment-capable and its protected environments retain exact repository dependencies |
| BDD-M1-7 | DEPLOY_GOV_2 through DEPLOY_GOV_4 and existing safe inputs run                                                         | their behavior remains unchanged                                                                                      |
| BDD-M1-8 | package/workspace/security gates run                                                                                   | all pass with no dependency graph or out-of-scope diff                                                                |

### Execution sequence

1. Run the official pinned OSV gate and focused component/policy baselines.
2. Add tuple, decoy, malformed-trust, missing-edge, empty-foundation, and duplicate-environment scenarios; preserve the intended RED failures.
3. Remove component-presence exemptions, implement exact tuple correlation, and make the component's deployment intent explicit.
4. Run focused and package tests, build, typecheck, lint, formatting, workspace regressions, OSV, Semgrep, secret review, allow-list, and diff hygiene.
5. Sign and DCO-stamp the exact source commit, pass exact-head CI, merge only the pinned head under standing authorization, and run xhigh Codex Security on the exact merged-main commit.

### Forbidden shortcuts

- No component-type, logical-name, basename, description-marker, general `dependsOn`, substring, wildcard, case-folding, or whitespace-normalizing exemption.
- No trust-policy acceptance based only on component props or tags; the child IAM role trust document is mandatory evidence.
- No ref-mode role accepted as proof of a protected environment.
- No suppression, severity downgrade, dependency addition, version/publication change, live provider mutation, or fabricated evidence.

### Definition of done

All BDDs and existing regressions pass; the exact-head PR is green and merged; and an exact merged-main scan no longer reports uncorrelated/empty deployment evidence or an equivalent occurrence.
