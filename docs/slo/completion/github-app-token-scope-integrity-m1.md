# Completion summary — GitHub App token scope integrity M1

Date: 2026-10-15
Status: local execution and verification complete; exact-head and merged-main gates pending.

## Delivered

- Canonicalized and bounded every component repository allowlist and permission map.
- Added an IaC-owned `hulumi:github-app-scope-sha256` tag and additive non-secret `scopeDigest` output.
- Removed wildcard-repository and empty-permission defaults from secret population.
- Required population scope to match the component tag before `PutSecretValue`.
- Stored the canonical scope and digest with the App credential without placing PEM bytes in process arguments.
- Required tag, payload digest, recomputed scope, and requested target to agree before private-key use.
- Required every token request, including wildcard allowlist mode, to name exactly one repository and carry the bound non-empty permissions.
- Added structural and byte limits, fixed HTTPS/TLS settings, the current GitHub API version header, and reason-only failures.
- Documented migration, wildcard semantics, IAM requirements, limits, and operational failure behavior.

## Evidence

- Baseline: 17/17 focused tests plus package build, typecheck, and lint.
- RED: 15 intended failures with 15 controls passing against the old behavior.
- Final focused suite: 34/34.
- Complete package suite: 265/265; build, typecheck, lint, Bash syntax, and ShellCheck passed.
- Full workspace test/build/typecheck/lint and repository governance gates passed across 19 runnable projects.
- OSV 2.7.0: two unchanged lockfiles, 575 package occurrences, zero vulnerabilities and zero `MAL-*`.
- Semgrep 1.156.0: 74 rules, four TypeScript targets, zero findings and zero errors.
- Secret review, allow-list audit, dependency diff, and diff hygiene passed.
- No package dependency, manifest, lockfile, version, publication, or live-cloud change.

## Remaining gates

- Signed+DCO exact source commit and exact-head GitHub CI.
- Authorized merge of the exact green head.
- Exact merged-main Codex Security scan with the scope-widening source finding absent.

## M2 completion record — brokered private-key isolation

Date: 2026-10-15

Status: local execution and verification complete; exact-head and merged-main gates pending.

### Delivered

- Replaced runtime secret-read authority with exact `lambda:InvokeFunction` authority on a private broker.
- Added an explicit Lambda-only execution role with exact secret read, customer-managed KMS decrypt constrained to Secrets Manager and this secret, and exact log-stream permissions.
- Embedded the component's canonical scope into the broker and verified the event target before secret retrieval and stored scope before private-key use.
- Minted a nine-minute App JWT with Node's built-in crypto and called only fixed GitHub HTTPS endpoints with the current API version, redirect refusal, timeout, JSON, and body-size controls.
- Verified GitHub's returned repository, permissions, selection mode, token bounds, and expiry before returning a bearer.
- Reworked the packaged mint helper to invoke Lambda only, reject function/malformed response failures, scrub its temporary response file, and print only the token.
- Added `iamInvokePolicyArn`, `brokerFunctionArn`, and `brokerFunctionName`; preserved `iamReadPolicyArn` as a deprecated invoke-only compatibility alias.
- Documented runtime-role migration and the need to remove independently managed raw-secret and KMS authority.

### Evidence

- Baseline focused suite 34/34; RED 12 intended failures with 24 controls passing; final focused suite 40/40.
- Complete `@hulumi/k8s-baseline` suite 271/271.
- Full workspace test, build, typecheck, and lint passed across 19 runnable projects; formatting and governance gates passed.
- OSV-Scanner 2.7.0: two unchanged lockfiles, 575 package occurrences, zero vulnerabilities and zero `MAL-*`.
- Semgrep 1.156.0: 74 TypeScript rules, four targets, zero findings and zero errors.
- Bash syntax, ShellCheck 0.11.0, secret review, exact allow-list, dependency diff, and diff hygiene passed.
- No dependency, manifest, lockfile, version, publication, or live-cloud change.

### Remaining gates

- Signed+DCO exact source commit and exact-head GitHub CI.
- Authorized merge of the exact green head.
- Exact merged-main xhigh Codex Security scan with `csf_7b681c175edc7c44f60bd797` and equivalent raw-private-key bypasses absent.
