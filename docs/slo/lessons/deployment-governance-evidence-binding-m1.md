# Lessons — deployment governance evidence binding M1

Date: 2026-10-15

1. Independent presence checks are unsafe for authority evidence. Each resource can be individually valid while describing a different repository, environment, workflow, or principal.
2. Pulumi property dependencies are a stronger repository identity signal than basenames, logical names, component ancestry, or general dependency presence.
3. Component inputs and tags are declarations. The child IAM trust policy is the enforceable authority boundary and must agree with those declarations before they count as evidence.
4. Exact trust-policy shape keeps hidden alternate principals, actions, claims, and additional Allow statements outside the admitted contract.
5. A component named for deployment should require a protected-environment contract and expose deployment intent explicitly; an empty foundation must not exempt its child repository.
6. Runtime validation still matters after a TypeScript field becomes required. An untyped caller can omit the field, so the constructor must reject missing and empty arrays before iterating them.
7. The useful negative suite combines decoys across layers: wrong property dependency, different environment, malformed trust, wrong claim, wrong provider, wrong action, extra statement, wrong tags, and missing child authority.
8. Keep the policy's accepted tuple aligned with the producing component's deterministic child name, tags, action, and trust-policy serialization. A future producer change must update both sides and retain adversarial parity tests.
