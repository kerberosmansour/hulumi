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

Adding a runtime dependency to any of `@hulumi/baseline`, `@hulumi/policies`, `@hulumi/drift` is a significant supply-chain decision. Open a GitHub Discussion first describing:

- why the dependency is needed,
- what the exact version + integrity hash will be,
- whether the dependency itself carries SLSA provenance,
- how the 72h/24h cooling-off policy applies to future bumps.

The policy is codified in `SECURITY.md` once M5 lands.

## Pre-submit checks

- Tests pass locally.
- No `TODO`, `FIXME`, `XXX` markers in production source.
- No `console.log` debug leftovers.
- No `eval`, `new Function`, `child_process.exec` with interpolated user input.
- `.gitignore` covers any new generated artifacts.
- `git status` clean after running tests.

## Code of Conduct

Participation in this project is governed by the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating you are expected to uphold this code. Report unacceptable behavior to the project maintainers.

## Security

See [SECURITY.md](./SECURITY.md) for responsible-disclosure details.
