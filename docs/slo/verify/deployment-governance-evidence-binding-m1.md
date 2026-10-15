# Verification — deployment governance evidence binding M1

Date: 2026-10-15
Runbook: `docs/RUNBOOK-deployment-governance-evidence-binding.md`
Base: `d773186a3ccfebee1517b17c32cb3355cf77cbc9`
Finding: `csf_f94795dde0b262c12cafc8ab`
Verdict: local implementation and security gates passed; exact-head CI, merge, and merged-main Codex Security remain.

## Outcome and BDD evidence

| Evidence | Result |
| --- | --- |
| Baseline | The existing deployment-governance policy suite passed 12/12 and the existing repository-foundation suite passed 2/2. Official OSV-Scanner 2.7.0 scanned both resolved lockfiles and 575 package occurrences with zero vulnerabilities and zero `MAL-*`. |
| RED | The expanded policy suite produced 15 intended failures with 7 controls passing. The expanded component suite produced 3 intended failures with 1 control passing. The failures covered unbound/misbound environments, independently matched evidence, missing or malformed child trust, trust/tag mismatches, ref mode, empty environments, duplicate environments, component presence, and component-child ancestry. |
| Repository binding | A protected environment is accepted only when its concrete repository name matches and its `repository` property depends on the exact reviewed repository type and URN. |
| Deployment authority | The environment name, component environment subject, repository, audience, reusable workflow ref, role tags, OIDC principal, IAM subject, action, audience, and `job_workflow_ref` must form one exact tuple. |
| Trust boundary | Evidence requires the deterministic IAM role child of the OIDC component, one exact Allow statement, `sts:AssumeRoleWithWebIdentity`, an exact supported GitHub OIDC provider ARN, and only the three required `StringEquals` claims. Missing, malformed, wider, or mismatched trust is rejected without throwing. |
| Component contract | `DeploymentRepositoryFoundation` rejects missing, empty, and duplicate environment lists and marks its repository with the existing `deployment` topic. Valid environment resources retain exact property dependencies on that repository. |
| Focused/package regression | Final focused suites passed 32/32 policy tests and 4/4 component tests. The complete `@hulumi/policies` suite passed 421/421; the complete `@hulumi/platform-patterns` suite passed 79 tests with 9 intentional integration skips. Both packages passed build, typecheck, and lint. |
| Workspace regression | Recursive test, build, typecheck, and lint passed across all 19 runnable workspace projects. |

## Security and repository evidence

| Gate | Result |
| --- | --- |
| OSV admission | Official checksum-verified OSV-Scanner 2.7.0 scanned two unchanged resolved lockfiles and 575 package occurrences with zero vulnerability results and zero `MAL-*`; baseline and final report SHA-256 `10c55dbf5e83d5268eb5fa37e826477ae5eb4a972a2fe38e0a6832f28be95df4`. |
| Dependency diff | No manifest or lockfile changed, and the implementation added no dependency, lifecycle script, build script, or package authority. |
| Semgrep | Semgrep 1.156.0 ran 74 TypeScript rules over the five changed TypeScript files with zero findings and zero errors; report SHA-256 `8ef141a10e3275593287516b2ad015382584bcddda95fd11f0865d3c220db168`. |
| Secret review | Added lines contain no credential, token, private-key, secret, or live account material. Test values are inert repository, environment, workflow, account-number, and IAM policy fixtures. |
| Repository governance | Prettier, license-boundary, exact-pin, workflow-governance, exact allow-list, and `git diff --check` passed. |

## Residual limits

- The policy validates resources visible in one Pulumi stack. A protected environment, OIDC role, or trust policy created outside that evaluation needs an inventory or runtime control.
- Repository identity is proved by Pulumi's property-specific dependency on the exact repository resource. The GitHub provider's configured owner is not exposed as a repository input, so the owner is proved by exact agreement between the OIDC component, reusable workflow ref, role tag, and IAM subject.
- Unknown/computed policy inputs fail closed and may require a later preview or update when their concrete values become available.
- Tests exercise Pulumi registrations and policy inputs locally and make no live GitHub or AWS calls.

## Pending closeout

- Sign and DCO-stamp the exact source commit.
- Pass exact-head GitHub checks and merge only that verified head under standing authorization.
- Run xhigh Codex Security against the exact merged-main commit and confirm the source finding and equivalent evidence-recombination bypasses are absent.
