# Runbook: Kubernetes Secrets Manager fetcher CI race

Status: confirmed by the user's standing instruction to continue autonomously with the SLO skills on defensive cybersecurity work.
Runbook ID: `k8s-secret-fetcher-ci-race`
Trigger: PR #338 exact-head CI run `38791340772`, job `116616455977`.
Base: `2d28d71143e6b4995c1ac9e14e01bfb4a21aca93`
Data classification: Secrets Manager ARNs and Kubernetes names are internal configuration. Secret values and AWS credentials are credentials and must never enter test evidence.

## 1. Failure model

`KubernetesSecretFromAwsSecretsManager` selects the module-level test fetcher inside an asynchronous Pulumi `Output.apply`. Tests restore the module-level hook in `afterEach`. On a slower clean runner, the callback can execute after teardown, observe `undefined`, and silently switch from the injected stub to the real AWS SDK. The tests then report success before Vitest surfaces late `Region is missing` rejections. This creates nondeterministic CI and an unintended live-SDK boundary in a mock-only suite.

The component instance must bind its fetch authority when it is constructed. Later mutation of the test seam must affect only future instances. Production behavior remains the default AWS SDK fetcher, and all existing fail-closed, redaction, bounds, and missing-key behavior remains unchanged.

## 2. Security contract

| Contract item            | Decision                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal                     | Remove a teardown race that can redirect mock-only tests to the live AWS SDK.                                                                                                   |
| Authority binding        | Capture `activeFetcher ?? defaultFetcher` synchronously after validation and before any asynchronous `Output.apply` callback.                                                   |
| Test evidence            | Construct with an injected fetcher, reset the global seam immediately, then prove the already-created instance still uses the captured fetcher and renders the expected secret. |
| Boundary at maximum size | The 64-key constructor control uses an explicit local fetcher and settles Pulumi so it cannot leave background work.                                                            |
| Failure behavior         | Fetch, parse, nesting, and missing-key failures remain deployment-blocking by default.                                                                                          |
| Dependency contract      | No dependency, manifest, lockfile, version, publication, workflow, or live-cloud change.                                                                                        |

## 3. M1 — seal the instance fetcher and prove deterministic teardown

Started: 2026-10-15
Refactor budget: one implementation file, one focused test file, and five SLO evidence documents.

### Allowed files

- `docs/RUNBOOK-k8s-secret-fetcher-ci-race.md`
- `docs/slo/critique/k8s-secret-fetcher-ci-race-m1.md`
- `docs/slo/verify/k8s-secret-fetcher-ci-race-m1.md`
- `docs/slo/lessons/k8s-secret-fetcher-ci-race-m1.md`
- `docs/slo/completion/k8s-secret-fetcher-ci-race-m1.md`
- `packages/k8s-baseline/src/kubernetes-secret-from-asm.ts`
- `packages/k8s-baseline/tests/kubernetes-secret-from-asm.test.ts`

### BDD acceptance

| ID       | Given/when                                                                                               | Then                                                                                     |
| -------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| BDD-M1-1 | a component is constructed while a test fetcher is installed and the hook is reset before Pulumi settles | the instance uses only the captured fetcher and renders the injected value               |
| BDD-M1-2 | a later component is constructed after reset                                                             | it selects the production default independently; the first instance cannot be redirected |
| BDD-M1-3 | the maximum 64-entry key mapping is exercised                                                            | construction and all asynchronous mock work settle without a live AWS request            |
| BDD-M1-4 | fetch, malformed JSON, excessive nesting, or missing keys occur                                          | the existing fail-closed and redacted behavior remains unchanged                         |
| BDD-M1-5 | focused, package, workspace, security, and exact-head CI gates run                                       | they pass without late unhandled rejections or dependency-graph changes                  |

### Execution sequence

1. Preserve the exact-main CI failure and focused/package baselines.
2. Add a deterministic regression that resets the fetcher immediately after construction; record the RED result.
3. Move fetcher selection outside the asynchronous callback and make the maximum-bound control explicitly mock-only.
4. Run focused and package tests repeatedly with AWS configuration disabled, then workspace build, sequential tests, typecheck, lint, formatting, OSV, Semgrep, secret review, allow-list, and diff hygiene.
5. Sign and DCO-stamp the exact source commit, pass exact-head CI, merge the pinned head under standing authorization, and rebase the blocked Cloudflare PR onto the repaired main branch.

### Forbidden shortcuts

- No environment-wide fake AWS region, credential injection, ignored unhandled rejection, retry-only workaround, sleep, timer, or weakened failure mode.
- No test call to the real AWS SDK and no test secret or credential.
- No dependency, workflow, version, publication, or unrelated component change.

### Definition of done

The RED race is reproduced and fixed by instance-local authority binding; all regression and security gates pass; the exact-head PR is green and merged; and PR #338 can pass the same clean-runner workspace gate after rebasing.
