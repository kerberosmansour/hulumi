# EKS Service Through Cloudflare Tunnel

Use `CloudflareOriginIngress` in `mode: "tunnel"` when the origin should not
expose a public load balancer.

```ts
import * as pulumi from "@pulumi/pulumi";
import { CloudflareOriginIngress } from "@hulumi/platform-patterns";

new CloudflareOriginIngress("api", {
  tier: "startup-hardened",
  mode: "tunnel",
  cloudflareAccountId: "acct_123",
  hostname: "api.example.com",
  service: "http://api.default.svc.cluster.local:8080",
  httpHostHeader: "api.default.svc.cluster.local",
  additionalRoutes: [
    {
      hostname: "proxy.example.com",
      service: "http://proxy.default.svc.cluster.local:8080",
      httpHostHeader: "proxy.default.svc.cluster.local",
      runtime: { kind: "eks", automation: "managed-contract" },
    },
  ],
  tunnelSecret: pulumi.secret("base64-tunnel-secret"),
  runtime: { kind: "eks", automation: "managed-contract" },
});
```

Battle-test notes:

- Confirm the parent `CloudflareOriginIngress` inputs omit `tunnelSecret` and
  the tunnel child input is recorded as a Pulumi secret. The component forces
  child secrecy even for a literal, but callers should mark the value secret
  at the configuration boundary too.
- Verify the serialized tunnel config includes every hostname binding and ends with the `http_status:404` catch-all.
- For Istio or other virtual-host routing, verify each route's `httpHostHeader` matches the internal service FQDN expected by the origin.
- Verify the EKS service is reachable only through the tunnel path.
- Record the Cloudflare plan and any unsupported bot/WAF controls in the
  battle-test checklist.
