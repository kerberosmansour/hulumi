# Verification — Policy suppression integrity M1

Date: 2026-10-15
Runbook: `docs/RUNBOOK-policy-suppression-integrity.md`
Base: `f03d63741757cdc37eb6efb8f895b5720df646b9`
Finding: `csf_4617d83ac6d0d2c36b2638f8` / CWE-20
Verdict: local implementation and security gates passed; exact-head CI, merge,
and merged-main Codex Security remain.

The repository has no frozen `.slo.json` threat model for this pre-existing
matcher. Verification therefore operated in documented degraded mode and makes
no stable abuse-ID claim.

## What was exercised

| Scenario                             | Category                | How exercised                                                                                          | Result | Evidence                                                                         |
| ------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------- |
| `oc-policy-suppression-integrity-1`  | Pass 0 outcome          | The exported matcher evaluated missing, global, malformed, noncanonical, expired, and bounded records. | pass   | Every invalid record left the rule active; canonical bounded records matched.    |
| `cuj-policy-suppression-integrity-1` | Pass 0 journey          | Direct BDD modeled rejection, exact remediation, and expiry behavior.                                  | pass   | The production matcher exercised the unsafe and remediated states.               |
| B1                                   | Reason boundary         | Missing, empty, and whitespace-only reasons were supplied.                                             | pass   | All returned `{ suppressed: false }`.                                            |
| B2                                   | Scope boundary          | Missing/blank/global scopes, non-URN prefixes, internal wildcards, and question marks were supplied.   | pass   | All failed closed; exact `stack` remained separate from resource scope.          |
| B3                                   | Time boundary           | Missing, invalid, noncanonical, offset, expired, current, and invalid-clock cases were supplied.       | pass   | All failed closed; canonical future dates and UTC timestamps passed.             |
| B4                                   | Identity boundary       | Missing/blank/mismatched rule IDs and nonmatching resource/prefix scopes were supplied.                | pass   | No mismatched entry suppressed the rule.                                         |
| B5–B7                                | Positive controls       | Exact resource, bounded prefix, and explicit stack exceptions used future canonical expiry.            | pass   | Each matched only its intended rule and scope and returned the reviewed reason.  |
| B8                                   | Consumer migration      | AWS, GitHub, Cloudflare, Kubernetes, RBAC, and operations fixtures plus operator docs were reviewed.   | pass   | Repository-owned examples carry correct IDs, explicit scope, reason, and expiry. |
| B9                                   | Regression and security | Package/workspace, OSV, Semgrep, formatting, license, and scope gates ran.                             | pass   | Direct 35/35; package 530/530; all 19 runnable workspace projects passed.        |

## RED/GREEN evidence

- Baseline consumer suites: seven files and 291/291 tests.
- RED: the new 25-case direct suite produced 11 intended failures and retained
  14 passing controls. Failures covered missing/blank reason, missing/global
  scope, and missing/blank/invalid/noncanonical expiry.
- GREEN: the expanded direct suite passed 35/35 after adding malformed-record,
  rule-ID, exact-time, and invalid-clock partitions; the policy package passed
  530/530.
- Package build, typecheck, test, and lint passed.
- All 19 runnable workspace projects passed topological build, typecheck,
  sequential tests, lint, format, and the ID-only license boundary. The 35 new
  tests raised the preceding 1,354-test workspace baseline to 1,389 passing
  tests; existing skips and the existing todo were unchanged.
- One final aggregate rerun hit a generated `dist` cleanup race and an unrelated
  exact-pin test timeout. A clean package build passed, the complete skill-BDD
  package immediately passed 120/120 with the exact-pin case in 696 ms, and all
  final lint, format, and license gates passed.

## Runtime QA passes

| Pass              | Result | Evidence                                                                                                              |
| ----------------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| 0 — outcome       | pass   | Malformed global/permanent records no longer silence the exported production matcher.                                 |
| 1 — happy path    | pass   | Canonical exact URN, bounded URN prefix, and explicit stack records passed.                                           |
| 2 — edge states   | pass   | Missing, blank, wildcarded, mismatched, invalid-date, offset-date, exact-now, and invalid-clock inputs failed closed. |
| 3 — recovery      | pass   | Adding a bounded scope and canonical future expiry restored only the intended suppression.                            |
| 4 — security      | pass   | Input partition, OSV, Semgrep, secret review, and dependency-diff checks passed.                                      |
| 5 — compatibility | pass   | Public exports/result shape and every policy-pack family stayed green after fixture migration.                        |
| 6 — operations    | N/A    | This deterministic preview predicate has no service, deployment, migration, or live-cloud runtime.                    |

## Security pass

| Gate                  | Result                                                                                                                                                                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OSV admission         | pass — official checksum-verified OSV-Scanner 2.7.0 scanned two unchanged lockfiles and 575 package occurrences with zero vulnerability and zero `MAL-*` results; report SHA-256 `10c55dbf5e83d5268eb5fa37e826477ae5eb4a972a2fe38e0a6832f28be95df4`. |
| Dependency provenance | pass — no manifest or lockfile changed and no direct/transitive package, install hook, build script, or package authority was added.                                                                                                                 |
| Semgrep               | pass — Semgrep 1.156.0 ran 210 rules over nine changed TypeScript targets with zero findings and zero errors; report SHA-256 `f0809f1b611beb7e65edbbc8879c401a262adf44825bfe654b7a50f6005fb8d0`.                                                     |
| Secret review         | pass — changed lines contain configuration examples and synthetic URNs only; no credential, token, private key, or secret material is introduced or emitted.                                                                                         |
| DAST                  | N/A — this deterministic Pulumi preview predicate exposes no HTTP service or OpenAPI surface.                                                                                                                                                        |
| Live cloud            | N/A — no provider API, Pulumi deployment, policy-pack deployment, registry operation, or credential was used.                                                                                                                                        |
| AI tolerance          | N/A — no AI component.                                                                                                                                                                                                                               |
| Measurement           | pass locally — contract partitions and consumer controls passed; the lagging merged-main scan remains a closeout gate.                                                                                                                               |

## Bug disposition

| id                                      | severity | scenario                                                                                       | regression test                                                          | status                                         |
| --------------------------------------- | -------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------- |
| `csf_4617d83ac6d0d2c36b2638f8` / CWE-20 | medium   | A malformed, unscoped, global, invalid-date, or non-expiring record disables a mandatory rule. | `packages/policies/tests/suppressions.test.ts` complete record partition | fixed locally; exact-main confirmation pending |

## Environment

- macOS arm64, Node.js/pnpm repository toolchain, Vitest 4.1.11.
- Production TypeScript matcher and policy functions were exercised without a
  cloud or repository secret.

## Coverage gaps and residual limits

- A reviewed non-global prefix can intentionally cover multiple resources; its
  breadth remains visible in the required scope and limited by expiry.
- The matcher validates configuration but does not persist an approval record
  or claim an external audit sink.
- Date-only expiry is interpreted as midnight UTC at the start of that date;
  operators needing end-of-day precision should use a canonical UTC timestamp.
- OSV covers known vulnerabilities and malicious-package advisories; it does
  not prove the absence of unknown malware.

## Pending closeout

- Sign and DCO-stamp the exact source commit.
- Pass exact-head GitHub checks and merge only that verified head under standing
  authorization.
- Run xhigh Codex Security against the exact merged-main commit and confirm the
  finding and equivalent global/permanent suppression bypasses are absent.
