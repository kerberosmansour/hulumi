# Contributing to Hulumi

Thanks for your interest. Hulumi is Apache-2.0 licensed, community-maintained, and ships under strict supply-chain and license-boundary discipline. Please read this document before opening a PR.

## DCO sign-off required

All commits must carry a `Signed-off-by:` trailer per the [Developer Certificate of Origin](https://developercertificate.org/). We do not accept CLAs; DCO is the only contribution bar. Configure your git client to sign off automatically:

```bash
git commit -s -m "your message"
```

Or set `commit.gpgsign` and use `-s` in every commit. CI enforces the trailer on every PR; unsigned commits fail the DCO check.

## License-boundary discipline — IDs only

Hulumi cites framework control identifiers (CSA CCM, CSA AICM, CIS AWS Foundations Benchmark, NIST SP 800-53 Rev 5, NIST SP 800-218 / SSDF, MITRE ATLAS) **by ID only**. Verbatim control text, CAIQ question text, or Implementation Guidelines prose MUST NOT appear in `skills/` or `packages/` source. They may appear in docs only if the licensing terms permit and the doc is clearly scoped.

CI runs a `license-boundary` lint that fails on known-distinctive framework prose fragments. If you need to discuss a control's intent, paraphrase and cite the ID with a URL. See `docs/mappings/licensing.md` for the full policy.

## How to develop

```bash
pnpm install
pnpm -r test          # unit tests
pnpm -r typecheck
pnpm -r lint
pnpm run lint:license-boundary
pnpm run format:check
```

Before opening a PR, confirm `pnpm -r test && pnpm -r typecheck && pnpm -r lint` pass locally on Node 20 LTS with pnpm ≥ 9.

## Branch + PR conventions

- Branch from `main`. Keep branches topic-focused; one logical change per branch.
- PR title follows [Conventional Commits](https://www.conventionalcommits.org/): `feat(scope): …`, `fix(scope): …`, `chore(scope): …`, `docs(scope): …`, etc.
- Link the milestone your PR satisfies in the description if applicable (`Closes hulumi-m<N>` or `Part of hulumi-m<N>`).
- Every PR requires CODEOWNERS approval (see `CODEOWNERS`).

## No runtime dependency additions without discussion

Adding a runtime dependency to any publishable `@hulumi/*` package is a significant supply-chain decision. Open a GitHub Discussion first describing:

- why the dependency is needed,
- what the exact version + integrity hash will be,
- whether the dependency itself carries SLSA provenance,
- how the 72h/24h cooling-off policy applies to future bumps.

The policy is codified in `SECURITY.md`.

## Pre-submit checks

- Tests pass locally.
- No `TODO`, `FIXME`, `XXX` markers in production source.
- No `console.log` debug leftovers.
- No `eval`, `new Function`, `child_process.exec` with interpolated user input.
- `.gitignore` covers any new generated artifacts.
- `git status` clean after running tests.

## Runbook discipline (for non-trivial work)

Hulumi follows the [SunLitOrchestrate](https://github.com/kerberosmansour/SunLitOrchestrate) `/slo-*` discipline for non-trivial features: every feature lives in a `docs/slo/current/RUNBOOK-<feature>.md` with allowed files, forbidden shortcuts, BDD scenarios, abuse cases, and regression tests. The full layout convention is at [docs/slo/README.md](./docs/slo/README.md).

**Recommended workflow** for a new component / policy rule / drift adapter / threat-model scenario:

1. **Open an issue first.** The runbook discipline only pays off when scope is agreed before code is written. Tiny fixes (typos, broken links, one-line bug fixes) can skip this step.
2. **Use the `/slo-*` skills on yourself.** `/slo-ideate` → `/slo-research` → `/slo-architect` → `/slo-plan` produces a runbook the maintainers can review _before_ any code lands. This is the lowest-friction path to merging — reviewers can sign off on the plan and trust the execution.
3. **Pass the baseline** — the `Pre-submit checks` section above.
4. **Open a PR** following the [PR template](./.github/PULL_REQUEST_TEMPLATE.md). Link to the runbook + closed-milestone summary if there is one.

The runbook templates live at [docs/slo/templates/](./docs/slo/templates/). Runbooks completed against the older v3 template stay completed; new runbooks should use v4.

## What's currently most welcome

- **Real-world false-positive shakedown** of `HulumiHardeningPack` / `CisV5Pack` / `HulumiK8sHardeningPack` / `HulumiOperationsHardeningPack` against your own Pulumi programs, with PRs tightening any over-broad rules.
- **New component proposals** — open a feature-request issue with the proposed shape, then run `/slo-ideate` if accepted.
- **`/hulumi-threat-model` scenarios** anchored on named real-world incidents.
- **kind / EKS integration tests** — the runbook anticipates them and the gating skeletons exist; what's missing is real-cluster wiring in CI.
- **Documentation polish** — typos, broken links, clearer examples.

## What is out of scope

- Switching the licence from Apache-2.0 to anything else. The Apache-2.0 + IDs-only-citations stance is load-bearing — see [SECURITY.md](./SECURITY.md) and [docs/mappings/licensing.md](./docs/mappings/licensing.md).
- Adding new runtime dependencies to a publishable `@hulumi/*` package without supply-chain rationale (see "No runtime dependency additions without discussion" above).
- Extending `/hulumi-threat-model` to non-Apache-2.0-compatible framework prose. Citations only.

## Code of Conduct

Participation in this project is governed by the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating you are expected to uphold this code. Report unacceptable behavior to the project maintainers.

## New source files — copyright and SPDX header

For **new** source files you create, add this header at the top:

```ts
// Copyright 2026 Sherif Mansour and Hulumi contributors.
// SPDX-License-Identifier: Apache-2.0
```

(Adjust comment syntax for the language.) Existing files do not need to be retroactively headered — the project-level [NOTICE](./NOTICE) and [LICENSE](./LICENSE) cover the repo as a whole. The per-file header is belt-and-braces for new code, not a requirement to bulk-edit existing code.

## Trade-marks

The Apache-2.0 licence grants no rights in the project name or logo. See [TRADEMARKS.md](./TRADEMARKS.md) for what permission you do and do not need before using the name in a fork, derivative, or downstream product. The `@hulumi/*` npm scope is owned by Sherif Mansour; publishing under that scope requires written permission.

## Security

See [SECURITY.md](./SECURITY.md) for responsible-disclosure details.
