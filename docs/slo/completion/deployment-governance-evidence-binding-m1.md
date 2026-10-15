# Completion summary — deployment governance evidence binding M1

Date: 2026-10-15
Status: local execution and verification complete; exact-head and merged-main gates pending.

## Delivered

- Replaced independent protected-environment and OIDC-component presence checks with one exact repository/environment/workflow/IAM authority tuple.
- Bound a GitHub environment to the reviewed repository through the exact `repository` property dependency, resource type, URN, and concrete name.
- Required an environment-scoped `GitHubAwsOidcDeploymentRole` with the exact owner, repository, environment, audience, supported GitHub OIDC provider ARN, and pinned reusable workflow ref.
- Required the component's deterministic child IAM role, matching component/repository/environment tags, and one exact GitHub OIDC trust statement with the web-identity action and exact audience, subject, and `job_workflow_ref` conditions.
- Removed the presence-only `DeploymentRepositoryFoundation` and component-child exemptions.
- Made `DeploymentRepositoryFoundation.environments` required, rejected missing, empty, and duplicate environment lists at runtime, and marked its child repository as deployment-capable.
- Added adversarial policy and component tests and updated the component, policy-pack, cookbook, and README migration guidance.

## Evidence

- Baselines: deployment-governance policy 12/12; repository foundation 2/2.
- RED: policy 15 intended failures with 7 controls passing; component 3 intended failures with 1 control passing.
- Final focused suites: policy 32/32; component 4/4.
- Complete package suites: `@hulumi/policies` 421/421; `@hulumi/platform-patterns` 79 passed with 9 intentional integration skips.
- Full workspace test, build, typecheck, and lint passed across 19 runnable projects; formatting and governance gates passed.
- OSV-Scanner 2.7.0: two unchanged lockfiles, 575 package occurrences, zero vulnerabilities and zero `MAL-*`.
- Semgrep 1.156.0: 74 TypeScript rules, five targets, zero findings and zero errors.
- Secret review, exact allow-list, dependency diff, and diff hygiene passed.
- No dependency, manifest, lockfile, package version, publication, or live-cloud change.

## Remaining gates

- Signed+DCO exact source commit and exact-head GitHub CI.
- Authorized merge of the exact green head.
- Exact merged-main xhigh Codex Security scan with `csf_f94795dde0b262c12cafc8ab` and equivalent evidence-recombination bypasses absent.
