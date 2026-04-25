# SCP guide — `docs/deployment/scp.json`

The `hulumi:iac-role=true` tag is load-bearing: M2's
`HulumiHardeningPack` H3 (mandatory in v1.0.0) and M4's drift
classifier both consult it as proof-of-IaC. If a non-IaC principal
can add the tag to itself, both checks become trivially bypassable.
The SCP at [`scp.json`](scp.json) makes the tag tamper-evident at
AWS Organizations level: only the named IaC role list can add or
remove the tag from any IAM principal.

This document covers customizing, applying, and reverting the SCP.

## Customize

The default SCP refuses `iam:TagRole` / `iam:UntagRole` /
`iam:TagUser` / `iam:UntagUser` on the `hulumi:iac-role` tag key
unless the calling principal is in the IaC role list. Replace the
two `__REPLACE_ME__` placeholders with your AWS account IDs:

```sh
# macOS / GNU sed compatibility — adjust ARN structure for your org.
sed -i.bak \
  -e 's|__REPLACE_ME__:role/hulumi-prod-iac-role|arn:aws:iam::PROD_ACCOUNT_ID:role/hulumi-prod-iac-role|g' \
  -e 's|__REPLACE_ME__:role/hulumi-sandbox-iac-role|arn:aws:iam::SANDBOX_ACCOUNT_ID:role/hulumi-sandbox-iac-role|g' \
  scp.json && rm -f scp.json.bak
```

Add additional IaC-role ARNs to the `aws:PrincipalArn` array as your
org grows. The wildcard form `arn:aws:iam::*:role/hulumi-*-iac-role`
also works if you adopt a consistent naming pattern.

## Validate

Before applying, validate the JSON shape:

```sh
aws organizations validate-policy \
  --type SERVICE_CONTROL_POLICY \
  --content file://docs/deployment/scp.json
```

Expected output: `{ "Findings": [] }`. Any finding (e.g. unresolved
placeholder, malformed condition key) blocks application.

## Apply

Two paths:

**A. AWS Organizations console**:

1. Sign in to the management account.
2. AWS Organizations → **Policies** → **Service control policies** →
   **Create policy**.
3. Name: `hulumi-iac-role-tag-protection`. Description: "Protects
   the hulumi:iac-role tag from non-IaC principals — paired with
   HulumiHardeningPack H3 mandatory."
4. Paste the customized `scp.json` content.
5. **Create policy**.
6. Attach to the OU containing the Hulumi-managed accounts (or to
   the root, if you want org-wide protection).

**B. Pulumi-managed (recommended for org-as-code shops)**:

```ts
import * as aws from "@pulumi/aws";
import { readFileSync } from "node:fs";

const policy = new aws.organizations.Policy("hulumi-iac-role-tag-protection", {
  type: "SERVICE_CONTROL_POLICY",
  content: readFileSync("docs/deployment/scp.json", "utf8"),
  description: "Protects hulumi:iac-role tag from non-IaC principals.",
});

new aws.organizations.PolicyAttachment("hulumi-iac-role-tag-protection-attach", {
  policyId: policy.id,
  targetId: "ou-xxxx-xxxxxxxx", // your hulumi-managed OU
});
```

## Test

After application, attempt to add the tag from a non-IaC principal:

```sh
# As your SSO admin (NOT the IaC role) in the sandbox account:
aws iam tag-role \
  --role-name some-test-role \
  --tags Key=hulumi:iac-role,Value=true
```

Expected: `AccessDeniedException` citing the SCP.

Then attempt the same operation from the IaC role itself:

```sh
# Assume hulumi-sandbox-iac-role first (via aws-vault or
# `aws sts assume-role`), then:
aws iam tag-role --role-name some-test-role \
  --tags Key=hulumi:iac-role,Value=true
```

Expected: succeeds.

## Revert

If the SCP causes operational pain (e.g. an emergency change
requires tagging a role from a non-IaC identity):

**A. Console**: AWS Organizations → Policies → select
`hulumi-iac-role-tag-protection` → **Targets** → detach from the OU.

**B. Pulumi**: comment out the `PolicyAttachment` resource and run
`pulumi up`.

**C. AWS CLI**:

```sh
aws organizations detach-policy \
  --policy-id <SCP_ID> \
  --target-id <OU_ID>
```

Detaching takes effect within minutes. The policy itself remains
defined (re-attach via the same step).

To delete the policy entirely (after detaching from all targets):

```sh
aws organizations delete-policy --policy-id <SCP_ID>
```

## SCP × H3 interaction

| SCP applied? | H3 enforcement | Practical behavior                                                                                       |
| ------------ | -------------- | -------------------------------------------------------------------------------------------------------- |
| yes          | mandatory      | IaC role auto-carries tag (created by your bootstrap workflow). Non-IaC principals cannot add tag. ✅    |
| yes          | advisory       | (downgrade scenario) IaC role still tagged; non-IaC principals still blocked at AWS level.               |
| no           | mandatory      | H3 fires on missing tag. Non-IaC principals could ADD the tag to themselves to bypass — operational gap. |
| no           | advisory       | M2/M3 default. Tag is informational only; no enforcement.                                                |

The v1.0.0 release ships SCP + mandatory H3 together. Adopting one
without the other leaves either an enforcement gap (H3 mandatory,
no SCP — bypassable) or an unenforced advisory (SCP applied, H3
still advisory — pre-flight checks pass on stacks that wouldn't
deploy in practice). M5's CHANGELOG breaking-change note ties the
two together explicitly.

## Forward-compatibility notes

- The SCP refuses Tag/Untag actions specifically. AWS may add new
  IAM tag-modification verbs in the future (e.g.
  `iam:CreateRole-with-tags-inline`); audit periodically.
- `aws:PrincipalArn` matching is case-insensitive. The placeholder
  text uses lowercase; your replacement values are matched
  case-insensitively.
- The SCP as written affects IAM role / user tagging only. Resource
  tagging (S3, KMS, etc.) is not constrained — Hulumi's resource
  tag schema (`hulumi:component`, `hulumi:tier`, `hulumi:controls`)
  uses a different namespace and is consumed by the drift
  classifier directly without this SCP-style protection.
