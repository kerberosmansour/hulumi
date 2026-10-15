# Verification — GitHub OIDC effective authority M1

Date: 2026-10-15
Runbook: `docs/RUNBOOK-github-oidc-effective-authority.md`
Base: `90c3b6b3dba208b35444368e8ec6e2adba1209dc`
Finding: `csf_27b2f83bd7908229e9a00792` / CWE-269
Verdict: local implementation and security gates passed; exact-head CI, merge, and merged-main Codex Security remain.

The repository has no frozen `.slo.json` threat model for this pre-existing policy helper. Verification therefore operated in documented degraded mode and makes no stable abuse-ID claim.

## What was exercised

| Scenario                                | Category          | How exercised                                                                                                                                     | Result | Evidence                                                                                                             |
| --------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| `oc-github-oidc-effective-authority-1`  | Pass 0 outcome    | Production `G_OIDC_2` evaluated an inline `Allow + NotAction` policy, a scoped positive allowlist, and a deny-side complement twin.               | pass   | Unsafe allow complement produced one mandatory violation; both negative controls produced none.                      |
| `cuj-github-oidc-effective-authority-1` | Pass 0 journey    | The policy graph correlated inline and customer-managed documents to the exact GitHub-OIDC-trusted role through dependency and exact-value edges. | pass   | All supported role, `RolePolicy`, `RolePolicyAttachment`, exclusive attachment, and generic attachment paths passed. |
| B1–B2                                   | BDD               | Focused Vitest cases invoked the production stack-validation policy for role inline and linked `RolePolicy` documents.                            | pass   | Both complement forms were silent before the repair and mandatory after it.                                          |
| B3                                      | BDD               | One in-stack customer-managed policy was exercised through direct role, dependency, exact ARN, and every supported attachment resource.           | pass   | Every supported attachment form reported exactly one bounded violation.                                              |
| B4                                      | Security boundary | Table-driven cases used empty arrays, null values, scalar/array values, and combined complement keys.                                             | pass   | Own-property presence on an `Allow` statement failed closed without semantic complement evaluation.                  |
| B5–B7                                   | Compatibility     | Deny complements, scoped positive allows, existing wildcard full admin, AdministratorAccess, and CIS regressions ran together.                    | pass   | Deny/scoped controls remained silent; existing detections remained green.                                            |
| B8                                      | Regression        | Package and workspace build, typecheck, sequential tests, lint, formatting, OSV, and Semgrep were exercised.                                      | pass   | Focused 30/30; policies 459/459; all 19 runnable workspace projects passed.                                          |

## RED/GREEN evidence

- Baseline focused suite: 23/23.
- RED: 6 intended failures and 24 passing controls. The failures covered inline `NotAction`, linked `NotResource`, customer-managed attachment paths, empty/malformed presence, and combined complement operators.
- GREEN: 30/30 focused tests and 459/459 policy-package tests.
- Package build, typecheck, and lint passed.
- All 19 runnable workspace projects passed topological build, typecheck, sequential tests, and lint.

## Security pass

| Gate                     | Result                                                                                                                                                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OSV admission            | pass — official checksum-verified OSV-Scanner 2.7.0 scanned two unchanged lockfiles and 575 package occurrences with zero vulnerability and zero `MAL-*` results; report SHA-256 `10c55dbf5e83d5268eb5fa37e826477ae5eb4a972a2fe38e0a6832f28be95df4`. |
| Dependency provenance    | pass — no manifest or lockfile changed and no direct/transitive package, install hook, build script, or package authority was added.                                                                                                                 |
| Semgrep                  | pass — Semgrep 1.156.0 ran 210 rules over three changed TypeScript targets with zero findings and zero errors; report SHA-256 `392565a0b5b2a7ead2695055555971cde30955093d5c3d38b96d8c26a03e1103`.                                                    |
| Secret review            | pass — added lines contain no credential, token, private key, account secret, or copied policy document.                                                                                                                                             |
| DAST                     | N/A — this deterministic Pulumi preview policy milestone exposes no HTTP service or OpenAPI surface.                                                                                                                                                 |
| Container/IaC deployment | N/A — no container, live stack, GitHub configuration, or AWS resource was created or mutated.                                                                                                                                                        |
| AI tolerance             | N/A — no AI component.                                                                                                                                                                                                                               |
| Measurement              | pass locally — every supported in-stack graph edge and negative control is covered; the lagging merged-main scan remains a closeout gate.                                                                                                            |

## Bugs found

| id                                       | severity | scenario                                                                                                                                 | regression test                                                                        | status                                         |
| ---------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `csf_27b2f83bd7908229e9a00792` / CWE-269 | high     | An allow-side IAM complement grants near-administrator authority to a GitHub OIDC role while literal wildcard detection reports success. | `packages/policies/tests/github/g-oidc-2.test.ts` complement and attachment-path cases | fixed locally; exact-main confirmation pending |

## Environment

- macOS arm64, Node.js/pnpm repository toolchain, Vitest 4.1.11.
- Production TypeScript policy functions were exercised through Pulumi `StackValidationPolicy` inputs; no provider or cloud credentials were used.

## Coverage gaps and residual limits

- External managed-policy versions, permissions boundaries, session policies, SCPs, resource policies, and multi-statement escalation composition remain outside this preview-only rule.
- The presence of a permissions-boundary ARN does not prove that the boundary blocks every escalation path.
- Malformed policy documents remain governed by the existing bounded parser contract; this milestone adds fail-closed behavior for complement-key presence only after a statement is structurally parsed.
- OSV covers known vulnerabilities and malicious-package advisories; it does not prove the absence of unknown malware.

## Pending closeout

- Sign and DCO-stamp the exact source commit.
- Pass exact-head GitHub checks and merge only that verified head under standing authorization.
- Run xhigh Codex Security against the exact merged-main commit and confirm the finding and equivalent allow-complement authority bypasses are absent.
