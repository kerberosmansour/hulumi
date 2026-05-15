---
title: EksAdminAccessPath
description: Auditable EKS operator access path for private or restricted-public control-plane hardening.
---

# `EksAdminAccessPath`

`@hulumi/k8s-baseline.EksAdminAccessPath` models the operator network path for EKS API access before tightening control-plane exposure.

It emits:

- EKS endpoint access config values (`endpointPrivateAccess`, `endpointPublicAccess`, `publicAccessCidrs`).
- Optional `aws.ec2.SecurityGroupRule` ingress on port 443 for private endpoint access.
- Audit-friendly outputs for downstream docs, kubeconfig guidance, and policy exceptions.

## Private Endpoint

```ts
new EksAdminAccessPath("prod-eks-admin", {
  clusterName: "prod-eks",
  endpointMode: "private",
  clusterSecurityGroupId: cluster.core.cluster.securityGroupId,
  operatorAccess: {
    sourceSecurityGroupIds: [clientVpnSecurityGroup.id],
  },
});
```

`private` mode requires `operatorAccess` so `kubectl` has a deterministic network path.

## Restricted Public Endpoint

```ts
const adminAccess = new EksAdminAccessPath("prod-eks-admin", {
  clusterName: "prod-eks",
  endpointMode: "restricted-public",
  publicAccessCidrs: ["203.0.113.10/32"],
});

// Feed into an EKS resource's vpcConfig:
adminAccess.endpointAccessConfig;
```

`restricted-public` refuses `0.0.0.0/0` and `::/0`.

## Temporary Broad Public Endpoint

```ts
new EksAdminAccessPath("prod-eks-bootstrap", {
  clusterName: "prod-eks",
  endpointMode: "public-temporary",
  publicAccessCidrs: ["0.0.0.0/0"],
  temporaryBroadPublicAccess: {
    reason: "bootstrap operator VPN",
    expiresOn: "2026-06-30",
    ticketUrl: "https://example.invalid/issues/123",
  },
});
```

Temporary broad public endpoint access requires a reason and expiry date. Broad security-group ingress is always refused; use a source security group or narrow CIDR for the private endpoint path.

Source: [packages/k8s-baseline/src/eks-admin-access-path.ts](../../packages/k8s-baseline/src/eks-admin-access-path.ts).
