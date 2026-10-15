# Verification — GitHub App token scope integrity M1

Date: 2026-10-15
Runbook: `docs/RUNBOOK-github-app-token-scope-integrity.md`
Base: `8a34a60eae79c0a86a3e80b54193dee2c24e32aa`
Verdict: local implementation gates passed; exact-head CI, merge, and merged-main Codex Security remain.

## Outcome and BDD evidence

| Evidence | Result |
| --- | --- |
| Baseline | The existing focused suite passed 17/17, and the package build, typecheck, and lint passed before RED changes. |
| RED | The expanded 30-test focused suite produced the intended 15 failures and 15 controls passing against the old implementation. Failures covered the absent digest/tag/output, malformed repositories and permission levels, optional/default population scope, population tag mismatch, missing payload digest, `owner/name` request values, wildcard repository omission, and digest mismatch acceptance. |
| Component binding | Equivalent repository and permission order produces one deterministic 64-hex SHA-256 in the Secrets Manager tag and additive `scopeDigest` output. Invalid, duplicate, mixed-wildcard, over-500, or malformed repositories and empty, over-100, or malformed permissions reject before child resources. |
| Population boundary | The helper requires exactly five arguments, canonicalizes explicit scope, requires equality with the IaC-owned tag, and refuses a write on missing or mismatched scope. The PEM is read with `jq --rawfile`, so its bytes are not placed in process arguments. |
| Mint boundary | Missing, malformed, empty, mixed-wildcard, tag-mismatched, payload-mismatched, and disallowed-target requests reject before the private key is written or signing/HTTP occurs. |
| Request authority | Explicit and wildcard allowlists both produce `{repositories: [REPO_NAME], permissions: <bound-map>}`; wildcard changes target eligibility only. The helpers use fixed GitHub HTTPS endpoints, TLS 1.2 or newer, and API version `2026-03-10`. |
| Failure behavior | Rejected fixture runs never emitted the fixture key. Scripts emit bounded reason codes, while successful minting emits only the synthetic token to stdout. |
| Focused/package regression | Focused suite 34/34. Complete `@hulumi/k8s-baseline` suite 265/265; package build, typecheck, lint, Bash syntax, and ShellCheck passed. |
| Workspace regression | Recursive test, build, typecheck, and lint passed across all 19 runnable projects. The first test attempt overlapped a workspace build that deletes `dist` and briefly could not resolve `@hulumi/baseline`; the required standalone rerun passed after builds completed. |

## Security and repository evidence

| Gate | Result |
| --- | --- |
| OSV admission | Official checksum-verified OSV-Scanner 2.7.0 scanned two unchanged resolved lockfiles and 575 package occurrences with zero vulnerability results and zero `MAL-*`; report SHA-256 `10c55dbf5e83d5268eb5fa37e826477ae5eb4a972a2fe38e0a6832f28be95df4`; receipt SHA-256 `c3c0f5f4117b350ce6d38650f98aa318ca95eb8e17e14b32d0f77151d196371e`. |
| Dependency diff | No manifest or lockfile changed. Existing workspace packages were restored from the admitted local pnpm store with frozen lockfiles, scripts disabled, offline mode, 422 packages reused, and zero downloaded. |
| Semgrep | Semgrep 1.156.0 ran 74 TypeScript rules over four changed TypeScript files with zero findings and zero errors; report SHA-256 `5eda557a02a0bfdd1ea86e9d51c3bf81465da63cf903421cd0c8eb7e1d128476`. |
| Shell review | `bash -n` and ShellCheck passed for both packaged helpers with zero findings. Manual review confirmed validation, tag/scope/target checks, and resource bounds precede secret use, signing, or HTTP. |
| Secret review | Added lines matched zero high-confidence private-key, AWS access-key, GitHub-token, or OpenAI-key patterns. Test values are explicitly synthetic public fixtures. |
| Repository governance | Prettier, license-boundary, exact-pin, workflow-governance, and `git diff --check` passed. All changed and SLO evidence files are within the exact milestone allow-list. |

## Residual limits

- The scope tag is authoritative only while the minting principal lacks tag mutation and the IaC deployment controls the tag. The component-created runtime policy has that property; operators must not add broader tag authority elsewhere.
- Permission-name syntax and `read`/`write`/`admin` bounds prevent malformed or empty maps, while GitHub remains the authority on which permission names and levels are valid for a particular App.
- The executable tests use local fakes and do not call AWS or GitHub. Request shape, omission behavior, repository-name semantics, limits, and API version were checked against official provider documentation.
- The helpers trust the runner's local `aws`, `jq`, `openssl`, `awk`, and `curl` executables. Those tools must come from the runner's admitted, least-privilege environment.
- The minted token is intentionally printed to stdout for BuildKit secret plumbing; callers must keep that stream out of logs and persistent artifacts.

## Pending closeout

- Sign and DCO-stamp the exact source commit.
- Pass exact-head GitHub checks and review the final diff.
- Merge only the verified head under standing authorization.
- Run Codex Security against the exact merged-main commit and confirm the scope-widening source finding and its equivalent occurrence are absent.

## M2 broker verification

Date: 2026-10-15

Base: `fd319eed1bc676068c84164894de27b4aa33d718`

Finding: `csf_7b681c175edc7c44f60bd797`

Verdict: local M2 execution and verification passed; exact-head CI, merge, and merged-main Codex Security remain.

| Evidence | Result |
| --- | --- |
| Baseline/admission | Official checksum-verified OSV-Scanner 2.7.0 scanned two resolved lockfiles and 575 package occurrences with zero vulnerabilities and zero `MAL-*`. A frozen, offline, script-disabled install reused 422 admitted packages and downloaded none. The existing focused suite passed 34/34. |
| RED/GREEN | Twelve intended M2 failures and 24 controls passing demonstrated the missing broker boundary. The final focused suite passed 40/40; the complete `@hulumi/k8s-baseline` suite passed 271/271. |
| Runtime authority | The runtime policy grants only `lambda:InvokeFunction` on the exact broker ARN. It grants no Secrets Manager, KMS, signing, or tag-mutation action. The deprecated `iamReadPolicyArn` output points to this same invoke-only policy. |
| Broker authority | The explicit role trusts only `lambda.amazonaws.com`. Its inline policy grants exact-secret `GetSecretValue`, exact-key `kms:Decrypt` constrained by `kms:ViaService` and the exact secret encryption context, and writes to only the precreated exact log group. No managed policy or wildcard action/resource is attached. |
| Request boundary | The handler accepts only the exact `{owner, repository}` event, authorizes the target before reading the secret, verifies the compiled and stored canonical scope digests before signing, and always sends one repository plus the exact permission map to fixed GitHub HTTPS endpoints. |
| Response boundary | JSON-only provider responses are streamed with a 16 KiB cap and 10-second timeout. A token is returned only when GitHub reports `selected`, exactly the requested full name, the exact permissions, a bounded non-empty token, and a future expiry no more than 3,700 seconds away. |
| Failure behavior | Dependency exceptions, signing errors, network errors, malformed events, scope mismatch, broader provider responses, and invalid expiry produce bounded reason codes without interpolating provider errors or key/JWT/token bytes. |
| Packaged helper | The helper invokes only the exact broker name/ARN, rejects Lambda `FunctionError` and malformed or oversized results, stores the response in a mode-0600 temporary file, scrubs it on exit, and prints only the token. It contains no Secrets Manager, OpenSSL, or GitHub HTTP path. |
| Workspace regression | Recursive test, build, typecheck, and lint passed across all 19 runnable projects. Prettier, license-boundary, exact-pin, and workflow-governance gates passed. |
| Static and shell security | Semgrep 1.156.0 ran 74 rules over four TypeScript targets with zero findings and zero errors; report SHA-256 `7ec8857f7cca5609a8930b2f5bbd0a8ab10abf7ade45126ad07b95d41343515e`. Bash syntax and ShellCheck 0.11.0 passed for both packaged helpers. |
| Final OSV evidence | Two lockfiles and 575 package occurrences remained clean; report SHA-256 `10c55dbf5e83d5268eb5fa37e826477ae5eb4a972a2fe38e0a6832f28be95df4`; receipt SHA-256 `c3c0f5f4117b350ce6d38650f98aa318ca95eb8e17e14b32d0f77151d196371e`. |
| Repository hygiene | No manifest or lockfile changed. Diff hygiene and the exact milestone allow-list passed. Added lines contained no high-confidence private-key, AWS access-key, GitHub-token, or OpenAI-key material. |

### M2 residual limits

- The component removes raw-key authority it creates. Operators must also remove independently managed `secretsmanager:GetSecretValue`, `kms:Decrypt`, and tag-mutation grants from runtime roles during migration.
- Local tests serialize the real Pulumi callback and exercise provider requests through injected fakes; they do not deploy Lambda or call live AWS/GitHub endpoints.
- Repository owner/name comparison is deliberately exact. A caller must use the canonical case returned by GitHub or the broker fails closed.
- The broker returns a bearer token to its authorized invoker. Callers must continue to keep helper stdout out of logs and persistent artifacts.

### M2 pending closeout

- Sign and DCO-stamp the exact source commit.
- Pass exact-head GitHub checks and merge only that verified head under standing authorization.
- Run xhigh Codex Security against the exact merged-main commit and confirm `csf_7b681c175edc7c44f60bd797` and equivalent raw-private-key bypasses are absent.
