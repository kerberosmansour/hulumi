---
title: EksTrustedNodeLabelReconciler
description: Restore one NodeRestriction-protected label only after exact EKS, Auto Scaling and EC2 attestation.
---

# `EksTrustedNodeLabelReconciler`

`@hulumi/k8s-baseline.EksTrustedNodeLabelReconciler` deploys a bounded controller
for one EKS managed node group. It restores one configured
NodeRestriction-protected label after a managed Node replacement only when EKS,
Auto Scaling, EC2 and the current Kubernetes Node agree on the node's identity,
membership, location, instance type and taints.

The component accepts only an immutable `@sha256` image reference. Hulumi's
manual `trusted-node-label-image` workflow builds linux/amd64 and linux/arm64
from the admitted Azure Linux Node 24 base, scans the complete OS package
inventory and exact npm runtime SBOM with the checksum-pinned official OSV
scanner, and publishes one provenance-attested public GHCR index. Use the exact
digest in the workflow's `published-image.txt` evidence; do not convert it to a
tag. The separate `eks-trusted-node-label-qualification` workflow must pass on
that digest before a release claims live EKS recovery.

## Example

```ts
import { EksTrustedNodeLabelReconciler } from "@hulumi/k8s-baseline";

const reconciler = new EksTrustedNodeLabelReconciler("trusted-workers", {
  k8sProvider: clusterProvider,
  clusterName: "prod-eks",
  nodeGroupName: "trusted-workers",
  awsAccountId: "111122223333",
  awsRegion: "eu-west-2",
  namespace: "hulumi-system",
  controllerImage:
    "111122223333.dkr.ecr.eu-west-2.amazonaws.com/hulumi-node-label@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  protectedLabelKey: "identity.node-restriction.kubernetes.io/workload",
  protectedLabelValue: "trusted",
  allowedInstanceTypes: ["m7i.large"],
  expectedTaints: [{ key: "dedicated", value: "trusted", effect: "NoSchedule" }],
  alarmSnsTopicArn: "arn:aws:sns:eu-west-2:111122223333:security-alerts",
});
```

The namespace and SNS topic must already exist. The EKS cluster must support EKS
Pod Identity and `admissionregistration.k8s.io/v1` ValidatingAdmissionPolicy.
Use a private or restricted EKS API endpoint consistent with
`EksClusterFoundation`.

## Security boundary

The component creates:

- one Pod Identity role with `eks:DescribeNodegroup`,
  `autoscaling:DescribeAutoScalingGroups`, `ec2:DescribeInstances`, and
  namespace-scoped `cloudwatch:PutMetricData` only;
- one ServiceAccount with default token automount disabled and one explicit,
  short-lived Kubernetes API token projection;
- one ClusterRole with only `get`, `list` and `patch` on Nodes;
- one cluster-wide, fail-closed ValidatingAdmissionPolicy that keeps the
  protected label unchanged for every other identity and lets the exact
  controller ServiceAccount add only the absent configured value without any
  other Node mutation;
- one `Recreate`, single-replica Deployment with a read-only root filesystem,
  non-root UID/GID, RuntimeDefault seccomp, all Linux capabilities dropped,
  bounded CPU/memory and EC2 metadata credentials disabled; and
- failure and persistent-missing-label CloudWatch alarms.

RBAC deliberately cannot express the label-key restriction; the admission
policy is part of the authority boundary. Do not deploy the controller until the
policy and binding are active. Do not grant the ServiceAccount another Node
writer or an AWS write action.

## Reconciliation behavior

Each cycle uses the ordinary `eks.amazonaws.com/nodegroup` label only to select a
bounded candidate set. That label never authorizes a patch. The runtime then:

1. calls exact-region EKS `DescribeNodegroup` and requires the full managed ASG
   set;
2. calls Auto Scaling with that exact set and rejects pagination, missing,
   duplicate, foreign or over-bound groups and memberships;
3. reads the provider-ID-selected EC2 instance and requires exactly one matching
   instance plus the configured account, region, AZ, type and running state;
4. passes typed snapshots to the deterministic M1 kernel;
5. re-reads the Node and discards a plan if UID, resourceVersion, provider ID or
   protected-label state changed; and
6. sends the kernel's four-operation JSON Patch. Any HTTP/admission rejection
   ends that plan; the next cycle starts from new evidence.

Provider, parsing, pagination and concurrency errors fail closed. A desired size
of zero with zero observed Nodes is healthy. A different existing protected
label is never overwritten.

## Audit and alarms

Structured stdout events use stable event/reason codes and a 16-hex SHA-256
correlation prefix derived from the Node UID. They omit tokens, credential
headers, provider IDs, raw AWS/Kubernetes responses and label maps.

The controller publishes these fixed-dimension metrics to
`Hulumi/EksTrustedNodeLabelReconciler` unless an exact custom namespace is
configured:

- `ReconcileDecisions`
- `ReconcileFailures`
- `MissingTrustedLabel`

Dimensions are only `ClusterName` and `NodeGroupName`. The live qualification
gates alarm resources, structured redaction, rolling replacement and
scale-from-zero recovery, admission enforcement, Pod Identity, CloudTrail's
controller-role call set and exact teardown.

## Current limits

- Standard regional availability-zone provider IDs are supported. Local Zones
  and Wavelength are rejected until separately designed and qualified.
- Repository checks do not establish a live EKS claim. Only the protected,
  manually dispatched qualification workflow against an exact public digest
  does so, and its independent cleanup and empty-inventory jobs must also pass.
- The component does not create the namespace, SNS topic, cluster audit trail or
  controller image repository.
