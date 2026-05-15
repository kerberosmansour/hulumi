# Hulumi Edge Platform Battle-Test Checklist

Status: Battle-test pending.

Use this checklist in the separate consumer project before calling the edge
platform generally battle-tested.

## Package versions

| Package                       | Version exercised | Result                        |
| ----------------------------- | ----------------- | ----------------------------- |
| `@hulumi/cloudflare-baseline` | pending           | Mock/policy-only in this repo |
| `@hulumi/platform-patterns`   | pending           | Mock/policy-only in this repo |
| `@hulumi/policies`            | pending           | Mock/policy-only in this repo |

## Environment

| Field           | Value   |
| --------------- | ------- |
| Cloudflare plan | pending |
| GitHub plan     | pending |
| AWS runtime     | pending |
| AWS region      | pending |

## Examples exercised

| Example                                      | Observed pass/fail | Evidence link |
| -------------------------------------------- | ------------------ | ------------- |
| EKS service through Cloudflare Tunnel        | pending            | pending       |
| ALB origin restricted to Cloudflare plus AOP | pending            | pending       |
| GitHub OIDC deployment pipeline              | pending            | pending       |
| Build provenance helper                      | pending            | pending       |

## Unsupported controls

| Control | Reason  | Follow-up |
| ------- | ------- | --------- |
| pending | pending | pending   |

## Cleanup evidence

| Provider   | Resource prefixes checked | Result  |
| ---------- | ------------------------- | ------- |
| Cloudflare | pending                   | pending |
| GitHub     | pending                   | pending |
| AWS        | pending                   | pending |

## Release-readiness note

The current repository evidence is Mock/policy-only for real Cloudflare,
GitHub, and AWS provider behavior. A release may proceed with battle-test
pending only when unit, mock, policy, linter, and documentation gates are
green and this checklist is linked from the PR.
