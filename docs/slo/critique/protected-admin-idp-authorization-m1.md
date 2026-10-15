# SLO critique — Protected admin IdP authorization integrity M1

Runbook: `docs/RUNBOOK-protected-admin-idp-authorization.md`
Date: 2026-10-15
Threat-model mode: degraded. This bounded Access policy correction has no frozen component-specific `.slo.json`; the abuse ID is defined in the runbook and no schema-stability claim is made.

## CEO pass

| id | persona | category | runbook section | finding | concrete scenario | recommendation | resolution |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C1 | CEO | reduce-scope | Out of scope | MFA, device posture, provider creation, and Access-group lifecycle would expand the milestone without changing the reported OR-authority defect. | A broad Zero Trust redesign delays removal of an immediate authorization alternative. | Separate provider routing from authorization first and leave additional factors to later explicit contracts. | accepted under standing autonomous maintenance instruction |

## Engineering-lead pass

| id | persona | category | runbook section | finding | concrete scenario | recommendation | resolution |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E1 | engineering lead | ask | Compatibility | Existing IdP-only callers currently construct successfully, but their success means every user of that provider may match. | Removing `loginMethod` without another selector would create an invalid empty policy or a misleading component. | Make the security break explicit: require email, domain, or Access group authorization and document migration. | accepted |
| E2 | engineering lead | auto-fix | Policy parity | The component renders an inline application policy and, with `accountId`, a reusable policy. | Fixing only one form leaves deployment behavior dependent on configuration. | Build one authorization-selector union and use it in both policy forms. | applied to contract |
| E3 | engineering lead | ask | Output truthfulness | `requiredIdentitySelectors` currently labels provider IDs as authorization evidence. | Downstream evidence reports an allowlist even when only authentication routing exists. | Exclude provider IDs from the authorization-evidence output. | accepted |

## Security pass

| id | persona | category | runbook section | finding | concrete scenario | recommendation | resolution |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | security | ask | Security contract | **Severity: high — CWE-284/CWE-863.** Cloudflare Include entries are OR alternatives, and Login Methods checks only the provider used. | Any user who can authenticate through an approved provider bypasses a narrower email or group selector. | Keep provider IDs solely in application `allowedIdps`; require an independent identity authorization selector. | accepted; primary repair |
| S2 | security | ask | Negative proof | Structural snapshot tests can miss a `loginMethod` added at a different nesting level. | One policy form is repaired while another retains the alternative. | Assert recursively that neither inline nor reusable policy inputs contain a `loginMethod` key. | accepted |
| S3 | security | auto-fix | Failure order | IdP-only rejection after provider registration leaves partial resources in Pulumi mocks and previews. | An unsafe declaration registers the application before throwing. | Validate authorization selectors before constructing any provider resource. | applied |

### Expanded finding S1

- **Severity: high; CWE-284/CWE-863.** Authentication-provider selection is treated as authorization membership.
- **Provider evidence:** Cloudflare states Include entries use OR logic, Login Methods checks the provider used at login, and `allowed_idps` limits providers users may select.
- **Threat link:** `tm-hulumi-access-idp-or-bypass`; eliminated when provider IDs never appear in an Include array and an independent authorization selector is mandatory.
- **Variant analysis:** IdP-only input, IdP plus email, IdP plus domain, IdP plus Access group, inline policy, reusable policy, output evidence, and no-provider configurations.
- **Remediation proof:** focused recursive structure BDDs, complete package/workspace regression, exact-head CI, and exact merged-main Codex Security rescan.

## Design pass

Skipped: no UI surface.

## Critique decision

M1 remains one bounded defensive milestone. The user's standing instruction authorizes execution. The ten-file allow-list does not overlap the active trusted-node release task, official Cloudflare documentation confirms the policy semantics, and implementation may proceed BDD-first with no new dependency.
