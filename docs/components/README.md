# Hulumi components — index

Per-component documentation. Each component page includes tier matrix references, cited framework IDs, and a working Pulumi TypeScript snippet for both Sandbox and Startup-Hardened tiers.

## AWS components (`@hulumi/baseline.aws`)

| Component                                 | Milestone | Doc                                                                                               |
| ----------------------------------------- | --------- | ------------------------------------------------------------------------------------------------- |
| `hulumi.baseline.aws.SecureBucket`        | v0.2 (M2) | [secure-bucket.md](./secure-bucket.md)                                                            |
| `hulumi.policies.aws.HulumiHardeningPack` | v0.2 (M2) | see [../tiers.md § HulumiHardeningPack rule matrix](../tiers.md#hulumihardeningpack--rule-matrix) |
| `hulumi.baseline.aws.AccountFoundation`   | v0.3 (M3) | [account-foundation.md](./account-foundation.md)                                                  |
| `hulumi.drift.DriftClassifier`            | v0.4 (M4) | [drift-classifier.md](./drift-classifier.md)                                                      |

## Kubernetes / EKS components (`@hulumi/k8s-baseline`)

Pre-release at `1.0.0-pre.1`. First stable lands with the v1.2 release train (atomic four-package release). Compatibility with tested Helm chart versions is documented in [`packages/k8s-baseline/COMPATIBILITY.md`](../../packages/k8s-baseline/COMPATIBILITY.md) and asserted in the `release-readiness.test.ts` BDD suite.

| Component                                          | Doc                                                              |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| `hulumi.k8s.HardenedHelmRelease`                   | [hardened-helm-release.md](./hardened-helm-release.md)           |
| `hulumi.k8s.EksSubnetTagger`                       | [eks-subnet-tagger.md](./eks-subnet-tagger.md)                   |
| `hulumi.k8s.IstioFoundation`                       | [istio-foundation.md](./istio-foundation.md)                     |
| `hulumi.k8s.AlbMeshedHttpEntrypoint`               | [alb-meshed-http-entrypoint.md](./alb-meshed-http-entrypoint.md) |
| `hulumi.k8s.KubernetesSecretFromAwsSecretsManager` | [kubernetes-secret-from-asm.md](./kubernetes-secret-from-asm.md) |
| `hulumi.k8s.RdsCredentialSecret`                   | [rds-credential-secret.md](./rds-credential-secret.md)           |
| `hulumi.k8s.GitHubAppCredential`                   | [github-app-credential.md](./github-app-credential.md)           |

The tier matrix for every baseline component lives in [../tiers.md](../tiers.md).
