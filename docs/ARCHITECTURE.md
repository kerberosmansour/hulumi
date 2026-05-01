# ARCHITECTURE — Hulumi (today, post-v1.2 release train)

> Reality-first orientation doc. Describes **what exists at HEAD**, not what the runbooks plan to add. Planned architecture for in-flight work lives in the per-runbook Target Architecture sections under [docs/slo/completed/](./slo/completed/) — `RUNBOOK-hulumi.md` (AWS, shipped at v1.0.0), `RUNBOOK-hulumi-github.md` (GitHub, shipped at v1.1.0), `RUNBOOK-hulumi-k8s.md` (K8s baseline, pre-release shipped at v1.0.0-pre.1), and `RUNBOOK-hulumi-operations-k8s-security.md` (combined Operations + K8s security tranche, ready for the v1.2.0 release).

## Overview

Hulumi is an Apache-2.0 TypeScript monorepo that ships hardened-by-default Pulumi components for AWS, GitHub, and Kubernetes/EKS, a CrossGuard policy pack, a local-first drift classifier, and a Claude Code skill. Four publishable npm packages share an atomic SLSA Build L3 release path: `@hulumi/baseline` (AWS + GitHub, v1.1.0), `@hulumi/policies` (v1.1.0), `@hulumi/drift` (v1.1.0), and `@hulumi/k8s-baseline` (v1.0.0-pre.1; first stable lands with the v1.2 train). The K8s package is publish-ready and CI exercises a kind/EKS integration test skeleton that skips cleanly when the cluster prerequisites are absent.

## Workspace Structure

pnpm workspace globs are `packages/*`, `skills/*`, `examples/*`, `tests/*` (defined in [`pnpm-workspace.yaml`](../pnpm-workspace.yaml)).

```
hulumi/
├── packages/                          # publishable npm packages (CommonJS, dist/-shipped)
│   ├── baseline/                      # @hulumi/baseline
│   ├── drift/                         # @hulumi/drift
│   ├── k8s-baseline/                  # @hulumi/k8s-baseline (v1.0.0-pre.1)
│   └── policies/                      # @hulumi/policies
├── skills/
│   └── hulumi-threat-model/           # /hulumi-threat-model Claude Code skill (5 AWS scenarios)
├── examples/
│   ├── secure-bucket-smoke/           # consumed in CI
│   ├── account-foundation-smoke/
│   └── drift-classify-smoke/
├── tests/
│   └── skill-bdd/                     # repo-wide BDD + lint tests (workspace package)
├── scripts/
│   ├── license-boundary-lint.mjs      # CCM/CIS/NIST verbatim-prose guard
│   ├── exact-pin-guard.mjs            # @pulumi/* integrity-hash drift guard
│   └── cooling-off-diff.mjs           # 72h/24h cooling-off CI gate helper
├── docs/                              # code-level docs (cookbooks/, components/, mappings/,
│                                      # deployment/, launch/, threat-model-examples/,
│                                      # ARCHITECTURE.md, getting-started.md, etc.)
│   └── slo/                           # /slo-* runbooks + milestone artifacts
│                                      # (current/, completed/, future/, lessons/,
│                                      # completion/, idea/, design/, critique/,
│                                      # research/, verify/, runbook-milestones/, templates/)
└── .github/workflows/
    ├── ci.yml                         # build + test + lint + license-boundary + DCO
    ├── release.yml                    # SLSA-L3 release pipeline
    ├── weekly-integration.yml         # real AWS sandbox integration
    └── pulumi-cooling-off.yml         # @pulumi/* version cooling-off gate
```

## Key Components

| Module / package                                     | Purpose                                                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `@hulumi/k8s-baseline` (`packages/k8s-baseline/src/`) | Hardened K8s/EKS/Istio Pulumi `ComponentResource`s — `HardenedHelmRelease`, `EksSubnetTagger`, `IstioFoundation`, `AlbMeshedHttpEntrypoint`, `KubernetesSecretFromAwsSecretsManager`, `RdsCredentialSecret`, `GitHubAppCredential`. v1.0.0-pre.1; first stable in the v1.2 train. |
| `@hulumi/baseline` (`packages/baseline/src/`)        | Hardened AWS Pulumi `ComponentResource`s and the framework-ID mappings module                        |
| `packages/baseline/src/aws/secure-bucket.ts`         | `SecureBucket` — S3 with public-access block, SSE-KMS, TLS-only policy, versioning                   |
| `packages/baseline/src/aws/account-foundation.ts`    | `AccountFoundation` — composes CloudTrail / Config / GuardDuty / SecurityHub / IAM / KMS by tier     |
| `packages/baseline/src/aws/{cloudtrail,config,guardduty,securityhub,iam-baseline,kms-ring}.ts` | Sub-components of `AccountFoundation`                                              |
| `packages/baseline/src/aws/tier.ts`                  | `Tier` enum (`"sandbox" \| "startup-hardened"`) + `assertValidTier`                                  |
| `packages/baseline/src/aws/probes/poll.ts`           | The `dependsOn`-via-dynamic-resource escape hatch for vitest pool gotcha                             |
| `packages/baseline/src/mappings/{ccm,cis-aws,nist-800-53-r5,atlas}.ts` | IDs-only `as const` framework citation tables                                       |
| `@hulumi/policies` (`packages/policies/src/`)        | CrossGuard PolicyPack module                                                                         |
| `packages/policies/src/aws/hulumi-hardening-pack.ts` | `HulumiHardeningPack` — H1–H4 invariants                                                             |
| `packages/policies/src/aws/cis-v5-pack.{ts,rules.ts}` | `CisV5Pack` — CIS AWS Foundations v5.0.0 sections 1–3                                               |
| `packages/policies/src/aws/suppressions.ts`          | `Suppression` API                                                                                    |
| `packages/policies/src/aws/packs/{hulumi-hardening,cis-v5}.ts` | One-PolicyPack-per-process composed entry points                                            |
| `packages/policies/src/metadata.ts`                  | `PackMetadata` shared between packs                                                                  |
| `@hulumi/drift` (`packages/drift/src/`)              | Local-first drift classifier with TLA+-mirrored verdict matrix                                       |
| `packages/drift/src/classifier.ts`                   | `DriftClassifier` orchestrating four adapters via `Promise.allSettled`                               |
| `packages/drift/src/verdict.ts`                      | Hand-mirrored 5-row matrix from `HulumiDrift.tla` (TLA+-aligned via meta-test)                       |
| `packages/drift/src/cache.ts`                        | On-disk cache, mode 0600, with monotonicity invariant                                                |
| `packages/drift/src/monotonicity.ts`                 | `CacheInvalidate` — only sanctioned demotion path                                                    |
| `packages/drift/src/probe.ts`                        | Bounded probe via `p-timeout`                                                                        |
| `packages/drift/src/adapters/{automation-api,cloudtrail,git-log,provider-version}.ts` | The four signal sources                                                            |
| `packages/drift/src/types.ts`                        | `DriftSource` enum, `DriftAdapter` interface, `DriftVerdict` shape                                   |
| `skills/hulumi-threat-model/`                        | Runtime-dep-free `.mjs` Claude Code skill; `SKILL.md` + `scenarios/*.json` + `templates/` + `scripts/` |
| `tests/skill-bdd/`                                   | Repo-wide BDD harness + license-boundary-lint enforcement                                            |
| `scripts/license-boundary-lint.mjs`                  | Fails if verbatim CCM/AICM/CAIQ/CIS/NIST control text appears in `packages/` or `skills/`            |
| `scripts/exact-pin-guard.mjs`                        | Fails if `@pulumi/*` deps drift off the integrity-hash-pinned versions                               |
| `scripts/cooling-off-diff.mjs`                       | Helper for the 72h/24h `@pulumi/*` cooling-off CI gate                                               |

## Entry Points

- **`/hulumi-threat-model <scenario-id>`** — Claude Code skill (lives at `~/.claude/skills/hulumi-threat-model/` after install). Five prebuilt AWS scenarios. Writes structured threat-model markdown into the user's working directory.
- **`pulumi up`** in a user's program that imports `@hulumi/baseline` — the components register child resources with hardened defaults.
- **`PolicyPack`** loaded via `pulumi policy publish` or evaluated locally — `HulumiHardeningPack` and `CisV5Pack` enforce invariants at preview-time.
- **`DriftClassifier.classify()`** — invoked from a user's drift-detection wrapper; uses Pulumi Automation API + CloudTrail + git log + provider version as the four signal sources.
- **`pnpm run lint:license-boundary`** — repo-side license-boundary lint, also runs in CI.
- **`pnpm run lint:exact-pin-guard`** — repo-side exact-pin guard, also runs in CI.

## Data Flow (today)

```
Engineer
  │
  └─prompts→ Claude Code
                │
                ├─reads SKILL.md→ /hulumi-threat-model skill ─writes→ docs/threat-model-<scenario>-<date>.md
                │
                └─writes Pulumi program in user repo
                        │
                        ├─imports @hulumi/baseline.aws.{SecureBucket,AccountFoundation}
                        └─imports @hulumi/policies.aws.{HulumiHardeningPack,CisV5Pack}
                                    │
                                    └─pulumi up ─assumeRole→ IaC role tagged hulumi:iac-role=true
                                                                │
                                                                └─AWS API calls→ S3, CloudTrail, GuardDuty,
                                                                                 SecurityHub, KMS, IAM, Config

Drift triage (separate path):
  user wrapper ─DriftClassifier.classify()→ four adapters in parallel
                                              ├─ Automation API (declared state)
                                              ├─ CloudTrail LookupEvents (audit signal)
                                              ├─ git log via simple-git (authorship)
                                              └─ provider version pinned vs latest
                                                  │
                                                  └─ HardenedVerdict compositor → on-disk cache (0600)
                                                                                  → DriftVerdict + DriftSource + confidence
```

No GitHub side exists at HEAD. The Hulumi-for-GitHub runbook adds `@hulumi/baseline.github.*`, `@hulumi/policies.github.*`, and a fifth drift adapter (`GithubWebhookFallbackAdapter`) — see [`docs/slo/completed/RUNBOOK-hulumi-github.md`](./slo/completed/RUNBOOK-hulumi-github.md).

## Test Architecture

Three distinct test surfaces, all Vitest 1.6.1:

| Layer        | Where                                                                          | How to run                                                                            |
| ------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Unit / BDD   | `packages/<pkg>/tests/*.test.ts`, `packages/<pkg>/tests/setup.ts`              | `pnpm -r test` (build required first — examples import from `dist/`)                  |
| Integration  | `packages/<pkg>/tests/integration/*.integration.test.ts`                       | `HULUMI_INTEGRATION=1 pnpm test:integration` (real AWS sandbox; weekly CI by default) |
| Repo-wide    | `tests/skill-bdd/*.test.ts`                                                    | included in `pnpm -r test`                                                            |

Mock-runtime BDD pattern: `pulumi.runtime.setMocks()` per package; tests use a `settlePulumi()` helper (40 `setImmediate` ticks) — see [`packages/baseline/tests/setup.ts`](../packages/baseline/tests/setup.ts).

TLA+-alignment meta-test: [`packages/drift/tests/tla-alignment.test.ts`](../packages/drift/tests/tla-alignment.test.ts) enforces lockstep between `packages/drift/src/verdict.ts` and `docs/TLAdocs/hulumi/HulumiDrift.tla`.

Forbidden-shortcut lints-as-tests:

- `packages/drift/tests/no-shell-exec.test.ts` — bans `child_process` from `packages/*/src/`.
- `packages/drift/tests/no-sleep.test.ts` — bans `setTimeout` / `sleep` outside sanctioned probe paths.
- `scripts/license-boundary-lint.mjs` (run via `pnpm run lint:license-boundary`) — bans verbatim framework-prose embedding.
- `scripts/exact-pin-guard.mjs` (run via `pnpm run lint:exact-pin-guard`) — bans `@pulumi/*` version drift off integrity-hash pins.

CI ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) runs all of the above plus the cooling-off diff, attestation dry-run, and DCO `Signed-off-by` check.

## Build Commands (quick reference)

```bash
pnpm install
pnpm -r build              # required before tests (examples import from dist/)
pnpm -r typecheck
pnpm -r test               # vitest in each package + repo-wide
pnpm -r lint               # eslint per package
pnpm run lint:license-boundary
pnpm run lint:exact-pin-guard
pnpm run format:check
HULUMI_INTEGRATION=1 pnpm test:integration   # real AWS sandbox
pnpm run release:dry                          # `act` local dry-run of attestation job
pnpm run release:verify-attestations          # gh attestation verify on packed tarballs
```

## Constraints in force at HEAD

These are documented inline so future agents can see them without traversing every file:

- Node ≥ 20.0.0, pnpm ≥ 9.0.0, packageManager pinned to `pnpm@9.12.0`.
- `@pulumi/pulumi@3.232.0`, `@pulumi/aws@7.27.0`, `@pulumi/policy@1.20.0` exact-pinned with integrity hashes; bumps go through 72h/24h cooling-off CI gate.
- Apache-2.0 throughout. No verbatim CCM / AICM / CAIQ / CIS Benchmark / NIST control text in source — `license-boundary-lint` blocks PRs.
- SLSA Build L3 on every npm release; npm trusted publishing via OIDC; no `NPM_TOKEN`.
- DCO sign-off required on every commit (CI-enforced).
- No telemetry, no hosted-service runtime dep, no shell-exec in `packages/*/src/`, no `eval`, no `setTimeout`/sleep outside sanctioned probe paths (test-enforced).
- Atomic three-package release: `@hulumi/baseline`, `@hulumi/policies`, `@hulumi/drift` ship the same version on the same day.
- Mandatory IaC tag: `hulumi:iac-role=true` on IaC execution roles at v1.0.
- `pulumi.dynamic.Resource` does NOT work under vitest's worker pool — use `dependsOn` instead. Documented gotcha; escape hatch at [`packages/baseline/src/aws/probes/poll.ts`](../packages/baseline/src/aws/probes/poll.ts).
- `pnpm -r build` MUST run before `pnpm -r test` — example tests import from `dist/` via the `exports` map.
