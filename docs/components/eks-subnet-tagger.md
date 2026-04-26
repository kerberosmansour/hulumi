---
title: EksSubnetTagger
description: Writes the three conventional ALB-Controller-discovery tags (kubernetes.io/role/{,internal-}elb + kubernetes.io/cluster/<name>) onto existing EKS-bound subnets. Full reference at M5.
---

# `EksSubnetTagger`

`@hulumi/k8s-baseline.EksSubnetTagger` — writes the conventional EKS subnet tags so the AWS Load Balancer Controller can auto-discover subnets:

- Public subnets get `kubernetes.io/role/elb=1` (for `scheme: internet-facing` ingresses).
- Private subnets get `kubernetes.io/role/internal-elb=1` (for `scheme: internal`).
- Both get `kubernetes.io/cluster/<clusterName>=shared` (or `=owned`).

Refuses construction if both subnet lists are absent (the silent-zero-tags failure mode is the one this component exists to prevent). Empty arrays at apply time emit a `pulumi.log.warn`.

Pulumi-side standalone — does **not** wrap `@pulumi/awsx.ec2.Vpc`. Works with any VPC pattern (awsx, hand-rolled `aws.ec2.Vpc`, AWS-supplied via Control Tower / Landing Zone).

Full reference doc lands at M5. Source: [packages/k8s-baseline/src/eks-subnet-tagger.ts](../../packages/k8s-baseline/src/eks-subnet-tagger.ts).
