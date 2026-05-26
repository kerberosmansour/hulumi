# CloudflareOriginIngress

`CloudflareOriginIngress` models the two supported edge-to-origin patterns for this runbook:

- `mode: "tunnel"` for Cloudflare Tunnel.
- `mode: "allowlistAop"` for Cloudflare source restrictions plus Authenticated Origin Pulls.

## Tunnel Mode

Tunnel mode creates a Cloudflare tunnel and remote tunnel config with a public hostname binding. The `runtime` field records whether the workload runtime is automated by the component or cookbook-only.

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

Allowlist+AOP mode requires source CIDR evidence, load-balancer security-group restriction, target security-group restriction, origin certificate evidence, and Authenticated Origin Pull certificate evidence.

```ts
new CloudflareOriginIngress("aop", {
  tier: "startup-hardened",
  mode: "allowlistAop",
  cloudflareZoneId: "zone_123",
  hostname: "app.example.com",
  cloudflareSourceCidrBlocks: ["203.0.113.0/24"],
  loadBalancerSecurityGroupId: "sg-lb",
  targetSecurityGroupId: "sg-target",
  originPort: 443,
  originCertificateReference: "ssm:/edge/origin-ca-cert",
  authenticatedOriginPullCertificateId: "cert_123",
  aopMode: "hostname",
});
```

## Origin IP Rotation Warning

After onboarding an existing public origin behind Cloudflare, rotate any historically exposed origin IPs or load-balancer endpoints. Source restrictions and AOP protect the current path, but old DNS, logs, and caches may have already revealed the previous origin address. M5 operationalizes this with a cookbook.

Listener authentication is defense-in-depth only. The component outputs secret reference names and rotation steps; it never outputs secret values.
