# @hulumi/cloudflare-baseline

Hardened Pulumi components for Cloudflare edge posture.

M1 introduces two primitives:

- `ZoneFoundation` enables DNSSEC and secure zone TLS settings for an existing Cloudflare zone.
- `PublicHostname` creates public DNS records with proxied application traffic as the default and an explicit acknowledgement path for DNS-only public application records.

M2 adds edge-defense primitives:

- `EdgeWafBaseline` creates managed WAF rulesets where the declared Cloudflare plan supports them, bounded custom WAF rules, and route rate-limit helpers.
- `BotProtectionBaseline` maps `simple`, `balanced`, and `granular` intent to plan-aware bot controls and records unsupported or degraded controls in outputs.
- `ProtectedAdminHostname` creates Cloudflare Access application and allow-policy resources for admin, internal, and preview hostnames.

```ts
import { PublicHostname, ZoneFoundation } from "@hulumi/cloudflare-baseline";

const zone = new ZoneFoundation("app-zone", {
  tier: "startup-hardened",
  zoneId: "zone_123",
});

new PublicHostname("app", {
  tier: "startup-hardened",
  zoneId: zone.zoneId,
  hostname: "app.example.com",
  recordType: "CNAME",
  target: "origin.example.net",
  purpose: "public-app",
});
```

DNS-only public application records require `acknowledgeDnsOnlyExposure: true` and a non-empty `dnsOnlyJustification`. Use that path only for a bounded migration or when another origin-control layer is already in place.

```ts
import {
  BotProtectionBaseline,
  EdgeWafBaseline,
  ProtectedAdminHostname,
  loginRateLimitRule,
} from "@hulumi/cloudflare-baseline";

new EdgeWafBaseline("edge", {
  tier: "startup-hardened",
  zoneId: "zone_123",
  plan: "business",
  enableManagedRulesets: true,
  rateLimitRules: [loginRateLimitRule({ pathPrefix: "/login" })],
});

new BotProtectionBaseline("bots", {
  tier: "startup-hardened",
  zoneId: "zone_123",
  plan: "enterprise",
  intent: "granular",
});

new ProtectedAdminHostname("admin", {
  tier: "startup-hardened",
  zoneId: "zone_123",
  accountId: "acct_123",
  hostname: "admin.example.com",
  allowedEmailDomains: ["example.com"],
});
```

## Install And Import Paths

```bash
pnpm add @hulumi/cloudflare-baseline @pulumi/cloudflare@6.15.0 @pulumi/pulumi@3.232.0
```

```ts
import {
  BotProtectionBaseline,
  EdgeWafBaseline,
  ProtectedAdminHostname,
  PublicHostname,
  ZoneFoundation,
} from "@hulumi/cloudflare-baseline";
```

## Plan Caveats

- Managed WAF rulesets require Cloudflare Business or Enterprise plan support.
- Granular bot scoring is Enterprise-only; lower plans report unsupported or degraded controls rather than silently claiming coverage.
- DNSSEC may require registrar DS-record handoff outside Pulumi.
- Real provider testing is opt-in: `pnpm --filter @hulumi/cloudflare-baseline test:integration` skips unless `HULUMI_CLOUDFLARE_INTEGRATION=1`, `CLOUDFLARE_API_TOKEN`, `HULUMI_CLOUDFLARE_ACCOUNT_ID`, and `HULUMI_CLOUDFLARE_ZONE_ID` are set.

## Verifying SLSA Attestations

Every published tarball ships with GitHub Artifact Attestations provenance
from the reusable `sign-and-publish.yml` release lane. Verify before
installing:

```bash
pnpm pack @hulumi/cloudflare-baseline@1.3.2 --pack-destination .
gh attestation verify ./hulumi-cloudflare-baseline-1.3.2.tgz \
  --repo kerberosmansour/hulumi
```
