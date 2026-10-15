# SLO critique — GitHub App token scope integrity M1

Runbook: `docs/RUNBOOK-github-app-token-scope-integrity.md`
Date: 2026-10-15
Threat-model mode: degraded. This bounded component/helper correction has no frozen GitHub App scope `.slo.json`; the abuse ID is defined in the runbook and no schema-stability claim is made.

## CEO pass

| id | persona | category | runbook section | finding | concrete scenario | recommendation | resolution |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C1 | CEO | reduce-scope | Out of scope | App registration, installation lifecycle, and credential rotation are adjacent but would obscure proof of the reported authority widening. | A broad redesign changes operators and cloud resources while the token request can still omit its narrow scope. | Bind the existing declaration, secret, and request first; retain the current credential lifecycle. | accepted under standing autonomous maintenance instruction |

## Engineering-lead pass

| id | persona | category | runbook section | finding | concrete scenario | recommendation | resolution |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E1 | engineering lead | ask | Canonicalization | A digest is unstable if object keys or repository order affect serialization. | Pulumi and `jq` represent the same scope in different orders and falsely reject it. | Define one compact `permissions`-then-`repos` JSON shape with sorted keys and sorted repository entries; test cross-language equality. | accepted; BDD-M1-2 |
| E2 | engineering lead | auto-fix | API request | The existing script sends `owner/name` in GitHub's `repositories` field, whose documented values are repository names. | The allowlist check succeeds but the GitHub request is rejected or fails to narrow correctly. | Compare the full `owner/name` allowlist entry, then send only `REPO_NAME` in the request. | applied to contract |
| E3 | engineering lead | ask | Compatibility | Retaining the optional population arguments preserves callers by preserving the vulnerability. | A three-argument call silently stores wildcard repositories and empty permissions. | Make explicit repositories and permissions mandatory and document the migration. | accepted as security break |

## Security pass

| id | persona | category | runbook section | finding | concrete scenario | recommendation | resolution |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | security | ask | Security contract | **Severity: high — CWE-284/CWE-345.** Component policy is not authenticated at either runtime helper. | A narrow Pulumi declaration is followed by a default or modified secret that mints broader tokens. | Store a canonical scope digest in an IaC-owned tag and verify tag, payload, and runtime request at both helpers. | accepted; primary repair |
| S2 | security | ask | Wildcard semantics | Wildcard allowlist mode currently omits `repositories`, which GitHub documents as installation-wide token access. | A job targeting one repository receives a token for every installed repository. | Treat wildcard as target eligibility and still send one repository name on every request. | accepted; BDD-M1-7 |
| S3 | security | auto-fix | Resource bounds | JSON structure checks without entry or byte limits permit excessive work and payload failure. | A large secret or CLI argument consumes memory before rejection or exceeds Secrets Manager limits. | Enforce 500 repos, 100 permissions, 16 KiB canonical scope, and 64 KiB complete payload. | applied |
| S4 | security | ask | Failure order | Rejecting a disallowed repository after JWT signing unnecessarily touches key material. | An unauthorized target repeatedly triggers private-key use before eventual failure. | Verify tag, scope, and target before writing the PEM scratch file or signing. | accepted |

### Expanded finding S1

- **Severity: high; CWE-284/CWE-345.** Runtime helpers can substitute broader authority than the declared component scope.
- **Evidence:** the population helper defaults missing repos to `['*']` and permissions to `{}`; minting accepts those defaults and omits `repositories` for wildcard mode.
- **Threat link:** `tm-hulumi-github-app-scope-substitution`; eliminated when successful population and minting require equality among canonical component tag, stored payload digest, payload scope, allowed target, and request body.
- **Variant analysis:** missing fields, empty permissions, duplicate repos, malformed repo names, mixed wildcard, reordered inputs, modified payload, modified digest, missing/modified tag, explicit target outside allowlist, wildcard target, oversized data, unsafe permission values, and secrets in failure output.
- **Remediation proof:** focused component and executable-script BDDs, package/workspace regression, exact-head CI, and exact merged-main Codex Security rescan.

## Design pass

Skipped: no UI surface.

## Critique decision

M1 remains one bounded defensive milestone. The user's standing instruction authorizes execution. The 12-file allow-list does not overlap the active trusted-node controller task, provider behavior was checked against official GitHub and AWS documentation, and implementation may proceed BDD-first with no new dependency.

## M2 critique — private-key isolation

Date: 2026-10-15
Trigger: merged-main Codex Security finding `csf_7b681c175edc7c44f60bd797` proved that M1's helper checks are bypassable by any runtime principal that can read the raw App key.

### CEO pass

| id | persona | category | finding | concrete scenario | recommendation | resolution |
| --- | --- | --- | --- | --- | --- | --- |
| M2-C1 | CEO | reduce-scope | A general credential service or App lifecycle redesign would delay closure of one concrete high-severity bypass. | The team builds rotation, registration, or a public token API while the runtime role still exports the key. | Build one private Lambda broker owned by this component and retain out-of-band population. | accepted |

### Engineering-lead pass

| id | persona | category | finding | concrete scenario | recommendation | resolution |
| --- | --- | --- | --- | --- | --- | --- |
| M2-E1 | engineering lead | ask | CallbackFunction can attach broad default policies if no role is supplied. | A narrow secret boundary is replaced by a broker with broad AWS authority. | Supply an explicit Lambda trust role and exact inline secret/log permissions; assert no managed policy attachment. | accepted; BDD-M2-2 |
| M2-E1a | engineering lead | auto-fix | A customer-managed Secrets Manager key requires `kms:Decrypt`; omitting it produces a broker that cannot read its secret. | Deployment succeeds but every mint fails with `AccessDeniedException`. | Resolve the alias to its exact key ARN (or accept an explicit ARN) and constrain decrypt with `kms:ViaService` plus this secret's encryption context. | applied to BDD-M2-2 |
| M2-E2 | engineering lead | ask | Broker code is hard to test if validation and provider calls are inseparable. | Unit tests only inspect strings and never prove failure order. | Export a bounded handler factory whose injected secret reader, signer, clock, and HTTP client record side effects. The deployed callback closes over fixed production adapters. | accepted |
| M2-E3 | engineering lead | auto-fix | A token request can be narrow while the response is unexpectedly broader. | Provider behavior or a request defect returns multiple repositories or different permissions. | Check response `repositories` and `permissions` exactly before returning the token. | applied to BDD-M2-5/6 |
| M2-E4 | engineering lead | ask | Replacing `iamReadPolicyArn` can break consumers. | A stack reads the existing output during a security upgrade. | Keep it as a deprecated alias to the invoke-only policy and add clearly named broker/invoke outputs. | accepted |

### Security pass

| id | persona | category | finding | concrete scenario | recommendation | resolution |
| --- | --- | --- | --- | --- | --- | --- |
| M2-S1 | security | ask | **High — CWE-269.** The runtime principal can export the key and bypass every helper check. | Compromised build code calls Secrets Manager directly, signs an App JWT, and mints an installation-wide token. | Remove all runtime secret-read authority; broker alone owns the key and enforces every request. | accepted; primary repair |
| M2-S2 | security | ask | Input validation after secret retrieval unnecessarily exposes key material to abusive requests. | Invalid or unallowed targets repeatedly cause private-key loads. | Validate event shape and the component-bound allowlist before reading the secret; validate stored scope before signing. | accepted; BDD-M2-3/4 |
| M2-S3 | security | auto-fix | Unbounded provider bodies and hanging requests create a memory/duration exhaustion path. | GitHub or an intermediary returns a large body or never completes. | Enforce AbortSignal timeout and bounded body reads for both calls. | applied to contract |
| M2-S4 | security | ask | Errors can disclose authorization headers, JWTs, keys, or returned tokens. | SDK/fetch error objects are logged wholesale by the function runtime. | Catch internally, emit only enumerated reason codes, and never interpolate provider error objects. | accepted; BDD-M2-8 |
| M2-S5 | security | ask | Wildcard repository configuration can still tempt an installation-wide token request. | `repos: ["*"]` is treated as permission to omit the request's repository list. | Wildcard controls target eligibility only; every GitHub request and response must still bind exactly one repository. | accepted |

### Design pass

Skipped: no UI or public HTTP surface.

### Critique decision

M2 is bounded to the same 12 exact files, adds no dependency, and directly removes the raw-key bypass. Official GitHub documentation confirms narrowed request and response fields; official AWS guidance supports a custom least-privilege execution role; Pulumi's CallbackFunction docs justify making that role explicit. The user's standing autonomous instruction confirms execution, and implementation may proceed BDD-first.
