# Pulumi State Backend Foundation Smoke

Mocks-only Pulumi example for `PulumiStateBackendFoundation`. It uses placeholder bucket and KMS alias names so it can compile and run under Vitest without AWS credentials or Pulumi state export files.

```bash
pnpm --filter @hulumi-examples/pulumi-state-backend-foundation-smoke test
pnpm --filter @hulumi-examples/pulumi-state-backend-foundation-smoke typecheck
```

For a real rollout, read [`docs/cookbooks/secure-pulumi-state-backend.md`](../../docs/cookbooks/secure-pulumi-state-backend.md) first. The optional lease table serializes CI applies only; it does not change Pulumi backend semantics.
