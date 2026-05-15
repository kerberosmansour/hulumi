# `hulumi.baseline.aws.SecureBucket`

Hardened S3 bucket `ComponentResource` with Sandbox and Startup-Hardened tiers. All sub-resources are children of the `hulumi:baseline:aws:SecureBucket` component; every one carries the `hulumi:component`, `hulumi:tier`, and `hulumi:controls` tag triple.

**Stability**: `stable` from v0.2 per [interfaces.md §1](../slo/design/hulumi/interfaces.md).
**Ships**: M2.
**Paired policies**: `HulumiHardeningPack` H1 (blocks raw `aws.s3.Bucket` / `aws.s3.BucketV2`), H4 (Startup-Hardened requires logging sibling).

## Quick-start

### Sandbox tier

```ts
import { SecureBucket } from "@hulumi/baseline/aws";

const scratch = new SecureBucket("scratch", { tier: "sandbox" });

export const bucketArn = scratch.arn;
```

Emits: Bucket, PublicAccessBlock (T/T/T/T), SSE-KMS, BucketOwnerEnforced, Versioning, TLS-only policy.

### Startup-Hardened tier

```ts
import { SecureBucket } from "@hulumi/baseline/aws";

const production = new SecureBucket("prod-uploads", {
  tier: "startup-hardened",
  logBucketArn: "arn:aws:s3:::org-audit-logs",
  objectLock: { mode: "governance", days: 30 },
  kmsKeyArn: "arn:aws:kms:us-east-1:111122223333:key/0a0a0a0a-1b1b-2c2c-3d3d-4e4e4e4e4e4e",
});

export const prodArn = production.arn;
export const prodDomain = production.bucketDomainName;
```

Emits everything in the Sandbox tier PLUS `BucketObjectLockConfiguration`, `BucketLogging`, and a per-bucket `cloudtrail.EventDataStore`.

The full tier matrix, including why Startup-Hardened emits exactly three extra sub-resources, lives in [../tiers.md § SecureBucket — tier matrix](../tiers.md#securebucket--tier-matrix).

## Args

| Arg              | Type                                                    | Required?                   | Default                            |
| ---------------- | ------------------------------------------------------- | --------------------------- | ---------------------------------- |
| `tier`           | `"sandbox" \| "startup-hardened"`                       | yes                         | —                                  |
| `kmsKeyArn`      | `Input<string>`                                         | no                          | AWS-managed key (`aws/s3`)         |
| `logBucketArn`   | `Input<string>`                                         | yes (Startup-Hardened only) | —                                  |
| `objectLock`     | `{ mode: "governance" \| "compliance", days: number }`  | no                          | `{ mode: "governance", days: 30 }` |
| `lifecycleRules` | `Input<...BucketLifecycleConfigurationRule[]>`          | no                          | —                                  |
| `replication`    | `{ role, destinationBucketArn, destinationKmsKeyArn? }` | no                          | —                                  |

## Outputs

| Output             | Type                                 | Description                                               |
| ------------------ | ------------------------------------ | --------------------------------------------------------- |
| `bucket`           | `aws.s3.Bucket`                      | Primary Bucket resource (sub-resource of this component). |
| `arn`              | `pulumi.Output<string>`              | Equivalent to `bucket.arn`.                               |
| `bucketDomainName` | `pulumi.Output<string>`              | Equivalent to `bucket.bucketDomainName`.                  |
| `logBucketArn`     | `pulumi.Output<string \| undefined>` | Echo of the input when present.                           |
| `kmsKeyArn`        | `pulumi.Output<string \| undefined>` | Echo of the input when present.                           |

## Migration note

Current SecureBucket releases construct the non-V2 Pulumi AWS S3 resource classes and carry aliases back to the previous V2 child type tokens. Existing stacks should run `pulumi preview` after upgrading and confirm the bucket children are adopted/updated, not deleted and recreated. The TypeScript `bucket` output type changed from `aws.s3.BucketV2` to `aws.s3.Bucket`; practical outputs such as `id`, `arn`, and `bucketDomainName` are unchanged.

## Tags emitted

All children of a `SecureBucket` carry:

| Tag key            | Example value                   | Purpose                                                                |
| ------------------ | ------------------------------- | ---------------------------------------------------------------------- |
| `hulumi:component` | `SecureBucket`                  | Attribution.                                                           |
| `hulumi:tier`      | `sandbox` \| `startup-hardened` | Tier metadata; consumed by H4 and the M4 drift classifier.             |
| `hulumi:controls`  | comma-separated framework IDs   | Which CCM/CIS/NIST IDs this component claims to address (≥ 5 entries). |

Tag-key schema is `stable` per [interfaces.md §6](../slo/design/hulumi/interfaces.md).

## Framework IDs cited

SecureBucket addresses the following controls. IDs only; prose is intentionally NOT embedded (per the IDs-only license boundary in [../licensing.md](../licensing.md)).

- **CCM v4.1**: DSP-01, CEK-04, CEK-01, DSP-17, LOG-01. See [../mappings/ccm-v4.1.md](../mappings/ccm-v4.1.md).
- **CIS AWS v5.0.0**: 2.1.1, 2.1.2, 2.1.4, 2.1.5, 2.1.6. See [../mappings/cis-aws-v5.0.md](../mappings/cis-aws-v5.0.md).
- **NIST 800-53 Rev 5**: AC-3, SC-8, SC-12, SC-13, SC-28, AU-2, AU-12, CP-9. See [../mappings/nist-800-53-r5.md](../mappings/nist-800-53-r5.md).
- **MITRE ATLAS v5.1**: AML.T0001 (bucket name squatting). See [../mappings/atlas-v5.1.md](../mappings/atlas-v5.1.md).

## Input validation

- `tier` outside the union → runtime error `Invalid Hulumi tier "…"; expected one of: sandbox, startup-hardened`. Catches stringly-typed inputs that bypass TypeScript (e.g. `as any` or dynamic config).
- `tier: "startup-hardened"` with no `logBucketArn` → runtime error `Startup-Hardened requires logBucketArn; see docs/tiers.md`. Paired with the H4 CrossGuard rule for defense-in-depth.

## Mock-unit testing

The component instantiates normally under `pulumi.runtime.setMocks()`. See [../../packages/baseline/tests/secure-bucket.test.ts](../../packages/baseline/tests/secure-bucket.test.ts) for the full BDD test suite and [../../examples/secure-bucket-smoke/](../../examples/secure-bucket-smoke/) for a minimal end-to-end example.

Real-AWS integration (weekly sandbox job) arrives with `AccountFoundation` in M3.

## Planned deltas

- **v0.3 (M3)**: `AccountFoundation` consumes SecureBucket's per-bucket CloudTrail data-events and centralizes into one account trail. SecureBucket's EventDataStore sub-resource becomes configurable (emit-per-bucket vs. emit-tag-only).
- **v0.4 (M4)**: Drift classifier wires the bucket's `hulumi:iac-role` principal-attribution into its CloudTrail adapter.
- **v1.0 (M5)**: SLSA Build L3 attestation on the published `@hulumi/baseline` package; SCP template pairs with H3→mandatory.
