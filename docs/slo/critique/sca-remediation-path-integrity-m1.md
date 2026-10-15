# Critique — SCA remediation path integrity M1

The repository has no frozen `.slo.json` threat model for this pre-existing CLI, so the security pass
operated in documented degraded mode and makes no stable abuse-ID claim. The user’s standing request
to continue autonomously with defensive SLO work disposes the concrete `ask` rows as accepted.

| id  | persona          | category     | runbook section   | finding                                                                                                                | concrete scenario                                                                                                                                                 | recommendation                                                                                                                                                                          | disposition |
| --- | ---------------- | ------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| C1  | CEO              | reduce-scope | Red lines         | Repairing package-manager admission in the same milestone would mix two independently reviewable high-risk boundaries. | A path fix also rewrites pnpm resolution, obscuring whether a failure came from filesystem authority or dependency admission.                                     | Refuse pnpm apply here and leave script-disabled candidate resolution to its separately tracked finding.                                                                                | accepted    |
| C2  | Engineering lead | ask          | Stable interfaces | Deriving the repository root or revision implicitly from the work-item path preserves confused-deputy ambiguity.       | An operator launches from a parent checkout while the input names a sibling project and the tool validates the wrong boundary.                                    | Require explicit repository root, exact HEAD, and reviewed work-item SHA-256 whenever apply is enabled.                                                                                 | accepted    |
| C3  | Security         | ask          | BDD B2–B8         | **High — CWE-22:** lexical containment alone does not eliminate link and replacement races.                            | A malicious checkout swaps a validated manifest for a link or new inode between validation and overwrite, redirecting or replacing data under operator authority. | Validate every component, use no-follow handles, fingerprint the checked target, create a same-directory exclusive temp file, recheck before rename, and verify the final regular file. | accepted    |
| C4  | Security         | ask          | BDD B9            | A typed cast lets duplicate or inconsistent evidence choose whichever record `.find()` encounters.                     | A work-item file supplies two evidence rows for one key and places the hostile path first, so reviewer-visible identity and applied target diverge.               | Strict-schema validate the whole document and require exactly one internally consistent evidence row for the selected finding.                                                          | accepted    |
| C5  | Design           | defer        | Entire runbook    | No visual UI surface exists; the only interaction is a fail-closed CLI contract.                                       | N/A.                                                                                                                                                              | Skip the visual design pass; verify concise operator errors and documentation instead.                                                                                                  | accepted    |

## Expanded security finding C3

- **Severity: high — CWE-22 Path Traversal**
- **Class:** path authority / link traversal / TOCTOU replacement.
- **Status before M1:** unmitigated; `manifestPaths` reaches ordinary `readFile` and `writeFile`.
- **Concrete exploit:** a supplied `../../sibling/package-lock.json` or an in-repository link is approved
  by the same untrusted file that names it, then overwritten under the operator’s filesystem rights.
- **Class elimination target:** exact input/revision binding, canonical component validation, no-follow
  reads, checked fingerprints, exclusive same-directory staging, atomic replacement, and final checks.
- **Variant analysis:** absolute paths, POSIX traversal, backslash ambiguity, intermediate links, final
  links, missing files, directories/FIFOs, stale HEAD, wrong work-item digest, and concurrent inode swap.
- **Residual:** Node.js does not expose Linux `openat2`; the implementation therefore combines explicit
  component checks with descriptor/fingerprint checks and same-directory atomic replacement. A hostile
  process with permission to replace parent directories concurrently remains outside the single-process
  checkout threat model and must be prevented by executing in an isolated trusted workspace.

## Review conclusion

M1 is bounded to the direct high-severity path-authority defect. The contract is specific enough for
BDD-first execution and does not admit dependency or live-provider changes.
