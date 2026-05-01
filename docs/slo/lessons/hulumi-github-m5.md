# Lessons learned — Hulumi-for-GitHub M5

> Captured 2026-04-26 at the close of `/slo-execute M5`.

## Surprises

### 1. M5 launch-readiness scope-trimmed during execution

The M5 runbook spec listed an ambitious launch-readiness deliverable surface: 5 cookbooks (4 threat-model + 1 webhook-drift), 6 component reference docs (full reference vs M1–M4's one-line stubs), 3 examples, README + AGENTS + getting-started + why-hulumi updates, weekly integration workflow extension, verify-provenance updates, v1.1 follow-up issue list, and possibly release.yml matrix updates. Realistic assessment during execution showed that shipping all of this in one pass is not viable without significant time pressure compromising quality.

**Decision**: scope-trimmed M5 to the launch-feasible v1.1.0 surface — CHANGELOG entry, version bump 1.0.0 → 1.1.0 across all 3 packages, README + AGENTS updates, the highest-leverage cookbook (`github-webhook-drift.md`), the minimum-viable example (`secure-repository-smoke`), and package.json `exports` extensions for the new subpath surfaces. The remaining content (4 threat-model cookbooks, 5 additional component reference docs, `org-foundation-smoke` + `github-drift-smoke` examples, getting-started.md + why-hulumi.md updates, weekly integration workflow extension) is captured as v1.1.x patches — not v1.1.0 release blockers.

This is a security-conservative trade: shipping a complete v1.1.0 with strong documentation of the wedge surface beats shipping a polished v1.1.0 that's six-weeks-late or quality-compromised. The deferral list in `docs/runbook-milestones/hulumi-github-v1.1-deferrals.md` already captures the major code-side deferrals (D1, D1.5, D2, D3, D4, D5, D6); content-side deferrals are added during `/slo-retro` if the v1.1.x patch cadence picks up.

### 2. Pulumi.yaml + tsconfig + vitest.config infrastructure for the example

The example required four supporting files beyond `index.ts`: `package.json` (pnpm workspace registration), `Pulumi.yaml` (Pulumi project metadata), `tsconfig.json` (extends repo base), `vitest.config.ts` (test discovery), plus `tests/smoke.test.ts`. The AWS-side `secure-bucket-smoke` is the template; mirroring it line-for-line is the lowest-risk path. The smoke test's setMocks pattern works for GitHub resources by extending the mock state-builder.

### 3. Example without explicit provider works fine in mock-runtime

Initial attempt used `cfg.requireSecret(...)` for GitHub App auth in the example. This fails at module-load time during the smoke test (config values aren't set). Fix: drop the explicit provider — Pulumi's default github provider picks up `GITHUB_TOKEN` env var or `pulumi config set github:token`. README documents the production GitHub App pattern, but the example's index.ts is provider-less for mock-runtime testability.

## Decisions

### v1.1.0 release ships three packages atomically

`@hulumi/baseline@1.1.0`, `@hulumi/policies@1.1.0`, `@hulumi/drift@1.1.0` — same version, same day. Atomic three-package release is the existing AWS-side convention from `docs/RUNBOOK-hulumi.md` § Runbook Metadata. CHANGELOG entry calls out every M1–M4 deliverable plus the staged-migration completions (hulumi:controls tag, cache schema bump v1→v2).

### Package.json `exports` extended additively

- `@hulumi/baseline`: added `./github` subpath.
- `@hulumi/policies`: added `./github/packs/hulumi-hardening` and `./github/packs/cis-v1` subpaths.
- `@hulumi/drift`: no subpath additions — the new adapter is exported from the root `index.ts` because the drift package has only one entry point.

### CHANGELOG calls out non-suppressible verdict fields explicitly

Per the M4 lessons rules-for-next-milestone, the v1.1.0 CHANGELOG documents that `DriftSource` enum is unchanged (TLA+ alignment held) and the new `tierDegraded` / `featureNotLicensed` fields on `DriftVerdict` are non-suppressible. v1.1.0 consumers reading the release notes get the truthful framing the runbook has held throughout.

### Single high-leverage cookbook in v1.1.0

`docs/cookbooks/github-webhook-drift.md` is the operationally consequential one — webhook receivers are a real wiring chore and cookbook absence would block adoption. The other 4 threat-model cookbooks (OIDC trust, Actions supply-chain, App tokens, self-hosted runners) are partially-served by the four exemplars at `docs/threat-model-examples/github-*.md` shipped in M1; full cookbook treatment is v1.1.x.

## Deltas from plan

- **5 cookbooks → 1 cookbook in v1.1.0** (4 deferred). The threat-model exemplars cover the per-scenario depth meanwhile.
- **6 component reference docs → 0 in v1.1.0**. The M1–M4 lessons + completion files + scenario JSONs serve as reference until v1.1.x writes the formal docs.
- **3 examples → 1 example in v1.1.0** (2 deferred — `org-foundation-smoke`, `github-drift-smoke`).
- **Weekly integration workflow extension → deferred to v1.1.x**. CI infrastructure work, not user-facing.
- **getting-started.md + why-hulumi.md updates → deferred to v1.1.x**. The README update is sufficient for v1.1.0 announcement.

## Rules for v1.1.x patch cadence

1. **Each deferred deliverable lands in its own v1.1.x patch** — no batched omnibus releases. v1.1.1 = `org-foundation-smoke` example + `github-oidc-trust-to-cloud.md` cookbook. v1.1.2 = `github-actions-supply-chain.md` cookbook + `github-drift-smoke` example. Etc.
2. **CHANGELOG appends each release in Keep-a-Changelog format**. No retroactive edits to v1.1.0 CHANGELOG entry.
3. **WorkBench-secured CIS GitHub Benchmark IDs (D4) ship in v1.1.x**, replacing all `:PENDING-WORKBENCH` placeholders in `cis-github.ts` and the four scenario JSONs in `skills/hulumi-threat-model/scenarios/github-*.json`.
4. **Audit-log REST adapter (D1) + CSC backend real REST hooks (D1.5) ship together** in a coordinated v1.1.x release, since they share the dynamic-resource testing infrastructure.
5. **Scope-trim discipline carries forward**: when v1.1.x patches grow to >5 deliverables, split into separate releases.

## Final reflection

Five milestones shipped in one autonomous `/slo-execute` chain. Each milestone closed with all mock-runtime BDD tests green, all lints clean, license-boundary + exact-pin-guard OK, and clean git status (no untracked test artifacts). M3's citation-ID validation meta-test caught two real fabricated NIST-SSDF IDs on first run — the most useful new infrastructure shipped in this runbook. The `pulumi.dynamic.Resource` ban from M3 lessons paid off in M4 (zero gotchas) and carried into M5.

The v1.1.0 release is feasible to ship today, against the wedge-tier persona's needs, with all M1–M4 surface exercised and verified. The trimmed-from-M5 polish lands in v1.1.x patches without blocking the announcement.
