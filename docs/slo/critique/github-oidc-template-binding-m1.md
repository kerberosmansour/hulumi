# SLO critique — GitHub OIDC subject-template binding M1

Runbook: `docs/RUNBOOK-github-oidc-template-binding.md`
Date: 2026-10-15
Threat-model mode: degraded. The repository has a canonical Markdown threat model but no frozen `hulumi-github-threat-model.slo.json`; abuse IDs are read from the Markdown document and no schema-stability claim is made.

## CEO pass

| id  | persona | category     | runbook section | finding                                                                                                   | concrete scenario                                                                                                                           | recommendation                                       | resolution                                                            |
| --- | ------- | ------------ | --------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------- |
| C1  | CEO     | reduce-scope | M1 out of scope | Adding GitHub immutable-subject adoption would turn a bounded validation repair into a product migration. | Existing repositories have cloud trust policies matching name-based subjects; enabling immutable IDs in this patch would break deployments. | Keep immutable-subject design in a separate runbook. | accepted under the user's standing autonomous maintenance instruction |

## Engineering-lead pass

| id  | persona          | category | runbook section | finding                                                                                                                    | concrete scenario                                                                                                    | recommendation                                                              | resolution            |
| --- | ---------------- | -------- | --------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------- |
| E1  | engineering lead | ask      | BDD-M1-4        | GitHub's API requires unique alphanumeric/underscore keys, while the current client checks only a small metacharacter set. | A duplicate or punctuated key passes Hulumi and fails only after a live organization mutation is attempted.          | Validate exact API key syntax and uniqueness in runtime and preview paths.  | accepted; added to M1 |
| E2  | engineering lead | ask      | BDD-M1-5        | H2 skips every resource with claimed OrgFoundation ancestry.                                                               | A caller creates an equivalent component type and attaches a repo-only template; the mandatory policy returns clean. | Remove the ancestry exemption and validate all template resources.          | accepted; added to M1 |
| E3  | engineering lead | auto-fix | Compatibility   | Requiring exactly the default four keys would erase the public custom-template purpose.                                    | A customer adds `repository_id` for an immutable identity and receives an unnecessary rejection.                     | Require a three-key subset and preserve safe unique extras in caller order. | applied               |

## Security pass

| id  | persona  | category | runbook section   | finding                                                                                                     | concrete scenario                                                                                                                                                                | recommendation                                                                                                                    | resolution                                       |
| --- | -------- | -------- | ----------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| S1  | security | ask      | Security contract | **severity: high — CWE-284.** Missing required identity axes leaves authorization context underconstrained. | An org admin supplies `['repo']`; GitHub replaces the complete subject format and a cloud role can no longer distinguish an approved reusable workflow or protected environment. | Require `repo`, `job_workflow_ref`, and `environment` in both component and policy paths; add variant tests for each omitted key. | accepted; this is the milestone's primary repair |
| S2  | security | ask      | Policy parity     | The preview rule treats missing/non-array properties as clean.                                              | A malformed preview omits `includeClaimKeys`; H2 emits no violation and a later provider coercion can create an unreviewed subject.                                              | Fail closed on uninspectable property shapes and non-string entries.                                                              | accepted; added to BDD-M1-4                      |

### Expanded finding S1

- **Severity: high; CWE-284 — Improper Access Control.**
- **Evidence:** `packages/baseline/src/github/org-oidc-template.ts` accepts any nonempty custom list and passes it to the organization template resource. GitHub documents that customization replaces the complete `sub` format.
- **Threat-model link:** `docs/slo/design/hulumi-github-threat-model.md`, trust boundary 2. Class elimination changes from residual to eliminated for Hulumi-managed organization templates; repositories may still opt out through GitHub's separate repository-level API, which remains outside this component's authority.
- **Variant analysis:** inspect empty, missing each required key, duplicate keys, malformed key syntax, non-array/non-string shapes, raw resources, claimed component children, and forged logical names.
- **Remediation proof:** paired component and CrossGuard tests plus the merged-main Codex Security rescan.

## Design pass

Skipped: no UI surface.

## Critique decision

M1 remains one bounded milestone. All non-mechanical scope findings are resolved by the user's prior instruction to continue autonomously with defensive security maintenance. The allowed-file list is unchanged from the accepted contract; implementation may proceed BDD-first.
