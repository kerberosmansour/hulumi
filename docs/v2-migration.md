---
title: SecureBucket S3 V2 to non-V2 migration
description: Migration guide for Hulumi SecureBucket moving from deprecated Pulumi AWS S3 V2 resource classes to current non-V2 classes with aliases.
---

# SecureBucket S3 V2 to non-V2 migration

> **Status**: current SecureBucket migration guide. Issue [#139](https://github.com/kerberosmansour/hulumi/issues/139) moves the component to the non-V2 Pulumi AWS S3 classes while preserving V2-state compatibility through built-in aliases.

## Motivation

`@pulumi/aws@7.x` deprecates the S3 `*V2` resource classes in favor of the non-V2 names. Current SecureBucket deployments should emit the non-V2 Pulumi resource types so preview output stays clean and future provider changes are easier to reason about.

The hard part is Pulumi state compatibility: resource URNs include the type token. A bucket child moving from `aws:s3/bucketV2:BucketV2` to `aws:s3/bucket:Bucket` needs an alias or Pulumi may plan a delete/create instead of adopting the existing child.

## Affected SecureBucket surface

| Previous Pulumi AWS class                          | Current Pulumi AWS class                         |
| -------------------------------------------------- | ------------------------------------------------ |
| `aws.s3.BucketV2`                                  | `aws.s3.Bucket`                                  |
| `aws.s3.BucketServerSideEncryptionConfigurationV2` | `aws.s3.BucketServerSideEncryptionConfiguration` |
| `aws.s3.BucketVersioningV2`                        | `aws.s3.BucketVersioning`                        |
| `aws.s3.BucketObjectLockConfigurationV2`           | `aws.s3.BucketObjectLockConfiguration`           |
| `aws.s3.BucketLoggingV2`                           | `aws.s3.BucketLogging`                           |
| `aws.s3.BucketLifecycleConfigurationV2`            | `aws.s3.BucketLifecycleConfiguration`            |

There is no intended AWS-behavior change in this migration. It is a Pulumi provider type-surface cleanup plus a state-aliasing exercise.

## What Hulumi does for normal SecureBucket consumers

SecureBucket now constructs the non-V2 child resources and attaches aliases for the previous V2 child type tokens. For the ordinary case:

```ts
const logs = new SecureBucket("audit-logs", {
  tier: "startup-hardened",
  bucketName: "my-org-audit-logs",
  logBucketArn: "arn:aws:s3:::org-audit-logs",
});
```

You do not need to add a user-side alias block just because SecureBucket changed its internal S3 class names. The component carries the old child type aliases itself.

## Existing-stack checklist

1. Upgrade the Hulumi packages in a clean branch.
2. Run `pnpm -r build` if local examples or tests import from `dist/`.
3. Run `pulumi preview` for each stack that already has SecureBucket resources.
4. Confirm the SecureBucket S3 children show as adopted/updated, not deleted and recreated.
5. If preview shows a replacement for a bucket child, stop. Do not run `pulumi up`; inspect the URN, parent, resource name, and alias path first.
6. Once preview is clean, run `pulumi up`.

Expected preview shape: metadata updates or no-op for existing children. Unexpected shape: `-` destroy or `+-` replacement for a stateful bucket child.

## TypeScript API change

`SecureBucketOutputs.bucket` and `SecureBucket.bucket` are now typed as `aws.s3.Bucket` instead of `aws.s3.BucketV2`.

The practical outputs remain the same for normal callers:

- `bucket.id`
- `bucket.arn`
- `bucket.bucketDomainName`
- the component-level `arn` and `bucketDomainName` outputs

If application code explicitly imports `BucketV2` types or annotates `SecureBucket.bucket` as `aws.s3.BucketV2`, change those annotations to `aws.s3.Bucket`.

## Policy and drift compatibility

During the migration window, Hulumi policies and drift helpers accept both token families:

- Current bucket token: `aws:s3/bucket:Bucket`
- Legacy bucket token: `aws:s3/bucketV2:BucketV2`

This preserves H1/H4 policy behavior for stacks that still contain old V2 state while letting new SecureBucket deployments register the current non-V2 resources.

## Mid-stack adoption is different

The built-in aliases cover SecureBucket's own V2-to-non-V2 child type migration. They do not automatically adopt an unrelated hand-rolled resource from outside the component. If you are replacing an existing raw bucket with `SecureBucket`, use the mid-stack adoption cookbook and add aliases for the old hand-rolled URNs:

- [Adopt Hulumi inside an existing Pulumi project](./cookbooks/migration-mid-stack-adoption.md)

In short: package upgrades for existing SecureBucket stacks should be covered by the built-in child aliases. Refactoring a raw bucket into a SecureBucket component still needs project-specific aliases because the parent path changes.

## Rollback

Before `pulumi up`, rollback is just reverting the package/source change and rerunning `pulumi preview`.

After `pulumi up`, the state has been rewritten to the non-V2 child tokens. Rolling back to an older Hulumi release may require aliases in the opposite direction or Pulumi state surgery. Treat that as a change-management event, not a routine revert.
