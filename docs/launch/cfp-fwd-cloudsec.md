# CFP — FWD CloudSec — Hardened Pulumi for the AI-Agent Era

**Title**: Hardened Pulumi for the AI-Agent Era — What TLA+
Verification Taught Us About Drift

**Format**: 30-minute talk

**Audience**: cloud security practitioners, platform engineers,
application security engineers building IaC at scale.

**Abstract** (300 words):

Cloud authoring is changing faster than the threat model. AI
coding agents now write significant fractions of new
infrastructure-as-code, but their training data lags AWS API
changes by months and they have no built-in concept of
controlled-defaults. Existing Pulumi components are mostly
unopinionated; existing CrossGuard packs are mostly advisory.

This talk covers Hulumi v1.0.0, an open-source toolkit that:

1. **Tiers components** so Sandbox vs Startup-Hardened differ in
   ≥3–4 concrete sub-resources (object-lock, mandatory access
   logging, CloudTrail data events, Access Analyzer, GuardDuty
   extended protections, KMS deny-without-tag). Tier is
   behaviourally load-bearing — an AST test fails if anyone
   collapses Startup-Hardened back to Sandbox.

2. **Pairs CrossGuard rules with the tier system**: H1 blocks raw
   `aws.s3.Bucket`; H2 blocks `file://` state backends; H3 (now
   mandatory in v1.0.0) requires the `hulumi:iac-role=true` tag,
   paired with a ready-to-apply AWS Organizations SCP that makes
   the tag tamper-evident; H4 enforces logging on Startup-Hardened
   buckets.

3. **Classifies drift with TLA+ verification.** A 5-row verdict
   matrix walks every reachable state of a TLA+ spec
   (`HulumiDrift.tla`); the TypeScript classifier mirrors the
   spec's `HardenedVerdict` exactly. A meta-test fails CI if the
   two drift apart. Result: `ProviderApiChurn` is provably capped
   at `medium` confidence; `ConsoleBreakGlass / high` and
   `mutated` cannot coincide except via an in-flight CloudTrail
   event.

The session covers: how we modeled the eventual-consistency race
in TLA+, why the 4-adapter composition (CloudTrail + Automation
API + Provider Version + Git Log) was the smallest defensible
set, and what the cache-perms / shell-injection / shallow-clone
guardrails caught in development. Demos are live against an AWS
sandbox.

**Takeaway**: Formal verification of a small-but-critical
classifier is feasible in a real OSS project budget. The TLA+
spec is ~150 lines; the TypeScript mirror is ~50 lines; the
matrix BDD is ~30 lines.

**Bio** (50 words): [maintainer bio with Hulumi attribution]

---

**Internal notes:**

- Track CFP deadlines on the FWD CloudSec site.
- Mirror the abstract in `cfp-bsides.md` shortened to 20-min slot.
