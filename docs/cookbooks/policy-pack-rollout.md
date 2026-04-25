---
title: Roll out the Hulumi policy pack to an existing stack
description: Adopt @hulumi/policies on a stack that doesn't use SecureBucket / AccountFoundation yet — get the safety net first, migrate components later.
---

# Roll out the Hulumi policy pack to an existing stack

## When to use this recipe

You have an existing Pulumi stack, you can't migrate every resource to `SecureBucket` / `AccountFoundation` overnight, but you'd like the same safety net catching regressions today. The CrossGuard pack is independently loadable and surfaces a concrete migration list as it runs.

## Preconditions

- An existing Pulumi (TypeScript) stack you can `pulumi preview` against.
- `@pulumi/policy@1.20.0` installed alongside `@hulumi/policies@1.0.0`.
- Read-only walkthrough first: load the pack as advisory, see what fires, then promote to mandatory.

## Steps

### 1. Install

```bash
pnpm add -D @hulumi/policies @pulumi/policy@1.20.0
mkdir policies && cd policies
cp ../node_modules/@hulumi/policies/PulumiPolicy.yaml .
cat > index.ts <<'EOF'
export { hulumiHardeningPack } from "@hulumi/policies/aws/packs/hulumi-hardening";
EOF
```

> Important: `@pulumi/policy`'s `new PolicyPack()` constructor starts a gRPC server at module load and only one is allowed per process. Always import packs from their dedicated entrypoint files (`@hulumi/policies/aws/packs/*`), never side-by-side from one file. See [lessons/hulumi-m2.md](../lessons/hulumi-m2.md) for the rationale.

### 2. Run advisory-only

```bash
pulumi preview --policy-pack ./policies
```

Read every violation as a migration ticket:

| Violation                                                       | What to do                                                                                                        |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `HULUMI-H1-no-raw-bucket`                                       | Replace `aws.s3.BucketV2` with `SecureBucket`. See [components/secure-bucket.md](../components/secure-bucket.md). |
| `HULUMI-H2-state-backend-encryption` (mandatory)                | Move state off `file://`; if S3, ensure SSE is enabled on the state bucket.                                       |
| `HULUMI-H3-iac-role-tag` (advisory pre-v1.0, mandatory at v1.0) | Tag your IaC role `hulumi:iac-role=true`. Pair with the [SCP template](../deployment/) at v1.0.                   |
| `HULUMI-H4-startup-hardened-logging`                            | A Startup-Hardened `SecureBucket` is missing its `logBucketArn` sibling. Wire one up.                             |

### 3. Decide what to fix vs. suppress

Some violations are genuine bugs — fix them. Others are documented exceptions for your environment. For the second class, use a `Suppression`:

```ts
// policies/index.ts
import { hulumiHardeningPack } from "@hulumi/policies/aws/packs/hulumi-hardening";
import type { Suppression } from "@hulumi/policies";

const suppressions: Suppression[] = [
  {
    ruleId: "HULUMI-H1-no-raw-bucket",
    urnScope: "urn:pulumi:prod::your-stack::aws:s3/bucketV2:BucketV2::legacy-bucket",
    reason: "Imported pre-Hulumi; migration tracked in #JIRA-1234.",
    expiresAt: "2026-09-30",
  },
];

export { hulumiHardeningPack, suppressions };
```

See [suppressions.md](./suppressions.md) for the full suppression cookbook.

### 4. Promote to mandatory

When the advisory run is clean (or every remaining violation has a documented suppression), wire the pack into CI:

```yaml
# .github/workflows/ci.yml
- name: Pulumi preview with Hulumi policy pack
  run: pulumi preview --policy-pack ./policies
```

`HULUMI-H1`, `H2`, and `H4` already fail mandatory on violation. `H3` flips to mandatory at the v1.0 release; track the [v1.0 CHANGELOG entry](../../CHANGELOG.md) for migration paths if you're upgrading from a pre-v1.0 install.

## Verify

- A clean run reports `policy violations: 0 mandatory, 0 advisory`.
- A deliberately broken stack (e.g. add an `aws.s3.BucketV2` to `index.ts`) fails with `HULUMI-H1` and a violation message naming the exact resource.
- Removing the `hulumi:iac-role=true` tag from your IaC role fires `HULUMI-H3` advisory pre-v1.0 / mandatory at v1.0.

## Troubleshooting

**`H2` fires on an unencrypted state bucket but I can't see the bucket in the stack.** Pulumi sets `PULUMI_BACKEND_URL` for every operation; `H2` reads that and inspects the stack for a matching SSE configuration. If the state bucket isn't part of the stack being previewed, `H2` degrades to **advisory** (encryption can't be verified) rather than silently passing. Move the state bucket into a Hulumi-managed stack to get full mandatory coverage.

**`H3` shows up as advisory and I want it mandatory now.** It's a one-line override:

```ts
import { hulumiHardeningPack } from "@hulumi/policies/aws/packs/hulumi-hardening";
hulumiHardeningPack.policies.find((p) => p.name.includes("H3")).enforcementLevel = "mandatory";
```

Do this only if you're already applying the SCP template — otherwise expect drive-by failures from teams that haven't tagged their IaC role yet.

**Both `HulumiHardeningPack` and `CisV5Pack` need to load — preview crashes.** Don't import them in the same file. Use one entrypoint per process and call `pulumi preview --policy-pack ./policies-hulumi --policy-pack ./policies-cis`. Each pack's instance lives in its own gRPC server.

## See also

- [tiers.md § HulumiHardeningPack — rule matrix](../tiers.md#hulumihardeningpack--rule-matrix)
- [components/README.md](../components/README.md) — what to migrate to once a violation is a real bug.
- [suppressions.md](./suppressions.md) — when and how to document exceptions.
- [CHANGELOG.md](../../CHANGELOG.md) — H3 advisory→mandatory migration paths.
