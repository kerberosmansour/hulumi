---
title: Roll out AWS organization guardrails
description: Add delegated-admin, central configuration, account-level S3 block, and SCP guardrails to a multi-account AWS organization.
---

# Roll out AWS organization guardrails

## When to use this recipe

Use this before production workloads land in member accounts. It gives the management account a bootstrap path, delegates daily security administration to the security account, and attaches a finite SCP set to roots or OUs you choose.

## Preconditions

- AWS Organizations is already enabled.
- You have management, security, and log archive account IDs.
- You have separate bootstrap and steady-state Pulumi roles.
- You know the root or OU IDs that should receive the SCP attachments.
- You have an IAM role ARN for AWS Config organization aggregation.

## Steps

1. Add the component to the management-account Pulumi program.

```ts
import { AwsOrganizationSecurityFoundation } from "@hulumi/baseline/aws";

new AwsOrganizationSecurityFoundation("org", {
  tier: "startup-hardened",
  managementAccountId: "111122223333",
  securityAccountId: "222233334444",
  logArchiveAccountId: "333344445555",
  homeRegion: "us-east-1",
  enabledRegions: ["us-east-1", "us-west-2"],
  configAggregatorRoleArn: "arn:aws:iam::222233334444:role/hulumi-config-aggregator",
  bootstrapRoleArn: "arn:aws:iam::111122223333:role/hulumi-bootstrap",
  steadyStateRoleArn: "arn:aws:iam::111122223333:role/hulumi-steady-state",
  scpTargetIds: ["r-root", "ou-prod"],
});
```

2. Run a preview with the org policy pack.

```bash
pulumi preview --policy-pack @hulumi/policies/aws-org/packs/hulumi-aws-org-hardening
```

3. Apply first to a non-production OU or a single test account target.

```bash
pulumi up
```

4. Promote the same guardrail IDs to broader roots or OUs once the test target is clean.

## Verify

- Delegated admin resources exist for GuardDuty, Security Hub, AWS Config, and IAM Access Analyzer.
- Security Hub central configuration exists in the home region.
- AWS Config has an organization aggregator.
- Account-level S3 Public Access Block has all four switches enabled.
- The rendered SCPs include only the curated `deny-*` guardrail IDs.

## Troubleshooting

**Startup-Hardened constructor rejects the stack.** Check for an empty account ID, a missing `scpTargetIds` entry, or the same ARN being used for both bootstrap and steady-state roles.

**Security Hub central configuration fails.** Confirm the delegated admin account is a member account, not the management account, and that the Security Hub delegated administrator step has completed.

**A sandbox org wants no SCP attachments.** Use `tier: "sandbox"`, `scps: []`, and `scpTargetIds: []`. Do not use this for production-facing accounts.

## See also

- [AWS Organization Security Foundation](../components/aws-organization-security-foundation.md)
- [Bootstrap a new AWS account](./account-bootstrap.md)
- [Policy pack rollout](./policy-pack-rollout.md)
