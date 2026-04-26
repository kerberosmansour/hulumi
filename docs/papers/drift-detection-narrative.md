---
title: Drift detection that actually tells you what happened — a narrative tour of @hulumi/drift
subtitle: Same content as the reference paper; written to be read straight through
authors:
  - Sherif Mansour (Hulumi project maintainer)
version: 1.0
date: 2026-04-25
status: published
license: Apache-2.0
keywords: [drift detection, infrastructure-as-code, Pulumi, TLA+, AWS, CloudTrail]
---

# Drift detection that actually tells you what happened

> A narrative tour of `@hulumi/drift@1.0.0` — what it does, how it works, and why a small TLA+ spec sits at its core. The companion [reference paper](./drift-detection.md) covers the same material in dense citation form for people who want code-line numbers and a §-by-§ index. This one is written to be read straight through.

## A scene

It's 8am Monday. You run `pulumi preview` against your production stack and see 23 changed resources. The diff includes an S3 bucket policy, four IAM roles, a Lambda environment variable, and a handful of CloudWatch log groups. Nobody on your team mentions deploying anything over the weekend.

You have three plausible explanations:

- **Someone clicked something in the console.** Maybe oncall got paged at 3am and made a change to unblock prod. Maybe an engineer who shouldn't have console access does anyway.
- **`@pulumi/aws` released a new version.** A field was renamed, a default changed, and Pulumi now reports the old name as drift even though nothing in AWS actually moved.
- **A teammate landed a PR you haven't pulled yet.** Their change is committed but you haven't run `pulumi up` from the latest `main`.

Each explanation has a different correct response. Investigate-the-console is a security review. Update-the-pin is a chore. Pull-and-apply is a Slack message. Treating all three as "23 changes need attention" is how teams end up ignoring drift detection entirely — the signal-to-noise ratio collapses.

This is what `@hulumi/drift` is for. It looks at one resource at a time and tells you which of those three buckets the change falls into, plus how confident it is. You can then act, or ignore, with intent.

## Asking three sources, looking for one answer

Imagine you walk into a Monday morning meeting and ask three people:

- **The build engineer** — "did our pipeline change anything in this stack?"
- **The cloud auditor** — "did anyone outside our pipeline touch this resource?"
- **The library team** — "did we ship a new version of the toolkit recently?"

If the build engineer says "yes, here's the diff", the auditor says "no console activity", and the library team says "no recent release" — your teammate landed something. Pull and apply.

If the build engineer says "yes, here's the diff", the auditor says "yes, IAM user `alice` made changes", and the library team says "no release" — that's a console event. Investigate.

If the build engineer says "yes, here's the diff", the auditor says "no console activity", and the library team says "yes, we shipped 7.28 yesterday" — that's provider churn. Re-pin and re-run.

The classifier is automation for that meeting. Each "person" is an **adapter** — a small piece of TypeScript that knows how to ask one specific question. There are four of them, not three, because the auditor question is split in two: the CloudTrail adapter looks at the events, and a separate **probe** asks "is CloudTrail actually current, or is it still catching up?" That distinction matters in a way that we'll come back to.

## Each adapter does one thing

The four adapters are deliberately narrow:

The **AutomationApiAdapter** wraps `pulumi preview --refresh-only` and returns one bit: did anything for this resource change? It doesn't try to interpret the diff. The interpretation is the classifier's job.

The **CloudTrailAdapter** asks AWS: in the last 24 hours, who made API calls touching this resource? Then it filters out anyone whose IAM role carries the `hulumi:iac-role=true` tag. What's left over is "non-IaC actors who touched the resource" — by definition, console activity (or some other automation that shouldn't have been there).

The **ProviderVersionAdapter** compares the `@pulumi/aws` version pinned in your `pnpm-lock.yaml` to the latest version on npm. If the pin is older, that's a candidate explanation for drift.

The **GitLogAdapter** runs `git log` over your Pulumi program files in the relevant time window. If teammates committed IaC changes you haven't pulled, that's a candidate explanation.

Each adapter returns a small structured signal: did I find anything (yes/no), did the underlying call succeed (yes/no), and a bag of evidence the classifier can attach to the verdict for human inspection.

The adapters don't know about each other. They don't know about the verdict matrix. They just answer their one question. The composition lives in the classifier.

## The verdict matrix is just a lookup table

After running the four adapters and the probe, the classifier has four boolean facts:

- `mutated` — did `pulumi preview` show a change?
- `eventDelivered` — did the probe confirm CloudTrail surfaced a relevant event?
- `eventInTransit` — does the probe think CloudTrail is still catching up?
- `providerDrift` — is your provider pin older than upstream?

Four yes/no answers gives you 2⁴ = 16 possible combinations. But the booleans aren't independent — if an event is delivered, it can't also be in transit. So in practice **only five combinations are reachable**, and the matrix says: for each reachable combination, here's the verdict and how confident you should be.

| What you observed                                               | The verdict       | Confidence |
| --------------------------------------------------------------- | ----------------- | ---------- |
| Nothing changed                                                 | None              | none       |
| Something changed, and CloudTrail confirmed a console event     | ConsoleBreakGlass | **high**   |
| Something changed, and CloudTrail is still catching up          | Unknown           | low        |
| Something changed, no console event, but the provider is behind | ProviderApiChurn  | medium     |
| Something changed, no console event, no provider drift          | Unknown           | low        |

Two things are worth pausing on.

First, `ConsoleBreakGlass` is the only verdict that ever reaches **high** confidence in this matrix. That's deliberate. The reasoning: a confirmed CloudTrail event with a non-IaC principal is the only signal the classifier can produce that _cannot_ be explained by either provider churn or stale local code. Everything else is, at best, suggestive.

Second, `ProviderApiChurn` caps at **medium**, not high — even if the provider really did change, you can't be _sure_ that explains your specific resource diff without inspecting the upstream changelog. The classifier doesn't try; it just tells you that's the most likely explanation, with appropriate humility.

## Why a lookup table at all

The matrix could have been a thicket of nested if-else statements. A table is better for two reasons.

The boring reason: tables are easier to test. The verdict-matrix test in CI literally walks the table row by row — for each input row, run the classifier, assert it produces the expected verdict. If anyone changes the classifier and breaks a row, the test names exactly which one.

The interesting reason: a table makes you think about every reachable case before you ship. When the matrix has five rows, you can read them all in twenty seconds and ask "are these the right five rows?" When the same logic is buried in a hundred-line function, the same question takes hours.

This is the entire reason the classifier is structured the way it is. The verdict matrix is the _contract_. Adapters and probes feed into it; the cache and monotonicity guard sit on top of it. Nothing else in the system is allowed to invent a verdict.

## Why bother with TLA+

Here's where the paper usually gets dense. Let me try a different angle.

Imagine you wrote a chess engine and wanted to _prove_ "from this opening, my opponent can never force checkmate-in-three." You could write tests — play 1,000 games and check none of them ended in checkmate. But that's just 1,000 examples. There are roughly 10²⁰ possible 5-move sequences from a given position. Your tests are sampling a vanishingly small slice of the space.

TLA+ flips the question. You describe the rules of chess once (what's a board state, what's a legal move) and then a tool called TLC explores every reachable position from your starting state, mechanically, exhaustively. If, across the full reachable space, no checkmate-in-three exists, that's a guarantee. Not a sample.

The catch is the word "small." TLC can't enumerate all of chess (there's no such thing as a small chess state). But it _can_ enumerate things like "the four-bool snapshot, the cache state, and what's in flight in CloudTrail." That's a few thousand reachable states — small enough that exhaustive enumeration takes seconds.

So Hulumi's drift maintainer wrote a TLA+ spec called `HulumiDrift.tla` that describes:

- **The state** — the four booleans, the cache contents, the in-flight CloudTrail probe, what verdicts have ever been written.
- **The transitions** — every legal way the state can change. Operator runs preview. AWS commits an API call. CloudTrail eventually surfaces the event. npm publishes a new provider release. The probe times out. The cache is invalidated. And so on.
- **The properties to check** — claims like "no reachable state has `verdict.source = ProviderApiChurn ∧ verdict.confidence = high`."

TLC then explored every reachable state, every transition out of it, every state reachable from those, recursively until exhaustion. Two properties came back proven.

## Property one: the high-confidence cap

The first property is the one you saw in the matrix table: **`ProviderApiChurn @ high` is unreachable**. No matter what sequence of events happens, the classifier can never combine those two values.

Why does this matter? Because it lets you write a paging rule that says "alert me when `confidence == high`" and trust that it won't fire on a `@pulumi/aws` release. Ever. That's a behaviour guarantee, not a "we tried hard" guarantee. Tests can't give you that — tests only check the inputs you wrote tests for. TLC checks every reachable input.

The TypeScript classifier mirrors the cap explicitly:

```ts
if (snapshot.providerDrift) {
  // TLA+-proven UPPER BOUND: ProviderApiChurn never reaches `high` in any
  // reachable state (SafetyRealistic invariant). The classifier MUST cap
  // at `medium`.
  return { source: "ProviderApiChurn", confidence: "medium" };
}
```

If a future maintainer "improves" the classifier to escalate ProviderApiChurn to high on a strong signal, two tests fail in CI: the verdict-matrix test (which walks the proven table) and the alignment test (which demands the TS keep citing the spec). The proof becomes a tripwire.

## Property two: high never silently demotes

The second proven property: **once a verdict for resource X reaches `high`, no later classify call can silently overwrite it with a lower confidence.** Demotion has to go through an explicit "invalidate" step.

This is a temporal property — it's not about a single state, it's about sequences of states over time. Tests are bad at temporal properties because the number of possible sequences grows exponentially. TLC handles them naturally because it explores sequences as part of its normal reachability analysis.

The operational consequence: imagine a real console intrusion at 2am gets caught and cached as `ConsoleBreakGlass / high`. Then at 3am the CloudTrail probe times out — naive code would overwrite the cache with `Unknown / low`, and your alert silently downgrades. The monotonicity guard refuses that overwrite. You still see the high-severity verdict at 9am when you check Slack; the operator chooses when to clear it.

In code, this is a 50-line guard that compares incoming and existing confidence and refuses the cache write when the incoming is lower. It's mechanically simple. The TLA+ proof is what tells you it's _the right_ thing to be doing — that no clever optimisation should remove it.

## How the proof and the code stay in sync

TLA+ proves the _model_ is safe. If your real code disagrees with the model, the proof is irrelevant. So Hulumi has three guards to keep them aligned.

The first is the verdict-matrix test in `packages/drift/tests/verdict-matrix.feature.test.ts`. It walks the five reachable rows. For each, it runs the TS classifier and asserts the verdict matches. If the TS drifts from the model, this test fails the PR.

The second is an alignment meta-test in `tla-alignment.test.ts`. It checks that the TS source still cites the spec by name, and that the `DRIFT_SOURCES` enum exactly matches the model's `Source` set. If a future maintainer rewrites the verdict logic and forgets to bring the TLA+ along, this test points at the broken citation.

The third is a documented re-sync rule. If you change the TLA+ spec, you update the vendored trace AND the TS, or CI fails. There's no path where you can update one without the others.

Without these guards, the formal verification would be theatre. With them, the proof transitively applies to the production code.

## A budget honesty check

Before this section turns into formal-methods evangelism, the actual sizes:

The TLA+ spec is about 150 lines. The TypeScript verdict mirror is about 50 lines. The verdict-matrix BDD plus the alignment meta-test are about 80 lines combined. Total formal-methods overhead: maybe two days of focused work for the maintainer who originally wrote it, plus an hour or so per future change.

In return: two operationally-load-bearing invariants — the high-confidence cap and the no-silent-demotion rule — plus a CI gate that catches accidental escapes. We argue that's well within the budget any OSS classifier can afford. If the Pulumi/Terraform community wanted to adopt the same pattern for other small classifiers, the cost-benefit is favourable.

## The tricky part: CloudTrail is not "now"

A subtle thing about the verdict matrix: it has a row for `eventInTransit`. That row exists because of a specific quirk of CloudTrail.

When you call an AWS API, the actual change happens in a few hundred milliseconds. But the corresponding CloudTrail event takes longer to appear in `LookupEvents` — sometimes seconds, sometimes a few minutes, occasionally longer. So when the classifier runs `pulumi preview` and immediately asks CloudTrail "did anyone touch this resource recently?", the answer might be "no" — even if someone did, three seconds ago.

If we ignored this, the classifier would routinely report console events as `Unknown / low` simply because the event hadn't propagated yet. False negatives, all over the place.

The fix is the **probe**. Before each classify cycle, the classifier writes a tiny tagged event of its own — a sentinel — and then polls CloudTrail until that sentinel surfaces. If the sentinel surfaces, CloudTrail is current and any other recent events would also have surfaced; the classifier can trust the "no events" answer. If the sentinel doesn't surface within a 60-second timeout, the classifier knows CloudTrail is behind and degrades the verdict honestly to `Unknown / low` rather than guessing.

This is what `eventInTransit` represents: "the probe knows there's an event making its way through CloudTrail's pipes, but it's not visible yet." The classifier's response in that case is to degrade gracefully rather than guess. You can re-run a few minutes later when CloudTrail catches up.

The probe itself is wrapped in a timeout-and-abort helper rather than a raw `setTimeout`. That sounds like trivia until you trace it back to a Pulumi-specific issue: `pulumi.dynamic.Resource` triggers a closure-serialisation path that requires Node's `trace_events` module, which vitest's worker pool can't provide. So the codebase has a bright-line rule — no `setTimeout` outside one specific file — and a test that scans the source to enforce it. The probe is the one place allowed to wait.

## Seven things the code refuses to do

The drift package ships with seven small guardrails, each enforced by a dedicated test. They aren't TLA+-derived — they're operational constraints learned the hard way over the development of v1.0.

**Cache files are mode 0600 and the owner UID is checked on read.** A foreign-UID process on the same machine can't poison a future verdict by planting a fake cache file. If the file's UID doesn't match the running process, the classifier treats the file as absent and re-runs. The poison file is left in place — we don't delete other users' files — but it has no effect.

**URNs are validated before any subprocess call.** The git-log adapter is the only one that touches a subprocess (via the `simple-git` library). It uses argv-form calls, so URNs become arguments rather than parts of a shell string — but as defense in depth, every URN passes through a regex that rejects whitespace, quotes, backticks, parens, semicolons, and every other shell metacharacter. A crafted URN can't reach a shell.

**A lint scans the source for forbidden subprocess calls.** The codebase forbids `child_process.exec` and `child_process.spawn` outright. A test in CI literally greps the source and fails on a hit. (It strips comments first, so prose mentioning the forbidden APIs doesn't trip it.)

**The cache TTL is the rate limit.** Within six hours (the default TTL) of the last classify call for a given resource, repeat calls don't re-invoke the adapters. They short-circuit to the cached verdict. This means a noisy CI loop can't hammer CloudTrail or npm. The cache _is_ the rate limit; there's no separate token-bucket logic to get wrong.

**The CloudTrail filter requires the fully-qualified `hulumi:iac-role=true` tag.** Bare `iac-role=true` is rejected. The reason is subtle: an attacker who controls some unrelated IAM role might tag themselves with `iac-role=true` (no namespace) and hope the filter accepts it. The namespace check refuses that. Combined with the v1.0 SCP template that makes the namespaced tag tamper-evident at the AWS Organizations level, the only way to fake an IaC principal is to break the SCP first.

**The git-log adapter refuses to operate on a shallow clone.** A `git clone --depth=1` working tree has only one commit; `git log` would silently report "no commits in window" for any window. The adapter checks `git rev-parse --is-shallow-repository` and degrades the verdict honestly rather than producing a misleading result. CI users typically need `actions/checkout` with `fetch-depth: 0`.

**The probe times out gracefully.** If CloudTrail is having a bad day and the probe hangs, the wrapping `p-timeout` aborts after the configured window and the classifier falls through to `Unknown / low` with an explicit `probeFailedAt` timestamp in the evidence. The classify call doesn't hang the calling job.

The pattern across all seven: **degrade honestly rather than fail silently.** Every degradation produces explicit evidence in the verdict; the operator always sees the failure. The classifier never guesses to make itself look more confident than it is.

## What the cache is really for

The on-disk cache does three jobs at once. The performance one is obvious: classify is expensive, so caching the verdict avoids re-running the adapters within the TTL. The rate-limit one is the same job framed differently: the cache being a hit is what keeps the adapter call volume bounded.

The third job is the monotonicity guarantee from §3 — the cache is the only place where a verdict persists across runs, so it's the only place where "high never silently demotes" can be enforced. Every cache write goes through the monotonicity check first. A would-be demotion is dropped on the floor.

Cache files are paths derived from `sha256(stack || resource)` truncated to 32 hex characters. Predictable but not guessable without the (stack, resource) pair. Combined with the 0o600 mode and the UID check, an attacker with shell access to the operator's machine still can't poison a _specific_ verdict — they'd have to know exactly which resource you're going to classify next, with exactly the right stack URN.

## What this paper doesn't claim

A few things to be honest about.

The TLA+ proof covers the _verdict logic_, not the adapters. If the CloudTrail adapter has a bug and incorrectly reports `eventDelivered=true` when no such event exists, the verdict will be wrong, and the proof won't catch it. That's why §6 of the reference paper enumerates seven separate guardrails for the adapters — those are independent assurances on the inputs feeding the verdict.

The proof is only as good as the model. If the maintainer forgot to model some real-world behaviour — say, "CloudTrail is straight-up unavailable for an hour" — then "the model is correct" doesn't say much about reality. The proof is a strong claim about a small, well-defined system; it's not a global claim about how AWS behaves.

The classifier doesn't fix drift. It tells you what kind of drift it is and recommends a next step. The actual `pulumi up` (or the actual investigation, or the actual re-pin) is a human or pipeline decision above the classifier's pay grade. We don't believe automated remediation triggered by drift verdicts is operationally safe today; the classifier sits a layer below that.

There is also a known under-coverage. The `DriftSource` enum includes `Mixed` (per the TLA+ spec's `Source` set), but the current verdict logic doesn't emit it. The TLA+ trace's five rows don't model the case where multiple adapters report drift simultaneously — say, a console event AND a provider bump in the same window. That's tracked as a v1.1+ item; adding it would mean a sixth row, a paired re-verification, and an extension to the BDD test.

## What we'd like other Pulumi projects to take from this

The interesting question isn't "should you use Hulumi's drift classifier" — that depends on your stack. The more interesting question is "should you adopt the same pattern for _your_ small classifier?"

Our claim is yes, when:

- You have a classifier whose output drives operator behaviour (paging, blocking deploys, gating merges).
- The classifier has fewer than ten reachable verdict combinations.
- You can articulate at least one temporal property the classifier should preserve ("X never demotes silently", "Y never reaches Z confidence except via path P").

For systems matching those criteria, the cost is genuinely about two days plus an hour-per-change for life. The benefit is that the operationally-load-bearing invariants are _proven_, not asserted, and any future maintainer who breaks them gets caught by CI.

For systems that don't match — bigger state spaces, no temporal properties, no operator behaviour at stake — TLA+ is overkill. Stick with property-based testing or a thoughtful test suite. Formal methods aren't free; pick them only when the problem shape rewards the investment.

## Where to read what

- **Source code**: [`packages/drift/`](../../packages/drift/). The relevant files are `verdict.ts` (the TS mirror of the model), `classifier.ts` (the orchestration), `monotonicity.ts` (the guard), `probe.ts` (the timeout wrapper), `cache.ts` (the on-disk cache), and the four files under `adapters/`.
- **Reference paper**: [drift-detection.md](./drift-detection.md). Same content as this one, in dense citation form. Use it when you want code-line numbers and test-name pointers.
- **Operator guide**: [docs/drift-classifier-deployment.md](../drift-classifier-deployment.md). Auth, probe sentinel setup, cache layout, failure modes.
- **Cookbook**: [docs/cookbooks/drift-detection.md](../cookbooks/drift-detection.md). Copy-pasteable CI workflow.
- **Talk drafts**: [FWD CloudSec](../launch/cfp-fwd-cloudsec.md) (30 min) and [BSides](../launch/cfp-bsides.md) (20 min). Both pull their narrative spine from this paper's "asking three sources" through "high never silently demotes" sections.

## A short closing

Drift detection got a bad name because most tools couldn't tell the difference between a release and a break-in. Once you can — once you can give an operator a verdict they can act on, with confidence they can trust — the same drift signal moves from "reflexively ignored" to "reliably actionable." That's the whole point.

The TLA+ proof isn't there to be impressive. It's there because two specific properties about the verdict need to be _true_, not _probably true_, for the operator's downstream automation to work. Two properties, two days of work, a CI gate that catches drift forever. That's a trade we'd make again on the next classifier we build, and we'd encourage other projects to consider it for theirs.
