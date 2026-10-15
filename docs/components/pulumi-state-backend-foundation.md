---
title: PulumiStateBackendFoundation
description: Hardened S3/KMS Pulumi state backend foundation with optional CI apply lease metadata and explicit DR posture outputs.
---

# PulumiStateBackendFoundation

`PulumiStateBackendFoundation` creates the AWS storage primitives for a Hulumi-managed Pulumi backend:

- S3 bucket with public access blocked, SSE-KMS, BucketOwnerEnforced ownership, versioning, and a TLS-only bucket policy.
- KMS key and caller-selected alias for the Pulumi secrets provider.
- Optional Object Lock and KMS-aware replication posture outputs.
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

## KMS replication contract

Replication is explicit because this component encrypts every state object with
SSE-KMS. Amazon S3 does not replicate KMS-encrypted objects unless the rule
opts them in and names a destination KMS key.

```ts
const backend = new PulumiStateBackendFoundation("state", {
  tier: "startup-hardened",
  bucketName: "example-company-pulumi-state",
  kmsAliasName: "alias/hulumi/state/prod",
  replication: {
    destinationBucketArn: "arn:aws:s3:::example-company-pulumi-state-replica",
    roleArn: "arn:aws:iam::123456789012:role/pulumi-state-replication",
    destinationKmsKeyArn:
      "arn:aws:kms:eu-west-1:210987654321:key/11111111-2222-3333-4444-555555555555",
  },
});
```

`destinationKmsKeyArn` is required at runtime whenever `replication` is
present. Hulumi emits both
`sourceSelectionCriteria.sseKmsEncryptedObjects.status = Enabled` and
`destination.encryptionConfiguration.replicaKmsKeyId`; omission or an empty
literal fails before resource registration. The property remains optional in
the v3 TypeScript declaration so existing consumers receive this explicit
migration error. A future major can make it statically required.

The destination bucket, destination KMS key, and replication IAM role are
external prerequisites. The destination bucket must have versioning enabled,
the key must be a usable symmetric customer managed key in the destination
bucket's Region, and the replication role and key policies must allow source
decrypt and destination encrypt. AWS does not validate key usability when it
accepts `PutBucketReplication`, so qualify recovery with metadata and a
non-sensitive canary object before relying on the posture in production.

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

For replication, also inspect the rule's SSE-KMS source-selection status,
destination key ARN, destination versioning, and replication metrics. Do not
use an actual Pulumi state object as the replication canary.
