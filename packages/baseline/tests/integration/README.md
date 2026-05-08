# Integration tests — `@hulumi/baseline`

Real-AWS tests that stand up an `AccountFoundation` against the dedicated
sandbox account, assert all six sub-resources reach `ACTIVE` / `ENABLED`
within the 15-minute eventual-consistency window, then tear down. **Not
run on every PR.** Triggered weekly by
[`.github/workflows/weekly-integration.yml`](../../../../.github/workflows/weekly-integration.yml)
or manually via `gh workflow run weekly-integration.yml`.

See [docs/integration-testing.md](../../../../docs/integration-testing.md)
for the full workflow + cost contract.

## Local run

```sh
HULUMI_INTEGRATION=1 \
PULUMI_BACKEND_URL='s3://hulumi-pulumi-state-<sandbox-account-id>?region=us-east-1' \
AWS_REGION=us-east-1 \
pnpm --filter @hulumi/baseline test -- tests/integration/
```

Tests `it.skip` themselves unless `HULUMI_INTEGRATION=1` is set, so an
accidental run on the standard test path is a no-op. Teardown runs in
`afterAll`, including on failure (cost safety per the global red lines).
