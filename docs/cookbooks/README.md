---
title: Hulumi cookbooks
description: Task-shaped recipes — pick the one that matches what you're trying to do, copy the snippet, adapt.
---

# Hulumi cookbooks

Cookbooks are short, focused recipes for the things people actually do with Hulumi. Every recipe ships a runnable code snippet, the full set of preconditions, and a "what to verify when you're done" list.

If you're brand new, start with the [Getting Started walkthrough](../getting-started.md). Cookbooks assume you've already done that or its equivalent.

## Index

| Recipe                                                                              | Status  | When to reach for it                                                                                                  |
| ----------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| [Bootstrap a new AWS account](./account-bootstrap.md)                               | shipped | Day-zero baseline for a fresh AWS account or sandbox.                                                                 |
| [Roll out AWS organization guardrails](./aws-organization-guardrails.md)            | shipped | You need delegated admins, central config, account S3 block, and bounded SCP posture across a multi-account org.      |
| [Roll out a secure Pulumi state backend](./secure-pulumi-state-backend.md)          | shipped | You need S3/KMS-backed Pulumi state, approved secrets-provider posture, and safe migration guidance.                  |
| [Adopt hardened AWS primitives](./aws-secure-primitives.md)                         | shipped | You need safer defaults for IAM deployment roles, workload roles, secrets, and EC2 launch templates.                  |
| [Roll out security detection families](./security-detection-foundation.md)          | shipped | You need finite alarm families for org, state, EKS, identity, CloudTrail/KMS/Config, and service disablement signals. |
| [Roll out GitHub runner governance](./runner-governance.md)                         | shipped | You need live GitHub environment evidence, OIDC-only deployment jobs, and finite self-hosted runner approvals.        |
| [Run the live validator](./live-validator.md)                                       | shipped | You need scheduled JSON, Markdown, and SARIF posture artifacts from read-only live-validation findings.               |
| [Wire drift detection into CI](./drift-detection.md)                                | shipped | You want a verdict on whether last night's diff is console drift or provider churn.                                   |
| [Roll out the Hulumi policy pack to an existing stack](./policy-pack-rollout.md)    | shipped | You haven't migrated to `SecureBucket` yet but want the safety net today.                                             |
| [Threat-model an AWS scenario before writing IaC](./threat-modeling.md)             | shipped | You're about to write infra and want a structured controls-aligned design doc first.                                  |
| [Verify SLSA provenance on a `@hulumi/*` tarball](./verify-provenance.md)           | shipped | Your supply-chain policy requires provenance verification before install.                                             |
| [Suppress a CrossGuard violation, on purpose](./suppressions.md)                    | shipped | You have a justified exception and need to document it without disabling the rule.                                    |
| [Run Istio sidecars under PSA "baseline"](./psa-baseline-istio-sidecar.md)          | shipped | You hit `non-default capabilities (container "istio-init" must not include "NET_ADMIN")` on a PSA-baseline namespace. |
| [Migrate from Terraform to Pulumi + Hulumi](./migration-from-terraform.md)          | shipped | You have an existing Terraform stack and want Pulumi+Hulumi without a destroy/recreate cycle.                         |
| [Adopt Hulumi inside an existing Pulumi project](./migration-mid-stack-adoption.md) | shipped | You're already on Pulumi and want to swap hand-rolled AWS resources for Hulumi components in-place.                   |

## Recipe template

When contributing a new cookbook, follow this shape so all of them stay scannable:

```markdown
---
title: <verb-leading title>
description: <one sentence — what does the reader walk away with?>
---

# <title>

## When to use this recipe

<2–3 sentence problem statement>

## Preconditions

- <bullet list of "you must have X installed / configured">

## Steps

1. <numbered, executable, copy-pastable>
2. ...

## Verify

- <bullet list of "if you did this right, you'll see…">

## Troubleshooting

- <symptom> → <cause / fix>

## See also

- <links to component reference, related cookbooks, lessons>
```

If a recipe needs more than ~150 lines, it probably wants to be split. If a recipe drifts from the underlying tests, the test wins — please open an issue.
