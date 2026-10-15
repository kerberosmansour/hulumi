# Lessons — S3 hardening control-to-bucket binding M1

Date: 2026-10-15
Runbook: `docs/RUNBOOK-s3-hardening-bucket-binding.md`

## What changed the design

- `PolicyResource.name` is a Pulumi logical label and must not be merged with provider IDs when a policy decides resource ownership.
- Matching a type-chain ancestor groups resource kinds, but it does not identify a component instance. Property dependency URNs supply the missing causal relationship.
- Pulumi's general `dependencies` collection includes ordering relationships. Only the named `propertyDependencies` edge proves that a target-bearing input consumed an output of the exact bucket.
- A bucket policy has two distinct binding surfaces: `bucket` selects the provider resource, while `policy` embeds its ARN. Both require exact edges before the policy document can count as evidence.
- Physical identity must be singular. Conflicting `bucket` and `id` outputs or an unresolved identity are safer as a mandatory-policy failure than as a guessed match.

## Reusable review rule

For CrossGuard relationship checks, separate four questions: does the resource have the expected type and shape; is there one resolved provider identity; did the exact target property derive from the intended resource URN; and does any embedded policy/document cover that same identity? Names, prefixes, ancestry, and `dependsOn` can support diagnostics but must not replace those proofs.

## Follow-ups kept separate

- HULUMI-H5 still needs a separate bounded milestone for TLS Deny action/principal completeness; this milestone preserves the existing shape semantics and repairs only target attribution.
- HULUMI-H4 logging ownership has its own Codex Security finding and should receive the same property-edge treatment independently.
- Other policy packs that accept general dependency or value fallbacks remain separate findings so their provider contracts can be reviewed individually.
