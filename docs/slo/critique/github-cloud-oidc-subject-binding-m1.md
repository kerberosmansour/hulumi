# SLO critique — Azure and GCP GitHub OIDC subject binding M1

Runbook: `docs/RUNBOOK-github-cloud-oidc-subject-binding.md`
Date: 2026-10-15
Threat-model mode: degraded. This bounded correction has no frozen cloud-OIDC `.slo.json`; the abuse ID is defined in the runbook and no schema-stability claim is made.

## CEO pass

| id  | persona | category     | runbook section | finding                                                                                  | concrete scenario                                                                                                    | recommendation                                                   | resolution                                                     |
| --- | ------- | ------------ | --------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| C1  | CEO     | reduce-scope | Out of scope    | Changing AWS trust semantics would broaden migration and rollback risk beyond the target. | A single PR rejects existing AWS ref subjects while repairing separate Azure/GCP omissions.                          | Preserve AWS behavior and make the two affected branches strict. | accepted under the standing autonomous maintenance instruction |

## Engineering-lead pass

| id  | persona          | category | runbook section | finding                                                                                              | concrete scenario                                                                                                    | recommendation                                                                                  | resolution                 |
| --- | ---------------- | -------- | --------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------- |
| E1  | engineering lead | ask      | GCP invariant   | Regex-presence checks cannot prove that required equalities constrain the whole expression.          | `assertion.repository == 'org/repo' || true` contains the expected text but authorizes every token.                  | Use a bounded tokenizer and recursive-descent parser whose accepted grammar contains no `||`.   | accepted; BDD-M1-4 added   |
| E2  | engineering lead | auto-fix | Azure invariant | Splitting pairs without uniqueness or syntax checks permits decoy/ambiguous axes.                    | A duplicated `repo` key gives reviewers two apparent identities without a single unambiguous trust subject.          | Validate even key/value pairs, safe key syntax, nonempty values, uniqueness, and required axes. | applied                    |
| E3  | engineering lead | ask      | Compatibility   | Safe providers often add immutable numeric identity equalities.                                      | A GCP condition also binds `assertion.repository_id`, or Azure adds `repository_id` to its customized subject.        | Permit safe extra exact bindings while retaining the narrow grammar.                            | accepted                   |

## Security pass

| id  | persona  | category | runbook section   | finding                                                                                                  | concrete scenario                                                                                                         | recommendation                                                                                          | resolution               |
| --- | -------- | -------- | ----------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------ |
| S1  | security | ask      | Security contract | **Severity: high — CWE-284.** Missing/non-string Azure and GCP values currently return without a report. | A preview-time unknown or omitted condition bypasses a mandatory hardening rule.                                          | Fail closed on every uninspectable value and emit one bounded diagnostic.                               | accepted; primary repair |
| S2  | security | ask      | GCP grammar       | Wildcard rejection does not reject constant truth, partial scope, negation, functions, or disjunctions. | `true` or an organization-only condition admits unrelated repositories and workflows from the shared GitHub issuer.      | Accept only conjunctions of exact string equalities and require all three direct GitHub assertions.     | accepted                 |
| S3  | security | ask      | Azure subject     | A fixed but broad subject remains unsafe under a customized GitHub subject template.                    | `repo:org/repo` authorizes every workflow and environment in the repository.                                              | Require exact unique `repo`, `job_workflow_ref`, and `environment` pairs.                               | accepted                 |

### Expanded finding S1

- **Severity: high; CWE-284 — Improper Access Control.**
- **Evidence:** both provider inspectors return clean on non-string input and otherwise test only for `*`; a constant or partial literal therefore passes.
- **Threat link:** `tm-hulumi-github-cloud-oidc-broad-subject`; eliminated for preview-visible literal resources after structural validation. Live provider drift remains outside this policy rule.
- **Variant analysis:** missing, non-string, empty, wildcard, partial, duplicate, malformed, tautological, disjunctive, parenthesized, reversed equality, and safe extra binding forms.
- **Remediation proof:** focused policy BDDs plus exact merged-main Codex Security rescan.

## Design pass

Skipped: no UI surface.

## Critique decision

M1 remains one bounded milestone. The user's standing instruction authorizes continued defensive execution. The allowed-file list is unchanged and implementation may proceed BDD-first.
