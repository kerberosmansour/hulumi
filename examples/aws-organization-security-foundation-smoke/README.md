# AWS Organization Security Foundation Smoke

Mocks-only Pulumi example for `AwsOrganizationSecurityFoundation`. It uses placeholder account IDs and role ARNs so it can compile and run under Vitest without AWS Organizations credentials.

```bash
pnpm --filter @hulumi-examples/aws-organization-security-foundation-smoke test
pnpm --filter @hulumi-examples/aws-organization-security-foundation-smoke typecheck
```

For a real organization rollout, read [`docs/cookbooks/aws-organization-guardrails.md`](../../docs/cookbooks/aws-organization-guardrails.md) first and replace every placeholder with your management, security, log archive, and target root/OU IDs.
