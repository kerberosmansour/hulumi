## Summary

<!-- 1-3 bullet points describing what changed and why. Link the runbook or issue if there is one. -->

-
-

## Runbook / Issue

<!-- e.g. docs/slo/current/RUNBOOK-FOO.md M3, or Fixes #123. Delete the section if neither applies. -->

## Test plan

<!-- Bullet checklist of how you verified this change. -->

- [ ] `pnpm -r test`
- [ ] `pnpm -r typecheck`
- [ ] `pnpm -r lint`
- [ ] `pnpm -w run lint:license-boundary`
- [ ] `pnpm -w run lint:exact-pin-guard`
- [ ]

## Checklist

- [ ] Branch is up to date with `main`
- [ ] Every commit carries a `Signed-off-by:` trailer (DCO — see [CONTRIBUTING.md](../CONTRIBUTING.md#dco-sign-off-required))
- [ ] No secrets, credentials, or `.env` files included
- [ ] No verbatim control text from CSA / CIS / NIST / MITRE frameworks (IDs-only — see [SECURITY.md](../SECURITY.md) and [docs/mappings/licensing.md](../docs/mappings/licensing.md))
- [ ] Docs updated if behavior or surface changed (README, ARCHITECTURE.md, component docs, CHANGELOG)
- [ ] If a new dependency was added to a publishable `@hulumi/*` package, the supply-chain rationale is in the PR body (see CONTRIBUTING.md)

## Notes for the reviewer

<!-- Anything you want a reviewer to look at first. Risk areas, follow-ups, deferred work. Delete if none. -->
