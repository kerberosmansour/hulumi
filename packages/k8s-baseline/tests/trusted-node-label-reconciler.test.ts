import * as k8s from "@pulumi/kubernetes";
import { beforeEach, describe, expect, test } from "vitest";

import {
  EksTrustedNodeLabelReconciler,
  EKS_TRUSTED_NODE_LABEL_RECONCILER_COMPONENT_TYPE,
} from "../src";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

beforeEach(() => resetRegistrations());

function provider(): k8s.Provider {
  return new k8s.Provider("target", { kubeconfig: "mock-kubeconfig" });
}

function baseArgs() {
  return {
    k8sProvider: provider(),
    clusterName: "prod-eks",
    nodeGroupName: "trusted-workers",
    awsAccountId: "111122223333",
    awsRegion: "eu-west-2",
    namespace: "hulumi-system",
    controllerImage: `registry.example/hulumi/controller@sha256:${"a".repeat(64)}`,
    protectedLabelKey: "identity.node-restriction.kubernetes.io/workload",
    protectedLabelValue: "trusted",
    allowedInstanceTypes: ["m7i.large"],
    expectedTaints: [{ key: "dedicated", value: "trusted", effect: "NoSchedule" as const }],
    alarmSnsTopicArn: "arn:aws:sns:eu-west-2:111122223333:security-alerts",
  };
}

function resource(type: string) {
  const found = registrations.find((registration) => registration.type === type);
  if (found === undefined) throw new Error(`expected resource ${type}`);
  return found.inputs;
}

describe("EksTrustedNodeLabelReconciler component", () => {
  test("BDD-M2-5: renders the dedicated identity, minimal RBAC, admission, restricted workload and alarms", async () => {
    const component = new EksTrustedNodeLabelReconciler("trusted-label", baseArgs());
    await settlePulumi();

    expect(
      registrations.some((r) => r.type === EKS_TRUSTED_NODE_LABEL_RECONCILER_COMPONENT_TYPE),
    ).toBe(true);
    const expectedTypes = [
      "aws:iam/role:Role",
      "aws:iam/rolePolicy:RolePolicy",
      "aws:eks/podIdentityAssociation:PodIdentityAssociation",
      "kubernetes:core/v1:ServiceAccount",
      "kubernetes:rbac.authorization.k8s.io/v1:ClusterRole",
      "kubernetes:rbac.authorization.k8s.io/v1:ClusterRoleBinding",
      "kubernetes:admissionregistration.k8s.io/v1:ValidatingAdmissionPolicy",
      "kubernetes:admissionregistration.k8s.io/v1:ValidatingAdmissionPolicyBinding",
      "kubernetes:apps/v1:Deployment",
    ];
    for (const type of expectedTypes) {
      expect(
        registrations.some((r) => r.type === type),
        type,
      ).toBe(true);
    }
    expect(
      registrations.filter((r) => r.type === "aws:cloudwatch/metricAlarm:MetricAlarm"),
    ).toHaveLength(2);

    const rolePolicy = JSON.parse(resource("aws:iam/rolePolicy:RolePolicy").policy as string) as {
      Statement: Array<{ Action: string[]; Resource: string; Condition?: unknown }>;
    };
    expect(rolePolicy.Statement.flatMap((statement) => statement.Action).sort()).toEqual([
      "autoscaling:DescribeAutoScalingGroups",
      "cloudwatch:PutMetricData",
      "ec2:DescribeInstances",
      "eks:DescribeNodegroup",
    ]);
    expect(rolePolicy.Statement.every((statement) => !statement.Action.includes("*"))).toBe(true);
    expect(
      rolePolicy.Statement.find((statement) => statement.Action.includes("eks:DescribeNodegroup"))
        ?.Resource,
    ).toBe("arn:aws:eks:eu-west-2:111122223333:nodegroup/prod-eks/trusted-workers/*");

    expect(resource("kubernetes:rbac.authorization.k8s.io/v1:ClusterRole").rules).toEqual([
      { apiGroups: [""], resources: ["nodes"], verbs: ["get", "list", "patch"] },
    ]);
    const policy = resource("kubernetes:admissionregistration.k8s.io/v1:ValidatingAdmissionPolicy")
      .spec as { failurePolicy: string; validations: Array<{ expression: string }> };
    expect(policy.failurePolicy).toBe("Fail");
    const expressions = policy.validations.map((validation) => validation.expression).join("\n");
    expect(expressions).toContain("system:serviceaccount:hulumi-system:trusted-label-reconciler");
    expect(expressions).toContain("identity.node-restriction.kubernetes.io/workload");
    expect(expressions).toContain("object.spec == oldObject.spec");
    expect(expressions).toContain("oldObject.metadata.labels.all");
    expect(expressions).toContain("object.metadata.labels.all");
    expect(expressions).toContain("oldObject.metadata.labels.size() == 1");
    expect(expressions).toContain(
      'oldObject.metadata.labels["identity.node-restriction.kubernetes.io/workload"] == "trusted"',
    );
    for (const field of [
      "generateName",
      "namespace",
      "selfLink",
      "generation",
      "creationTimestamp",
      "deletionGracePeriodSeconds",
      "managedFields",
    ]) {
      expect(expressions).toContain(`metadata.${field}`);
    }

    const deployment = resource("kubernetes:apps/v1:Deployment").spec as {
      replicas: number;
      strategy: { type: string };
      template: { spec: Record<string, unknown> & { containers: Array<Record<string, unknown>> } };
    };
    expect(deployment.replicas).toBe(1);
    expect(deployment.strategy).toEqual({ type: "Recreate" });
    expect(deployment.template.spec).toMatchObject({
      serviceAccountName: "trusted-label-reconciler",
      automountServiceAccountToken: false,
      enableServiceLinks: false,
      securityContext: { runAsNonRoot: true, seccompProfile: { type: "RuntimeDefault" } },
    });
    expect(deployment.template.spec.containers).toHaveLength(1);
    expect(deployment.template.spec.containers[0]).toMatchObject({
      image: baseArgs().controllerImage,
      imagePullPolicy: "IfNotPresent",
      securityContext: {
        allowPrivilegeEscalation: false,
        readOnlyRootFilesystem: true,
        capabilities: { drop: ["ALL"] },
      },
    });
    const env = deployment.template.spec.containers[0].env as Array<{
      name: string;
      value: string;
    }>;
    expect(env).toContainEqual({ name: "AWS_EC2_METADATA_DISABLED", value: "true" });
    expect(env).toContainEqual({ name: "AWS_STS_REGIONAL_ENDPOINTS", value: "regional" });
    await expect(valueOf(component.serviceAccountName)).resolves.toBe("trusted-label-reconciler");
    await expect(valueOf(component.metricNamespace)).resolves.toBe(
      "Hulumi/EksTrustedNodeLabelReconciler",
    );
  });

  test("BDD-M2-4: mutable images and unsafe bounds fail before privileged children", () => {
    const args = baseArgs();
    expect(
      () =>
        new EksTrustedNodeLabelReconciler("mutable", { ...args, controllerImage: "image:latest" }),
    ).toThrow(/immutable @sha256/);
    expect(
      () =>
        new EksTrustedNodeLabelReconciler("unbounded", {
          ...args,
          reconcileIntervalSeconds: 1,
        }),
    ).toThrow(/reconcileIntervalSeconds/);
    expect(
      registrations.filter(
        (r) => r.type !== "pulumi:providers:kubernetes" && !r.type.startsWith("hulumi:"),
      ),
    ).toHaveLength(0);
  });

  test("BDD-M2-6: invalid protected labels, duplicate instances and empty taints fail closed", () => {
    const args = baseArgs();
    expect(
      () =>
        new EksTrustedNodeLabelReconciler("bad-label", {
          ...args,
          protectedLabelKey: "ordinary.example/workload",
        }),
    ).toThrow(/NodeRestriction/);
    expect(
      () =>
        new EksTrustedNodeLabelReconciler("duplicate-types", {
          ...args,
          allowedInstanceTypes: ["m7i.large", "m7i.large"],
        }),
    ).toThrow(/unique exact EC2/);
    expect(
      () =>
        new EksTrustedNodeLabelReconciler("no-taints", {
          ...args,
          expectedTaints: [],
        }),
    ).toThrow(/expectedTaints/);
  });
});
