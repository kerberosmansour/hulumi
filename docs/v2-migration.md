---
title: v2.0 migration plan — BucketV2 → non-V2 surface
description: Design doc for the v2.0 migration from `@pulumi/aws` `*V2` resource names to their non-V2 successors. Not a v2 release commitment.
---

# v2.0 migration plan — `BucketV2` → non-V2 surface

> **Status**: design doc. Hulumi v1.x continues to ship the V2-shaped surface; this doc is the contract for whenever v2.0 lands. It is **not** a release commit, and there is no v2 timeline yet.

## Motivation

`@pulumi/aws@7.x` deprecates the `V2` family of S3 resources in favor of the non-V2 names. Running `pulumi preview` against any v1.x Hulumi stack today emits warnings:

```
warning: [runtime] BucketV2 is deprecated: s3.BucketV2 has been deprecated in favor of s3.Bucket
warning: [runtime] BucketServerSideEncryptionConfigurationV2 is deprecated: …
warning: [runtime] BucketVersioningV2 is deprecated: …
warning: [runtime] BucketObjectLockConfigurationV2 is deprecated: …
warning: [runtime] BucketLoggingV2 is deprecated: …
```

The warnings are visible in every `examples/account-foundation-smoke` test run and in any user's `pulumi preview` output. Switching mid-major would force a destroy/recreate on every existing bucket — every consumer's prod state. The migration belongs to v2.0.

## Affected resource surface

The following `aws.s3.*V2` types are used by `@hulumi/baseline.aws.SecureBucket` and `AccountFoundation`'s sub-components:

| v1.x resource type                                 | v2.0 target type                                 |
| -------------------------------------------------- | ------------------------------------------------ |
| `aws.s3.BucketV2`                                  | `aws.s3.Bucket`                                  |
| `aws.s3.BucketServerSideEncryptionConfigurationV2` | `aws.s3.BucketServerSideEncryptionConfiguration` |
| `aws.s3.BucketVersioningV2`                        | `aws.s3.BucketVersioning`                        |
| `aws.s3.BucketObjectLockConfigurationV2`           | `aws.s3.BucketObjectLockConfiguration`           |
| `aws.s3.BucketLoggingV2`                           | `aws.s3.BucketLogging`                           |

There is no behavioral difference in the AWS API surface — the V2/non-V2 distinction is a Pulumi-side type-system change that happens to require URN regeneration.

## URN compatibility — why this is a v2

Pulumi resources are identified by URN, and the URN encodes the resource type. When `BucketV2` becomes `Bucket`, the URN changes. Pulumi treats the rename as a destroy + recreate unless the user explicitly aliases the old URN.

For Hulumi v1.x consumers:

- Without an alias: `pulumi up` after the v2.0 bump would delete every existing bucket and create new ones. Catastrophic for any stack with state.
- With an alias: the new resource adopts the old URN; the rename is a metadata-only operation.

Hulumi v2.0 will include `aliases` for every renamed resource; the migration steps below describe the user-side wiring.

## Migration steps (v2.0 consumer-side)

> These steps will land in `docs/cookbooks/v2-migration.md` when v2.0 ships.

### 1. Pin to the last v1.x release before bumping

```bash
pnpm add @hulumi/baseline@^1.3.2   # whatever's latest in the v1.x line
```

### 2. Run `pulumi preview` and confirm zero warnings other than the V2 deprecations

The deprecation warnings are the only expected v1.x noise. If your preview emits anything else, address it before the v2.0 bump.

### 3. Bump to v2.0 and add the `aliases` block

Hulumi v2.0 will export the alias array per renamed resource:

```ts
import { SecureBucket, V1_BUCKET_ALIASES } from "@hulumi/baseline/aws";

const logs = new SecureBucket(
  "audit-logs",
  { tier: "startup-hardened" },
  { aliases: V1_BUCKET_ALIASES },
);
```

The exact name of the export will be confirmed when v2.0 lands; this doc commits Hulumi to providing it.

### 4. Run `pulumi preview` after the bump

Expected output: every existing resource shows as `~` (update) with no `+` (create) or `-` (destroy). The alias absorbs the URN change.

### 5. Run `pulumi up`

Pulumi rewrites the URN entry in state without touching the AWS resource. Your data, encryption, and policies are unchanged.

## What v1.x does NOT commit to

This doc is a contract for v2.0 design, not a release promise. Specifically:

- No date. v2.0 ships when the migration story is fully validated, not on a calendar.
- No commitment to a specific `@pulumi/aws` version compatibility window. v2.0 may also bump the `@pulumi/aws` peer dep range.
- No commitment to keep V2 + non-V2 in the same major. v2.0 will be a clean cut; v1.x users who don't migrate by EOL of v1.x's support line will need to stay on v1.x.

## Compatibility window

`@hulumi/baseline@1.x` will be supported for **6 months** after v2.0 ships. During that window:

- Critical security fixes are backported to v1.x.
- `@pulumi/*` cooling-off bumps are backported.
- Net-new features land only on v2.x.

After the 6-month window, v1.x is EOL. The same 6-month window applies to every published `@hulumi/*` package because of the atomic-release invariant — you can't be on v1.x of one and v2.x of another.

## Open questions for v2.0 design

These are the design decisions that v2.0 will need to land:

1. **Alias export shape**. Single `V1_*_ALIASES` constants per component, or a builder function that takes the resource name and emits the URN list?
2. **`@pulumi/aws` peer dep range**. v2.0 might bump the lower bound past v7 (e.g., to v8 if AWS provider has shipped one by then).
3. **Migration tooling**. Should Hulumi ship a `pnpm dlx @hulumi/v2-migrator` codemod that auto-inserts the aliases? Or is a doc-only migration sufficient?
4. **State backend test fixtures**. v2.0 acceptance includes a fixture stack that round-trips a v1.x → v2.x migration with state intact. Where does that fixture live? (Probably under `tests/v2-migration/`.)
5. **CHANGELOG breaking-change discipline**. v2.0 is the first Hulumi major. Pin the changelog discipline (link to migration doc, name the affected APIs, name the alias surface) before the release commit.

## Why this design doc exists in v1.x

Public users will start depending on `BucketV2`-shaped output names the moment Hulumi flips public. A v2.0 migration sketch lets them plan past v1.x; an undocumented one means everyone re-derives the migration story when v2.0 hits. Filing the contract in v1.x is cheap insurance — the doc costs nothing if v2.0 takes a year, and saves a week of docs work if v2.0 ships sooner.

Tracking issue: [#22](https://github.com/kerberosmansour/hulumi/issues/22).
