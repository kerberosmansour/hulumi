# Lessons — Kubernetes RBAC authority bounds M1

Date: 2026-10-15
Runbook: `docs/RUNBOOK-k8s-rbac-authority-bounds.md`

## What changed our understanding

- Kubernetes privilege-escalation authority is represented by explicit verbs as well as wildcard verbs. A wildcard-only policy creates a semantic gap even when its description names `bind`, `escalate`, and `impersonate`.
- Secret `get` is narrower than `list` or `watch`, but it is not least privilege without `resourceNames`: a compromised workload can read any Secret name it learns from configuration, logs, conventions, or another API.
- `resourceNames` must be validated as a nonempty array of canonical exact strings. Merely checking field presence accepts empty arrays, scalar coercions, whitespace variants, and wildcard-like bounds.
- Diagnostics can explain the rejected authority without echoing Secret names or complete RBAC rules. This preserves remediation value while reducing metadata exposure in preview logs.
- Security scanning should include tests as first-class code. Semgrep caught a dynamic regular expression in the initial regression assertion; a literal substring assertion expressed the same proof without a ReDoS-shaped construct.

## Reusable rules

- Define authorization policy from the platform's effective privilege primitives, not from one syntactic shorthand.
- For read access to high-value named objects, require an explicit nonempty name allow-list and reject malformed bounds.
- Report at most once per resource rule so a single mixed rule does not flood preview output.
- Pair every fail-closed matrix with ordinary-workload, exact-name, suppression, and adjacent-rule negative controls.
- Keep structural policy claims bounded to the resources inspected; do not imply live subject/binding aggregation or authorization proof.

## Follow-ups

- The separate Patch-resource and workload-inventory findings require their own SLO contracts; they were intentionally not folded into this authority repair.
- No new retrospective issue is required: the two product defects are the Codex Security findings fixed by this milestone, and no matching open GitHub issue existed when the milestone began.
