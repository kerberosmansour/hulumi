---
title: Frequently Asked Questions
description: Recurring gotchas, design-decision rationale, and "is this for me" answers — distilled from the runbook lessons-learned files.
---

# Frequently Asked Questions

This FAQ consolidates recurring questions and gotchas surfaced across the v1.x runbooks' lessons-learned files (`docs/slo/lessons/*.md`). When the answer points at "see lessons file X", that's where the original incident or design discussion lives.

## Adoption questions

### Should I use Hulumi if my stack is already on Terraform?

Yes — Hulumi is Pulumi-native, and the canonical adoption path runs through `pulumi import` against your existing Terraform state. See [the Terraform-to-Pulumi+Hulumi migration cookbook](./cookbooks/migration-from-terraform.md). You don't need to rewrite your whole stack to start; the `SecureBucket` and `AccountFoundation` components compose alongside hand-rolled resources.

### Should I adopt Hulumi mid-stack, or wait for a greenfield project?

Mid-stack adoption is a first-class path. See [the mid-stack adoption cookbook](./cookbooks/migration-mid-stack-adoption.md) for the `aliases` + `dependsOn` patterns that let Hulumi components co-exist with existing Pulumi resources without forcing a destroy/recreate cycle.

### Why "IDs only" for framework citations? Can't you embed the control text?

CSA's CCM/AICM/CAIQ and CIS's Benchmarks all forbid embedding control prose without a commercial license. Hulumi keeps every framework citation **by ID + URL** so the whole stack stays Apache-2.0 across components, policies, and skill outputs. See [docs/mappings/licensing.md](./mappings/licensing.md). The repo enforces this with `pnpm run lint:license-boundary` on every PR.

## Common gotchas

### `pulumi.dynamic.Resource` doesn't work under vitest's worker pool

Documented gotcha: dynamic resources serialize through a worker boundary that vitest's pool model can't satisfy. Use `dependsOn` to express ordering instead. The previous `probes/poll.ts` escape hatch was removed in runbook `hulumi-pre-public-launch` M4 (issue #28) — it had zero callers; the documented workaround is the `dependsOn` pattern. See `docs/ARCHITECTURE.md` for the full narrative.

### `pnpm -r build` MUST run before `pnpm -r test`

The example tests under `examples/` import from `dist/` via the `exports` map. Without a fresh build, those imports resolve against stale or missing artifacts. CI runs both in order; if you run tests locally and see "Cannot find module" against a `dist/` path, run `pnpm -r build` first.

### `BucketV2` deprecation warnings during `pulumi preview`

`@pulumi/aws@7.x` deprecates the `V2` family (`s3.BucketV2`, `s3.BucketServerSideEncryptionConfigurationV2`, etc.) in favor of the non-V2 names. Hulumi v1.x still uses the V2 forms for stable URN compatibility — switching mid-major would force a destroy/recreate on every existing bucket. The migration is planned for v2.0; see [v2-migration.md](./v2-migration.md) for the design contract.

### `@pulumi/*` exact pins block a `pnpm update`

By design. Every `@pulumi/*` dep is exact-pinned with an integrity hash; the `scripts/exact-pin-guard.mjs` CI step refuses lockfile drift. Bumps go through the 72h/24h cooling-off gate ([SECURITY.md § Pulumi cooling-off policy](../SECURITY.md)). If a `pnpm update` fails CI, that's the guard working — open a deliberate PR with the new version + integrity hash + cooling-off justification.

### My PR fails the DCO check

Every commit needs a `Signed-off-by:` trailer per the [Developer Certificate of Origin](https://developercertificate.org/). Configure git to add it automatically:

```sh
git config --global user.email "you@example.com"
git config --global user.name "Your Name"
git commit -s -m "your message"
```

Hulumi's DCO check is a custom `^Signed-off-by:` grep in CI (not the probot/dco app). If you have a partial branch with unsigned commits, the cleanest fix is a fresh PR off main with sign-offs from the start — see the [`feedback_history-rewrite-vs-fresh-pr.md` rationale](./slo/lessons/hulumi-pre-public-launch-m1.md) noted across the runbook lessons.

### My PR fails `lint:license-boundary`

The license-boundary lint blocks verbatim CCM / AICM / CAIQ / CIS Benchmark / NIST control text in `packages/` and `skills/`. Paraphrase the control's intent; cite the ID with the upstream URL. See [docs/mappings/licensing.md](./mappings/licensing.md) for examples of acceptable shapes.

### I bumped `@pulumi/aws` and CI's cooling-off gate fails

The cooling-off gate refuses major/minor bumps published less than 72 hours ago and patch bumps less than 24 hours ago. Wait for the threshold or pin to a slightly older release. The gate's rationale: maintain a buffer between upstream publish and Hulumi consumption so a compromised release has a window to be detected. Self-applies to maintainers — there's no "skip cooling-off" override.

### Tests fail with "ConsoleBreakGlass / high" verdict but I didn't touch the console

The drift classifier reads CloudTrail. If your IaC role's tag has drifted off the resource (e.g. someone tagged a sub-resource manually post-deploy), the classifier will flag the mutation as console-driven. Check `aws s3api get-bucket-tagging` against the affected bucket; the IaC role's `hulumi:iac-role=true` tag must be present on every resource it owns.

## Repo-mechanical gotchas

### Why are there two "M4" milestones?

Two runbooks landed work labelled M4: `hulumi-k8s-security` M4 (added `@aws-sdk/client-secrets-manager` to the pin-guard) and `hulumi-pre-public-launch` M4 (added drift's runtime deps). Both touch `scripts/exact-pin-guard.mjs`. The lessons file `docs/slo/lessons/hulumi-pre-public-launch-m4.md` documents the disambiguation.

### `package-lock.json` keeps reappearing

It shouldn't, post-runbook-`hulumi-pre-public-launch` M1. The `.gitignore` blocks `package-lock.json` and `yarn.lock`; pnpm is the canonical package manager (`packageManager: pnpm@9.12.0`). If `package-lock.json` returns, you ran `npm install` somewhere — switch to `pnpm install` and delete the file.

### My new test wrote to `.tmp/` and `git status` is dirty

Every test that writes to disk must clean up on success and failure. Use `tempdir()` / `tempfile::TempDir` / vitest's `afterEach` hooks. The `.gitignore` already covers `packages/baseline/tests/integration/.tmp/`; if you write to a different path, add it to `.gitignore` AND clean up in the test.

### The atomic four-package release contract

`@hulumi/baseline`, `@hulumi/policies`, `@hulumi/drift`, `@hulumi/k8s-baseline` ship the SAME version on the SAME day. The release pipeline (`release.yml`) packs all four, generates SBOMs, attests provenance, and publishes in lockstep — any preflight failure aborts before any `npm publish`. `release-readiness.test.ts` enforces the version-equality invariant.

### `.claude/` showed up in my working tree

That's coding-agent harness state. It's now in `.gitignore` (added in runbook `hulumi-pre-public-launch` M1). If you see uncommitted `.claude/` content, your tooling hasn't picked up the gitignore — restart the agent or check `git ls-files .claude/` to confirm nothing's tracked.

## Pre-launch / publication

### How do I report a security vulnerability?

Use the [GitHub Security Advisory flow](https://github.com/kerberosmansour/hulumi/security/advisories/new). It creates a private fork of the repo where the report can be assessed and a fix coordinated before public disclosure. If GHSA is unavailable for some reason, contact the maintainer through their public GitHub profile. **Do not open a public issue for vulnerabilities.** See [SECURITY.md](../SECURITY.md) for the full policy, response targets, and scope.

This project intentionally does not publish a `security@` email address. Reports go through GHSA only.

### Why is `@hulumi/k8s-baseline` at 1.2.0 instead of 1.0.0?

Atomic four-package release. The K8s package was originally planned to ship as 1.0.0 in the v1.2 train; runbook `hulumi-pre-public-launch` M1 reconciled it to 1.2.0 to match the other three packages' atomic-release invariant. CHANGELOG entry under [1.2.0] documents the version skip.

### Are the integration tests actually running?

The `*.integration.test.ts` files under `packages/{baseline,drift}/tests/integration/` are gated on `HULUMI_INTEGRATION=1`. By default `pnpm -r test` skips them. Currently 7 of the integration test slots are `it.todo()` — see [integration-testing-roadmap.md](./integration-testing-roadmap.md) for the contract that the follow-up runbook (`hulumi-integration-real-aws`) must satisfy.

## Where do I report a problem?

- **Security vulnerability** — [GitHub Security Advisory](https://github.com/kerberosmansour/hulumi/security/advisories/new). See [SECURITY.md](../SECURITY.md) for the full policy.
- **Bug / unexpected behavior** — [open an issue](https://github.com/kerberosmansour/hulumi/issues/new?template=bug_report.yml).
- **Feature request** — [feature_request issue template](https://github.com/kerberosmansour/hulumi/issues/new?template=feature_request.yml).
- **Open-ended question / "is this the right shape"** — [GitHub Discussions](https://github.com/kerberosmansour/hulumi/discussions).
- **Trademark / branding question** — see [TRADEMARKS.md](../TRADEMARKS.md).
