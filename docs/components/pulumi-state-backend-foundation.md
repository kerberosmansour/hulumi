---
title: PulumiStateBackendFoundation
description: Hardened S3/KMS Pulumi state backend foundation with optional CI apply lease metadata and explicit DR posture outputs.
---

# PulumiStateBackendFoundation

`PulumiStateBackendFoundation` creates the AWS storage primitives for a Hulumi-managed Pulumi backend:

- S3 bucket with public access blocked, SSE-KMS, BucketOwnerEnforced ownership, versioning, and a TLS-only bucket policy.
- KMS key and caller-selected alias for the Pulumi secrets provider.
- Optional Object Lock and replication posture outputs.
- Optional DynamoDB lease table for CI apply serialization metadata.

The lease table does not change Pulumi backend semantics. It is a coordination aid for CI pipelines that want one active writer per stack key.

## Startup-Hardened Example

```ts
import { PulumiStateBackendFoundation } from "@hulumi/platform-patterns";

const backend = new PulumiStateBackendFoundation("state", {
  tier: "startup-hardened",
  bucketName: "example-company-pulumi-state",
  kmsAliasName: "alias/hulumi/state/prod",
  enableLeaseTable: true,
  objectLock: { mode: "governance", days: 30 },
});

export const backendUrl = backend.backendUrl;
export const secretsProviderHint = backend.secretsProviderHint;
export const drPosture = backend.drPosture;
```

Use `backendUrl` as the backend URL (`s3://...`) and configure Pulumi secrets with the emitted `awskms://...` hint. Do not export stack secret values.

## Outputs

| Output                | Meaning                                                                              |
| --------------------- | ------------------------------------------------------------------------------------ |
| `backendUrl`          | `s3://<bucket>` URL for Pulumi backend configuration.                                |
| `secretsProviderHint` | `awskms://<alias>` hint for Pulumi secrets-provider configuration.                   |
| `drPosture`           | `advisory-degraded`, `object-lock`, `replication`, or `object-lock-and-replication`. |
| `caveats`             | Human-readable posture notes, including the CI-lease limitation.                     |
| `leaseTableName`      | DynamoDB table name when `enableLeaseTable` is true.                                 |

## Policy Pairing

Pair the component with `@hulumi/policies/aws/packs/hulumi-hardening`.

| Rule        | Purpose                                                                       |
| ----------- | ----------------------------------------------------------------------------- |
| `HULUMI-H2` | Blocks `file://` state backends and flags S3 backend encryption posture gaps. |
| `STATE-1`   | Requires an approved `awskms://` Pulumi secrets provider.                     |

## Control IDs

IDs only: `CCM:CEK-04`, `NIST-800-53-r5:SC-28`.

## Safe Inspection

Runtime checks should inspect bucket encryption, versioning, KMS key metadata, backend URL, and Pulumi secrets-provider metadata. They must not read or commit `pulumi stack export` files or S3 state objects.
