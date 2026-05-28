# EKS Cluster Foundation Smoke

Mocks-only Pulumi example for `EksClusterFoundation`. It uses placeholder subnet and IAM role ARNs, so it can compile and run under Vitest without AWS or Kubernetes credentials.

```bash
pnpm --filter @hulumi-examples/eks-cluster-foundation-smoke test
pnpm --filter @hulumi-examples/eks-cluster-foundation-smoke typecheck
```

For real clusters, read [`docs/components/eks-cluster-foundation.md`](../../docs/components/eks-cluster-foundation.md) and keep kubeconfigs, service-account tokens, and cloud credentials out of the repo.
