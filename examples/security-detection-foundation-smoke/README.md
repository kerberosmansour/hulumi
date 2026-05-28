# Security Detection Foundation Smoke

Mocks-only Pulumi example for `SecurityDetectionFoundation`. It uses placeholder SNS ARNs and a placeholder CloudTrail log group, so it can compile and run under Vitest without AWS credentials.

```bash
pnpm --filter @hulumi-examples/security-detection-foundation-smoke test
pnpm --filter @hulumi-examples/security-detection-foundation-smoke typecheck
```

For rollout guidance, read [`docs/cookbooks/security-detection-foundation.md`](../../docs/cookbooks/security-detection-foundation.md).
