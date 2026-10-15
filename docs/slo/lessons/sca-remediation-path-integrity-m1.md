# Lessons — SCA remediation path integrity M1

Date: 2026-10-15
Runbook: `docs/RUNBOOK-sca-remediation-path-integrity.md`

## What changed our understanding

- A path listed in normalized scanner evidence is still untrusted input. The same document cannot both nominate a file and authorize writing it.
- Lexical containment is only the first check. Links, special files, stale checkouts, duplicate evidence, and target replacement each create a separate confused-deputy path.
- A reviewed remediation decision needs two immutable bindings: the exact evidence bytes and the exact repository commit. Binding only one still permits substitution of the other.
- Dynamic regular expressions built from escaped dependency names were safe in the narrow implementation but difficult for static analysis to prove. Fixed parsers make the boundary clearer and remove an avoidable review burden.
- Refusing pnpm apply is the honest bounded behavior. Graph resolution belongs in the separate dependency-admission lane where candidate lockfiles can be scanned and reviewed before code execution.

## Reusable rules

- Treat normalized security-tool output as evidence, never as filesystem authority.
- Derive the complete mutation set in trusted code, then validate every direct and derived target before the first write.
- Couple no-follow descriptor reads with inode/digest fingerprints and same-directory atomic replacement; do not separate validation from an ordinary overwrite.
- Require exact input and revision digests for any automation that turns findings into source changes.
- Keep package-manager execution outside a narrow file-remediation primitive.

## Follow-ups

- The existing dependency-lifecycle finding should design a separate script-disabled candidate-resolution pipeline rather than expanding this bounded writer.
- Run remediation only in isolated disposable checkouts because Node.js cannot provide `openat2`-style directory-handle resolution or atomic multi-file transactions.
