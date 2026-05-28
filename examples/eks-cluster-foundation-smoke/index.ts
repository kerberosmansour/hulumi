import { EksClusterFoundation } from "@hulumi/k8s-baseline";

export const eksFoundation = new EksClusterFoundation("eks-smoke", {
  tier: "startup-hardened",
  mode: "create",
  clusterName: process.env.HULUMI_EKS_CLUSTER_NAME ?? "hulumi-prod-eks",
  roleArn:
    process.env.HULUMI_EKS_CLUSTER_ROLE_ARN ??
    "arn:aws:iam::111122223333:role/hulumi-eks-control-plane",
  subnetIds: ["subnet-a", "subnet-b"],
  addons: [{ name: "vpc-cni", version: "v1.20.0-eksbuild.1" }],
  podIdentityAssociations: [
    {
      namespace: "kube-system",
      serviceAccount: "aws-load-balancer-controller",
      roleArn:
        process.env.HULUMI_EKS_POD_IDENTITY_ROLE_ARN ??
        "arn:aws:iam::111122223333:role/hulumi-alb-controller",
    },
  ],
  nodePools: [
    {
      name: "system",
      nodeRoleArn:
        process.env.HULUMI_EKS_NODE_ROLE_ARN ?? "arn:aws:iam::111122223333:role/hulumi-eks-node",
      subnetIds: ["subnet-a", "subnet-b"],
      instanceTypes: ["t3.large"],
      minSize: 1,
      desiredSize: 2,
      maxSize: 3,
    },
  ],
});

export const clusterName = eksFoundation.clusterName;
export const validationExpectations = eksFoundation.validationExpectations;
