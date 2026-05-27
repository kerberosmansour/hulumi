# Provider Casing Contract

This document defines canonical casing at each provider boundary in Hulumi.

| Boundary                          | Canonical shape                                           | Rule                                                                 |
| --------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------- |
| Pulumi TypeScript AWS args        | `camelCase`                                               | Never pass `snake_case` keys to Pulumi resource constructors.        |
| AWS IAM policy JSON               | AWS-native (`Version`, `Statement`, `Action`, `Resource`) | Preserve AWS IAM document casing; do not camelCase IAM JSON.         |
| Kubernetes manifests              | Kubernetes-native (`apiVersion`, `kind`, object schema)   | Keep Kubernetes object keys provider-native; avoid ad hoc remapping. |
| Cloudflare raw API payloads       | Provider-native payload shape                             | Use explicit adapters when converting to/from Pulumi inputs.         |
| Pulumi Cloudflare TypeScript args | `camelCase`                                               | Keep Pulumi wrapper inputs in TypeScript camelCase only.             |

## Enforceable invariants

- No raw `snake_case` keys in Pulumi TypeScript resource inputs.
- IAM policy JSON is produced through typed builders with AWS-native casing.
- Tests must assert serialization contracts where boundary conversions exist.

## Migration note

SecureBucket uses the current non-V2 split-resource S3 architecture (`Bucket`, `BucketPublicAccessBlock`, `BucketOwnershipControls`, `BucketVersioning`, `BucketServerSideEncryptionConfiguration`) and maintains aliases for legacy V2 resource tokens to support state-safe migrations.
