# Sandbox account — bootstrap

The Hulumi M3 weekly integration workflow runs against a dedicated AWS
sandbox account, separate from any production or shared workload
account. This document is the runbook for setting that account up:
account creation, OIDC trust, IAM role, cost guardrails, GitHub
configuration, and teardown.

## Why a dedicated account

- **Blast-radius isolation**: M3 deploys account-wide services
  (CloudTrail multi-region, GuardDuty, Security Hub, Config recorder,
  IAM password policy). In a shared account these would conflict with
  existing workloads.
- **Drift-classifier dependency**: M4's drift classifier uses the
  `hulumi:iac-role=true` tag on the IAM principal as the
  CloudTrail-attribution signal. Mixing the IaC role with human SSO
  identities defeats this attribution.
- **Cost containment**: A dedicated account has its own budget alarm
  and per-account Cost Explorer view. Orphaned resources in a shared
  account get lost in the noise.
- **SCP target**: M5 ships an `docs/deployment/scp.json` Service
  Control Policy template that constrains what the IaC role can do.
  The SCP only makes sense applied to a dedicated OU.

## Bootstrap — one-time setup (~15–30 minutes)

### 1. Create the AWS account

If you use AWS Organizations:

- Organizations console → **Add account** → name `hulumi-sandbox` →
  email `<your-email>+hulumi-sandbox@<domain>` (Gmail-style `+`
  aliasing works; the email must be globally unique because each AWS
  account has a per-account root user).

If you don't use Organizations: standalone signup at aws.amazon.com.

Capture the new **12-digit account ID**.

### 2. Apply account-level tags

Organizations console → Accounts → click `hulumi-sandbox` → Tags →
**Add tag** four times:

| Key                   | Value                                       |
| --------------------- | ------------------------------------------- |
| `Environment`         | `sandbox`                                   |
| `Purpose`             | `hulumi-integration-testing`                |
| `Owner`               | `<your-handle>` (or your work email / team) |
| `hulumi:account-role` | `sandbox`                                   |

### 3. Assign Identity Center access (skip if you don't use it)

If your management account runs IAM Identity Center:

- IAM Identity Center → AWS accounts → click `hulumi-sandbox` →
  **Assign users or groups** → pick yourself → assign your
  permission set (e.g. `sherif-sso-admin` or equivalent).
- Sign out, sign back into the SSO portal, switch into the new
  account. Use this for all manual operations from here on.

If you don't use Identity Center, the default
`OrganizationAccountAccessRole` is assumable from the management
account; use it for the rest of bootstrap.

### 4. Create the GitHub OIDC identity provider

In the new account's IAM console:

- **Identity providers** → **Add provider** → **OpenID Connect**.
- Provider URL: `https://token.actions.githubusercontent.com`
- Audience: `sts.amazonaws.com`
- Click **Get thumbprint** → **Add provider**.

This is a one-time step per account.

### 5. Create the IaC role

IAM → **Roles** → **Create role** → **Custom trust policy**, paste
(replacing `<SANDBOX_ACCOUNT_ID>` with your 12-digit ID):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<SANDBOX_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:kerberosmansour/hulumi:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

The strict `sub` filter accepts only workflows running against the
`main` branch of `kerberosmansour/hulumi`. PRs from feature branches
and forks cannot assume this role.

- **Permissions**: attach `AdministratorAccess`. Yes, that's wide —
  but the account is dedicated and isolated, M5's SCP template will
  constrain it later, and trying to scope down to exactly the
  CloudTrail/Config/GuardDuty/SecurityHub/IAM/KMS/S3 actions M3 needs
  takes ~150 lines of IAM JSON we'd then maintain. The
  dedicated-account boundary is doing the security work here.
- **Role name**: `hulumi-sandbox-iac-role`.
- **Tags**:

  | Key               | Value  |
  | ----------------- | ------ |
  | `hulumi:iac-role` | `true` |

  This tag is **mandatory**. It satisfies HulumiHardeningPack's H3
  rule (advisory in M3, mandatory in M5) and is the
  CloudTrail-attribution signal M4's drift classifier reads.

After **Create role**, copy the **role ARN** at the top of the role's
detail page.

### 6. Cost budget alarm

Account menu (top-right) → **Billing and Cost Management** → **Budgets**
→ **Create budget**:

- Use a template → **Monthly cost budget**.
- Name: `hulumi-sandbox-monthly`.
- Amount: **$20**.
- Email: yours.
- Create.

This alerts at 85% spend (~$17). Optionally add a $50 hard alarm.
Neither auto-disables resources — they email you. The weekly workflow's
`pulumi destroy` step is what actually keeps cost down; the alarm is
the safety net for the rare orphaned-resource case.

### 7. Publish the role + region to GitHub

`https://github.com/kerberosmansour/hulumi/settings/variables/actions`
→ **Variables** tab (NOT Secrets) → **New repository variable** three
times:

| Name                        | Value                                                    |
| --------------------------- | -------------------------------------------------------- |
| `AWS_SANDBOX_ACCOUNT_ID`    | the 12-digit ID                                          |
| `AWS_SANDBOX_OIDC_ROLE_ARN` | `arn:aws:iam::<account-id>:role/hulumi-sandbox-iac-role` |
| `AWS_SANDBOX_REGION`        | `us-east-1` (or your choice)                             |

Variables are not secrets — the role ARN is not sensitive on its own
(only the OIDC token is, and that's ephemeral and scoped to your repo).

### 8. (Optional) Pulumi Cloud token for real-AWS runs

The weekly workflow runs in **CONTRACT-ONLY mode** without
`PULUMI_ACCESS_TOKEN`. To enable the full
`pulumi up` → `pulumi destroy` cycle:

- Sign in at <https://app.pulumi.com> (free for individuals).
- Account settings → **Access Tokens** → **Create token** → name
  `hulumi-weekly-integration`.
- Repo settings → **Secrets and variables** → **Actions** → **Secrets**
  tab → **New repository secret**:

  | Name                  | Value               |
  | --------------------- | ------------------- |
  | `PULUMI_ACCESS_TOKEN` | the `pul-...` token |

Until this secret is set, the weekly workflow runs the mock unit +
integration test paths only and logs that it's in contract-only mode.

## Verification

After bootstrap, manually trigger
`.github/workflows/weekly-integration.yml` via
`gh workflow run weekly-integration.yml -f tier=sandbox`. Expect:

- The OIDC step assumes `hulumi-sandbox-iac-role` and prints the
  matching `Account: <id>` from `sts:GetCallerIdentity`.
- Mock test step passes 20+ tests.
- Real-AWS step is skipped if `PULUMI_ACCESS_TOKEN` is unset; runs
  `pulumi up` + `pulumi destroy` if set.

## Teardown — destroying the sandbox account

If the sandbox account is no longer needed:

1. Manually trigger the weekly workflow with `tier=both` once more to
   confirm no orphans exist.
2. Empty + delete remaining S3 buckets (CloudTrail logs, Config
   delivery, etc.) — M3 doesn't delete them automatically because
   `pulumi destroy` retains versioned buckets.
3. Disable + delete: GuardDuty detector, Security Hub hub, Config
   recorder, KMS keys (KMS keys go through a 30-day pending-deletion
   window).
4. Organizations console → Accounts → `hulumi-sandbox` → **Close
   account**. AWS holds the account for 90 days before fully removing
   it; during that window you can reopen.
