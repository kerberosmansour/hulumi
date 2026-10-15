# Cloudflare Policy Packs

M4 adds `HulumiCloudflareHardeningPack` for preview-time guardrails around
Cloudflare edge configuration.

## Entry Point

```bash
pulumi up --policy-pack node_modules/@hulumi/policies/cloudflare/packs/hulumi-hardening
```

## Stable Rule IDs

| Rule ID                                  | Enforcement | Purpose                                                                                                                                                                                        |
| ---------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CF_DNS_1_NO_DNS_ONLY_PUBLIC_APP_RECORD` | mandatory   | Reject DNS-only public application records unless a concrete matching `PublicHostname` parent records explicit acknowledgement and a non-empty justification, or a scoped suppression applies. |
| `CF_DNSSEC_1_REQUIRE_PUBLIC_ZONE_DNSSEC` | mandatory   | Require public Cloudflare zones to have `ZoneFoundation` or `ZoneDnssec` evidence, unless a migration suppression has a non-empty reason.                                                      |
| `CF_ORIGIN_1_REQUIRE_SECURE_ORIGIN_MODE` | mandatory   | Require application hostnames to have a concrete, hostname-correlated tunnel or per-hostname AOP plus ALB mutual-TLS enforcement tuple.                                                        |

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

- `CF_DNS_1_NO_DNS_ONLY_PUBLIC_APP_RECORD` requires the DNS record's concrete
  parent to be present in the evaluated stack with the exact
  `PublicHostname` type, the same normalized hostname, `purpose: "public-app"`,
  `proxied: false`, `acknowledgeDnsOnlyExposure: true`, and a non-empty
  `dnsOnlyJustification`. A `PublicHostname` token in the URN type chain is not
  sufficient by itself.
- `CF_DNSSEC_1_REQUIRE_PUBLIC_ZONE_DNSSEC` accepts `ZoneDnssec` evidence only
  when it targets the same zone id/zone name, or when Pulumi dependency
  metadata ties the DNSSEC resource to that zone.
- `CF_ORIGIN_1_REQUIRE_SECURE_ORIGIN_MODE` first matches the component's
  `hostname` to the public application DNS record, then inspects its direct
  child resources. Tunnel mode requires one Cloudflare tunnel and bound
  config with the same account, the exact hostname route, TLS verification,
  and a terminal `http_status:404` fallback. Allowlist+AOP mode requires one
  enabled per-hostname AOP association, a version-pinned ALB trust store, an
  HTTPS listener with the fixed strong TLS policy and mutual-TLS `verify`
  mode, certificate-expiry enforcement, exact server certificate and target
  group, one exact source rule per admitted Cloudflare IPv4 range, and one
  target rule from the exact load-balancer security group.

Component tokens without those concrete children, and unrelated parent,
DNSSEC, ingress, trust-store, listener, or security-group resources in the
same stack, do not suppress violations.
