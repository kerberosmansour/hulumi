---
title: Roll out a secure Pulumi state backend
description: Create a Hulumi-managed S3/KMS backend, move stacks deliberately, and verify posture without exporting secrets.
---

# Roll out a secure Pulumi state backend

## When to use this recipe

Use this when a stack still uses local state, passphrase secrets, or a hand-rolled S3 backend whose KMS/versioning/recovery posture is unclear. The goal is to make Pulumi state a first-class control plane asset without copying state snapshots into the repo.

## Preconditions

- A dedicated AWS account or security account scope for state.
- A Pulumi project that can install `@hulumi/platform-patterns`, `@hulumi/policies`, `@pulumi/aws`, and `@pulumi/policy`.
- A migration window. This cookbook does not automate state migration.

## Steps

### 1. Create the backend foundation

```ts
import { PulumiStateBackendFoundation } from "@hulumi/platform-patterns";

const state = new PulumiStateBackendFoundation("state", {
  tier: "startup-hardened",
  bucketName: "example-company-pulumi-state",
  kmsAliasName: "alias/hulumi/state/prod",
  objectLock: true,
  enableLeaseTable: true,
});

export const backendUrl = state.backendUrl;
export const secretsProviderHint = state.secretsProviderHint;
export const drPosture = state.drPosture;
```

The optional lease table is only for CI apply serialization. It is not a Pulumi state lock and does not change backend behavior.

### 2. Configure policy checks

Point `PulumiPolicy.yaml` at:

```ts
export { HulumiHardeningPack } from "@hulumi/policies/aws/packs/hulumi-hardening";
```

Run preview with the pack. `HULUMI-H2` catches unsafe backend URLs and unverifiable S3 encryption posture; `STATE-1` catches missing or non-`awskms://` secrets providers.

### 3. Move one stack at a time

For each stack, record the old backend URL in the private migration ticket, then move the stack using Pulumi's documented backend migration flow. Keep state export files out of git. Treat any export as `Restricted` and delete local copies after the move is verified.

### 4. Verify without reading secrets

Allowed checks:

- `s3:GetBucketEncryption`
- `s3:GetBucketVersioning`
- `kms:DescribeKey`
- Pulumi backend URL and secrets-provider metadata

Forbidden checks:

- `s3:GetObject` on state snapshots
- committed `pulumi stack export` files
- logging or exporting secret output values

## Verify

- `backendUrl` resolves to `s3://<bucket>`.
- `secretsProviderHint` starts with `awskms://`.
- `drPosture` is not `advisory-degraded` for production.
- `pulumi preview --policy-pack ./policies` reports no `HULUMI-H2` or `STATE-1` violations.

## Troubleshooting

**`STATE-1` fires even though the backend is S3.** Backend storage and secrets protection are separate. Configure an `awskms://` Pulumi secrets provider.

**The stack needs concurrent applies.** Do not rely on Pulumi state behavior for this. Use the optional lease table in your CI wrapper to reject a second active writer for the same stack key.

**No object lock or replication is configured.** The component reports `advisory-degraded`. That may be acceptable for sandbox stacks, but production should opt into Object Lock, replication, or both.

## See also

- [PulumiStateBackendFoundation](../components/pulumi-state-backend-foundation.md)
- [Roll out the Hulumi policy pack](./policy-pack-rollout.md)
- [Adopt Hulumi inside an existing Pulumi project](./migration-mid-stack-adoption.md)
