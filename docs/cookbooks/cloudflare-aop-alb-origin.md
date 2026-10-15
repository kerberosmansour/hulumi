# ALB Origin Restricted To Cloudflare Plus AOP

Use `CloudflareOriginIngress` in `allowlistAop` mode when an AWS load balancer
must remain the origin but should accept only Cloudflare-sourced traffic.

```ts
import { CLOUDFLARE_IPV4_ORIGIN_CIDRS, CloudflareOriginIngress } from "@hulumi/platform-patterns";

new CloudflareOriginIngress("alb-origin", {
  tier: "startup-hardened",
  mode: "allowlistAop",
  cloudflareZoneId: "zone_123",
  hostname: "app.example.com",
  cloudflareSourceCidrBlocks: CLOUDFLARE_IPV4_ORIGIN_CIDRS,
  loadBalancerSecurityGroupId: "sg-lb",
  targetSecurityGroupId: "sg-target",
  originPort: 443,
  loadBalancerArn:
    "arn:aws:elasticloadbalancing:eu-west-2:123456789012:loadbalancer/app/origin/123",
  originServerCertificateArn: "arn:aws:acm:eu-west-2:123456789012:certificate/server",
  originTargetGroupArn:
    "arn:aws:elasticloadbalancing:eu-west-2:123456789012:targetgroup/origin/456",
  aopCaBundleS3Bucket: "edge-trust",
  aopCaBundleS3Key: "aop/app-root-ca.pem",
  aopCaBundleS3ObjectVersion: "ca-version-1",
  authenticatedOriginPullCertificateId: "cert_123",
});
```

Battle-test notes:

- Generate a dedicated client-certificate CA and upload only its versioned
  public CA bundle to S3. Upload the issued leaf certificate and private key
  to Cloudflare through a separately controlled certificate workflow; never
  put the private key in component inputs, Pulumi state, or documentation.
- Keep the ALB server certificate in ACM. It is distinct from the client CA
  bundle used by the listener trust store.
- Verify the listener requests a client certificate, rejects an untrusted or
  expired certificate, accepts the configured Cloudflare certificate, and
  forwards only to the configured target group.
- Verify every load-balancer rule is a member of Cloudflare's published IPv4
  set and the target security group accepts traffic only from the exact
  load-balancer security group.
- Before migrating an existing listener or trust store, import it into the
  component's child URN or perform a reviewed replacement. Never deploy a
  second listener on an occupied ALB port.
- When Cloudflare changes its published ranges, update Hulumi through a
  reviewed release before changing security-group inputs.
