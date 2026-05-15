# Cloudflare Policy Packs

M4 adds `HulumiCloudflareHardeningPack` for preview-time guardrails around
Cloudflare edge configuration.

## Entry Point

```bash
pulumi up --policy-pack node_modules/@hulumi/policies/cloudflare/packs/hulumi-hardening
```

## Stable Rule IDs

| Rule ID                                  | Enforcement | Purpose                                                                                                                                                         |
| ---------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CF_DNS_1_NO_DNS_ONLY_PUBLIC_APP_RECORD` | mandatory   | Reject raw proxy-eligible public application DNS records that set `proxied=false` outside `PublicHostname`, unless a scoped suppression has a non-empty reason. |
| `CF_DNSSEC_1_REQUIRE_PUBLIC_ZONE_DNSSEC` | mandatory   | Require public Cloudflare zones to have `ZoneFoundation` or `ZoneDnssec` evidence, unless a migration suppression has a non-empty reason.                       |
| `CF_ORIGIN_1_REQUIRE_SECURE_ORIGIN_MODE` | mandatory   | Require application hostnames to have `CloudflareOriginIngress` tunnel or allowlist+AOP evidence.                                                               |

## Suppression Shape

The pack uses the existing Hulumi suppression shape:

```ts
{
  ruleId: "CF_DNS_1_NO_DNS_ONLY_PUBLIC_APP_RECORD",
  reason: "Legacy cutover window tracked in EDGE-12.",
  urnScope: "urn:pulumi:prod::edge::*",
  expiresAt: "2026-06-30"
}
```

Empty reasons are ignored. Suppressions are intended for migrations, not for
normal operation.

## Evidence Matching

Stack validators require evidence to match the specific resource under review:

- `CF_DNSSEC_1_REQUIRE_PUBLIC_ZONE_DNSSEC` accepts `ZoneDnssec` evidence only
  when it targets the same zone id/zone name, or when Pulumi dependency
  metadata ties the DNSSEC resource to that zone.
- `CF_ORIGIN_1_REQUIRE_SECURE_ORIGIN_MODE` accepts
  `CloudflareOriginIngress` evidence only when its `hostname` matches the
  public application DNS record hostname.

Unrelated DNSSEC or ingress resources in the same stack do not suppress
violations for other zones or hostnames.
