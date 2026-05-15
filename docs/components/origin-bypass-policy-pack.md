# Origin Bypass Policy Pack

`HulumiOriginBypassPack` catches Cloudflare DNS records that point directly at
public AWS load balancers without `CloudflareOriginIngress` evidence.

## Entry Point

```bash
pulumi up --policy-pack node_modules/@hulumi/policies/platform/packs/origin-bypass
```

## Stable Rule IDs

| Rule ID                                  | Enforcement | Purpose                                                                                                                                 |
| ---------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `X_ORIGIN_1_NO_PUBLIC_AWS_ORIGIN_BYPASS` | advisory    | Report Cloudflare public-app DNS records whose target ends in `.elb.amazonaws.com` when no tunnel or allowlist+AOP evidence is present. |

The rule starts as advisory because public DNS and origin topology can be
assembled across stacks. Promotion to mandatory should wait for M5 sandbox
fixtures that prove the rule can identify origin evidence without creating
unmanageable false positives.

`CloudflareOriginIngress` evidence is matched by hostname. A tunnel or
allowlist/AOP component for `app.example.com` does not suppress an advisory for
`api.example.com`, even when both resources are present in the same Pulumi
stack.
