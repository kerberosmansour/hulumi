# Runbook: GitHub OIDC workflow binding

Status: confirmed by the user's standing instruction to continue autonomously with the SLO skills on defensive cybersecurity work.
Runbook ID: `github-oidc-workflow-binding`
Finding: `csf_94820fe24792331b1f6229d3` — AWS GitHub OIDC validation accepts branch-only trust without workflow or environment binding.
Base: `d5e0c0d9bd71909105877efc1de0a3f93c248923`
Data classification: repository names, environment names, refs, workflow paths, IAM role names, and OIDC subject templates are internal configuration. OIDC tokens and AWS credentials must not be captured in source, fixtures, logs, or evidence.

## 1. Architecture and provider evidence

AWS IAM exposes GitHub's OIDC `aud` and `sub` claims as condition keys. It does not expose `job_workflow_ref` as an independent AWS condition key. A trust policy that adds `token.actions.githubusercontent.com:job_workflow_ref` therefore does not implement the intended portable AWS boundary. GitHub supports embedding the reusable-workflow identity into `sub` with a repository OIDC customization template.

The admitted template is:

```json
{
  "include_claim_keys": ["repo", "context", "job_workflow_ref"]
}
```

GitHub emits the values in that order. The resulting AWS `sub` is one of:

- `repo:OWNER/REPOSITORY:environment:ENVIRONMENT:job_workflow_ref:OWNER/REPOSITORY/.github/workflows/WORKFLOW.yml@refs/...`
- `repo:OWNER/REPOSITORY:ref:refs/...:job_workflow_ref:OWNER/REPOSITORY/.github/workflows/WORKFLOW.yml@refs/...`

The first profile binds repository, protected environment, and reusable workflow. The second binds repository, one exact branch or tag, and reusable workflow. Branch-only, environment-only, array-valued, wildcard, optional, and set-qualified subjects remain insufficient.

Provider references:

- <https://docs.github.com/en/actions/reference/security/oidc#customizing-the-subject-claims-for-an-organization-or-repository>
- <https://docs.github.com/en/actions/reference/security/oidc#example-requiring-a-reusable-workflow-and-other-claims>
- <https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_iam-condition-keys.html#condition-keys-wif>
- <https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_condition_operators.html>
- <https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-single-vs-multi-valued-context-keys.html>

## 2. Security contract

| Contract item       | Decision                                                                                                                                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal                | Ensure every AWS GitHub OIDC deployment role binds one repository, one exact execution context, and one reusable workflow through claims AWS actually evaluates.                                                                          |
| AWS operator        | Accept exactly one scalar `StringEquals` restriction for `token.actions.githubusercontent.com:sub`.                                                                                                                                       |
| Subject grammar     | Require unique literal key/value pairs containing `repo`, `job_workflow_ref`, and exactly one of `environment` or `ref`; reject incomplete, duplicate, empty, wildcard, control-character, malformed, or overlong values.                 |
| Context             | Environment is a nonempty exact name. Ref is one exact `refs/...` value and cannot be `pull_request` or `pull_request_target`.                                                                                                            |
| Workflow            | Require one non-wildcard `OWNER/REPOSITORY/.github/workflows/FILE@refs/...` value.                                                                                                                                                        |
| Constructors        | `SecureIamDeploymentRole` and `GitHubAwsOidcDeploymentRole` embed the workflow ref in the custom `sub`; their AWS condition map contains only `aud` and `sub`.                                                                            |
| Failure behavior    | Missing or invalid workflow binding fails synchronously before provider resources are registered. Malformed or weak policy evidence yields one bounded mandatory violation.                                                               |
| Migration           | Configure the matching AWS trust before applying the GitHub subject template, as GitHub documents. Existing roles should use a planned fail-closed cutover or a separately named parallel role; do not add multiple subject alternatives. |
| Dependency contract | No dependency, manifest, lockfile, package version, publication, or live GitHub/AWS change.                                                                                                                                               |

## 3. M1 — enforce AWS reusable-workflow binding

Started: 2026-10-15
Refactor budget: two existing constructors and input types, one policy rule, three focused test files, five operator documents, one smoke example, one package README, and SLO evidence.

### Allowed files

- `docs/RUNBOOK-github-oidc-workflow-binding.md`
- `docs/slo/critique/github-oidc-workflow-binding-m1.md`
- `docs/slo/verify/github-oidc-workflow-binding-m1.md`
- `docs/slo/lessons/github-oidc-workflow-binding-m1.md`
- `docs/slo/completion/github-oidc-workflow-binding-m1.md`
- `packages/policies/src/github/g-oidc-1.ts`
- `packages/policies/tests/github/hulumi-hardening-pack.test.ts`
- `packages/baseline/src/aws/secure-aws-primitives.ts`
- `packages/baseline/src/aws/secure-aws-primitives.args.ts`
- `packages/baseline/tests/secure-aws-primitives.test.ts`
- `packages/platform-patterns/src/github-aws-oidc-deployment-role.ts`
- `packages/platform-patterns/src/github-aws-oidc-deployment-role.args.ts`
- `packages/platform-patterns/tests/github-aws-oidc-deployment-role.test.ts`
- `examples/aws-secure-primitives-smoke/index.ts`
- `docs/components/g-oidc-1.md`
- `docs/components/github-aws-oidc-deployment-role.md`
- `docs/components/aws-secure-primitives.md`
- `docs/cookbooks/github-oidc-deployment-pipeline.md`
- `docs/cookbooks/aws-secure-primitives.md`
- `packages/platform-patterns/README.md`

### BDD acceptance

| ID       | Given/when                                                                                                                                            | Then                                                                                                                         |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| BDD-M1-1 | AWS trust uses exact branch-only or environment-only `sub`                                                                                            | G_OIDC_1 emits one violation naming the missing reusable-workflow axis.                                                      |
| BDD-M1-2 | AWS trust uses a three-axis custom subject with repository, exact context, and exact workflow                                                         | G_OIDC_1 accepts it.                                                                                                         |
| BDD-M1-3 | AWS `sub` uses `ForAnyValue`, `ForAllValues`, `IfExists`, an array, duplicate restrictions, malformed pairs, wildcard values, or both/no context axes | G_OIDC_1 fails closed with one bounded violation.                                                                            |
| BDD-M1-4 | either constructor receives an exact environment/ref and exact reusable workflow                                                                      | it emits scalar `StringEquals` `aud` and custom `sub` only, in GitHub template order.                                        |
| BDD-M1-5 | either constructor omits or weakens `reusableWorkflowRef`                                                                                             | construction fails before child provider registration.                                                                       |
| BDD-M1-6 | Azure and GCP safe/unsafe cases run                                                                                                                   | their existing three-axis semantics remain unchanged.                                                                        |
| BDD-M1-7 | operator documentation is followed                                                                                                                    | the GitHub template and AWS condition match exactly, with a fail-closed migration sequence and no unsupported AWS claim key. |
| BDD-M1-8 | package/workspace/security gates run                                                                                                                  | all pass with no dependency graph or out-of-scope diff.                                                                      |

### Execution sequence

1. Run the official pinned OSV gate and the three focused baselines.
2. Add branch-only, environment-only, set-operator, `IfExists`, array, missing-workflow, malformed-workflow, and positive custom-sub scenarios; preserve intended RED failures.
3. Restrict AWS G_OIDC_1 to one scalar `StringEquals` custom subject and keep Azure/GCP behavior stable.
4. Change both constructors to require the reusable workflow and embed it in `sub`; remove the unsupported standalone AWS condition key.
5. Update the smoke example, package README, component references, and cookbooks with the GitHub template and migration order.
6. Run focused/package/workspace tests, build, typecheck, lint, formatting, OSV, Semgrep, secret review, exact allow-list, and diff hygiene.
7. Sign and DCO-stamp the exact source commit, pass exact-head CI, merge only the pinned head under standing authorization, and run xhigh Codex Security on the exact merged-main commit.

### Forbidden shortcuts

- No branch-only, environment-only, wildcard, array, set-qualified, `IfExists`, substring, description-marker, or decoy restriction.
- No standalone `token.actions.githubusercontent.com:job_workflow_ref` AWS condition key.
- No multiple allowed subject values, default-subject fallback, suppression, severity downgrade, live provider mutation, dependency addition, or fabricated evidence.
- No change to the separate Pulumi preview unknown-value finding.

### Definition of done

All BDDs and regressions pass; both generated trust policies match GitHub's documented customized-sub format using only AWS-supported condition keys; the exact-head PR is green and merged; and an exact merged-main scan no longer reports branch-only GitHub OIDC trust, unenforced workflow conditions, or equivalent occurrences.
