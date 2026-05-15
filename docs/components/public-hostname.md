# PublicHostname

`PublicHostname` creates public Cloudflare DNS records with application traffic proxied by default.

The component is intentionally stricter than raw DNS record creation. A public application `A`, `AAAA`, or `CNAME` record defaults to Cloudflare proxy mode. DNS-only public application records are allowed only when the caller gives both an acknowledgement flag and a non-empty justification.

```ts
import { PublicHostname } from "@hulumi/cloudflare-baseline";

new PublicHostname("app", {
  tier: "startup-hardened",
  zoneId: "zone_123",
  hostname: "app.example.com",
  recordType: "CNAME",
  target: "origin.example.net",
  purpose: "public-app",
});
```

For a bounded migration where DNS-only exposure is intentional:

```ts
new PublicHostname("legacy-app", {
  tier: "sandbox",
  zoneId: "zone_123",
  hostname: "legacy.example.com",
  recordType: "A",
  target: "203.0.113.10",
  purpose: "public-app",
  proxied: false,
  acknowledgeDnsOnlyExposure: true,
  dnsOnlyJustification: "temporary migration window with separate origin controls",
});
```

## Inputs

| Field                        | Required    | Notes                                                                                    |
| ---------------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| `tier`                       | yes         | `sandbox` or `startup-hardened`; invalid strings throw during construction.              |
| `zoneId`                     | yes         | Existing Cloudflare zone identifier. Empty literal strings are rejected.                 |
| `hostname`                   | yes         | Fully qualified hostname; wildcards and missing TLDs are rejected.                       |
| `recordType`                 | yes         | `A`, `AAAA`, `CNAME`, `MX`, or `TXT`.                                                    |
| `target`                     | yes         | DNS record content.                                                                      |
| `purpose`                    | yes         | `public-app` for HTTP application traffic, or `dns` for non-application records.         |
| `proxied`                    | no          | Defaults to `true` for proxy-eligible public applications; omitted for DNS-only records. |
| `acknowledgeDnsOnlyExposure` | conditional | Required with `dnsOnlyJustification` when a public application sets `proxied: false`.    |
| `dnsOnlyJustification`       | conditional | Non-empty reason recorded in a structured security event.                                |

## Outputs

| Field                  | Meaning                                                                      |
| ---------------------- | ---------------------------------------------------------------------------- |
| `hostname`             | Provider-reported DNS record name.                                           |
| `recordId`             | Provider record ID.                                                          |
| `proxied`              | Effective proxy intent.                                                      |
| `protectionMode`       | `proxied` or `dns-only`.                                                     |
| `dnsOnlyJustification` | Justification captured for acknowledged DNS-only public application records. |

`PublicHostname` does not configure WAF, bot management, Access, tunnel mode, or AWS origin controls. Those surfaces belong to later edge-platform milestones.
