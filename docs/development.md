---
title: Hulumi development guide
description: Repo layout, local dev loop, testing strategy, build pipeline, supply-chain conventions — everything you need to hack on Hulumi itself.
---

# Hulumi development guide

This doc is for people working **on** Hulumi, not with it. If you want to use Hulumi in your own project, start at [getting-started.md](./getting-started.md). If you're submitting a PR, also read [CONTRIBUTING.md](../CONTRIBUTING.md) for DCO sign-off, conventional-commit titles, and CODEOWNERS.

## Repo layout

```
.
├── packages/
│   ├── baseline/          @hulumi/baseline    — SecureBucket, AccountFoundation, mappings
│   ├── policies/          @hulumi/policies    — HulumiHardeningPack, CisV5Pack, suppressions
│   └── drift/             @hulumi/drift       — DriftClassifier, 4 adapters, probe
├── skills/
│   └── hulumi-threat-model/                   — Claude Code skill (.mjs scripts, scenarios JSON, template)
├── examples/
│   ├── secure-bucket-smoke/                   — minimal Pulumi program per component, mocked
│   ├── account-foundation-smoke/
│   └── drift-classify-smoke/
├── scripts/
│   ├── license-boundary-lint.mjs              — fails on verbatim CCM/CIS/NIST prose in src
│   ├── exact-pin-guard.mjs                    — fails on @pulumi/* lockfile drift
│   └── cooling-off-diff.mjs                   — Pulumi-bump cooling-off check
├── docs/
│   ├── components/                            — per-component reference
│   ├── cookbooks/                             — task-shaped recipes
│   ├── deployment/                            — operator guides + SCP template
│   ├── mappings/                              — framework ID → URL tables
│   ├── runbook-milestones/                    — engineering plan, M1–M5
│   ├── lessons/                               — post-milestone retrospectives
│   ├── verify/, completion/                   — post-milestone QA artifacts
│   ├── threat-model-examples/                 — sample skill outputs
│   └── launch/                                — outreach drafts
├── tests/                                     — repo-wide BDD + lint tests
├── .github/workflows/                         — ci, release, weekly-integration, pulumi-cooling-off
└── pnpm-workspace.yaml
```

The three publishable packages all live under `packages/`. The skill is intentionally separate (skill packs ship via clone, not npm). The runbooks and milestone retrospectives live in `docs/` and aren't published.

## Local dev loop

Every PR runs the same checks CI runs. To match locally:

```bash
pnpm install
pnpm -r build
pnpm -r typecheck
pnpm -r test
pnpm -r lint
pnpm run lint:license-boundary
pnpm run lint:exact-pin-guard
pnpm run format:check
```

`pnpm -r build` is **required before `pnpm -r test`** because the example smoke tests import from `@hulumi/baseline/aws`, which the package's `exports` map points at `dist/`. CI orders these correctly; if you skip `build` locally, the example tests fail with `Cannot find module`.

The most common mid-loop iteration:

```bash
# Edit a component
pnpm --filter @hulumi/baseline build && pnpm --filter @hulumi/baseline test
# Then the example that uses it
pnpm --filter @hulumi-examples/secure-bucket-smoke test
```

## Testing strategy

Hulumi runs three layers of tests, each with a different scope:

### 1. Mock-runtime BDD (per PR, fast)

Every component runs under `pulumi.runtime.setMocks()` in the package's vitest suite. No AWS, no network, no Pulumi CLI. Tests assert:

- Sub-resource set per tier (the load-bearing ≥3 / ≥4 deltas)
- Tag triple on every taggable child
- Rule violation messages match the BDD row exactly
- Verdict matrix walks the TLA+ trace cell-by-cell

If you change a component, expect to also touch `packages/<pkg>/tests/`. The Pulumi mock runtime fires `newResource` asynchronously; tests use a `settlePulumi()` helper that drains 40 setImmediate ticks before assertions. See [packages/baseline/tests/setup.ts](../packages/baseline/tests/setup.ts).

### 2. Forbidden-shortcut lints (per PR, fast)

A handful of repo-wide tests scan `packages/*/src` for things we've decided not to allow:

- `tests/no-shell-exec.test.ts` — no `child_process` import or `exec()`/`spawn()` outside a sanctioned escape hatch.
- `tests/no-sleep.test.ts` (M3) — no `setTimeout`/`sleep`/`await new Promise` outside `src/probes/` or `src/probe.ts`.
- `scripts/license-boundary-lint.mjs` — no verbatim CCM / CIS / NIST prose in source or shipped `dist/` artifacts.
- `scripts/exact-pin-guard.mjs` — `@pulumi/*` integrity hashes match the hardcoded allowlist.

These are cheap to run and catch a class of regressions automated review doesn't. When you find a new "we should never do X" rule, add it as a test rather than a wiki page.

### 3. Real-AWS integration (weekly, gated)

`.github/workflows/weekly-integration.yml` runs Sundays at 04:00 UTC,
matrix `tier ∈ {sandbox, startup-hardened}`, against a sandbox AWS
account via OIDC. Without `PULUMI_BACKEND_URL` or `PULUMI_ACCESS_TOKEN`,
the workflow runs in **contract-only mode** (mocks-only path) and proves
the OIDC role is still alive. With exactly one backend configured, it is
allowed to run real Pulumi operations. Prefer a private S3
`PULUMI_BACKEND_URL` secret over a Pulumi Cloud token for this public
repo.

Local equivalent:

```bash
# Mocks-only:
pnpm test:integration
# Real-AWS gate (requires AWS creds + one Pulumi backend):
HULUMI_INTEGRATION=1 \
PULUMI_BACKEND_URL='s3://hulumi-pulumi-state-<sandbox-account-id>?region=us-east-1' \
pnpm test:integration
```

See [integration-testing.md](./integration-testing.md) for cost contract and teardown rules.

## Build pipeline

Each package has its own `tsconfig.build.json` that excludes tests and emits `dist/` with declarations. The publishable shape (`exports` map, `peerDependencies`) is fixed per [interfaces.md](./slo/design/hulumi/interfaces.md) (upstream planning corpus); changing it is a v2.0 concern.

Notable build-shape decisions:

- **`type: "commonjs"`** for all three publishable packages. Pulumi's runtime is CJS-friendly; some Pulumi consumers still ship CJS bundlers. ESM-only deps (`p-timeout` v7) work via `esModuleInterop` + the runtime's CJS-wrapped reexports.
- **`moduleResolution: "bundler"` for `examples/*/`.** The packages' `exports` subpaths require `node16` / `nodenext` / `bundler`. Examples use `bundler` to match the root tsconfig; the published packages use `node` for stable consumer behaviour.
- **`rootDir` in `tsconfig.build.json` only.** The base `tsconfig.json` doesn't set `rootDir` so typecheck (`noEmit`) can include `tests/`; the build config sets it and excludes tests.

## Supply-chain conventions

Hulumi takes supply-chain seriously enough that it's a design constraint, not just a best practice. Three rules govern every change:

### Rule 1: `@pulumi/*` is exact-pinned with integrity hashes

`pnpm-lock.yaml` is the source of truth. `scripts/exact-pin-guard.mjs` hardcodes the expected integrity hashes for `@pulumi/pulumi`, `@pulumi/aws`, and `@pulumi/policy`. The CI step `lint:exact-pin-guard` fails on drift. Bumping a Pulumi pin requires updating the hash _and_ the cooling-off check.

### Rule 2: Pulumi bumps go through cooling-off

`scripts/cooling-off-diff.mjs` (M5) blocks any PR that bumps a `@pulumi/*` pin until 72h (minor/major) or 24h (patch) have elapsed since the upstream npm publish. This is a deliberate friction point — supply-chain attacks against Pulumi are most effective in the first 24–48h post-publish.

### Rule 3: SLSA Build L3 on every release

`.github/workflows/release.yml` uses `slsa-framework/slsa-github-generator` pinned to an exact SHA. Every published tarball ships with `"provenance": true`. Consumers can verify with `gh attestation verify` — see [verify-provenance.md](./cookbooks/verify-provenance.md).

If you're adding a new runtime dependency to any of the three publishable packages, **start a GitHub Discussion first**. CONTRIBUTING.md describes the criteria. The drift package's runtime deps (`@aws-sdk/*`, `simple-git`, `p-timeout`) went through this gate.

## License-boundary discipline (the thing newcomers stub their toes on)

Every reference to a CCM, AICM, CAIQ, CIS, or NIST control in `skills/` or `packages/` source — including comments — must be **by ID only**. Verbatim control text from these frameworks is licensed and cannot be redistributed under Apache-2.0.

The `license-boundary-lint` job runs on every PR over `skills/` + `packages/` + the shipped `dist/` tarballs. Its match list is fragment-based: it knows the distinctive opening phrases of CCM, AICM, and CIS controls and fails if it finds them. False positives go in `_fixtures/` or are added to the lint's exception list with a documented reason.

If you ever feel the urge to "just include the control text for clarity," don't. Cite the ID, link to the upstream URL, and paraphrase if you need prose. See [mappings/licensing.md](./mappings/licensing.md) for the full policy.

## Working with the Claude Code skill

The skill is a set of `.mjs` scripts under `skills/hulumi-threat-model/scripts/` plus a frontmatter-bearing `SKILL.md`. Constraints:

- **No runtime deps.** The skill installs by clone; users on any Node 20 machine should be able to run it without a build step or `tsx`. `.mjs` + JSDoc types is the canonical pattern.
- **Output schema is locked.** The frontmatter shape (`name`, `scenario`, `generated_at`, `citations[]`) and the section list (`Scenario`, `Actors`, `Assets`, `Threats (STRIDE)`, `Control Citations`, `Recommended Hulumi Components`, `Open Questions`) are asserted by `tests/schema.test.ts`. Adding a field is a versioned change.
- **Scenario JSONs are data.** Per-milestone passes flip "v0.x+" forward references to "Shipped in M<N>" once a component lands. The script and template stay untouched.

If you want to add a new scenario, add the JSON, update SKILL.md's prebuilt-scenarios table, and let the IDs-only lint enforce the licensing posture.

## Common gotchas

- **Prettier eats markdown tables that contain placeholders or glob characters.** Add the file to `.prettierignore` rather than fighting it. M1 lessons document the failure mode.
- **`new PolicyPack(...)` starts a gRPC server at module load.** One per process. Keep handlers in side-effect-free files; instantiate the pack only in the dedicated entrypoint files under `src/aws/packs/*`.
- **Pulumi mocks fire async.** Awaiting one output doesn't barrier sibling registrations. Use the `settlePulumi()` helper.
- **`pulumi.dynamic.Resource` doesn't run under vitest's worker pool** (Pulumi's closure serialization needs Node's `trace_events`). Both M3 and M4 use direct `dependsOn` instead. The escape hatch lives at `packages/baseline/src/aws/probes/poll.ts` — preserved but unused.

The lessons docs ([docs/slo/lessons/hulumi-m\*.md](./slo/lessons/)) capture the full per-milestone list. When you trip over something not yet documented, add it.

## Releasing

Releases are atomic across the three packages — `@hulumi/baseline`, `@hulumi/policies`, `@hulumi/drift` ship the same version on the same day. The release workflow:

1. Tag `v<x.y.z>` on `main`.
2. `.github/workflows/release.yml` builds, attests, and publishes via npm trusted publishing (OIDC, no `NPM_TOKEN`).
3. Post-publish, `release:verify-attestations` (in the root `package.json`) verifies the freshly-published tarballs against the canonical repo.
4. CHANGELOG.md updated under the new version heading.

If a publish goes wrong, **don't `npm unpublish`.** Cut a `<x.y.z+1>` patch instead — unpublishing breaks downstream lockfiles for everyone who installed in the failure window. See [SECURITY.md](../SECURITY.md) for the responsible-disclosure path if the publish was compromised.

## Where to ask questions

- Bugs / feature requests → GitHub issues.
- Design or roadmap questions → GitHub Discussions.
- Security disclosures → see [SECURITY.md](../SECURITY.md).
- Conventions ambiguities → check [docs/slo/lessons/](./slo/lessons/) first; many gotchas have already been documented per-milestone.
