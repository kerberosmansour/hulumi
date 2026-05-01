---
title: KubernetesSecretFromAwsSecretsManager
description: Generic foundation that extracts a JSON-shaped AWS Secrets Manager value into a K8s Secret with a key-mapping. Refuses empty mappings; redacts token shapes from error paths. Full reference at M5.
---

# `KubernetesSecretFromAwsSecretsManager`

`@hulumi/k8s-baseline.KubernetesSecretFromAwsSecretsManager` — extracts a JSON value from AWS Secrets Manager and writes a K8s `Secret` with a per-key mapping (SM-JSON-key → K8s-data-key).

- `keyMapping` is required, must be non-empty, and is bounded at 64 entries (M2 cap).
- `secretName` rejects `/` and `..`.
- SM JSON parsed with a 64-level nesting cap (deserialization-bomb defense).
- Error paths sanitize token-shaped substrings (`ghs_…`, `ghp_…`, `Bearer …`, etc.) before logging.
- **`failureMode` (M2)** — defaults to `"fail"`. On any fetch / parse / non-object / depth failure, the impl logs `pulumi.log.error` and throws inside the apply chain — Pulumi treats the rejected output as deploy-blocking. Set `failureMode: "warn-empty"` to opt back into the legacy "log + emit empty Secret" degraded path. Choose `"warn-empty"` only with a written rationale; the empty-Secret path is the failure mode this component exists to prevent.
- **`missingKeyMode` (M2)** — defaults to `"fail"`. If the SM JSON is missing a key listed in `keyMapping`, the impl logs `pulumi.log.error` and aborts the deploy. Set `missingKeyMode: "warn"` for legacy log-and-skip behavior — appropriate only when the missing key is genuinely optional (e.g., an optional API token).

For the AWS RDS-managed-master JSON shape specifically, use the `RdsCredentialSecret` convenience wrapper. Both `failureMode` and `missingKeyMode` flow through to the underlying component, so `RdsCredentialSecret` is fail-closed by default — RDS JSON missing `password` will fail the deploy with a visible error.

### Migration from v1.0

If you were relying on the legacy "log + empty Secret" behavior on failures, opt back in explicitly:

```ts
new KubernetesSecretFromAwsSecretsManager("creds", {
  // ... existing args ...
  failureMode: "warn-empty", // legacy degraded path
  missingKeyMode: "warn", // legacy missing-key warn
});
```

Full reference doc lands at M5. Source: [packages/k8s-baseline/src/kubernetes-secret-from-asm.ts](../../packages/k8s-baseline/src/kubernetes-secret-from-asm.ts).
