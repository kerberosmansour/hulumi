# ZoneFoundation

`ZoneFoundation` is the first Cloudflare zone primitive in `@hulumi/cloudflare-baseline`.

It manages the Cloudflare-side settings Hulumi needs before higher-level edge controls compose around the zone:

- DNSSEC desired state through `cloudflare.ZoneDnssec`.
- SSL/TLS origin mode through a zone `ssl` setting, defaulting to `strict`.
- Optional HTTPS/TLS hygiene settings when the caller supplies them.

```ts
import { ZoneFoundation } from "@hulumi/cloudflare-baseline";

const zone = new ZoneFoundation("app-zone", {
  tier: "startup-hardened",
  zoneId: "zone_123",
  settings: {
    minTlsVersion: "1.2",
    alwaysUseHttps: true,
    automaticHttpsRewrites: true,
  },
});

export const cloudflareZoneId = zone.zoneId;
export const cloudflareDnssecStatus = zone.dnssecStatus;
export const cloudflareDsRecord = zone.dsRecord;
```

## Inputs

| Field          | Required | Notes                                                                              |
| -------------- | -------- | ---------------------------------------------------------------------------------- |
| `tier`         | yes      | `sandbox` or `startup-hardened`; invalid strings throw during construction.        |
| `zoneId`       | yes      | Existing Cloudflare zone identifier. Empty literal strings are rejected.           |
| `enableDnssec` | no       | Defaults to enabled. Passing `false` records an explicit disabled desired state.   |
| `sslMode`      | no       | `strict` by default; `full` is available for migration cases.                      |
| `settings`     | no       | Optional `minTlsVersion`, `alwaysUseHttps`, and `automaticHttpsRewrites` settings. |

## Outputs

| Field             | Meaning                                                       |
| ----------------- | ------------------------------------------------------------- |
| `zoneId`          | The zone ID supplied by the caller.                           |
| `dnssecStatus`    | Provider-reported DNSSEC status when available.               |
| `dsRecord`        | Provider-reported DS record material when available.          |
| `sslMode`         | Effective SSL mode requested by the component.                |
| `appliedControls` | Machine-readable list of controls requested by the component. |

`ZoneFoundation` does not create a Cloudflare zone. It deliberately starts from an existing zone ID so ownership, registrar handoff, and production DNS migration remain explicit.
