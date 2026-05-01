# Hulumi components — index

Per-component documentation. Each component page includes tier matrix references, cited framework IDs, and a working Pulumi TypeScript snippet for both Sandbox and Startup-Hardened tiers.

## AWS components (`@hulumi/baseline.aws`)

| Component                                 | Milestone | Doc                                                                                               |
| ----------------------------------------- | --------- | ------------------------------------------------------------------------------------------------- |
| `hulumi.baseline.aws.SecureBucket`        | v0.2 (M2) | [secure-bucket.md](./secure-bucket.md)                                                            |
| `hulumi.policies.aws.HulumiHardeningPack` | v0.2 (M2) | see [../tiers.md § HulumiHardeningPack rule matrix](../tiers.md#hulumihardeningpack--rule-matrix) |
| `hulumi.baseline.aws.AccountFoundation`   | v0.3 (M3) | [account-foundation.md](./account-foundation.md)                                                  |
| `hulumi.drift.DriftClassifier`            | v0.4 (M4) | [drift-classifier.md](./drift-classifier.md)                                                      |

## Kubernetes / EKS policy packs (`@hulumi/policies`)

Three CrossGuard PolicyPacks added in runbook `hulumi-operations-k8s-security` Milestone 3. Each pack has its own entry point because `@pulumi/policy` allows only one `PolicyPack` per process. Point your `PulumiPolicy.yaml` at one of:

| Pack                            | Module entry point                                       | Rules                                                                                                                                                                          |
| ------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `HulumiK8sHardeningPack`        | `@hulumi/policies/k8s/packs/hulumi-k8s-hardening`        | `WL-1` privileged containers · `WL-2` host namespaces · `WL-3` mutable image tags · `WL-4` resources missing (advisory) · `SVC-1` public LoadBalancer                          |
| `HulumiK8sRbacPack`             | `@hulumi/policies/k8s/packs/hulumi-k8s-rbac`             | `RBAC-1` wildcard verbs · `RBAC-2` `list` / `watch` on Secrets · `RBAC-3` cluster-admin RoleBinding / ClusterRoleBinding                                                       |
| `HulumiEksClusterPack`          | `@hulumi/policies/k8s/packs/hulumi-eks-cluster`          | `EKS-CL-1` public endpoint with broad CIDR · `EKS-CL-2` audit logging required                                                                                                 |
| `HulumiOperationsHardeningPack` | `@hulumi/policies/aws/packs/hulumi-operations-hardening` | `O-PATCH-1` Patch:Group enum · `O-AUDIT-1` CloudTrail multi-region + log-file validation · `O-AUDIT-2` CT log group KMS-encrypted · `O-INSPECTOR-1` Inspector v2 full coverage |

All rules support the existing `Suppression` API: a `{ ruleId, urnScope, reason }` entry on the `suppressions` config silences the rule for the matching URN. Suppressions without a non-empty `reason` are ignored.

## Kubernetes / EKS components (`@hulumi/k8s-baseline`)

Pre-release at `1.0.0-pre.1`. First stable lands with the v1.2 release train (atomic four-package release). Compatibility with tested Helm chart versions is documented in [`packages/k8s-baseline/COMPATIBILITY.md`](../../packages/k8s-baseline/COMPATIBILITY.md) and asserted in the `release-readiness.test.ts` BDD suite.

| Component                                          | Doc                                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------------------- |
| `hulumi.k8s.HardenedHelmRelease`                   | [hardened-helm-release.md](./hardened-helm-release.md)                       |
| `hulumi.k8s.EksSubnetTagger`                       | [eks-subnet-tagger.md](./eks-subnet-tagger.md)                               |
| `hulumi.k8s.IstioFoundation`                       | [istio-foundation.md](./istio-foundation.md)                                 |
| `hulumi.k8s.AlbMeshedHttpEntrypoint`               | [alb-meshed-http-entrypoint.md](./alb-meshed-http-entrypoint.md)             |
| `hulumi.k8s.KubernetesSecretFromAwsSecretsManager` | [kubernetes-secret-from-asm.md](./kubernetes-secret-from-asm.md)             |
| `hulumi.k8s.RdsCredentialSecret`                   | [rds-credential-secret.md](./rds-credential-secret.md)                       |
| `hulumi.k8s.GitHubAppCredential`                   | [github-app-credential.md](./github-app-credential.md)                       |
| `hulumi.k8s.NamespaceFoundation`                   | [namespace-foundation.md](./namespace-foundation.md)                         |
| `hulumi.k8s.EksRuntimeDetectionFoundation`         | [eks-runtime-detection-foundation.md](./eks-runtime-detection-foundation.md) |
| `hulumi.k8s.EksBackupFoundation`                   | [eks-backup-foundation.md](./eks-backup-foundation.md)                       |
| `hulumi.k8s.EksAddonFoundation`                    | [eks-addon-foundation.md](./eks-addon-foundation.md)                         |
| `hulumi.k8s.planUpgrade` (library)                 | [eks-upgrade-planner.md](./eks-upgrade-planner.md)                           |

The tier matrix for every baseline component lives in [../tiers.md](../tiers.md).
