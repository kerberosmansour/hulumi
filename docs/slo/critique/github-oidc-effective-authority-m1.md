# Critique — GitHub OIDC effective authority M1

The repository has no frozen `.slo.json` threat model for this pre-existing policy helper, so the
security pass operated in documented degraded mode and makes no stable abuse-ID claim. The user's
standing instruction to continue autonomously with defensive SLO work confirms this bounded
milestone and disposes the concrete `ask` rows as accepted.

| id  | persona          | category     | runbook section | finding                                                                                                             | concrete scenario                                                                                                                                | recommendation                                                                                                                                                                     | disposition |
| --- | ---------------- | ------------ | --------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| C1  | CEO              | reduce-scope | Red lines       | Whole-account IAM evaluation would turn a direct predicate repair into an unbounded authorization-analysis product. | The patch starts downloading managed-policy versions, simulating boundaries/SCPs, and cannot make a truthful completeness claim.                 | Restrict M1 to structurally inspectable in-stack complement operators on already supported graph edges.                                                                            | accepted    |
| C2  | Engineering lead | ask          | Compatibility   | Broadening `iamPolicyHasFullAdmin` would silently change CIS 1.16 and every current caller.                         | A `Deny + NotAction` or unrelated complement form begins producing CIS violations without a reviewed contract.                                   | Keep the exact helper stable and add a dedicated G_OIDC_2 effective-authority predicate.                                                                                           | accepted    |
| C3  | Security         | ask          | BDD B1–B5       | **High — CWE-269:** complement operators bypass literal wildcard detection.                                         | `Allow`, `NotAction: iam:DeleteRole`, `Resource: "*"` grants virtually every applicable AWS action to the workflow role while validation passes. | Treat the presence of `NotAction` or `NotResource` on any `Allow` statement as unsafe; cover scalar/array/malformed variants, all supported policy edges, and deny negative twins. | accepted    |
| C4  | Design           | defer        | Entire runbook  | The surface is a deterministic policy diagnostic with no visual UI.                                                 | N/A.                                                                                                                                             | Skip visual design; keep the diagnostic bounded and free of policy contents.                                                                                                       | accepted    |

## Expanded security finding C3

- **Severity:** high.
- **Taxonomy:** CWE-269 Improper Privilege Management.
- **Reachability:** a downstream repository actor obtains a correctly scoped GitHub OIDC token and
  receives an in-stack complement policy through a supported role attachment path.
- **Impact:** near-account-wide service, credential, data, and control-plane authority.
- **Class elimination:** structural statement parsing plus unconditional rejection of allow-side
  `NotAction`/`NotResource` at the G_OIDC_2 trust boundary.
- **Negative twin:** deny-side complements do not grant authority and must remain silent.
- **Residual:** external managed policies, permission boundaries, session policies, SCPs, resource
  policies, and multi-statement privilege-escalation composition remain outside this preview rule.

## Review conclusion

M1 is limited to the validated high-severity bypass and preserves the existing exact-full-admin CIS
contract. The milestone is specific enough for BDD-first execution without dependency or live-cloud
authority.
