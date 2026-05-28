---
title: AWS Organization Security Foundation
description: Delegated-admin, central configuration, S3 account block, and SCP guardrails for a multi-account AWS organization.
---

# AWS Organization Security Foundation

`AwsOrganizationSecurityFoundation` is the organization-level companion to `AccountFoundation`. It configures the security account as delegated administrator for GuardDuty, Security Hub, AWS Config, and IAM Access Analyzer, creates central Security Hub and Config aggregation resources, enforces account-level S3 Public Access Block, and renders a bounded Hulumi SCP set.

## When to use it

Use this when you have a management account plus separate security and log archive accounts, and you want organization guardrails before workload accounts become production-facing. Use `AccountFoundation` inside each account after the organization posture exists.

## TypeScript

```ts
import { AwsOrganizationSecurityFoundation } from "@hulumi/baseline/aws";

export const org = new AwsOrganizationSecurityFoundation("org", {
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

## Guardrails

| Guardrail ID                     | Purpose                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| `deny-leave-organization`        | Blocks member accounts leaving the organization except through exempt rollout roles. |
| `deny-disable-security-services` | Blocks disabling or deleting core detective services.                                |
| `deny-public-s3-policy-changes`  | Blocks account/bucket public-access weakening actions.                               |

Startup-Hardened defaults to the full set. Sandbox may pass `scps: []` and `scpTargetIds: []`; it still renders the central service resources for mocked validation.

## Policy pack

The matching CrossGuard pack is `HulumiAwsOrgHardeningPack` at `@hulumi/policies/aws-org/packs/hulumi-aws-org-hardening`.

| Rule           | Enforces                                             |
| -------------- | ---------------------------------------------------- |
| `HULUMI-ORG-1` | delegated security administrators are present        |
| `HULUMI-ORG-2` | bootstrap and steady-state roles are separated       |
| `HULUMI-ORG-3` | approved SCP guardrail set exists                    |
| `HULUMI-ORG-4` | S3 account Public Access Block has all four switches |
| `HULUMI-ORG-5` | S3 account Public Access Block is present            |
| `HULUMI-ORG-6` | sandbox tier without SCPs emits an advisory          |

## Outputs

- `delegatedAdministratorServicePrincipals`
- `configAggregatorArn`
- `accountPublicAccessBlockId`
- `securityHubOrganizationConfigurationId`
- `guardrailIds`
- `scpPolicyIds`
- `scpAttachmentIds`

## Safety notes

- `homeRegion` must be included in `enabledRegions`.
- Startup-Hardened requires at least one SCP target unless `attachScps: false` is explicitly set.
- `bootstrapRoleArn` and `steadyStateRoleArn` must differ when both are literal strings.
- Account IDs, OU IDs, root IDs, and role ARNs in examples are placeholders.

## See also

- [AWS organization guardrails cookbook](../cookbooks/aws-organization-guardrails.md)
- [AccountFoundation](./account-foundation.md)
- [SCP deployment guide](../deployment/scp-guide.md)
