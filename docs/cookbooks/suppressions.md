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
    ruleId: "HULUMI-H1",
    urnScope: "urn:pulumi:prod::your-stack::aws:s3/bucketV2:BucketV2::legacy-bucket",
    reason: "Imported pre-Hulumi; migration tracked in #JIRA-1234.",
    expiresAt: "2027-01-31",
  },
];

export { hulumiHardeningPack, suppressions };
```

`Suppression` shape (from [packages/policies/src/aws/suppressions.ts](../../packages/policies/src/aws/suppressions.ts)):

| Field       | Required | Notes                                                                                                         |
| ----------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `ruleId`    | yes      | Exact public rule ID, e.g. `HULUMI-H1`.                                                                       |
| `reason`    | yes      | Nonblank human-readable explanation and tracking reference.                                                   |
| `urnScope`  | yes      | Exact Pulumi URN, a non-global URN prefix ending in one `*`, or exact `stack` for a stack-level rule.         |
| `expiresAt` | yes      | Canonical future `YYYY-MM-DD` or UTC timestamp. Invalid, noncanonical, current, and past values do not match. |

### 2. Run the preview

```bash
pulumi preview --policy-pack ./policies
```

If the suppression matches, the built-in rule does not emit that violation.
Other resources still fail the same rule normally. The shared matcher returns
the reason to callers that record separate exception evidence.

### 3. Set yourself a calendar reminder

A suppression is a debt. The expiry date is its repayment plan — once it lapses, the rule fires again and CI breaks. That's the point. The expiry forces you to either fix the underlying issue or consciously renew the exception.

> Tip: pair this with a `/schedule` reminder if you use Claude Code:
> "In two weeks, open a PR migrating `legacy-bucket` to `SecureBucket`."

## Verify

- A `pulumi preview` run shows the suppressed violation as **suppressed**, not silently absent.
- A second resource that doesn't match the `urnScope` still fails the same rule.
- After the `expiresAt` date passes, the suppression no longer matches (the matcher rejects expired entries — see `matchSuppression` in `packages/policies/src/aws/suppressions.ts`).
- Your exception review records the same rule, scope, reason, and expiry as the
  configuration. The built-in pack does not claim an external audit sink.

## Anti-patterns

**Suppressing a whole rule with no `urnScope` or `expiresAt`.** The matcher
ignores this malformed entry and keeps the rule active. Use an exact bounded
scope and future expiry instead of trying to create a global disable.

**Suppressing without a JIRA / GitHub issue link in `reason`.** The whole point of `reason` is that the next person reading the diff understands why. "needed for legacy" is not a reason; "imported pre-Hulumi; migration tracked in #JIRA-1234" is.

**Suppressing `H2` (state backend encryption).** Don't. If you have an unencrypted state backend, fix it; suppressing `H2` is exactly the kind of "make the warning go away" move that bites in an audit. If your state backend genuinely cannot be encrypted (e.g., it's the bootstrap stack creating the encryption key itself), open an issue — that's a known design wart, not a suppression candidate.

## Troubleshooting

**Suppression doesn't match.** Print the URN with `pulumi stack --show-urns | grep <name>`. URNs are exact — typos in the project name, stack name, or resource name break the match. For prefixes, `urnScope: "urn:pulumi:prod::*"` matches resources beneath that non-global prefix; one trailing `*` is the only wildcard form supported. Stack-level rules require `urnScope: "stack"`.

**Suppression matches but rule still fires.** Check that `reason` is nonblank,
the scope is explicit, and `expiresAt` is a canonical future date or UTC
timestamp. Offset timestamps and invalid calendar dates fail closed.

**`Suppression` type doesn't import.** It's exported from `@hulumi/policies` (root). If you only imported `hulumiHardeningPack` from `@hulumi/policies/aws/packs/hulumi-hardening`, also `import type { Suppression } from "@hulumi/policies"`.

## See also

- [packages/policies/src/aws/suppressions.ts](../../packages/policies/src/aws/suppressions.ts) — the matcher and type definitions.
- [policy-pack-rollout.md](./policy-pack-rollout.md) — bigger-picture cookbook for adopting the pack.
- [tiers.md § HulumiHardeningPack — rule matrix](../tiers.md#hulumihardeningpack--rule-matrix) — what each rule actually checks.
