---
title: Migrate from Terraform to Pulumi + Hulumi
description: Canonical adoption path for teams moving an existing Terraform stack to Pulumi with Hulumi's hardened components.
---

# Migrate from Terraform to Pulumi + Hulumi

## When to use this recipe

You have an existing Terraform stack — typically `aws_s3_bucket`, `aws_cloudtrail`, `aws_config_*`, IAM password policy, etc. — and you want to land Pulumi (so an AI coding agent can author IaC safely) plus Hulumi (so the result is hardened by default).

Migration paths fall into two shapes:

- **Greenfield-cutover**: stand up a parallel Pulumi+Hulumi stack, point traffic at it, retire the Terraform stack. Simpler but requires duplicate spend during the transition.
- **State-import**: use `pulumi import` to absorb the existing AWS resources into Pulumi state, then refactor toward Hulumi components in-place. No duplicate spend, but the import-then-refactor sequence has gotchas (see below).

This recipe covers state-import. For greenfield-cutover, see [account-bootstrap.md](./account-bootstrap.md) — start from scratch with Hulumi from day one.

## Preconditions

- Existing Terraform stack you can run `terraform show -json > tfstate.json` against.
- Pulumi 3.232.0+ + Pulumi Cloud (or self-managed backend) available.
- AWS credentials with read access to the resources you're importing.
- An IaC role tagged `hulumi:iac-role=true` (or be ready to add the tag during import).

## Steps

### 1. Inventory the Terraform-managed resources

```sh
terraform state list > terraform-resources.txt
```

For each resource type, decide:

- **Map to Hulumi**: e.g. `aws_s3_bucket` → `@hulumi/baseline.aws.SecureBucket`.
- **Map to a sub-component of `AccountFoundation`**: e.g. `aws_cloudtrail`, `aws_guardduty_detector`, `aws_securityhub_account` → managed inside `AccountFoundation`.
- **Keep as raw Pulumi resource**: e.g. project-specific resources Hulumi doesn't model.

### 2. Author the Pulumi program with Hulumi components

Start with the Hulumi components that absorb the highest count of TF resources. Typical sequence:

```ts
import * as aws from "@pulumi/aws";
import { SecureBucket, AccountFoundation } from "@hulumi/baseline/aws";

// AccountFoundation absorbs CloudTrail, Config, GuardDuty, SecurityHub,
// IAM password policy, KMS ring — i.e. ~15-20 TF resources collapse into
// one ComponentResource.
const baseline = new AccountFoundation("baseline", {
  tier: "startup-hardened",
  iacRoleArn: "arn:aws:iam::ACCOUNT:role/hulumi-iac-role",
  region: "us-east-1",
});

// Each existing aws_s3_bucket becomes one SecureBucket.
const audit = new SecureBucket("audit", {
  tier: "startup-hardened",
  bucketName: "my-org-audit-logs",
});
```

### 3. Generate `pulumi import` commands per resource

For each existing AWS resource, the Pulumi-side import call shape is:

```sh
pulumi import aws:s3/bucket:Bucket audit-bucket-tf my-org-audit-logs --yes
```

For sub-resources of `AccountFoundation`, the imports get more specific — you import the AWS-side resource into the URN that `AccountFoundation` emits. Discover the URNs via `pulumi stack export | jq '.deployment.resources[].urn'` after a first preview-only run.

### 4. Reconcile the import drift

After every `pulumi import`, run `pulumi preview`. Expect a non-zero diff — Terraform's resource shape and Hulumi's hardened defaults won't match exactly. Common diffs:

- `acl` / `policy` — Terraform-managed buckets often lack the TLS-only policy that `SecureBucket` enforces. The diff is "add `Effect: Deny` for non-TLS requests"; that's the hardening kicking in.
- `tags` — Hulumi adds `hulumi:iac-role`, `hulumi:tier`, `hulumi:component`, `hulumi:controls`. If your TF stack already had a different tagging schema, decide which wins (Hulumi's tags are load-bearing for the drift classifier and the SCP).
- `versioning.enabled` — If the imported bucket has versioning disabled, Hulumi will enable it. Consider whether re-versioning has compliance / cost implications before applying.

Document each non-trivial diff before running `pulumi up`.

### 5. Run `pulumi up` with surgical scope

```sh
pulumi up --target 'urn:pulumi:dev::my-stack::aws:s3/bucket:Bucket::audit'
```

`--target` lets you apply one resource at a time. After each apply, run drift detection ([drift-detection.md](./drift-detection.md)) to confirm the imported resource is now Hulumi-managed cleanly.

### 6. Tear down the Terraform stack

Once every resource is in Pulumi state and `pulumi up` is a no-op, `terraform destroy` against the old stack. Because the AWS resources are owned by Pulumi at this point, the Terraform-side teardown is a metadata-only operation — Terraform sees no resources to destroy.

If `terraform destroy` reports outstanding resources, you've missed a `pulumi import` somewhere — go back to step 3.

## Drift expectations during the transition

While the migration is in flight, the drift classifier may flag resources as `Unknown / low` because:

- The provider-version adapter sees a Pulumi-managed resource with a non-Hulumi-shaped URN history.
- The git-log adapter doesn't have a clear authorship trail (the resource was Terraform-authored historically).

These are expected. After the migration closes (step 6), the next `DriftClassifier.classify()` run should return `None / none` for all imported resources. If it doesn't, see [drift-detection.md § "Verdict explanations"](./drift-detection.md#verdict-explanations).

## Rollback strategy

If a migration step goes wrong:

1. **Before `pulumi up`**: run `pulumi cancel` and `pulumi state delete <urn>` to remove the imported resource from Pulumi state. Terraform still owns it.
2. **After `pulumi up` but before Terraform destroy**: `pulumi state delete <urn>` removes Pulumi's claim; the resource lives in AWS untouched. Re-import to Terraform with `terraform import`.
3. **After Terraform destroy**: rollback is no longer free. The resource is Pulumi-only. Restore via `pulumi state import` from a backup, or accept the new state.

The rollback safety window narrows as you progress. Run small, target-scoped applies, especially for resources with state (S3 buckets, RDS instances, KMS keys).

## What to do next

- [Wire drift detection into CI](./drift-detection.md) — once the import is done, drift is the early-warning system for "Terraform admin clicked something."
- [Verify SLSA provenance](./verify-provenance.md) on the `@hulumi/*` packages you've installed.
- [Threat-modeling cookbook](./threat-modeling.md) — run a structured threat model on the now-Pulumi-managed account.

Tracking issue: [#34](https://github.com/kerberosmansour/hulumi/issues/34).
