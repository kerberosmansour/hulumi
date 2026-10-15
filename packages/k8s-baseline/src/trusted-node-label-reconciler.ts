import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

import {
  DEFAULT_TRUSTED_NODE_LABEL_METRIC_NAMESPACE,
  type EksTrustedNodeLabelReconcilerArgs,
} from "./trusted-node-label-reconciler.args";
import type { EksTrustedNodeLabelReconcilerOutputs } from "./trusted-node-label-reconciler.outputs";

export const EKS_TRUSTED_NODE_LABEL_RECONCILER_COMPONENT_TYPE =
  "hulumi:k8s:EksTrustedNodeLabelReconciler";

const DNS_LABEL = /^[a-z0-9](?:[-a-z0-9]{0,61}[a-z0-9])?$/u;
const AWS_NAME = /^[A-Za-z0-9][A-Za-z0-9_.:/+=,@-]{0,99}$/u;
const AWS_ACCOUNT = /^\d{12}$/u;
const AWS_REGION = /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/u;
const IMMUTABLE_IMAGE = /^[^\s@]+@sha256:[a-f0-9]{64}$/u;
const INSTANCE_TYPE = /^[a-z][a-z0-9.]{1,31}$/u;
const LABEL_NAME = /^(?=.{1,63}$)[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?$/u;
const LABEL_VALUE = /^(?=.{1,63}$)[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?$/u;
const METRIC_NAMESPACE = /^[A-Za-z0-9_./#-]{1,255}$/u;
const TAINT_EFFECTS = new Set(["NoSchedule", "PreferNoSchedule", "NoExecute"]);

interface ValidatedArgs {
  readonly serviceAccountName: string;
  readonly reconcileIntervalSeconds: number;
  readonly maxEvidenceAgeSeconds: number;
  readonly maxEvidenceSkewSeconds: number;
  readonly maxNodesPerCycle: number;
  readonly metricNamespace: string;
}

function requireBoundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < minimum || resolved > maximum) {
    throw new Error(
      `EksTrustedNodeLabelReconciler: ${label} must be an integer from ${minimum} through ${maximum}`,
    );
  }
  return resolved;
}

function isProtectedLabelKey(value: string): boolean {
  const parts = value.split("/");
  if (parts.length !== 2 || !LABEL_NAME.test(parts[1])) return false;
  const prefix = parts[0];
  if (
    prefix.length > 253 ||
    !prefix.split(".").every((part) => DNS_LABEL.test(part)) ||
    (prefix !== "node-restriction.kubernetes.io" &&
      !prefix.endsWith(".node-restriction.kubernetes.io"))
  ) {
    return false;
  }
  return true;
}

function validateArgs(name: string, args: EksTrustedNodeLabelReconcilerArgs): ValidatedArgs {
  if (!DNS_LABEL.test(name) || name.length > 40) {
    throw new Error(
      "EksTrustedNodeLabelReconciler: component name must be a Kubernetes DNS label of at most 40 characters",
    );
  }
  if (!AWS_NAME.test(args.clusterName) || !AWS_NAME.test(args.nodeGroupName)) {
    throw new Error(
      "EksTrustedNodeLabelReconciler: clusterName and nodeGroupName must be exact bounded AWS names",
    );
  }
  if (!AWS_ACCOUNT.test(args.awsAccountId)) {
    throw new Error("EksTrustedNodeLabelReconciler: awsAccountId must be twelve digits");
  }
  if (!AWS_REGION.test(args.awsRegion)) {
    throw new Error("EksTrustedNodeLabelReconciler: awsRegion must be an exact AWS region");
  }
  if (!DNS_LABEL.test(args.namespace)) {
    throw new Error("EksTrustedNodeLabelReconciler: namespace must be a Kubernetes DNS label");
  }
  const serviceAccountName = args.serviceAccountName ?? `${name}-reconciler`;
  if (!DNS_LABEL.test(serviceAccountName)) {
    throw new Error(
      "EksTrustedNodeLabelReconciler: serviceAccountName must be a Kubernetes DNS label",
    );
  }
  if (!IMMUTABLE_IMAGE.test(args.controllerImage)) {
    throw new Error(
      "EksTrustedNodeLabelReconciler: controllerImage must be an immutable @sha256 digest reference",
    );
  }
  if (!isProtectedLabelKey(args.protectedLabelKey)) {
    throw new Error(
      "EksTrustedNodeLabelReconciler: protectedLabelKey must use a NodeRestriction protected prefix",
    );
  }
  if (!LABEL_VALUE.test(args.protectedLabelValue)) {
    throw new Error(
      "EksTrustedNodeLabelReconciler: protectedLabelValue must be a valid non-empty label value",
    );
  }
  if (
    args.allowedInstanceTypes.length === 0 ||
    args.allowedInstanceTypes.length > 16 ||
    args.allowedInstanceTypes.some((value) => !INSTANCE_TYPE.test(value)) ||
    new Set(args.allowedInstanceTypes).size !== args.allowedInstanceTypes.length
  ) {
    throw new Error(
      "EksTrustedNodeLabelReconciler: allowedInstanceTypes must contain 1–16 unique exact EC2 instance types",
    );
  }
  if (
    args.expectedTaints.length === 0 ||
    args.expectedTaints.length > 16 ||
    args.expectedTaints.some(
      (taint) =>
        !LABEL_NAME.test(taint.key) ||
        !LABEL_VALUE.test(taint.value) ||
        !TAINT_EFFECTS.has(taint.effect),
    ) ||
    new Set(args.expectedTaints.map((taint) => `${taint.key}\0${taint.effect}`)).size !==
      args.expectedTaints.length
  ) {
    throw new Error(
      "EksTrustedNodeLabelReconciler: expectedTaints must contain 1–16 unique exact taints",
    );
  }
  const metricNamespace = args.metricNamespace ?? DEFAULT_TRUSTED_NODE_LABEL_METRIC_NAMESPACE;
  if (!METRIC_NAMESPACE.test(metricNamespace) || metricNamespace.startsWith("AWS/")) {
    throw new Error(
      "EksTrustedNodeLabelReconciler: metricNamespace must be an exact custom CloudWatch namespace",
    );
  }
  return {
    serviceAccountName,
    reconcileIntervalSeconds: requireBoundedInteger(
      args.reconcileIntervalSeconds,
      60,
      15,
      900,
      "reconcileIntervalSeconds",
    ),
    maxEvidenceAgeSeconds: requireBoundedInteger(
      args.maxEvidenceAgeSeconds,
      120,
      15,
      600,
      "maxEvidenceAgeSeconds",
    ),
    maxEvidenceSkewSeconds: requireBoundedInteger(
      args.maxEvidenceSkewSeconds,
      15,
      1,
      60,
      "maxEvidenceSkewSeconds",
    ),
    maxNodesPerCycle: requireBoundedInteger(args.maxNodesPerCycle, 200, 1, 500, "maxNodesPerCycle"),
    metricNamespace,
  };
}

function partitionForRegion(region: string): string {
  if (region.startsWith("cn-")) return "aws-cn";
  if (region.startsWith("us-gov-")) return "aws-us-gov";
  return "aws";
}

function optionalEqual(path: string): string {
  return `((!has(object.${path}) && !has(oldObject.${path})) || (has(object.${path}) && has(oldObject.${path}) && object.${path} == oldObject.${path}))`;
}

export class EksTrustedNodeLabelReconciler
  extends pulumi.ComponentResource
  implements EksTrustedNodeLabelReconcilerOutputs
{
  readonly roleArn: pulumi.Output<string>;
  readonly serviceAccountName: pulumi.Output<string>;
  readonly deploymentName: pulumi.Output<string>;
  readonly admissionPolicyName: pulumi.Output<string>;
  readonly alarmArns: pulumi.Output<readonly string[]>;
  readonly metricNamespace: pulumi.Output<string>;

  constructor(
    name: string,
    args: EksTrustedNodeLabelReconcilerArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super(EKS_TRUSTED_NODE_LABEL_RECONCILER_COMPONENT_TYPE, name, {}, opts);
    const validated = validateArgs(name, args);
    const partition = partitionForRegion(args.awsRegion);
    const childOptions: pulumi.CustomResourceOptions = { parent: this };
    const k8sOptions: pulumi.CustomResourceOptions = {
      parent: this,
      provider: args.k8sProvider,
    };
    const commonTags = pulumi.output(args.tags ?? {}).apply((tags) => ({
      ...tags,
      "hulumi:component": "EksTrustedNodeLabelReconciler",
      "hulumi:cluster": args.clusterName,
      "hulumi:node-group": args.nodeGroupName,
    }));
    const clusterArn = `arn:${partition}:eks:${args.awsRegion}:${args.awsAccountId}:cluster/${args.clusterName}`;
    const patchGroup = `hulumi:trusted-node-label:${name}`;
    const patchUsernamePrefix = `hulumi:trusted-node-label:${name}:`;
    const resourceLabels = {
      "app.kubernetes.io/name": name,
      "app.kubernetes.io/component": "trusted-node-label-reconciler",
      "app.kubernetes.io/managed-by": "hulumi",
      "hulumi.dev/cluster": args.clusterName,
      "hulumi.dev/node-group": args.nodeGroupName,
    };

    const role = new aws.iam.Role(
      `${name}-role`,
      {
        assumeRolePolicy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "pods.eks.amazonaws.com" },
              Action: ["sts:AssumeRole", "sts:TagSession"],
              Condition: {
                StringEquals: {
                  "aws:RequestTag/eks-cluster-arn": clusterArn,
                  "aws:RequestTag/kubernetes-namespace": args.namespace,
                  "aws:RequestTag/kubernetes-service-account": validated.serviceAccountName,
                },
              },
            },
          ],
        }),
        tags: commonTags,
      },
      childOptions,
    );

    const rolePolicy = new aws.iam.RolePolicy(
      `${name}-read-policy`,
      {
        role: role.id,
        policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Sid: "ReadExactEksNodeGroup",
              Effect: "Allow",
              Action: ["eks:DescribeNodegroup"],
              Resource: `arn:${partition}:eks:${args.awsRegion}:${args.awsAccountId}:nodegroup/${args.clusterName}/${args.nodeGroupName}/*`,
            },
            {
              Sid: "ReadNodeGroupInstances",
              Effect: "Allow",
              Action: ["autoscaling:DescribeAutoScalingGroups", "ec2:DescribeInstances"],
              Resource: "*",
              Condition: { StringEquals: { "aws:RequestedRegion": args.awsRegion } },
            },
            {
              Sid: "PublishBoundedControllerMetrics",
              Effect: "Allow",
              Action: ["cloudwatch:PutMetricData"],
              Resource: "*",
              Condition: {
                StringEquals: { "cloudwatch:namespace": validated.metricNamespace },
              },
            },
          ],
        }),
      },
      childOptions,
    );

    const serviceAccount = new k8s.core.v1.ServiceAccount(
      `${name}-service-account`,
      {
        metadata: {
          name: validated.serviceAccountName,
          namespace: args.namespace,
          labels: resourceLabels,
        },
        automountServiceAccountToken: false,
      },
      k8sOptions,
    );

    const accessEntry = new aws.eks.AccessEntry(
      `${name}-patch-access`,
      {
        clusterName: args.clusterName,
        principalArn: role.arn,
        region: args.awsRegion,
        type: "STANDARD",
        kubernetesGroups: [patchGroup],
        userName: `${patchUsernamePrefix}{{SessionName}}`,
        tags: commonTags,
      },
      { ...childOptions, dependsOn: [role] },
    );

    const podIdentityAssociation = new aws.eks.PodIdentityAssociation(
      `${name}-pod-identity`,
      {
        clusterName: args.clusterName,
        namespace: args.namespace,
        serviceAccount: validated.serviceAccountName,
        roleArn: role.arn,
        tags: commonTags,
      },
      { ...childOptions, dependsOn: [rolePolicy, serviceAccount] },
    );

    const readClusterRole = new k8s.rbac.v1.ClusterRole(
      `${name}-node-role`,
      {
        metadata: { name: `${name}-node-label-reconciler`, labels: resourceLabels },
        rules: [
          {
            apiGroups: [""],
            resources: ["nodes"],
            verbs: ["get", "list"],
          },
        ],
      },
      k8sOptions,
    );

    const readClusterRoleBinding = new k8s.rbac.v1.ClusterRoleBinding(
      `${name}-node-role-binding`,
      {
        metadata: { name: `${name}-node-label-reconciler`, labels: resourceLabels },
        roleRef: {
          apiGroup: "rbac.authorization.k8s.io",
          kind: "ClusterRole",
          name: `${name}-node-label-reconciler`,
        },
        subjects: [
          {
            kind: "ServiceAccount",
            name: validated.serviceAccountName,
            namespace: args.namespace,
          },
        ],
      },
      { ...k8sOptions, dependsOn: [readClusterRole, serviceAccount] },
    );

    const patchClusterRole = new k8s.rbac.v1.ClusterRole(
      `${name}-node-patch-role`,
      {
        metadata: { name: `${name}-node-label-mutator`, labels: resourceLabels },
        rules: [
          {
            apiGroups: [""],
            resources: ["nodes"],
            verbs: ["patch"],
          },
        ],
      },
      k8sOptions,
    );

    const patchClusterRoleBinding = new k8s.rbac.v1.ClusterRoleBinding(
      `${name}-node-patch-role-binding`,
      {
        metadata: { name: `${name}-node-label-mutator`, labels: resourceLabels },
        roleRef: {
          apiGroup: "rbac.authorization.k8s.io",
          kind: "ClusterRole",
          name: `${name}-node-label-mutator`,
        },
        subjects: [
          {
            kind: "Group",
            name: patchGroup,
            apiGroup: "rbac.authorization.k8s.io",
          },
        ],
      },
      { ...k8sOptions, dependsOn: [patchClusterRole, accessEntry] },
    );

    const labelKey = JSON.stringify(args.protectedLabelKey);
    const labelValue = JSON.stringify(args.protectedLabelValue);
    const controllerUsernamePrefix = JSON.stringify(patchUsernamePrefix);
    const controllerGroup = JSON.stringify(patchGroup);
    const controllerIdentity = `(request.userInfo.username.startsWith(${controllerUsernamePrefix}) && request.userInfo.groups.exists(group, group == ${controllerGroup}))`;
    const newHasLabel = `has(object.metadata.labels) && ${labelKey} in object.metadata.labels`;
    const oldHasLabel = `has(oldObject.metadata.labels) && ${labelKey} in oldObject.metadata.labels`;
    const labelUnchanged = `((${oldHasLabel}) == (${newHasLabel}) && (!(${oldHasLabel}) || object.metadata.labels[${labelKey}] == oldObject.metadata.labels[${labelKey}]))`;
    const labelsAreExactAddition = `(${newHasLabel}) && !(${oldHasLabel}) && object.metadata.labels[${labelKey}] == ${labelValue} && ((!has(oldObject.metadata.labels) && object.metadata.labels.size() == 1) || (has(oldObject.metadata.labels) && object.metadata.labels.size() == oldObject.metadata.labels.size() + 1 && oldObject.metadata.labels.all(k, v, k in object.metadata.labels && object.metadata.labels[k] == v)))`;
    const labelsAreExactRemoval = `(${oldHasLabel}) && oldObject.metadata.labels[${labelKey}] == ${labelValue} && !(${newHasLabel}) && ((!has(object.metadata.labels) && oldObject.metadata.labels.size() == 1) || (has(object.metadata.labels) && oldObject.metadata.labels.size() == object.metadata.labels.size() + 1 && object.metadata.labels.all(k, v, k in oldObject.metadata.labels && oldObject.metadata.labels[k] == v)))`;
    const unchangedMetadata = [
      "metadata.generateName",
      "metadata.namespace",
      "metadata.selfLink",
      "metadata.generation",
      "metadata.creationTimestamp",
      "metadata.deletionTimestamp",
      "metadata.deletionGracePeriodSeconds",
      "metadata.annotations",
      "metadata.ownerReferences",
      "metadata.finalizers",
      "metadata.managedFields",
    ]
      .map(optionalEqual)
      .join(" && ");
    const noPiggyback = `object.metadata.name == oldObject.metadata.name && object.metadata.uid == oldObject.metadata.uid && object.metadata.resourceVersion == oldObject.metadata.resourceVersion && object.spec == oldObject.spec && object.status == oldObject.status && ${unchangedMetadata}`;
    const updateRule = `request.operation != "UPDATE" || ((${controllerIdentity}) ? (((${labelsAreExactAddition}) || (${labelsAreExactRemoval})) && (${noPiggyback})) : (${labelUnchanged}))`;
    const admissionPolicyName = `${name}-protected-node-label`;
    const admissionPolicy = new k8s.admissionregistration.v1.ValidatingAdmissionPolicy(
      `${name}-protected-label-policy`,
      {
        metadata: { name: admissionPolicyName, labels: resourceLabels },
        spec: {
          failurePolicy: "Fail",
          matchConstraints: {
            resourceRules: [
              {
                apiGroups: [""],
                apiVersions: ["v1"],
                operations: ["CREATE", "UPDATE"],
                resources: ["nodes"],
              },
            ],
          },
          validations: [
            {
              expression: `request.operation != "CREATE" || !(${newHasLabel})`,
              message: "Nodes must be created without the reconciler-protected label.",
              reason: "Forbidden",
            },
            {
              expression: updateRule,
              message:
                "Only the exact trusted-node-label reconciler identity may add or remove the exact configured label without another Node mutation.",
              reason: "Forbidden",
            },
          ],
        },
      },
      k8sOptions,
    );

    new k8s.admissionregistration.v1.ValidatingAdmissionPolicyBinding(
      `${name}-protected-label-binding`,
      {
        metadata: { name: `${admissionPolicyName}-binding`, labels: resourceLabels },
        spec: {
          policyName: admissionPolicyName,
          validationActions: ["Deny"],
          matchResources: {},
        },
      },
      { ...k8sOptions, dependsOn: [admissionPolicy] },
    );

    const environment = [
      ["HULUMI_CLUSTER_NAME", args.clusterName],
      ["HULUMI_NODE_GROUP_NAME", args.nodeGroupName],
      ["HULUMI_AWS_ACCOUNT_ID", args.awsAccountId],
      ["HULUMI_AWS_REGION", args.awsRegion],
      ["HULUMI_PROTECTED_LABEL_KEY", args.protectedLabelKey],
      ["HULUMI_PROTECTED_LABEL_VALUE", args.protectedLabelValue],
      ["HULUMI_ALLOWED_INSTANCE_TYPES_JSON", JSON.stringify(args.allowedInstanceTypes)],
      ["HULUMI_EXPECTED_TAINTS_JSON", JSON.stringify(args.expectedTaints)],
      ["HULUMI_RECONCILE_INTERVAL_SECONDS", String(validated.reconcileIntervalSeconds)],
      ["HULUMI_MAX_EVIDENCE_AGE_SECONDS", String(validated.maxEvidenceAgeSeconds)],
      ["HULUMI_MAX_EVIDENCE_SKEW_SECONDS", String(validated.maxEvidenceSkewSeconds)],
      ["HULUMI_MAX_NODES_PER_CYCLE", String(validated.maxNodesPerCycle)],
      ["HULUMI_METRIC_NAMESPACE", validated.metricNamespace],
      ["HULUMI_KUBERNETES_TOKEN_PATH", "/var/run/secrets/hulumi-kubernetes/token"],
      ["HULUMI_KUBERNETES_CA_PATH", "/var/run/secrets/hulumi-kubernetes/ca.crt"],
      ["AWS_REGION", args.awsRegion],
      ["AWS_DEFAULT_REGION", args.awsRegion],
      ["AWS_EC2_METADATA_DISABLED", "true"],
      ["AWS_STS_REGIONAL_ENDPOINTS", "regional"],
    ].map(([envName, value]) => ({ name: envName, value }));
    const deploymentName = `${name}-controller`;
    new k8s.apps.v1.Deployment(
      `${name}-controller`,
      {
        metadata: { name: deploymentName, namespace: args.namespace, labels: resourceLabels },
        spec: {
          replicas: 1,
          revisionHistoryLimit: 2,
          strategy: { type: "Recreate" },
          selector: { matchLabels: resourceLabels },
          template: {
            metadata: { labels: resourceLabels },
            spec: {
              serviceAccountName: validated.serviceAccountName,
              automountServiceAccountToken: false,
              enableServiceLinks: false,
              securityContext: {
                runAsNonRoot: true,
                runAsUser: 65532,
                runAsGroup: 65532,
                fsGroup: 65532,
                seccompProfile: { type: "RuntimeDefault" },
              },
              containers: [
                {
                  name: "controller",
                  image: args.controllerImage,
                  imagePullPolicy: "IfNotPresent",
                  command: ["node", "/app/dist/trusted-node-label-controller-main.js"],
                  env: environment,
                  resources: {
                    requests: { cpu: "50m", memory: "96Mi" },
                    limits: { cpu: "500m", memory: "256Mi" },
                  },
                  securityContext: {
                    allowPrivilegeEscalation: false,
                    readOnlyRootFilesystem: true,
                    runAsNonRoot: true,
                    capabilities: { drop: ["ALL"] },
                    seccompProfile: { type: "RuntimeDefault" },
                  },
                  volumeMounts: [
                    {
                      name: "kubernetes-api",
                      mountPath: "/var/run/secrets/hulumi-kubernetes",
                      readOnly: true,
                    },
                    { name: "tmp", mountPath: "/tmp" },
                  ],
                },
              ],
              volumes: [
                {
                  name: "kubernetes-api",
                  projected: {
                    defaultMode: 292,
                    sources: [
                      {
                        serviceAccountToken: {
                          path: "token",
                          expirationSeconds: 600,
                        },
                      },
                      {
                        configMap: {
                          name: "kube-root-ca.crt",
                          items: [{ key: "ca.crt", path: "ca.crt" }],
                        },
                      },
                    ],
                  },
                },
                { name: "tmp", emptyDir: { sizeLimit: "16Mi" } },
              ],
            },
          },
        },
      },
      {
        ...k8sOptions,
        dependsOn: [
          serviceAccount,
          readClusterRole,
          readClusterRoleBinding,
          patchClusterRole,
          patchClusterRoleBinding,
          admissionPolicy,
          rolePolicy,
          accessEntry,
          podIdentityAssociation,
        ],
      },
    );

    const alarmDimensions = {
      ClusterName: args.clusterName,
      NodeGroupName: args.nodeGroupName,
    };
    const failureAlarm = new aws.cloudwatch.MetricAlarm(
      `${name}-failure-alarm`,
      {
        name: `${name}-reconcile-failures`,
        namespace: validated.metricNamespace,
        metricName: "ReconcileFailures",
        dimensions: alarmDimensions,
        comparisonOperator: "GreaterThanOrEqualToThreshold",
        evaluationPeriods: 1,
        period: 300,
        statistic: "Sum",
        threshold: 1,
        treatMissingData: "notBreaching",
        alarmActions: [args.alarmSnsTopicArn],
        okActions: [args.alarmSnsTopicArn],
        tags: commonTags,
      },
      childOptions,
    );
    const missingLabelAlarm = new aws.cloudwatch.MetricAlarm(
      `${name}-missing-label-alarm`,
      {
        name: `${name}-missing-trusted-label`,
        namespace: validated.metricNamespace,
        metricName: "MissingTrustedLabel",
        dimensions: alarmDimensions,
        comparisonOperator: "GreaterThanOrEqualToThreshold",
        evaluationPeriods: 2,
        datapointsToAlarm: 2,
        period: 300,
        statistic: "Maximum",
        threshold: 1,
        treatMissingData: "breaching",
        alarmActions: [args.alarmSnsTopicArn],
        okActions: [args.alarmSnsTopicArn],
        tags: commonTags,
      },
      childOptions,
    );

    this.roleArn = role.arn;
    this.serviceAccountName = pulumi.output(validated.serviceAccountName);
    this.deploymentName = pulumi.output(deploymentName);
    this.admissionPolicyName = pulumi.output(admissionPolicyName);
    this.alarmArns = pulumi.all([failureAlarm.arn, missingLabelAlarm.arn]);
    this.metricNamespace = pulumi.output(validated.metricNamespace);
    this.registerOutputs({
      roleArn: this.roleArn,
      serviceAccountName: this.serviceAccountName,
      deploymentName: this.deploymentName,
      admissionPolicyName: this.admissionPolicyName,
      alarmArns: this.alarmArns,
      metricNamespace: this.metricNamespace,
    });
  }
}
