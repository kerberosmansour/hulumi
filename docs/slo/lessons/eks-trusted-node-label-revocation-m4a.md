# Lessons: EKS trusted-node label revocation M4a

## What worked

- Making mutation intent a discriminated `add`/`remove` plan kept validation explicit and prevented presence-only checks from authorizing removal.
- Discovering the union of current node-group members and exact trusted-label holders closed selector drift while one UID/name map and one global bound kept the input finite.
- Testing the label value before removing it turned revocation into a compare-and-swap operation alongside UID, resourceVersion and providerID tests.
- Keeping capacity classification separate from the revocation union prevented stale outsiders from making a node group look ready.
- Treating per-node evidence retrieval failure as an ordinary denial path reused the same bounded revocation kernel and audit vocabulary.

## Corrections made during review

- Runtime types must be checked before regular expressions. JavaScript regular expressions coerce `undefined` to a string, so the final guard explicitly proves protected-label and Node identity fields are strings before any revoke plan is constructed.
- The first critique described all provider outages as revocable. The implementation can safely revoke on per-node EC2 evidence failure, while shared discovery failure lacks a trustworthy candidate/evidence set. The contract now states that residual precisely.

## Follow-up

M4b must redesign the reusable ServiceAccount bearer-token authority boundary. Username matching in admission and cluster-wide Node patch RBAC are not a complete workload identity boundary. That work needs its own architecture, threat model and milestone; it must not be hidden inside this revocation fix.
