# ProtectedAdminHostname

`ProtectedAdminHostname` wraps a Cloudflare Access application and allow policy for admin, internal, and preview hostnames.

## Behavior

- Requires at least one authorization allow-list input: email, email domain, or Access group ID.
- Uses identity-provider IDs only as application `allowedIdps` login choices. They are never policy Include selectors and do not authorize users.
- Rejects hostnames without an authorization allow-list before registering provider resources.
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
  allowedIdentityProviderIds: ["idp_123"],
  sessionDuration: "8h",
});
```

Use `requiredIdentitySelectors` as evidence that the protected hostname has an explicit
authorization allow-list. It reports emails, email domains, and Access group IDs; it does not
report identity-provider routing.

## Migrating provider-only configurations

An identity provider proves where authentication occurred, not that the user belongs to an
authorized population. Cloudflare combines policy Include entries with OR logic, so using a
Login Methods entry beside an email or group makes either one sufficient. The component now
rejects an `allowedIdentityProviderIds`-only declaration. Keep those IDs to constrain the login
picker and add an independent authorization selector:

```ts
new ProtectedAdminHostname("admin-access", {
  tier: "startup-hardened",
  zoneId: "zone_123",
  hostname: "admin.example.com",
  allowedIdentityProviderIds: ["idp_123"],
  allowedAccessGroupIds: ["access_group_admins"],
});
```

Provider references: [Access policy rule semantics](https://developers.cloudflare.com/reference-architecture/design-guides/designing-ztna-access-policies/), [common policy misconfigurations](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/), and [application `allowed_idps`](https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/applications/methods/create/).
