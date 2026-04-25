---
title: Why Hulumi?
description: The design philosophy behind Hulumi — what it is, what it isn't, and when to choose it over the alternatives.
---

# Why Hulumi?

Hulumi exists to answer one question:

> "I'm a platform engineer about to author AWS infrastructure with the help of an AI coding agent. How do I get a defensible cloud account on day one without hand-rolling controls every time, embedding a commercial control-text license, or taking on a hosted-service dependency?"

Today the honest answer is _"you re-derive the same hardening checklist on every project, then audit yourself against framework documents you can't legally embed in your code, then bolt on a drift detector that may or may not run when no one is on call."_

Hulumi packages that answer once, ships it under Apache-2.0, and assumes the consumer is half-human, half-agent.

## The shape of the problem

Three trends collide:

1. **AI agents author IaC now.** Claude, Cursor, Copilot, and friends generate Pulumi/Terraform/CDK. They produce plausible code very quickly and very confidently. They don't read your wiki, they don't know which CIS revision your auditor wants, and they happily reach for `aws.s3.BucketV2` if you don't stop them.
2. **Compliance frameworks are licensed.** CSA's CCM and AICM, the CAIQ, and CIS's Benchmarks all forbid embedding control text in source unless you hold a commercial license. Tools that claim "CIS-aligned" by quoting the controls aren't really redistributable. ([details](./mappings/licensing.md))
3. **Drift is invisible until it bites.** When someone hits the AWS console at 2am to "just unblock prod," the IaC repo doesn't know. Cloud-side eventual consistency means even your own pipeline can look like drift if you ask too soon.

The combinations are nasty: an agent shipping unhardened S3, an auditor asking which CIS row each resource maps to, and a drift detector that can't tell the agent's `pulumi up` apart from a console click.

## Hulumi's three answers

### 1. Hardened-by-default ComponentResources, parameterised by tier

`SecureBucket` and `AccountFoundation` aren't wrappers around the AWS resources — they _replace_ the way you reach for them. Both accept a single `tier` parameter (`"sandbox" | "startup-hardened"`) which is the only knob you turn between scratch work and production. Every other hardening choice is a default the component owns.

The Startup-Hardened tier is **behaviourally load-bearing**: each component emits at least three more sub-resource kinds than Sandbox, and the test suite asserts the delta. Critique C2 forced this — one delta reduces "tier" to marketing. Three deltas means dropping any one weakens a specific, named security property (retention, attribution, data-plane auditing). See [tiers.md § Why three deltas, not one](./tiers.md#why-three-deltas-not-one).

This matters more under AI authoring than human authoring. A human reads `tier: "sandbox"` and remembers what it implies. An agent reads it as a string and trusts that the component will do the right thing. Hulumi's job is to make sure the right thing happens whether or not the agent understood it.

### 2. CrossGuard pack as the safety net

`HulumiHardeningPack` is what catches the things `SecureBucket` can't: code that bypasses `SecureBucket` entirely, state backends pointed at `file://`, IaC roles without the `hulumi:iac-role=true` tag. The four rules (H1–H4) are intentionally narrow — every rule answers a single concrete question with a concrete violation message.

Because the pack can be loaded into any Pulumi stack independently of the components, it's also a low-risk way to introduce Hulumi into an existing codebase. You can run the pack against a stack that doesn't use `SecureBucket` at all, and the violations tell you exactly which resources to migrate.

### 3. Local-first drift classifier with a TLA+-bound verdict

`DriftClassifier` is the part most other "hardened defaults" projects punt on. It's local-first (no hosted backend), with four pluggable adapters (Pulumi Automation API, CloudTrail, provider-version, Git log) feeding a verdict matrix that mirrors the TLA+ `HardenedVerdict` spec cell-by-cell:

| Snapshot                               | Verdict           | Confidence |
| -------------------------------------- | ----------------- | ---------- |
| `mutated && eventDelivered`            | ConsoleBreakGlass | high       |
| `mutated && eventInTransit`            | Unknown           | low        |
| `mutated && providerDrift && !event*`  | ProviderApiChurn  | medium     |
| `mutated && !providerDrift && !event*` | Unknown           | low        |

The `medium` ceiling on `ProviderApiChurn` is **TLA+-proven** — the spec's `SafetyRealistic` invariant guarantees `ProviderApiChurn @ high` and `mutated` cannot coincide. The classifier code mirrors that ceiling, and the verdict-matrix BDD test fails any drift. This is rare in IaC tooling and it matters: it means you can build alerting on top of `ConsoleBreakGlass @ high` without it being polluted by provider releases.

The classifier is the part of Hulumi that most directly serves the "agent is authoring my IaC" use case. When the agent asks "is this drift mine, or did a human do it?", the classifier gives a verdict you can act on.

## What Hulumi explicitly is not

| Not                           | Why                                                                          | Use instead                                  |
| ----------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------- |
| A hosted SaaS                 | Apache-2.0 + local-first is the value proposition.                           | Wiz, Lacework, Prisma — different tradeoffs. |
| A CSPM                        | Hulumi prevents misconfiguration at IaC time. CSPMs scan a deployed account. | Pair with your CSPM of choice.               |
| A multi-cloud abstraction     | AWS first by design. Other clouds may follow on the same component contract. | Hand-roll, or use a multi-cloud framework.   |
| A CIS Benchmark distribution  | We cite IDs only. The full Benchmark text is licensed.                       | Buy the Benchmark from CIS.                  |
| A replacement for code review | The pack catches the obvious; humans catch the architectural.                | Both.                                        |
| A way to skip threat modeling | The skill makes threat modeling cheaper, not unnecessary.                    | Use both: skill + human review.              |

## When to use Hulumi

**Strong fit:**

- You're starting an AWS account from scratch and want a defensible day-one baseline.
- Your team has at least one AI agent in the IaC authoring loop.
- You need to pass a compliance audit that asks for CCM / CIS / NIST mappings, but you can't legally ship the framework prose with your code.
- You want drift detection that distinguishes provider-API churn from console break-glass, and you want it without paying a SaaS.
- You ship Pulumi (TypeScript) and are comfortable on Node 20.

**Weak fit (today):**

- You're on Terraform / CDK / OpenTofu. Hulumi is Pulumi-only for v1.x.
- You need clouds beyond AWS. v2.x might add Azure / GCP, but no commitment yet.
- Your existing stack is a tangle of bespoke modules; Hulumi components are opinionated and don't unwind years of customisation.
- You're allergic to opinionated defaults. Hulumi's defaults are what you're paying for.

## The licensing posture, in one sentence

We cite control framework IDs (CCM, AICM, CAIQ, CIS, NIST 800-53, NIST 800-218A, MITRE ATLAS) **by ID only**, with links to the upstream sources. No verbatim control text in `skills/` or `packages/`. Docs may include short factual references when licensing permits, never paragraphs.

This is a deliberate constraint, not an oversight. It's why Hulumi can be Apache-2.0 across the board, including the dist tarballs, including the skill outputs, including any document the skill writes to your working directory. See [mappings/licensing.md](./mappings/licensing.md) for the full policy and the legal rationale.

## What "hardened by default" actually buys you

A short walkthrough using the SecureBucket Sandbox tier — the _minimum_ a Hulumi user gets:

| Default             | Without Hulumi                              | With Hulumi                                                  |
| ------------------- | ------------------------------------------- | ------------------------------------------------------------ |
| Public access block | Decide per bucket; forget on the third one. | All four levers `true`, every bucket.                        |
| SSE-KMS             | Remember to set, often `aws/s3` only.       | SSE-KMS by default; pass a CMK if you have one.              |
| ACLs                | Default is "let me write ACLs."             | `BucketOwnerEnforced`; ACLs disabled.                        |
| TLS-only            | A bucket policy you rewrite from a wiki.    | Built-in `aws:SecureTransport=false → Deny`.                 |
| Versioning          | Off until someone asks.                     | Enabled, both tiers.                                         |
| Tagging             | Manual, drifts on rename.                   | `hulumi:component`, `hulumi:tier`, `hulumi:controls` triple. |

Multiply this by every component, every account, every team. That is the value Hulumi is trying to compound.

## Further reading

- [Getting started](./getting-started.md) — the 10-minute hands-on path.
- [Tier matrix](./tiers.md) — exactly what changes between Sandbox and Startup-Hardened, per component.
- [Cookbooks](./cookbooks/README.md) — task-shaped recipes.
- [CHANGELOG.md](../CHANGELOG.md) — what shipped at v1.0 and what's queued for v1.x / v2.x.
