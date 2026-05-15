# EKS Service Through Cloudflare Tunnel

Use `CloudflareOriginIngress` in `mode: "tunnel"` when the origin should not
expose a public load balancer.

```ts
import { CloudflareOriginIngress } from "@hulumi/platform-patterns";

new CloudflareOriginIngress("api", {
  tier: "startup-hardened",
  mode: "tunnel",
  cloudflareAccountId: "acct_123",
  hostname: "api.example.com",
  service: "http://api.default.svc.cluster.local:8080",
  tunnelSecret: "base64-tunnel-secret",
  runtime: { kind: "eks", automation: "managed-contract" },
});
```

Battle-test notes:

- Verify the serialized tunnel config includes the hostname binding.
- Verify the EKS service is reachable only through the tunnel path.
- Record the Cloudflare plan and any unsupported bot/WAF controls in the
  battle-test checklist.
