# ALB Origin Restricted To Cloudflare Plus AOP

Use `CloudflareOriginIngress` in `allowlistAop` mode when an AWS load balancer
must remain the origin but should accept only Cloudflare-sourced traffic.

```ts
import { CloudflareOriginIngress } from "@hulumi/platform-patterns";

new CloudflareOriginIngress("alb-origin", {
  tier: "startup-hardened",
  mode: "allowlistAop",
  cloudflareZoneId: "zone_123",
  hostname: "app.example.com",
  cloudflareSourceCidrBlocks: ["203.0.113.0/24"],
  loadBalancerSecurityGroupId: "sg-lb",
  targetSecurityGroupId: "sg-target",
  originPort: 443,
  originCertificateReference: "ssm:/edge/origin-cert",
  authenticatedOriginPullCertificateId: "cert_123",
  aopMode: "hostname",
});
```

Battle-test notes:

- Use current Cloudflare source CIDRs, not the documentation placeholder above.
- Verify load-balancer security group ingress and target security group ingress.
- Keep origin certificate references as references only; do not write private
  key material to Pulumi state or docs.
