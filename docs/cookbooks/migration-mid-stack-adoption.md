---
title: Adopt Hulumi inside an existing Pulumi project
description: Mid-stack adoption path — replace hand-rolled AWS resources with Hulumi components without forcing destroy/recreate.
---

# Adopt Hulumi inside an existing Pulumi project

## When to use this recipe

You already have a Pulumi project and want to replace existing hand-rolled `aws.s3.BucketV2` / `aws.cloudtrail.Trail` / `aws.guardduty.Detector` / etc. resources with Hulumi components — without forcing every resource through a destroy/recreate cycle.

This is the **mid-stack adoption** path. For a fresh project, see [account-bootstrap.md](./account-bootstrap.md). For a Terraform-to-Pulumi migration, see [migration-from-terraform.md](./migration-from-terraform.md).

## Preconditions

- An existing Pulumi project at `@pulumi/pulumi >= 3.232.0`.
- An understanding of which resources are stateful (buckets, RDS, KMS keys) vs ephemeral (Lambda, IAM roles).
- An IaC role tagged `hulumi:iac-role=true` already in use, or willingness to add the tag.

## Core technique: `aliases` to absorb URN changes

When you replace a hand-rolled `aws.s3.BucketV2` with a Hulumi `SecureBucket`, the URN changes:

- Before: `urn:pulumi:dev::myproject::aws:s3/bucketV2:BucketV2::audit-logs`
- After: `urn:pulumi:dev::myproject::hulumi:aws:SecureBucket$aws:s3/bucketV2:BucketV2::audit-logs`

Without an alias, Pulumi treats this as destroy-old + create-new. With `aliases`, the new resource adopts the old URN — the bucket's data, encryption, and policies are unchanged.

```ts
import { SecureBucket } from "@hulumi/baseline/aws";

const audit = new SecureBucket(
  "audit-logs",
  {
    tier: "startup-hardened",
    bucketName: "my-org-audit-logs",
  },
  {
    aliases: [
      // The old hand-rolled BucketV2 URN — replace with whatever your stack
      // had previously.
      { type: "aws:s3/bucketV2:BucketV2", name: "audit-logs" },
    ],
  },
);
```

Run `pulumi preview` and confirm the diff is `~` (update), not `+` / `-`.

## Steps

### 1. Inventory the resources you'll replace

```sh
pulumi stack export | jq '.deployment.resources[] | select(.type | startswith("aws:")) | {urn, type}' > to-migrate.json
```

For each resource type, decide which Hulumi component it maps to. Typical mappings:

| Hand-rolled type                                                            | Hulumi target                                                       |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `aws:s3/bucketV2:BucketV2` + child resources (encryption, versioning, etc.) | `@hulumi/baseline.aws.SecureBucket`                                 |
| `aws:cloudtrail/trail:Trail` + log group + bucket                           | `@hulumi/baseline.aws.AccountFoundation` (CloudTrail sub-component) |
| `aws:guardduty/detector:Detector` + features                                | `@hulumi/baseline.aws.AccountFoundation` (GuardDuty sub-component)  |
| `aws:iam/passwordPolicy:PasswordPolicy`                                     | `@hulumi/baseline.aws.AccountFoundation` (IAM baseline)             |
| `aws:kms/key:Key`                                                           | `@hulumi/baseline.aws.AccountFoundation` (KMS ring)                 |

The Hulumi components are intentionally additive — adopting `AccountFoundation` doesn't require ripping out unrelated resources.

### 2. Author the Hulumi-component replacements with `aliases`

For each replacement, capture the OLD URN before deleting the old resource. The pattern:

```ts
// Before — hand-rolled
const oldBucket = new aws.s3.BucketV2("audit-logs", {
  bucket: "my-org-audit-logs",
});
// ... and 4-5 child resources for encryption / versioning / etc.

// After — Hulumi
const audit = new SecureBucket(
  "audit-logs",
  { tier: "startup-hardened", bucketName: "my-org-audit-logs" },
  {
    aliases: [
      { type: "aws:s3/bucketV2:BucketV2", name: "audit-logs" },
      // The child resources also need aliases if Hulumi's child shape
      // matches one-for-one. SecureBucket's children are URN-stable
      // across the v1.x line; consult the component reference for the
      // exact alias list.
    ],
  },
);
```

For `AccountFoundation`, the alias surface is wider — every sub-component (CloudTrail, Config, GuardDuty, SecurityHub, IAM, KMS) has its own URN. The component's [reference doc](../components/account-foundation.md) lists the canonical aliases.

### 3. Use `dependsOn` to express ordering

Hulumi components composed with hand-rolled resources may need explicit ordering hints:

```ts
const baseline = new AccountFoundation("baseline", {
  tier: "startup-hardened",
  iacRoleArn,
  region,
});

const myService = new MyExistingComponent(
  "my-service",
  {
    /* ... */
  },
  { dependsOn: [baseline] },
);
```

The `dependsOn` is the documented workaround for the `pulumi.dynamic.Resource` + vitest-pool gotcha (see [FAQ](../faq.md#pulumidynamicresource-doesnt-work-under-vitests-worker-pool)) and is also the right shape for "wait for the baseline before applying my service-specific resources."

### 4. Run `pulumi preview` per migration step

Apply replacements one at a time. After each:

```sh
pulumi preview --target 'urn:pulumi:dev::myproject::hulumi:aws:SecureBucket::audit-logs'
```

Expected diff: `~` (update) for every previously-hand-rolled child. If you see `+` (create) for a resource that should already exist, the alias didn't fire — review the alias type/name pair.

### 5. Apply with `pulumi up --target`

```sh
pulumi up --target 'urn:pulumi:dev::myproject::hulumi:aws:SecureBucket::audit-logs'
```

Surgical applies are safer than `pulumi up --everything` during a migration. After each apply, run drift detection ([drift-detection.md](./drift-detection.md)) to confirm the resource is cleanly Hulumi-managed.

### 6. Once all replacements are done, drop `aliases`

The `aliases` are migration-only scaffolding. Once `pulumi up` is a no-op, remove them:

```ts
// Final form
const audit = new SecureBucket("audit-logs", {
  tier: "startup-hardened",
  bucketName: "my-org-audit-logs",
});
```

Run `pulumi preview` once more — should be a no-op.

## Drift expectations during the transition

While the migration is in flight:

- The drift classifier may report `Unknown / low` for in-flight resources because git-log authorship is split between hand-rolled and Hulumi-composed.
- Provider-version checks are unaffected — `@pulumi/aws` is exact-pinned by Hulumi.

After all replacements + alias removal, drift classifier results should stabilize. If a previously-hand-rolled resource still reports `ConsoleBreakGlass / high` post-migration, check that the resource's `hulumi:iac-role` tag is set — the classifier reads tags to identify IaC-managed resources.

## Rollback strategy

Per replacement step:

1. **Before `pulumi up`**: revert the source code to the hand-rolled shape; the next `pulumi preview` shows no change.
2. **After `pulumi up` but before alias removal**: re-add the hand-rolled code with the SAME alias structure (in reverse). Pulumi sees the alias and re-adopts the URN; no resource churn.
3. **After alias removal**: rollback requires manual `pulumi state` surgery. Don't remove aliases until you're confident the migration is sticky.

The window of free rollback closes when you delete the aliases. Be deliberate.

## Common pitfalls

- **Alias type/name mismatch**. The `type` field uses Pulumi's resource-type string (e.g. `aws:s3/bucketV2:BucketV2`), not the JSON path. Get it wrong and the alias silently doesn't fire — the migration becomes a destroy/recreate.
- **Forgetting child-resource aliases**. `SecureBucket` composes ~5 child resources; if you alias the parent but not the children, the children get destroyed/recreated. Component reference docs list the full alias surface.
- **Tag drift mid-migration**. If the IaC role's `hulumi:iac-role=true` tag isn't on every resource being adopted, the SCP (if applied) or H3 policy will fire. Add the tag pre-migration or fold it into the migration commit.

## What to do next

- [Wire drift detection into CI](./drift-detection.md).
- [Adopt the policy pack](./policy-pack-rollout.md) once the components are landed.
- [Verify SLSA provenance](./verify-provenance.md) on installed `@hulumi/*` packages.

Tracking issue: [#34](https://github.com/kerberosmansour/hulumi/issues/34).
