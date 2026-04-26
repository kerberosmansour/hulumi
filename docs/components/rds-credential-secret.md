---
title: RdsCredentialSecret
description: Convenience wrapper on KubernetesSecretFromAwsSecretsManager shaped for the AWS RDS / Aurora / DocumentDB / Neptune auto-managed-master credential JSON (6-key default mapping). Full reference at M5.
---

# `RdsCredentialSecret`

`@hulumi/k8s-baseline.RdsCredentialSecret` — thin convenience wrapper on `KubernetesSecretFromAwsSecretsManager` for the AWS RDS auto-managed master credential (when `manage_master_user_password=true` is set, which is the AWS-recommended posture).

Default key mapping (load-bearing — renaming any breaks consumer apps):

| SM JSON key             | K8s Secret data key     |
| ----------------------- | ----------------------- |
| `username`              | `username`              |
| `password`              | `password`              |
| `host`                  | `host`                  |
| `port`                  | `port`                  |
| `engine`                | `engine`                |
| `dbClusterIdentifier`   | `dbClusterIdentifier`   |

Override via the optional `keyMapping` arg (e.g., `{ password: "DB_PASSWORD" }`). Override is _additive_ — supplied keys override defaults; unsupplied defaults remain.

Same trust-boundary discipline as the foundation: SM secret value transits Pulumi state in encrypted form; the K8s Secret lives at rest in etcd (consumer's responsibility to enable etcd encryption).

Full reference doc lands at M5. Source: [packages/k8s-baseline/src/kubernetes-secret-from-asm.ts](../../packages/k8s-baseline/src/kubernetes-secret-from-asm.ts).
