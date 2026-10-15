# Critique — Policy suppression integrity M1

The repository has no frozen `.slo.json` threat model for this pre-existing
matcher, so the security pass operates in documented degraded mode and makes no
stable abuse-ID claim. The user's standing instruction to continue
autonomously with defensive SLO work confirms this bounded milestone and
disposes the concrete `ask` rows as accepted.

| id  | persona          | category     | runbook section | finding                                                                                                                   | concrete scenario                                                                         | recommendation                                                                                            | disposition |
| --- | ---------------- | ------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------- |
| C1  | CEO              | reduce-scope | Red lines       | Adding owners, approval services, or audit persistence would turn a predicate repair into a new governance product.       | The milestone stalls on unrelated workflow and storage design.                            | Enforce only the already documented reason, bounded scope, and expiry contract in the shared matcher.     | accepted    |
| C2  | Engineering lead | ask          | Compatibility   | Making expiry and scope mandatory invalidates current fixtures and examples, including stack-level exceptions.            | Consumers see mandatory rules reappear without a clear migration path.                    | Migrate every repository-owned consumer, retain exact/prefix matching, and define explicit `stack` scope. | accepted    |
| C3  | Security         | ask          | BDD B1–B7       | **Medium — CWE-20:** omitted scope/expiry, global `*`, and invalid dates currently suppress mandatory rules indefinitely. | A reviewed exception for one resource becomes a repository-wide permanent control bypass. | Validate the complete record and fail closed on every malformed or noncanonical field.                    | accepted    |
| C4  | Design           | defer        | Entire runbook  | The surface is configuration and preview diagnostics with no visual UI.                                                   | N/A.                                                                                      | Keep the existing matcher result and document concise canonical examples.                                 | accepted    |

## Review conclusion

M1 closes the validated global/permanent exception bypass while preserving the
existing public matcher and bounded exact/prefix behavior. Direct partition
tests plus every consumer family make the contract specific enough for
BDD-first execution.
