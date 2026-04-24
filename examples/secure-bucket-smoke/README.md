# examples/secure-bucket-smoke

Minimal Pulumi program exercising both SecureBucket tiers under mocked
`@pulumi/aws`. Not intended for real AWS deployment — this is the M2
end-to-end smoke test. See [../../docs/tiers.md](../../docs/tiers.md) for
the per-tier control matrix.

## Layout

- `index.ts` — Pulumi program. Instantiates `SecureBucket` in both tiers.
- `tests/smoke.test.ts` — Vitest under `pulumi.runtime.setMocks`; asserts
  the tier-appropriate sub-resource set and tag schema.
- `Pulumi.yaml` — project config.
- `package.json` — workspace dep on `@hulumi/baseline`, `@pulumi/pulumi`,
  `@pulumi/aws`.

## Running

```sh
pnpm --filter @hulumi-examples/secure-bucket-smoke install
pnpm --filter @hulumi-examples/secure-bucket-smoke test
pnpm --filter @hulumi-examples/secure-bucket-smoke typecheck
```

## Not covered here

- Real AWS deployment (`pulumi up` against a sandbox) — that's a weekly
  integration job shipping in M3.
- SLSA-provenance verification on `@pulumi/aws` — M5.
