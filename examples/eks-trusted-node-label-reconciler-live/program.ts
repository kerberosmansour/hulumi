import * as aws from "../../packages/k8s-baseline/node_modules/@pulumi/aws";
import * as k8s from "../../packages/k8s-baseline/node_modules/@pulumi/kubernetes";
import * as pulumi from "../../packages/k8s-baseline/node_modules/@pulumi/pulumi";

import { EksTrustedNodeLabelReconciler } from "../../packages/k8s-baseline/src";

export interface QualificationProgramArgs {
  readonly accountId: string;
  readonly controllerImage: string;
  readonly publicCidr: string;
  readonly region: string;
  readonly runId: string;
}

const clusterPolicy = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy";
const workerPolicies = [
  "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
  "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPullOnly",
  "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
] as const;

export function qualificationProgram(args: QualificationProgramArgs): () => Promise<object> {
  return async () => {
    const tags = {
      "hulumi:qualification-id": args.runId,
      "hulumi:purpose": "trusted-node-label-reconciler-live",
    };
    const clusterName = `${args.runId}-cluster`;
    const nodeGroupName = `${args.runId}-nodes`;
    const namespaceName = "hulumi-system";
    const componentName = "trusted-label";
    const protectedLabelKey = "identity.node-restriction.kubernetes.io/pool";
    const protectedLabelValue = "trusted";
    const taint = {
      key: "hulumi.dev/trusted",
      value: "true",
      effect: "PREFER_NO_SCHEDULE",
    } as const;

    const zones = aws.getAvailabilityZonesOutput({ state: "available" });
    const vpc = new aws.ec2.Vpc(`${args.runId}-vpc`, {
      cidrBlock: "10.77.0.0/16",
      enableDnsHostnames: true,
      enableDnsSupport: true,
      tags: { ...tags, Name: `${args.runId}-vpc` },
    });
    const internetGateway = new aws.ec2.InternetGateway(`${args.runId}-igw`, {
      vpcId: vpc.id,
      tags,
    });
    const routeTable = new aws.ec2.RouteTable(`${args.runId}-routes`, {
      vpcId: vpc.id,
      routes: [{ cidrBlock: "0.0.0.0/0", gatewayId: internetGateway.id }],
      tags,
    });
    const subnets = [0, 1].map((index) => {
      const subnet = new aws.ec2.Subnet(`${args.runId}-subnet-${index + 1}`, {
        availabilityZone: zones.names.apply((names) => names[index]),
        cidrBlock: `10.77.${index + 1}.0/24`,
        mapPublicIpOnLaunch: true,
        vpcId: vpc.id,
        tags: {
          ...tags,
          [`kubernetes.io/cluster/${clusterName}`]: "shared",
          "kubernetes.io/role/elb": "1",
        },
      });
      new aws.ec2.RouteTableAssociation(`${args.runId}-route-${index + 1}`, {
        routeTableId: routeTable.id,
        subnetId: subnet.id,
      });
      return subnet;
    });

    const clusterRole = new aws.iam.Role(`${args.runId}-cluster-role`, {
      name: `${args.runId}-cluster-role`,
      assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: "eks.amazonaws.com" }),
      tags,
    });
    const clusterRolePolicy = new aws.iam.RolePolicyAttachment(`${args.runId}-cluster-policy`, {
      policyArn: clusterPolicy,
      role: clusterRole.name,
    });
    const nodeRole = new aws.iam.Role(`${args.runId}-node-role`, {
      name: `${args.runId}-node-role`,
      assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: "ec2.amazonaws.com" }),
      tags,
    });
    const nodeRolePolicies = workerPolicies.map(
      (policyArn, index) =>
        new aws.iam.RolePolicyAttachment(`${args.runId}-node-policy-${index + 1}`, {
          policyArn,
          role: nodeRole.name,
        }),
    );

    const cluster = new aws.eks.Cluster(
      `${args.runId}-cluster`,
      {
        name: clusterName,
        roleArn: clusterRole.arn,
        accessConfig: {
          authenticationMode: "API_AND_CONFIG_MAP",
          bootstrapClusterCreatorAdminPermissions: true,
        },
        enabledClusterLogTypes: ["api", "audit", "authenticator"],
        vpcConfig: {
          endpointPrivateAccess: true,
          endpointPublicAccess: true,
          publicAccessCidrs: [args.publicCidr],
          subnetIds: subnets.map((subnet) => subnet.id),
        },
        tags,
      },
      { dependsOn: [clusterRolePolicy] },
    );
    const podIdentityAgent = new aws.eks.Addon(`${args.runId}-pod-identity-agent`, {
      addonName: "eks-pod-identity-agent",
      clusterName: cluster.name,
      resolveConflictsOnCreate: "OVERWRITE",
      resolveConflictsOnUpdate: "OVERWRITE",
      tags,
    });
    const launchTemplate = new aws.ec2.LaunchTemplate(`${args.runId}-launch-template`, {
      namePrefix: `${args.runId}-`,
      metadataOptions: {
        httpEndpoint: "enabled",
        httpTokens: "required",
        httpPutResponseHopLimit: 1,
      },
      tagSpecifications: [{ resourceType: "instance", tags }],
      tags,
    });
    const nodeGroup = new aws.eks.NodeGroup(
      `${args.runId}-node-group`,
      {
        clusterName: cluster.name,
        forceUpdateVersion: true,
        instanceTypes: ["t3.medium"],
        launchTemplate: {
          id: launchTemplate.id,
          version: pulumi.interpolate`${launchTemplate.latestVersion}`,
        },
        nodeGroupName,
        nodeRoleArn: nodeRole.arn,
        scalingConfig: { desiredSize: 1, maxSize: 1, minSize: 0 },
        subnetIds: subnets.map((subnet) => subnet.id),
        taints: [taint],
        updateConfig: { maxUnavailable: 1 },
        tags,
      },
      { dependsOn: nodeRolePolicies },
    );

    const kubeconfig = pulumi
      .all([cluster.endpoint, cluster.certificateAuthority])
      .apply(([endpoint, authority]) =>
        JSON.stringify({
          apiVersion: "v1",
          clusters: [
            {
              cluster: { "certificate-authority-data": authority.data, server: endpoint },
              name: clusterName,
            },
          ],
          contexts: [
            {
              context: { cluster: clusterName, user: clusterName },
              name: clusterName,
            },
          ],
          "current-context": clusterName,
          kind: "Config",
          users: [
            {
              name: clusterName,
              user: {
                exec: {
                  apiVersion: "client.authentication.k8s.io/v1beta1",
                  args: [
                    "eks",
                    "get-token",
                    "--cluster-name",
                    clusterName,
                    "--region",
                    args.region,
                  ],
                  command: "aws",
                },
              },
            },
          ],
        }),
      );
    const provider = new k8s.Provider(`${args.runId}-kubernetes`, {
      kubeconfig,
      suppressDeprecationWarnings: true,
    });
    const namespace = new k8s.core.v1.Namespace(
      `${args.runId}-namespace`,
      {
        metadata: {
          name: namespaceName,
          labels: { "hulumi.dev/qualification-id": args.runId },
        },
      },
      { provider },
    );
    const alarms = new aws.sns.Topic(`${args.runId}-alarms`, {
      name: `${args.runId}-alarms`,
      tags,
    });
    const reconciler = new EksTrustedNodeLabelReconciler(
      componentName,
      {
        alarmSnsTopicArn: alarms.arn,
        allowedInstanceTypes: ["t3.medium"],
        awsAccountId: args.accountId,
        awsRegion: args.region,
        clusterName,
        controllerImage: args.controllerImage,
        expectedTaints: [{ key: taint.key, value: taint.value, effect: "PreferNoSchedule" }],
        k8sProvider: provider,
        maxEvidenceAgeSeconds: 180,
        maxEvidenceSkewSeconds: 30,
        namespace: namespaceName,
        nodeGroupName,
        protectedLabelKey,
        protectedLabelValue,
        reconcileIntervalSeconds: 15,
        tags,
      },
      { dependsOn: [namespace, nodeGroup, podIdentityAgent] },
    );

    return {
      admissionPolicyName: reconciler.admissionPolicyName,
      clusterName,
      controllerRoleArn: reconciler.roleArn,
      deploymentName: reconciler.deploymentName,
      metricNamespace: reconciler.metricNamespace,
      namespaceName,
      nodeGroupName,
      protectedLabelKey,
      protectedLabelValue,
      runId: args.runId,
    };
  };
}
