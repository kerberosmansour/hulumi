# examples/account-foundation-smoke

Minimal Pulumi program exercising both AccountFoundation tiers under
mocked `@pulumi/aws`. M3 end-to-end smoke test. Real-AWS deployment
goes through [`.github/workflows/weekly-integration.yml`](../../.github/workflows/weekly-integration.yml)
(OIDC + Pulumi Automation API + guaranteed teardown), not unattended
local `pulumi up`.

## Layout

- `index.ts` — Pulumi program. Instantiates `AccountFoundation` in both
  tiers (`smoke-sandbox`, `smoke-hardened`).
- `tests/smoke.test.ts` — Vitest under `pulumi.runtime.setMocks`; asserts
  the tier-appropriate sub-resource set across the 6 service helpers.
- `Pulumi.yaml` — project config.
- `package.json` — workspace dep on `@hulumi/baseline`, `@pulumi/pulumi`,
  `@pulumi/aws`.

## Running

```sh
pnpm --filter @hulumi-examples/account-foundation-smoke install
pnpm --filter @hulumi/baseline build
pnpm --filter @hulumi-examples/account-foundation-smoke test
pnpm --filter @hulumi-examples/account-foundation-smoke typecheck
```

## What's NOT covered here

- Real AWS deployment (`pulumi up` against a sandbox account) — that's
  the weekly integration workflow.
- The `pulumi.dynamic.Resource` GuardDuty readiness probe — it conflicts
  with vitest's worker pool (see [docs/lessons/hulumi-m3.md](../../docs/lessons/hulumi-m3.md));
  the deterministic `dependsOn` chain in `securityhub.ts` provides
  equivalent ordering for the real-AWS path.
