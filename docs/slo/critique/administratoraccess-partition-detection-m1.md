# Critique — AdministratorAccess partition detection M1

Date: 2026-10-15
Runbook: `docs/RUNBOOK-administratoraccess-partition-detection.md`
Verdict: approved for bounded execution after the revisions captured below.

## CEO pass

- The repair closes a mandatory-policy blind spot in regulated and sovereign AWS partitions without changing public rule IDs or package versions.
- Shipping value is concrete: the same full-administrator grant receives the same decision regardless of AWS partition.
- Revision accepted: document the operator-visible behavior in G_OIDC_2 and retain the commercial ARN export for source compatibility.

## Engineering lead pass

- Partition logic belongs in one shared predicate. Duplicating three literals in G_OIDC_2 and CIS would allow the callers to drift again.
- Scalar and array inputs must use the same predicate, including the G_OIDC_2 direct-role and attachment paths.
- Revision accepted: test the shared behavior through both public policies and keep the implementation a small exact set lookup rather than a permissive regex.

## Security pass

- Matching only the policy suffix would let a customer-managed policy or crafted partition impersonate AWS managed `AdministratorAccess`.
- Trimming or case-folding malformed values could convert invalid evidence into authority-bearing evidence. Exact byte equality is the correct fail-closed boundary.
- Unknown `aws-*` partitions must remain nonmatches until AWS documents and the contract admits them.
- Revision accepted: add adversarial cases for customer accounts, unknown partitions, suffixes, prefixes, whitespace, embedding, different policy names, and non-string array entries.

## Design pass

- Keep `AWS_ADMINISTRATOR_ACCESS_ARN` as the familiar commercial exemplar. The predicate represents the multi-partition concept and the documentation explains why.
- Diagnostics should continue to say `AdministratorAccess`; partition details do not help remediation and would add noisy branching.
- Revision accepted: no new public type or configuration input is needed, and the user-facing document names all three admitted ARN shapes.

## Final constraints

- Exact three-partition set, exact AWS account field `aws`, exact path `policy/AdministratorAccess`.
- No dependency, manifest, lockfile, version, publication, live AWS call, suppression, or unrelated policy change.
- RED evidence must demonstrate both policy families fail on GovCloud/China before the predicate changes.
