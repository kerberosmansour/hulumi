# CloudflareOriginIngress

`CloudflareOriginIngress` models the two supported edge-to-origin patterns for this runbook:

- `mode: "tunnel"` for Cloudflare Tunnel.
- `mode: "allowlistAop"` for Cloudflare source restrictions plus Authenticated Origin Pulls.

## Tunnel Mode

Tunnel mode creates a Cloudflare tunnel and remote tunnel config with a public hostname binding. The `runtime` field records whether the workload runtime is automated by the component or cookbook-only.

`tunnelSecret` is omitted from the parent component inputs and is forced to a Pulumi secret on the tunnel child. Callers should still use `pulumi.secret(...)` at the configuration boundary so the value remains secret before it reaches the component.

```ts
import * as pulumi from "@pulumi/pulumi";
import { CloudflareOriginIngress } from "@hulumi/platform-patterns";

new CloudflareOriginIngress("edge", {
  tier: "startup-hardened",
  mode: "tunnel",
  cloudflareAccountId: "acct_123",
  hostname: "app.example.com",
  service: "http://app.default.svc.cluster.local:8080",
  httpHostHeader: "app.default.svc.cluster.local",
  additionalRoutes: [
    {
      hostname: "api.example.com",
      service: "http://api.default.svc.cluster.local:8080",
      httpHostHeader: "api.default.svc.cluster.local",
      runtime: { kind: "eks", automation: "managed-contract" },
    },
  ],
  tunnelSecret: pulumi.secret("base64-tunnel-secret"),
  runtime: { kind: "eks", automation: "managed-contract" },
});
```

Use `additionalRoutes` when one tunnel should front several public hostnames. `httpHostHeader` is optional, but it is useful for service meshes and virtual-hosted origins that route by internal service FQDN rather than by the public Cloudflare hostname.

## Allowlist+AOP Mode

Allowlist+AOP mode creates the complete AWS enforcement path: a version-pinned ALB trust store, an HTTPS listener using mutual-TLS `verify` mode, load-balancer source restrictions, a target security-group restriction, and per-hostname Cloudflare Authenticated Origin Pulls.

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

The CA bundle is the root that issued the client certificate uploaded to Cloudflare; it is separate from the ALB server certificate referenced by `originServerCertificateArn`. Keep the client private key out of Pulumi state and upload it to Cloudflare through a separately controlled certificate workflow. The component fixes the listener policy to `ELBSecurityPolicy-TLS13-1-2-2021-06`, verifies client certificates, and refuses expired client certificates.

`CLOUDFLARE_IPV4_ORIGIN_CIDRS` is the pinned set published by Cloudflare. A non-empty unique subset is permitted, but every entry must match that set exactly. When Cloudflare publishes a range change, update Hulumi through a reviewed release before deploying the new range; arbitrary CIDRs, including `0.0.0.0/0`, fail closed.

### Migration from metadata-only AOP

The former `originCertificateReference` and `aopMode` inputs are removed. Replace them with the concrete load-balancer, ACM server certificate, target-group, and versioned S3 CA-bundle inputs shown above. The component now owns the HTTPS listener and trust store. Import matching existing resources into the component's child URNs before the first update, or plan a reviewed replacement; do not allow Pulumi to create a competing listener on an occupied port.

## Origin IP Rotation Warning

After onboarding an existing public origin behind Cloudflare, rotate any historically exposed origin IPs or load-balancer endpoints. Source restrictions and AOP protect the current path, but old DNS, logs, and caches may have already revealed the previous origin address. M5 operationalizes this with a cookbook.

Listener authentication is defense-in-depth only. The component outputs secret reference names and rotation steps; it never outputs secret values.
