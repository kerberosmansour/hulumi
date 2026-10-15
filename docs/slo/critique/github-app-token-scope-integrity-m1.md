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
