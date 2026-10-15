# SLO critique — AWS organization delegated-admin binding M1

Runbook: `docs/RUNBOOK-aws-org-delegated-admin-binding.md`
Date: 2026-10-15
Threat-model mode: degraded. This bounded correction has no frozen AWS organization `.slo.json`; the abuse ID is defined in the runbook and no schema-stability claim is made.

## CEO pass

| id  | persona | category     | runbook section | finding                                                                                    | concrete scenario                                                                                                                 | recommendation                                    | resolution                                                     |
| --- | ------- | ------------ | --------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------- |
| C1  | CEO     | reduce-scope | Out of scope    | Combining ORG-3 SCP proof would obscure whether account binding fixed the reported defect. | One PR changes delegate identity, SCP parsing, content analysis, and attachments, making rollback and scan attribution ambiguous. | Keep the ORG-3 high finding in its own milestone. | accepted under the standing autonomous maintenance instruction |

## Engineering-lead pass

| id  | persona          | category | runbook section  | finding                                                                                                     | concrete scenario                                                                                                               | recommendation                                                                                         | resolution               |
| --- | ---------------- | -------- | ---------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------ |
| E1  | engineering lead | ask      | Invariant        | A single global service set still lets one foundation satisfy another.                                      | Foundation A delegates GuardDuty to account A while foundation B names account B; B passes because the service exists globally. | Evaluate exact service/account pairs separately for every startup-hardened foundation.                 | accepted; BDD-M1-5 added |
| E2  | engineering lead | ask      | Failure behavior | Four diagnostics per malformed foundation add noise without more remediation value.                         | An unknown security account produces one failure for every service.                                                             | Emit one bounded identity-shape violation, otherwise one missing-service-set violation per foundation. | accepted                 |
| E3  | engineering lead | auto-fix | Compatibility    | Matching only component-child URNs would reject equivalent raw resources and couple the policy to ancestry. | An operator declares a valid raw delegated administrator for a migration.                                                       | Correlate actual service/account inputs across the preview graph.                                      | applied                  |

## Security pass

| id  | persona  | category | runbook section   | finding                                                                                                            | concrete scenario                                                                                       | recommendation                                                                                   | resolution                 |
| --- | -------- | -------- | ----------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------- |
| S1  | security | ask      | Security contract | **Severity: high — CWE-284.** The current rule validates capability type but not the authorized account identity.  | Required service principals exist under an unintended member account and ORG-1 reports a clean preview. | Bind every required service to the foundation's exact security account ID.                       | accepted; primary repair   |
| S2  | security | ask      | Fail closed       | Missing and unknown preview identities could be silently treated as absent resources or accepted through coercion. | `securityAccountId` is missing/non-string, or a delegate account is malformed.                          | Require literal 12-digit IDs for the comparison and reject an uninspectable foundation identity. | accepted; BDD-M1-2/3 added |

### Expanded finding S1

- **Severity: high; CWE-284 — Improper Access Control.**
- **Evidence:** `org1DelegatedAdminsRequired` extracts only `servicePrincipal` from every delegated-administrator resource and never reads `accountId` or the foundation `securityAccountId`.
- **Threat link:** `tm-hulumi-aws-org-delegated-admin-wrong-account`; class eliminated for preview-visible resources after exact pair validation. Live AWS drift remains the live-validator boundary.
- **Variant analysis:** each missing service, wrong account, malformed/missing/non-string account IDs, mixed decoy plus valid resource, and two independent foundations.
- **Remediation proof:** focused stack-policy tests plus exact merged-main Codex Security rescan.

## Design pass

Skipped: no UI surface.

## Critique decision

M1 remains one bounded milestone. The user's standing instruction authorizes continued defensive execution. The allowed-file list is unchanged and implementation may proceed BDD-first.
