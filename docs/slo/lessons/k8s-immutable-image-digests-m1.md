# Lessons — Kubernetes immutable image digests M1

Date: 2026-10-15
Runbook: `docs/RUNBOOK-k8s-immutable-image-digests.md`

## What changed our understanding

- A semantic-version tag communicates release intent but supplies no content-integrity guarantee. The same registry namespace can repoint it without any infrastructure-code change.
- Merely searching for `@sha256:` is insufficient. Truncated, overlong, uppercase/non-canonical, whitespace-bearing, multi-separator, and suffix-garbage references can all contain that substring without being an exact content address.
- Fail-closed handling of missing and uninspectable inputs matters in preview because an unknown value is not evidence of a valid digest.
- Security diagnostics should not echo image references. Internal registry paths are sensitive metadata, and malformed references can accidentally contain credentials.
- A stricter invariant exposes stale “hardened” fixtures usefully; updating the fixture preserves the system-level zero-violation proof instead of weakening the production rule.

## Reusable rules

- Treat tags as mutable labels regardless of naming convention; use a content digest for immutability claims.
- Anchor integrity-reference grammars at both ends and constrain algorithm, canonical encoding, length, whitespace, and separator count.
- Test valid tag-plus-digest and host-port forms as negative controls so strict parsing does not reject common safe references.
- Apply image rules identically to application and init containers through the same authoritative PodSpec extractor.
- Keep resolver, signature, attestation, vulnerability, and runtime-image proof in their own trusted release lane.

## Follow-ups

- The separate Patch-resource and workload-inventory findings require their own SLO contracts; they were intentionally not folded into this digest repair.
- No new retrospective issue is required: the single product defect is the Codex Security finding fixed by this milestone, and no matching open GitHub issue existed when the milestone began.
