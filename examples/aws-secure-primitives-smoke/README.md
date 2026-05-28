# AWS Secure Primitives Smoke

Mocks-only Pulumi example for `SecureIamDeploymentRole`, `SecureSecret`, and `SecureLaunchTemplate`. It uses placeholder ARNs and does not deploy to real AWS.

```bash
pnpm --filter @hulumi-examples/aws-secure-primitives-smoke test
pnpm --filter @hulumi-examples/aws-secure-primitives-smoke typecheck
```

For rollout guidance, read [`docs/cookbooks/aws-secure-primitives.md`](../../docs/cookbooks/aws-secure-primitives.md).
