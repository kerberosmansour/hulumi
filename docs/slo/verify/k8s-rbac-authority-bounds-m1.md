# Verification — Kubernetes RBAC authority bounds M1

Date: 2026-10-15
Runbook: `docs/RUNBOOK-k8s-rbac-authority-bounds.md`
Base: `fe9ddc9346e7266edd239ab271e4a612e982da86`
Findings: `csf_22d32a06fdca073efcb726d3` / CWE-269 and `csf_1880772fe33ed55be7f48f50` / CWE-284
Verdict: local implementation and security gates passed; exact-head CI, merge, and merged-main Codex Security remain.

The repository has no frozen `.slo.json` threat model for this pre-existing rule. Verification therefore operated in documented degraded mode and makes no stable abuse-ID claim.

## What was exercised

| Scenario                          | Category                        | How exercised                                                                                                                               | Result | Evidence                                                                                                       |
| --------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| `oc-k8s-rbac-authority-bounds-1`  | Pass 0 outcome                  | Production RBAC-1 and RBAC-2 evaluated explicit escalation verbs and unscoped Secret reads through Pulumi resource-validation inputs.       | pass   | Every explicit escalation verb and every malformed or absent Secret-name bound produced a mandatory violation. |
| `cuj-k8s-rbac-authority-bounds-1` | Pass 0 journey                  | The focused suite models an unsafe Role, preview rejection, least-privilege verb reduction, exact Secret-name scoping, and a clean preview. | pass   | Unsafe and remediated states exercise the production policy functions.                                         |
| B1–B3                             | Escalation boundary             | Table-driven tests used `bind`, `escalate`, `impersonate`, and a mixed `get` plus `impersonate` rule.                                       | pass   | Each offending rule produced exactly one RBAC-1 violation.                                                     |
| B4                                | Regression                      | The existing wildcard case and ordinary explicit workload verbs were retained.                                                              | pass   | Wildcard still failed with its established diagnostic contract; ordinary Pod reads stayed clean.               |
| B5                                | Secret boundary                 | Tests used missing, empty, blank, whitespace-bearing, wildcard-like, and scalar `resourceNames`.                                            | pass   | Every unbounded `get` failed closed with one RBAC-2 violation.                                                 |
| B6                                | Negative control                | A core Secret `get` named one exact Secret.                                                                                                 | pass   | The exact named-Secret rule produced no violation.                                                             |
| B7                                | Compatibility and data handling | Existing reasoned suppression and non-admin binding controls ran; a sensitive-looking invalid Secret name was supplied.                     | pass   | Suppression and RBAC-3 behavior were preserved, and the diagnostic did not copy the Secret name.               |
| B8                                | Regression and security         | Focused/package/workspace, OSV, and Semgrep gates ran against the milestone tree.                                                           | pass   | Focused 19/19; policy package 485/485; all 19 runnable workspace projects passed.                              |

## RED/GREEN evidence

- Baseline focused suite: 8/8.
- RED: 11 intended failures and 8 passing controls. The failures covered three explicit escalation verbs, a mixed escalation rule, six invalid Secret-name-bound shapes, and diagnostic redaction.
- GREEN: 19/19 focused tests and 485/485 policy-package tests.
- Package build, typecheck, and lint passed.
- All 19 runnable workspace projects passed topological build, typecheck, sequential tests, and lint; 1,344 tests passed, 28 were skipped, and one existing test remained todo.

## Security pass

| Gate                  | Result                                                                                                                                                                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OSV admission         | pass — official checksum-verified OSV-Scanner 2.7.0 scanned two unchanged lockfiles and 575 package occurrences with zero vulnerability and zero `MAL-*` results; report SHA-256 `10c55dbf5e83d5268eb5fa37e826477ae5eb4a972a2fe38e0a6832f28be95df4`. |
| Dependency provenance | pass — no manifest or lockfile changed and no direct/transitive package, install hook, build script, or package authority was added.                                                                                                                 |
| Semgrep               | pass — Semgrep 1.156.0 ran 210 rules over the two changed TypeScript targets with zero findings and zero errors; report SHA-256 `a4547366556e148eb79525b55b5aa1bf74dcbe2b99028f123e043292b7689259`.                                                  |
| Secret review         | pass — diagnostics contain the Role/ClusterRole URN and bounded authority class but never copy `resourceNames`, Secret names, complete rules, credentials, tokens, or private keys.                                                                  |
| DAST                  | N/A — these deterministic Pulumi preview policies expose no HTTP service or OpenAPI surface.                                                                                                                                                         |
| Live cluster          | N/A — no Kubernetes API, authorization review, admission controller, or cluster credential was used.                                                                                                                                                 |
| AI tolerance          | N/A — no AI component.                                                                                                                                                                                                                               |
| Measurement           | pass locally — all contract partitions and negative controls passed; the lagging merged-main scan remains a closeout gate.                                                                                                                           |

## Bugs found

| id                                       | severity | scenario                                                                           | regression test                                                                | status                                         |
| ---------------------------------------- | -------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------- |
| `csf_22d32a06fdca073efcb726d3` / CWE-269 | high     | Explicit `bind`, `escalate`, or `impersonate` passes a wildcard-only RBAC-1 check. | `packages/policies/tests/k8s/rbac-pack.test.ts` escalation verb matrix         | fixed locally; exact-main confirmation pending |
| `csf_1880772fe33ed55be7f48f50` / CWE-284 | high     | Unscoped `get` permits reads of any known or guessed Secret in scope.              | `packages/policies/tests/k8s/rbac-pack.test.ts` invalid `resourceNames` matrix | fixed locally; exact-main confirmation pending |

## Environment

- macOS arm64, Node.js/pnpm repository toolchain, Vitest 4.1.11.
- Production TypeScript policy functions were exercised through Pulumi `ResourceValidationPolicy` inputs; no cluster, registry, cloud, or repository secret was used.

## Coverage gaps and residual limits

- The pack inspects each declared Role/ClusterRole rule. It does not aggregate subjects, bindings, aggregated ClusterRoles, admission decisions, or live Kubernetes authorization state.
- This milestone does not add Patch-resource coverage or expand the existing resource-type inventory.
- A reviewed suppression can intentionally admit a broad controller capability; its owner and expiry discipline remain operational responsibilities.
- OSV covers known vulnerabilities and malicious-package advisories; it does not prove the absence of unknown malware.

## Pending closeout

- Sign and DCO-stamp the exact source commit.
- Pass exact-head GitHub checks and merge only that verified head under standing authorization.
- Run xhigh Codex Security against the exact merged-main commit and confirm both findings and equivalent explicit-escalation or unscoped-Secret-read bypasses are absent.
