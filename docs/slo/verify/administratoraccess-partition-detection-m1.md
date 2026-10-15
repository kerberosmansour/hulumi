# Verification — AdministratorAccess partition detection M1

Date: 2026-10-15
Runbook: `docs/RUNBOOK-administratoraccess-partition-detection.md`
Base: `10d3704dcf43dcaf28b559b2566d8a244d0edd93`
Finding: `csf_6dc6685b80368670490947d5`
Verdict: local implementation and security gates passed; exact-head CI, merge, and merged-main Codex Security remain.

## Outcome and BDD evidence

| Evidence | Result |
| --- | --- |
| Baseline | The 57 existing G_OIDC_2 and CIS 1.16 tests passed before the new scenarios were added. Official OSV-Scanner 2.7.0 scanned both resolved lockfiles and 575 package occurrences with zero vulnerabilities and zero `MAL-*`. |
| RED | The expanded focused suite produced five intended failures with 58 controls passing against the commercial-only implementation. The failures covered GovCloud and China in the shared predicate, G_OIDC_2, and CIS 1.16. |
| Exact predicate | The shared helper accepts only the exact AWS-managed `AdministratorAccess` ARNs in the `aws`, `aws-us-gov`, and `aws-cn` partitions, as a scalar or array member. |
| Negative boundary | Unknown partitions, customer-account policies, alternate case, whitespace, prefixes, suffixes, different policy names, embedded values, and non-string entries remain nonmatches. |
| G_OIDC_2 | GovCloud and China grants are rejected for direct role `managedPolicyArns`, `RolePolicyAttachment`, `RolePolicyAttachmentsExclusive`, and generic `PolicyAttachment` resources linked to a GitHub-OIDC-trusted role. |
| CIS 1.16 | GovCloud and China grants are rejected for role, user, group, generic, exclusive, and direct-role managed-policy attachment shapes. |
| Focused/package regression | The final focused suite passed 63/63. The complete `@hulumi/policies` suite passed 401/401; package build, typecheck, and lint passed. |
| Workspace regression | Recursive test, build, typecheck, and lint passed across all 19 runnable workspace projects. |

## Security and repository evidence

| Gate | Result |
| --- | --- |
| OSV admission | Official checksum-verified OSV-Scanner 2.7.0 scanned two unchanged resolved lockfiles and 575 package occurrences with zero vulnerability results and zero `MAL-*`; report SHA-256 `10c55dbf5e83d5268eb5fa37e826477ae5eb4a972a2fe38e0a6832f28be95df4`. |
| Dependency diff | No manifest or lockfile changed, and the implementation added no dependency or build-time authority. |
| Semgrep | Semgrep 1.156.0 ran 74 TypeScript rules over the four changed TypeScript files with zero findings and zero errors; report SHA-256 `47d6a8b241718d0f84e01246b8553f7314c68ebe1bcb78f9318f6a2f3f2cfc7b`. |
| Secret review | Added lines contain no credential, token, private-key, or secret material; test inputs are public IAM ARN fixtures. |
| Repository governance | Prettier, license-boundary, exact-pin, workflow-governance, exact allow-list, and `git diff --check` passed. |

## Residual limits

- This rule recognizes the documented AWS-managed `AdministratorAccess` ARN. It does not calculate effective IAM permissions or infer uninspectable customer-managed policy contents.
- Unknown AWS partitions remain nonmatches until provider documentation and this contract explicitly admit their exact ARN.
- G_OIDC_2 correlates resources present in one Pulumi stack. Attachments created outside the evaluated stack require a separate inventory or runtime control.
- Tests exercise Pulumi policy inputs locally and make no live AWS calls.

## Pending closeout

- Sign and DCO-stamp the exact source commit.
- Pass exact-head GitHub checks and merge only that verified head under standing authorization.
- Run xhigh Codex Security against the exact merged-main commit and confirm the source finding and equivalent partition blind spots are absent.
