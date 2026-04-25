# Pulumi Discussion draft — proposing a sibling compliance-pack org

**Where**: <https://github.com/orgs/pulumi/discussions> (Ideas
category) — once `pulumi/pulumi` Discussions is open to
non-maintainers; otherwise <https://github.com/pulumi/pulumi/discussions>.

**Title**: A `pulumi-compliance-policies-frameworks` sibling org
for community-contributed policy packs (CIS, NIST, AICM, …)

---

Hi Pulumi maintainers,

I just shipped Hulumi v1.0.0
(<https://github.com/kerberosmansour/hulumi>), an Apache-2.0
toolkit centered on three npm packages:

- `@hulumi/baseline` — hardened S3 + AccountFoundation
  ComponentResources with Sandbox / Startup-Hardened tiers.
- `@hulumi/policies` — `HulumiHardeningPack` (4 rules) +
  `CisV5Pack` (CIS AWS Foundations v5.0.0 sections 1–3).
- `@hulumi/drift` — TLA+-verified drift classifier with 4
  pluggable adapters (Automation API, CloudTrail, Provider
  Version, Git Log).

All three publish with SLSA Build L3 attestation via npm trusted
publishing. The verdict logic in `@hulumi/drift` is verified with
TLA+ and the verdict-matrix BDD walks the trace cell by cell.

**Proposal**: it'd be useful for the Pulumi ecosystem to have a
sibling org or repo —
`pulumi-compliance-policies-frameworks` — where community-shipped
CrossGuard packs (CIS, NIST 800-53, AICM, ISO 27001, etc.) can
live under a consistent rubric:

- IDs-only citations (no verbatim framework prose) for
  Apache-2.0 compatibility with CSA / CIS licensing.
- SLSA Build L3 attestation on every release.
- A shared `PackMetadata` shape (cdk-nag-style; Hulumi's lives
  in `@hulumi/policies`) so consumers can compose packs
  without per-pack glue code.
- A common `Suppression` interface with required reasons +
  expiry on high-severity rules.

I'd be happy to contribute Hulumi's `HulumiHardeningPack` +
`CisV5Pack` as the seed content for such a repo, and I'm
interested in others' framework packs.

Is there appetite for this in the Pulumi org? If so, what's the
right path — a repo under `pulumi/`, an org outside Pulumi
mirroring the `awesome-pulumi`-style federation, or a registry
addition?

Happy to drive the bootstrap if there's interest.

Sherif

---

**Internal notes:**

- Post 3 days after release so the npm packages have time to
  propagate provenance badges.
- Reference any responses in the Pulumi-blog-pitch draft.
