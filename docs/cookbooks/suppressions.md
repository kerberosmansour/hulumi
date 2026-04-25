---
title: Suppress a CrossGuard violation, on purpose
description: Add a documented, scoped, expiring exception to a HulumiHardeningPack rule without disabling it everywhere.
---

# Suppress a CrossGuard violation, on purpose

## When to use this recipe

A CrossGuard rule is firing on a resource that you _know_ is an exception — an imported legacy bucket pre-Hulumi, a deliberately public asset, a staging-only carve-out. Disabling the rule globally hides the same problem on every other resource. A scoped suppression silences exactly the resource you mean, requires a documented reason, and expires.

## Preconditions

- `@hulumi/policies@1.0.0` installed and a working `policies/` folder per [policy-pack-rollout.md](./policy-pack-rollout.md).
- A specific Pulumi URN you want to suppress against. `pulumi stack --show-urns` lists them.

## Steps

### 1. Author the suppression

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

`Suppression` shape (from [packages/policies/src/aws/suppressions.ts](../../packages/policies/src/aws/suppressions.ts)):

| Field       | Required                   | Notes                                                                                  |
| ----------- | -------------------------- | -------------------------------------------------------------------------------------- |
| `ruleId`    | yes                        | Exact rule ID, e.g. `HULUMI-H1-no-raw-bucket`.                                         |
| `reason`    | yes                        | Human-readable explanation. Show up in evidence packets and audit reviews.             |
| `urnScope`  | recommended                | Exact URN or a `urn-prefix*` glob. Omit to silence the rule globally — discouraged.    |
| `expiresAt` | required for high-severity | ISO 8601 date. After this, the suppression no longer matches and the rule fires again. |

### 2. Run the preview

```bash
pulumi preview --policy-pack ./policies
```

If the suppression matches, the violation is silenced and the policy log notes `suppressed: <reason>`. Other resources still fail the same rule normally.

### 3. Set yourself a calendar reminder

A suppression is a debt. The expiry date is its repayment plan — once it lapses, the rule fires again and CI breaks. That's the point. The expiry forces you to either fix the underlying issue or consciously renew the exception.

> Tip: pair this with a `/schedule` reminder if you use Claude Code:
> "In two weeks, open a PR migrating `legacy-bucket` to `SecureBucket`."

## Verify

- A `pulumi preview` run shows the suppressed violation as **suppressed**, not silently absent.
- A second resource that doesn't match the `urnScope` still fails the same rule.
- After the `expiresAt` date passes, the suppression no longer matches (the matcher rejects expired entries — see `matchSuppression` in `packages/policies/src/aws/suppressions.ts`).
- The reason text appears in audit / CI logs alongside the matched rule ID.

## Anti-patterns

**Suppressing a whole rule with no `urnScope` and no `expiresAt`.** That's a global, permanent disable wearing a `Suppression` costume. Just don't ship the rule if you genuinely never want it to fire.

**Suppressing without a JIRA / GitHub issue link in `reason`.** The whole point of `reason` is that the next person reading the diff understands why. "needed for legacy" is not a reason; "imported pre-Hulumi; migration tracked in #JIRA-1234" is.

**Suppressing `H2` (state backend encryption).** Don't. If you have an unencrypted state backend, fix it; suppressing `H2` is exactly the kind of "make the warning go away" move that bites in an audit. If your state backend genuinely cannot be encrypted (e.g., it's the bootstrap stack creating the encryption key itself), open an issue — that's a known design wart, not a suppression candidate.

## Troubleshooting

**Suppression doesn't match.** Print the URN with `pulumi stack --show-urns | grep <name>`. URNs are exact — typos in the project name, stack name, or resource name break the match. For globs, `urnScope: "urn:pulumi:prod::*"` matches every resource in the prod stack; trailing `*` is the only glob form supported.

**Suppression matches but rule still fires.** The expiry has passed. Check `expiresAt` against today's date.

**`Suppression` type doesn't import.** It's exported from `@hulumi/policies` (root). If you only imported `hulumiHardeningPack` from `@hulumi/policies/aws/packs/hulumi-hardening`, also `import type { Suppression } from "@hulumi/policies"`.

## See also

- [packages/policies/src/aws/suppressions.ts](../../packages/policies/src/aws/suppressions.ts) — the matcher and type definitions.
- [policy-pack-rollout.md](./policy-pack-rollout.md) — bigger-picture cookbook for adopting the pack.
- [tiers.md § HulumiHardeningPack — rule matrix](../tiers.md#hulumihardeningpack--rule-matrix) — what each rule actually checks.
