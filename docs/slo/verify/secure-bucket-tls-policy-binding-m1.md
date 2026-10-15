# Verification — SecureBucket TLS policy binding M1

Date: 2026-10-15
Runbook: `docs/RUNBOOK-secure-bucket-tls-policy-binding.md`
Base: `8b967993deafd3c711c5031ad105255035603698`
Finding: `csf_b38a094764d7b6788e69edab` / CWE-693
Verdict: local implementation and security gates passed; exact-head CI, merge,
and merged-main Codex Security remain.

The repository has no frozen `.slo.json` threat model for this pre-existing
rule. Verification therefore operated in documented degraded mode and makes no
stable abuse-ID claim.

## What was exercised

| Scenario                                      | Category                        | How exercised                                                                                                                   | Result | Evidence                                                                                                  |
| --------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| `oc-secure-bucket-tls-policy-binding-1`       | Pass 0 outcome                  | Production HULUMI-H5 evaluated forged SecureBucket siblings with narrowed IAM statement authority.                             | pass   | Every complement, specific-authority, and extra-condition partition produced the existing H5 violation. |
| `cuj-secure-bucket-tls-policy-binding-1`      | Pass 0 journey                  | The focused suite models unsafe policy evidence, preview rejection, canonical remediation, and a clean preview.                | pass   | Unsafe and remediated states exercise the production stack-validation function.                          |
| B1–B2                                         | Positive controls               | The emitted statement and a singleton `["s3:*"]` action array were evaluated with exact bucket binding.                        | pass   | Both shapes produced no H5 violation.                                                                     |
| B3–B4                                         | Principal/action boundary       | Tests used a specific principal, `NotPrincipal`, a specific action, and `NotAction`.                                            | pass   | Each narrowed or complemented shape produced exactly one H5 violation.                                   |
| B5                                            | Resource boundary               | Tests used `NotResource`, a missing exact bucket target, and the existing decoy-resource fixture.                              | pass   | All failed closed; the canonical bucket and object ARN pair remained accepted.                            |
| B6                                            | Condition boundary              | Tests added a sibling condition operator and a second Bool condition key.                                                      | pass   | Both narrowed shapes produced exactly one H5 violation.                                                  |
| B7                                            | Shape and data handling         | An unknown statement field and a sensitive-looking resource marker were supplied.                                              | pass   | Unknown fields failed closed and the marker was absent from the bounded diagnostic.                      |
| B8                                            | Regression and security         | Focused/package/workspace, OSV, Semgrep, formatting, and secret gates ran against the milestone tree.                          | pass   | Focused 71/71; policy package 495/495; all 19 runnable workspace projects passed.                         |

## RED/GREEN evidence

- Baseline focused suite: 61/61.
- RED: eight intended failures and 63 passing controls. The failures covered a
  specific principal, `NotPrincipal`, a specific action, `NotAction`,
  `NotResource`, an extra condition operator, an extra Bool key, and an unknown
  statement field.
- GREEN: 71/71 focused tests and 495/495 policy-package tests.
- Package build, typecheck, and lint passed.
- All 19 runnable workspace projects passed topological build, typecheck,
  sequential tests, and lint; the ten new focused cases raised the prior
  workspace total from 1,344 to 1,354 passing tests. Existing skips and the
  existing todo remained unchanged.

## Runtime QA passes

| Pass | Result | Evidence |
| ---- | ------ | -------- |
| 0 — outcome | pass | The production validator rejected every modeled narrowed policy and accepted the exact remediation. |
| 1 — happy path | pass | Genuine SecureBucket evidence and both supported Action encodings passed. |
| 2 — edge states | pass | Complement fields, specific authority, additional conditions, unknown keys, and missing resources failed closed. |
| 3 — recovery | pass | Replacing an invalid statement with the documented canonical shape restored a clean preview without changing sibling identity. |
| 4 — security | pass | Authority, condition, target binding, diagnostic redaction, OSV, Semgrep, and secret checks passed. |
| 5 — compatibility | pass | Public HULUMI-H5 identity/export, mandatory level, suppression behavior, H1–H4, ancestry, and dependency-edge tests stayed green. |
| 6 — operations | N/A | This deterministic preview policy has no service, deployment, migration, or live-cloud runtime. |

## Security pass

| Gate                  | Result |
| --------------------- | ------ |
| OSV admission         | pass — official checksum-verified OSV-Scanner 2.7.0 scanned two unchanged lockfiles and 575 package occurrences with zero vulnerability and zero `MAL-*` results; report SHA-256 `10c55dbf5e83d5268eb5fa37e826477ae5eb4a972a2fe38e0a6832f28be95df4`. |
| Dependency provenance | pass — no manifest or lockfile changed and no direct/transitive package, install hook, build script, or package authority was added. |
| Semgrep               | pass — Semgrep 1.156.0 ran 210 rules over the two changed TypeScript targets with zero findings and zero errors; report SHA-256 `8edf446fe2d48bceb214caeb4aee3582198ab66d0fe82651da5c91fab2d40dae`. |
| Secret review         | pass — the changed lines contained no credential pattern, and the H5 diagnostic does not copy the policy document, principal, action, condition, resource, marker, credential, token, or private key. |
| DAST                  | N/A — this deterministic Pulumi preview policy exposes no HTTP service or OpenAPI surface. |
| Live cloud            | N/A — no AWS API, Pulumi deployment, cloud credential, bucket policy mutation, or registry operation was used. |
| AI tolerance          | N/A — no AI component. |
| Measurement           | pass locally — all contract partitions and controls passed; the lagging merged-main scan remains a closeout gate. |

## Bug disposition

| id                                      | severity | scenario                                                                                                       | regression test                                                                 | status                                         |
| --------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------- |
| `csf_b38a094764d7b6788e69edab` / CWE-693 | high     | An apparent TLS deny can retain recognized fields while excluding a principal, action, resource, or condition. | `packages/policies/tests/hulumi-hardening-pack.test.ts` exact-statement matrix | fixed locally; exact-main confirmation pending |

## Environment

- macOS arm64, Node.js/pnpm repository toolchain, Vitest 4.1.11.
- Production TypeScript policy functions were exercised through Pulumi
  `StackValidationPolicy` inputs; no cloud or repository secret was used.

## Coverage gaps and residual limits

- H5 proves the bounded statement shape emitted by SecureBucket; it does not
  implement general AWS IAM policy equivalence or reason across statements.
- Additional resources are accepted because they broaden the deny while the
  exact bucket and object targets remain present.
- A reviewed H5 suppression can intentionally admit missing policy evidence;
  suppression integrity is tracked as a separate milestone.
- OSV covers known vulnerabilities and malicious-package advisories; it does
  not prove the absence of unknown malware.

## Pending closeout

- Sign and DCO-stamp the exact source commit.
- Pass exact-head GitHub checks and merge only that verified head under standing
  authorization.
- Run xhigh Codex Security against the exact merged-main commit and confirm the
  finding and equivalent principal/action/resource/condition narrowing bypasses
  are absent.
