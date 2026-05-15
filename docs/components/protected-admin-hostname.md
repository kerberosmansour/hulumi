# ProtectedAdminHostname

`ProtectedAdminHostname` wraps a Cloudflare Access application and allow policy for admin, internal, and preview hostnames.

## Behavior

- Requires at least one allow-list input: email, email domain, Access group ID, or identity provider ID.
- Rejects hostnames without an identity allow-list before registering provider resources.
- Creates an Access application with HttpOnly cookies, strict SameSite cookies, binding cookies, and an inline allow policy.
- Creates a reusable Access policy when `accountId` is supplied.
- Does not create DNS records. Compose it with `PublicHostname` when the hostname also needs DNS.

## Example

```ts
import { ProtectedAdminHostname, PublicHostname } from "@hulumi/cloudflare-baseline";

new PublicHostname("admin-dns", {
  tier: "startup-hardened",
  zoneId: "zone_123",
  hostname: "admin.example.com",
  recordType: "CNAME",
  target: "origin.example.net",
  purpose: "public-app",
});

new ProtectedAdminHostname("admin-access", {
  tier: "startup-hardened",
  zoneId: "zone_123",
  accountId: "acct_123",
  hostname: "admin.example.com",
  allowedEmails: ["admin@example.com"],
  sessionDuration: "8h",
});
```

Use `requiredIdentitySelectors` as evidence that the protected hostname has an explicit allow-list.
