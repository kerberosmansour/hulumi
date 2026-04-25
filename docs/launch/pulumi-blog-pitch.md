# Pulumi blog guest-post pitch

**To**: Pulumi blog editor / DevRel team
**Format**: 1500-word guest post draft

**Pitch**:

Hulumi v1.0.0 just shipped — an Apache-2.0 toolkit on top of
Pulumi for hardened AWS components, CrossGuard policy packs, and
a TLA+-verified drift classifier. We'd love to write a Pulumi
blog guest post on the design choices, especially:

1. **Why CrossGuard wasn't just "policy as code".** We pair
   CrossGuard rules with `aws:PrincipalTag/hulumi:iac-role` and
   an AWS Organizations SCP. The combination is what makes the
   classifier's principal-attribution signal trustworthy.

2. **TLA+ for drift classification.** A 150-line TLA+ spec
   (`HulumiDrift.tla`) verified with TLC; a 50-line TypeScript
   mirror; a 30-line BDD that walks the trace. We can show how
   the formal model surfaced the `ProviderApiChurn @ medium`
   ceiling — a property we'd never have proven with tests
   alone.

3. **SLSA Build L3 day-zero.** We use
   `slsa-framework/slsa-github-generator` reusable workflow +
   npm trusted publishing (no `NPM_TOKEN`). Three packages
   publish atomically; any attestation failure aborts before
   any `npm publish`.

4. **Pulumi Automation API as an integration test harness.**
   Our weekly real-AWS integration test runs `pulumi up` →
   verify-via-aws-sdk → `pulumi destroy` against a dedicated
   sandbox account, OIDC-only, 30-min total budget per run.

The pitch ties to Pulumi's audience: platform engineers building
real infra in TypeScript, who want to know how to make their own
projects more like Hulumi (or who want to consume Hulumi
directly).

The post would be 1200–1800 words with two diagrams (the TLA+
state machine; the 4-adapter composition graph) and three code
snippets (50 LOC total).

Deliverable: blog draft within 2 weeks of pitch acceptance.

---

**Internal notes:**

- Send 7+ days post-release so the npm pages have provenance
  badges visible.
- Include link to the GH Discussion thread (if response is
  positive there) as social proof.
