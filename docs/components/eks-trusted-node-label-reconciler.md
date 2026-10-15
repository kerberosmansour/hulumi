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

M4b ships the current component and runtime source. It does not publish a controller
image. Supply an image that contains this package's compiled `dist/` tree at
`/app/dist` and runs on Node.js 22.12 or later. The component accepts only an
immutable `@sha256` image reference. M3 will publish the supported image after
registry provenance, image vulnerability scanning and isolated EKS qualification
are complete.

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

The namespace and SNS topic must already exist. The EKS cluster must:

- use authentication mode `API` or `API_AND_CONFIG_MAP` so the component's
  STANDARD AccessEntry can authenticate its Pod Identity role;
- run the EKS Pod Identity Agent so AWS injects the exact
  `http://169.254.170.23/v1/credentials` endpoint and projected Pod Identity
  token file; and
- support `admissionregistration.k8s.io/v1` ValidatingAdmissionPolicy.

`CONFIG_MAP`-only clusters are unsupported and fail when Pulumi creates the
AccessEntry. There is no `aws-auth` fallback. Use a private or restricted EKS
API endpoint consistent with `EksClusterFoundation`.

## Security boundary

The component creates:

- one Pod Identity role with `eks:DescribeNodegroup`,
  `autoscaling:DescribeAutoScalingGroups`, `ec2:DescribeInstances`, and
  namespace-scoped `cloudwatch:PutMetricData` only; its trust requires the exact
  cluster ARN, namespace and ServiceAccount request tags;
- one STANDARD EKS AccessEntry that maps that exact role to one
  component-specific Kubernetes group and username prefix;
- one ServiceAccount with default token automount disabled and one explicit,
  short-lived Kubernetes API token projection, with Node `get` and `list` only;
- one separate ClusterRole granting Node `patch` only to the AccessEntry's IAM
  group;
- one cluster-wide, fail-closed ValidatingAdmissionPolicy that keeps the
  protected label unchanged for every other identity and requires both the
  component-specific IAM username prefix and exact group for the existing exact
  add/remove mutation without any other Node change;
- one `Recreate`, single-replica Deployment with a read-only root filesystem,
  non-root UID/GID, RuntimeDefault seccomp, all Linux capabilities dropped,
  bounded CPU/memory and EC2 metadata credentials disabled; and
- failure and persistent-missing-label CloudWatch alarms.

RBAC deliberately cannot express the label-key restriction; the admission
policy is part of the authority boundary. Do not deploy the controller until the
policy, AccessEntry and both bindings are active. Do not grant the
ServiceAccount Node write access or grant the IAM group another Kubernetes
permission. Possession of the projected ServiceAccount token alone can read the
bounded Node set but cannot patch it.

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
6. signs a fresh, 60-second EKS IAM authenticator token with temporary
   credentials obtained only from the exact Pod Identity HTTP endpoint and
   token-file contract; and
7. sends the kernel's exact JSON Patch with that IAM token. Any credential,
   HTTP or admission rejection ends that plan; the next cycle starts from new
   evidence.

Kubernetes list/get requests continue to use the short-lived projected
ServiceAccount token. PATCH never reuses that token, never uses the default AWS
credential chain, and never falls back to static environment, profile, IMDS,
web-identity, kubeconfig or `aws-auth` credentials. IAM tokens and temporary AWS
credentials are bounded and are never logged or cached across patches.

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

Dimensions are only `ClusterName` and `NodeGroupName`. Live alarm delivery,
rolling replacement and scale-from-zero recovery evidence are M3 gates.

## Upgrade and rollback

Treat the Pulumi resources and controller image as one coordinated rollout:

1. confirm the cluster authentication mode and Pod Identity Agent prerequisites;
2. build a digest-pinned image from the same M4b source revision;
3. deploy the component and wait for the AccessEntry, split RBAC and admission
   resources to become active; and
4. verify the ServiceAccount identity cannot patch a Node while the admitted IAM
   identity can perform only the exact protected-label mutation.

EKS AccessEntry propagation is eventually consistent. Early PATCH attempts can
receive 401/403 and fail closed; a later bounded cycle obtains new evidence and
a fresh token. An older controller image paired with M4b RBAC also loses patch
access and fails closed. Roll back the image and component revision together;
do not restore ServiceAccount `patch` as a temporary workaround.

## Current limits

- Standard regional availability-zone provider IDs are supported. Local Zones
  and Wavelength are rejected until separately designed and qualified.
- M4b has local adapter, Pulumi-resource and finite-state evidence. It makes no
  live EKS, registry provenance or official image claim.
- A principal already authorized to admit a new Pod under the exact controller
  ServiceAccount can receive the same Pod Identity credentials. Namespace
  workload admission and governance must prevent that; M3 must verify the
  operator control before a live qualification claim.
- The component does not create the namespace, SNS topic, cluster audit trail or
  controller image repository.
