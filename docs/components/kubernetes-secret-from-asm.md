---
title: KubernetesSecretFromAwsSecretsManager
description: Generic foundation that extracts a JSON-shaped AWS Secrets Manager value into a K8s Secret with a key-mapping. Refuses empty mappings; redacts token shapes from error paths. Full reference at M5.
---

# `KubernetesSecretFromAwsSecretsManager`

`@hulumi/k8s-baseline.KubernetesSecretFromAwsSecretsManager` — extracts a JSON value from AWS Secrets Manager and writes a K8s `Secret` with a per-key mapping (SM-JSON-key → K8s-data-key).

- `keyMapping` is required and must be non-empty.
- `secretName` rejects `/` and `..`.
- SM JSON parsed with a 64-level nesting cap (deserialization-bomb defense).
- Error paths sanitize token-shaped substrings (`ghs_…`, `ghp_…`, `Bearer …`, etc.) before logging.
- Missing source keys emit `pulumi.log.warn` and produce a Secret without the missing data keys (consumer apps fail loud at startup — preferable to silent placeholder values).

For the AWS RDS-managed-master JSON shape specifically, use the `RdsCredentialSecret` convenience wrapper.

Full reference doc lands at M5. Source: [packages/k8s-baseline/src/kubernetes-secret-from-asm.ts](../../packages/k8s-baseline/src/kubernetes-secret-from-asm.ts).
