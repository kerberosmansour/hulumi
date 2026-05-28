# Runner Governance Foundation Smoke

Mocks-only Pulumi example for `RunnerGovernanceFoundation`. It records protected environment, OIDC, and runner-label posture without requiring GitHub credentials.

```bash
pnpm --filter @hulumi-examples/runner-governance-foundation-smoke test
pnpm --filter @hulumi-examples/runner-governance-foundation-smoke typecheck
```

For a real rollout, read [`docs/cookbooks/runner-governance.md`](../../docs/cookbooks/runner-governance.md).
