# Lessons — GitHub OIDC effective authority M1

Date: 2026-10-15
Runbook: `docs/RUNBOOK-github-oidc-effective-authority.md`

## What changed our understanding

- Literal `Action: "*"` and `Resource: "*"` matching is only one representation of broad AWS authority. Complement operators can express a larger evolving grant while avoiding both literals.
- Complement semantics are difficult to prove safe against AWS's changing action and resource universe. At the GitHub deployment-role boundary, the bounded and reviewable rule is to require positive allowlists.
- Operator presence matters independently of value shape. Empty, null, malformed, scalar, array, and combined complement values must not create parser-dependent gaps.
- The same authority predicate must cover every already-supported policy graph edge. Fixing only role inline policies would leave customer-managed attachment forms as equivalent bypasses.
- `Deny` complements are negative controls, not grants. Keeping their behavior explicit prevents a privilege rule from becoming a generic syntax ban.

## Reusable rules

- Keep narrow exact-policy helpers stable when another caller has a separate compatibility contract; compose a dedicated predicate at the stricter trust boundary.
- Model IAM authority structurally from parsed statements, never from string or substring matching.
- For high-impact workload identities, reject allow-side complement operators and guide operators toward explicit action/resource allowlists.
- Test every correlation edge plus unrelated, unbound, scoped, and deny-side negative twins.
- Keep diagnostics to bounded labels and resource identities; never copy policy bodies into violations.

## Follow-ups

- External managed policies and whole-account effective permissions need a separately scoped design if future product requirements demand them.
- No new retrospective issue is required: the single product defect is the Codex Security finding fixed by this milestone, and no matching open GitHub issue existed when the milestone began.
