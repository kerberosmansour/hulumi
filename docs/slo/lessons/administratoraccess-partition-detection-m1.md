# Lessons — AdministratorAccess partition detection M1

Date: 2026-10-15

1. AWS-managed policy identity includes the partition. Treating one commercial ARN as universal silently weakens a mandatory rule in sovereign partitions.
2. A shared security predicate prevents G_OIDC_2 and CIS 1.16 from acquiring different partition behavior.
3. Exact equality is the useful boundary here. Suffix, regex, trimming, and case-folding approaches can turn customer-controlled or malformed strings into trusted provider identity.
4. Partition coverage needs attachment-shape coverage as well. Testing only the helper would miss callers that compare raw policy values themselves.
5. A public commercial-ARN constant can remain compatible while the private recognition set represents the broader provider concept.
6. Unknown partitions should fail closed as nonmatches until official evidence and tests add them deliberately.
