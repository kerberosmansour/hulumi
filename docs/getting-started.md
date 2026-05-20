---
title: Getting started with Hulumi
description: Install the Pulumi components, install the Claude Code skill, and ship a hardened S3 bucket in ~10 minutes.
---

# Getting started with Hulumi

This walkthrough takes you from "clean machine" to a working hardened S3 bucket and a generated AWS threat model in roughly **ten minutes**. It deliberately stays in mocked-Pulumi mode so you don't need an AWS account to follow along — the same code targets a real account when you're ready.

## What you'll do

1. [Install prerequisites](#1-install-prerequisites)
2. [Install the `/hulumi-threat-model` skill](#2-install-the-hulumi-threat-model-skill-optional-but-recommended)
3. [Create a Pulumi project that uses `@hulumi/baseline`](#3-create-a-pulumi-project-that-uses-hulumibaseline)
4. [Add the `HulumiHardeningPack` policy pack](#4-add-the-hulumihardeningpack-policy-pack)
5. [Run a mocked preview](#5-run-a-mocked-preview)
6. [Promote the bucket to the Startup-Hardened tier](#6-promote-the-bucket-to-the-startup-hardened-tier)
7. [Where to go next](#7-where-to-go-next)

## 1. Install prerequisites

| Tool                       | Version   | Why                                                 |
| -------------------------- | --------- | --------------------------------------------------- |
| Node.js                    | 20 LTS    | Hulumi packages target Node 20.                     |
| pnpm                       | ≥ 9       | The repo and recommended setup use pnpm.            |
| Pulumi CLI                 | ≥ 3.232.0 | Hulumi's tested floor for `@pulumi/pulumi`.         |
| (optional) Claude Code CLI | latest    | Required only for the `/hulumi-threat-model` skill. |
| (optional) AWS CLI         | ≥ 2.15    | Only needed when you eventually run `pulumi up`.    |

```bash
node --version   # v20.x
pnpm --version   # 9.x or later
pulumi version   # 3.232.0 or later
```

## 2. Install the `/hulumi-threat-model` skill (optional but recommended)

The skill writes a structured AWS threat-model markdown that maps directly to the components you're about to use. Running it before you write IaC saves rework.

```bash
git clone https://github.com/kerberosmansour/hulumi ~/.claude/skills/hulumi-threat-model-src
ln -s ~/.claude/skills/hulumi-threat-model-src/skills/hulumi-threat-model \
      ~/.claude/skills/hulumi-threat-model
```

Restart Claude Code. In a fresh session:

```
/hulumi-threat-model s3-public-bucket-hardening
```

The skill writes `docs/threat-model-s3-public-bucket-hardening-YYYYMMDD.md` in your current working directory — read the **Recommended Hulumi Components** section before you continue.

> Don't have Claude Code? You can run the script directly:
> `node ~/.claude/skills/hulumi-threat-model/scripts/generate-threat-model.mjs s3-public-bucket-hardening`

## 3. Create a Pulumi project that uses `@hulumi/baseline`

```bash
mkdir hulumi-quickstart && cd hulumi-quickstart
pulumi new aws-typescript --name hulumi-quickstart --description "Hulumi quickstart" --yes --force
pnpm add @hulumi/baseline @pulumi/aws @pulumi/pulumi
```

> Hulumi 1.4.1+ accepts any caret-compatible Pulumi SDK (`@pulumi/pulumi` in the `3.x` line, `@pulumi/aws` in the `7.x` line). The exact versions Hulumi is tested against live in each package's `peerDependencies` as the floor. If you already have these SDKs at a compatible version, you don't need to change them.

Replace the generated `index.ts` with:

```ts
import { SecureBucket } from "@hulumi/baseline/aws";

// Sandbox tier — for local experimentation, PR previews, scratch stacks.
export const scratch = new SecureBucket("scratch", { tier: "sandbox" });

export const scratchArn = scratch.arn;
```

What this gets you, automatically:

- `BucketPublicAccessBlock` with all four levers `true`
- SSE-KMS using the AWS-managed `aws/s3` key
- `BucketOwnershipControls = BucketOwnerEnforced` (ACLs disabled)
- Versioning enabled
- A bucket policy that denies non-TLS requests (`aws:SecureTransport=false → Deny`)
- The `hulumi:component`, `hulumi:tier`, `hulumi:controls` tag triple on every child

You did not have to know any of those defaults. That's the point of `SecureBucket`.

## 4. Add the `HulumiHardeningPack` policy pack

The pack catches the things a misconfigured PR could reintroduce — like reaching past `SecureBucket` to instantiate a raw `aws.s3.BucketV2`, or pointing the Pulumi backend at `file://`.

```bash
pnpm add -D @hulumi/policies @pulumi/policy
mkdir policies && cd policies
cp ../node_modules/@hulumi/policies/PulumiPolicy.yaml .
cat > index.ts <<'EOF'
export { hulumiHardeningPack } from "@hulumi/policies/aws/packs/hulumi-hardening";
EOF
cd ..
```

Reference it on preview:

```bash
pulumi preview --policy-pack ./policies
```

Today (v0.2 → v1.0 transition) the four rules behave as:

| Rule | Severity | Enforcement | What it blocks                                                       |
| ---- | -------- | ----------- | -------------------------------------------------------------------- |
| H1   | high     | mandatory   | Raw `aws.s3.Bucket` / `aws.s3.BucketV2` outside `SecureBucket`.      |
| H2   | critical | mandatory   | `file://` state backend; unencrypted S3 state backend (best-effort). |
| H3   | medium   | advisory\*  | IAM role missing `hulumi:iac-role=true` tag (mandatory in v1.0).     |
| H4   | high     | mandatory   | Startup-Hardened SecureBucket without a sibling logging resource.    |

\* H3 flips to mandatory in v1.0 and is paired with the SCP template in [`docs/deployment/`](./deployment/). See the v1.0.0 entry in the [CHANGELOG](../CHANGELOG.md) for the migration paths.

## 5. Run a mocked preview

You can drive the program through Pulumi's mock runtime without an AWS account. Add a vitest spec to lock in the behaviour:

```bash
pnpm add -D vitest @types/node
mkdir tests
cat > tests/scratch.test.ts <<'EOF'
import * as pulumi from "@pulumi/pulumi";
import { describe, expect, it } from "vitest";

pulumi.runtime.setMocks({
  newResource: (args) => ({ id: `${args.name}-id`, state: args.inputs }),
  call: () => ({}),
});

describe("scratch SecureBucket", () => {
  it("emits a sandbox-tier bucket", async () => {
    const { scratch } = await import("../index");
    const tier = await new Promise<string>((resolve) => {
      // Pulumi outputs settle on the next tick; we resolve once arn is materialised.
      pulumi.output(scratch.arn).apply((v) => resolve(v as string));
    });
    expect(tier).toContain("scratch");
  });
});
EOF
pnpm vitest run
```

If everything is wired correctly you'll see one passing test. Real `pulumi preview` and `pulumi up` work the same way — they just need AWS credentials and an empty state backend.

## 6. Promote the bucket to the Startup-Hardened tier

When the bucket is going to hold anything you'd care about losing, switch tiers:

```ts
import { SecureBucket } from "@hulumi/baseline/aws";

const logBucket = new SecureBucket("audit-logs", {
  tier: "startup-hardened",
  logBucketArn: "arn:aws:s3:::your-existing-audit-logs",
  objectLock: { mode: "governance", days: 30 },
});

export const production = new SecureBucket("prod-uploads", {
  tier: "startup-hardened",
  logBucketArn: logBucket.arn,
  objectLock: { mode: "governance", days: 90 },
  kmsKeyArn: "arn:aws:kms:us-east-1:111122223333:key/your-cmk-id",
});
```

The Startup-Hardened tier emits **three sub-resources Sandbox does not**:

- `aws:s3/bucketObjectLockConfigurationV2` — retention.
- `aws:s3/bucketLoggingV2` — attribution.
- `aws:cloudtrail/eventDataStore` — data-plane auditing.

The full delta lives in [docs/tiers.md § SecureBucket — tier matrix](./tiers.md#securebucket--tier-matrix). Drop `logBucketArn` and the component constructor will throw at preview — defense in depth, paired with the H4 CrossGuard rule.

## 7. Where to go next

| Goal                                                      | Doc                                                                  |
| --------------------------------------------------------- | -------------------------------------------------------------------- |
| Bootstrap an entire AWS account, not just a bucket        | [`AccountFoundation` cookbook](./cookbooks/account-bootstrap.md)     |
| Wire the drift classifier into your CI                    | [Drift detection cookbook](./cookbooks/drift-detection.md)           |
| Apply the `HulumiHardeningPack` to an existing stack      | [Policy-pack rollout cookbook](./cookbooks/policy-pack-rollout.md)   |
| Use the threat-model skill in design reviews              | [Threat-modeling cookbook](./cookbooks/threat-modeling.md)           |
| Verify SLSA provenance before your team installs from npm | [Provenance verification cookbook](./cookbooks/verify-provenance.md) |
| Understand _why_ Hulumi is shaped the way it is           | [Why Hulumi](./why-hulumi.md)                                        |
| Hack on Hulumi itself                                     | [Development guide](./development.md)                                |

## Troubleshooting

**`pulumi preview` complains it can't find `@hulumi/baseline/aws`.** The package's `exports` map points at `dist/`, which means a published tarball works out of the box but a _source-checked-out_ copy needs a build first: `pnpm -r build`. This applies inside this repo's `examples/`, not when you `pnpm add @hulumi/baseline` from npm.

**The mocked test sees fewer sub-resources than the tier matrix promises.** Pulumi's mock `newResource` hook fires asynchronously through Promise chains; awaiting one output (e.g., `bucket.arn`) doesn't barrier all sibling registrations. Drain the microtask queue with a small helper before assertions — see [`packages/baseline/tests/setup.ts`](../packages/baseline/tests/setup.ts) for the canonical `settlePulumi()`.

**`PolicyPack` constructor exits with `process.exit(1)`.** `@pulumi/policy`'s `new PolicyPack()` starts a gRPC server at module load time and only one is allowed per process. Import `HulumiHardeningPack` and `CisV5Pack` from their dedicated entrypoints under `@hulumi/policies/aws/packs/*`, never side-by-side from the same file. See [docs/slo/lessons/hulumi-m2.md](./slo/lessons/hulumi-m2.md) for the underlying constraint.

**The skill output references `Hulumi v0.4+` but I'm on v1.0.** Forward-references are deliberate in the M1-shipped scenario JSONs and refresh per-milestone. v1.0.0 has shipped everything, but the static template language stays — that's a known follow-up tracked in [issue-candidates.md](./issue-candidates.md).
