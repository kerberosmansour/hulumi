# Lessons: AWS organization delegated-admin binding M1

- Capability presence and capability ownership are separate invariants; a service principal alone does not prove which account holds authority.
- Stack rules with component-scoped intent must evaluate every foundation separately because one global set can let one foundation satisfy another.
- A single bounded diagnostic for an uninspectable foundation identity is clearer than four derivative missing-service messages.
- Raw resources can remain compatible when the validator correlates actual inputs rather than trusting component ancestry.
- Static exact-pair checks are sufficient for this preview boundary; live AWS drift needs a separate control-plane read.
