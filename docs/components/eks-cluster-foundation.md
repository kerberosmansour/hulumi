---
title: EksClusterFoundation
description: Create or adopt an EKS cluster foundation with restricted endpoint posture, audit logs, Pod Identity preference, and IMDSv2 node posture.
---

# EksClusterFoundation

`EksClusterFoundation` is the formative EKS layer for Hulumi. It owns cluster creation or adoption expectations, then composes safely with the existing post-cluster pieces such as `NamespaceFoundation`, `EksAddonFoundation`, `EksRuntimeDetectionFoundation`, and `EksBackupFoundation`.

## Create Mode

```ts
import { EksClusterFoundation } from "@hulumi/k8s-baseline";

const cluster = new EksClusterFoundation("prod", {
  tier: "startup-hardened",
  mode: "create",
  clusterName: "prod-eks",
  roleArn: "arn:aws:iam::111122223333:role/eks-control-plane",
  subnetIds: ["subnet-a", "subnet-b"],
  addons: [{ name: "vpc-cni", version: "v1.20.0-eksbuild.1" }],
  podIdentityAssociations: [
    {
      namespace: "kube-system",
      serviceAccount: "aws-load-balancer-controller",
      roleArn: "arn:aws:iam::111122223333:role/alb-controller",
    },
  ],
  nodePools: [
    {
      name: "system",
      nodeRoleArn: "arn:aws:iam::111122223333:role/eks-node",
      subnetIds: ["subnet-a", "subnet-b"],
      instanceTypes: ["t3.large"],
      minSize: 1,
      desiredSize: 2,
      maxSize: 3,
    },
  ],
});
```

Startup-Hardened defaults to a private endpoint and enables the `audit` control-plane log. Managed node groups use launch templates with `metadataOptions.httpTokens = "required"`.

## Adopt Mode

```ts
const existing = new EksClusterFoundation("existing", {
  tier: "startup-hardened",
  mode: "adopt",
  clusterName: "existing-prod",
  expectedEndpointMode: "private",
});
```

Adopt mode emits validation expectations and does not claim ownership of cluster topology.

## Policy Pairing

Use `@hulumi/policies/k8s/packs/hulumi-eks-cluster`.

| Rule               | Purpose                                             |
| ------------------ | --------------------------------------------------- |
| `HULUMI-EKS-CL-1`  | Rejects broad public endpoint CIDRs.                |
| `HULUMI-EKS-CL-2`  | Requires EKS audit logs.                            |
| `HULUMI-EKS-FND-1` | Foundation-tagged clusters must keep audit logging. |
| `HULUMI-EKS-FND-2` | Foundation launch templates must require IMDSv2.    |

## Control IDs

IDs only: `CCM:DSP-04`, `CCM:LOG-01`, `CCM:IVS-06`, `NIST-800-53-r5:SC-7`, `NIST-800-53-r5:AU-2`, `NIST-800-53-r5:AC-6`, `CIS-EKS:2.1.1`, `CIS-EKS:2.1.2`.
