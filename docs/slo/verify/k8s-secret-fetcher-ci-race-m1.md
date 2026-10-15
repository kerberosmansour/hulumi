# Verification — Kubernetes Secrets Manager fetcher CI race M1

Date: 2026-10-15
Runbook: `docs/RUNBOOK-k8s-secret-fetcher-ci-race.md`
Base: `2d28d71143e6b4995c1ac9e14e01bfb4a21aca93`
Status: local verification passed; exact-head GitHub CI and merge evidence pending.

## Failure and RED evidence

- Exact-main code reproduced in PR #338 CI run `38791340772`, job `116616455977`: all 271 Kubernetes package assertions passed, followed by 27 unhandled `FailClosedError` rejections whose cause was `Region is missing` after the test hook had been restored.
- The release dry-run failure in job `116617269126` was its intended dependency on the failed workspace verification, not a second product defect.
- A deterministic regression constructed the component with an injected fetcher, reset the hook before Pulumi settled, and failed on the unmodified implementation: the injected function was called zero times and the instance attempted the default AWS SDK fetcher.

## GREEN evidence

| Gate                                                                 | Result                                       |
| -------------------------------------------------------------------- | -------------------------------------------- |
| Focused regression with AWS config and metadata disabled             | 16/16 passed                                 |
| Focused scheduling stress                                            | 5 consecutive runs, 16/16 passed each        |
| `@hulumi/k8s-baseline` package with AWS config and metadata disabled | 21 files, 272/272 passed                     |
| Workspace build                                                      | 19/19 projects passed                        |
| Workspace typecheck                                                  | 19/19 projects passed                        |
| Sequential workspace test with AWS config and metadata disabled      | 19/19 projects passed with no late rejection |
| Workspace lint                                                       | 19/19 projects passed                        |
| Prettier                                                             | passed                                       |
| Exact dependency pin guard                                           | 14/14 pinned dependencies passed             |
| License boundary                                                     | passed                                       |
| Workflow governance and maintenance tests                            | passed; 6/6 Python tests                     |
| Diff hygiene                                                         | `git diff --check` passed                    |

## Dependency admission and security evidence

- Before materializing dependencies in the fresh worktree, `python3 scripts/osv-dependency-gate.py` ran the repository-pinned, checksum-verified OSV-Scanner 2.7.0 over both resolved lockfiles and 575 package occurrences. It reported zero vulnerability and zero malicious-package findings.
- Dependencies were then materialized from the existing local store using `pnpm install --offline --frozen-lockfile --ignore-scripts`: no download, resolution change, lifecycle script, manifest change, or lockfile change occurred.
- The final OSV report is byte-identical to baseline: SHA-256 `d71df953470078569fec8ab5f7e404941478447c6123141e894f6a74c53e89eb`.
- Semgrep 1.156.0 ran 74 `p/typescript` rules on the two changed TypeScript files with zero findings and zero errors. Report SHA-256: `635e17f27898969b738fbd701061571a05624f669bf00aaff4b6f979f9a86199`.
- A changed-diff scan found no AWS access-key ids, private-key markers, GitHub token shapes, or bearer tokens.
- Dependency, manifest, lockfile, version, publication, workflow, and live-cloud diffs are empty.

## BDD disposition

| ID       | Evidence                                                                                                              | Result                              |
| -------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| BDD-M1-1 | Immediate hook reset regression calls the captured fetcher exactly once and renders `captured-user`.                  | pass                                |
| BDD-M1-2 | Fetcher selection is a synchronous constructor-local constant; callback code no longer reads the mutable module hook. | pass                                |
| BDD-M1-3 | The 64-key boundary uses a complete injected payload, settles Pulumi, and proves 64 rendered keys.                    | pass                                |
| BDD-M1-4 | Existing fetch, parse, depth, missing-key, and redaction scenarios remain green.                                      | pass                                |
| BDD-M1-5 | Focused, package, workspace, governance, OSV, Semgrep, secret, and diff gates pass locally.                           | pass locally; exact-head CI pending |

## Residual limits

- This milestone verifies the Pulumi mock runtime and does not contact AWS or Kubernetes.
- The module-scoped hook remains an internal test seam. Each component now snapshots it; tests that intentionally run component construction concurrently must still install the intended hook before each synchronous construction.
