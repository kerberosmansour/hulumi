import { beforeEach, describe, expect, it } from "vitest";
import {
  UnknownValueError,
  unknownCheckingProxy,
  type PolicyResource,
  type StackValidationArgs,
} from "@pulumi/policy";

const PULUMI_UNKNOWN_STRING = "04da6b54-80e4-46f7-96ec-b56ff0331ba9";

function resource(type: string, name: string, props: Record<string, unknown> = {}): PolicyResource {
  return {
    type,
    name,
    props,
    urn: `urn:pulumi:s::p::${type}::${name}`,
    dependencies: [],
    propertyDependencies: {},
  } as unknown as PolicyResource;
}

function stack(resources: PolicyResource[]): StackValidationArgs {
  return {
    resources,
    getConfig: (() => ({})) as StackValidationArgs["getConfig"],
  } as StackValidationArgs;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function updatePolicyContract(boundary: PolicyResource, updates: Record<string, unknown>): void {
  const outputs = boundary.props as Record<string, unknown>;
  boundary.props = {
    ...outputs,
    policyContract: {
      ...(outputs.policyContract as Record<string, unknown>),
      ...updates,
    },
  };
}

const boundaryTags = (kind: string) => ({
  "hulumi:component": "BrokeredAuroraPostgresBoundary",
  "hulumi:boundary": "orders",
  "hulumi:identity-kind": kind,
});

const workloadLabels = (kind: string) => ({
  "app.kubernetes.io/name": `orders-${kind}`,
  "app.kubernetes.io/part-of": "orders",
  "hulumi.dev/component": "BrokeredAuroraPostgresBoundary",
  "hulumi.dev/boundary": "orders",
  "hulumi.dev/identity-kind": kind,
});

const imageFor = (kind: string) =>
  `registry.example/${kind}@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`;

const placement = {
  runtime: {
    runtimeClassName: "runc",
    nodePool: {
      key: "guardian.node-restriction.kubernetes.io/workload-pool",
      value: "runtime",
    },
    toleration: {
      key: "hulumi.dev/workload-pool",
      value: "runtime",
      effect: "NoSchedule",
    },
    schedulerName: "default-scheduler",
    priorityClassName: "guardian-runtime",
  },
  privileged: {
    runtimeClassName: "gvisor",
    nodePool: {
      key: "guardian.node-restriction.kubernetes.io/workload-pool",
      value: "broker-privileged",
    },
    toleration: {
      key: "hulumi.dev/workload-pool",
      value: "broker-privileged",
      effect: "NoSchedule",
    },
    schedulerName: "default-scheduler",
    priorityClassName: "guardian-broker-privileged",
  },
};

function environmentFor(kind: string): Array<{ name: string; value: string }> {
  const environment = [
    {
      name: "AWS_ROLE_ARN",
      value: `arn:aws:iam::111122223333:role/orders-${kind}`,
    },
    {
      name: "AWS_WEB_IDENTITY_TOKEN_FILE",
      value: "/var/run/secrets/hulumi/identity/token",
    },
  ];
  if (kind === "runtime") {
    environment.push(
      {
        name: "BROKER_URL",
        value: "https://orders-broker.guardian-data.svc.cluster.local:7443",
      },
      { name: "CAPABILITY_AUDIENCE", value: "guardian-db-broker" },
    );
  }
  if (kind === "broker") {
    environment.push(
      { name: "DATABASE_HOST", value: "orders.cluster-example.eu-west-2.rds.amazonaws.com" },
      { name: "DATABASE_PORT", value: "5432" },
      {
        name: "APPLICATION_SECRET_A_ARN",
        value: "arn:aws:secretsmanager:eu-west-2:111122223333:secret:app-a",
      },
      {
        name: "APPLICATION_SECRET_B_ARN",
        value: "arn:aws:secretsmanager:eu-west-2:111122223333:secret:app-b",
      },
      { name: "CAPABILITY_ISSUER", value: "https://identity.guardian.example" },
      { name: "CAPABILITY_AUDIENCE", value: "guardian-db-broker" },
      { name: "CAPABILITY_JWKS_JSON", value: '{"keys":[{"kid":"key-1"}]}' },
      { name: "CAPABILITY_MAX_TTL_SECONDS", value: "60" },
      { name: "CAPABILITY_REPLAY_TABLE", value: "orders-capability-replay" },
      {
        name: "AWS_ENDPOINT_URL_DYNAMODB",
        value: "https://vpce-0123456789abcdef0-example.dynamodb.eu-west-2.vpce.amazonaws.com",
      },
    );
  }
  if (kind === "migrator" || kind === "rotation") {
    environment.push(
      { name: "DATABASE_HOST", value: "orders.cluster-example.eu-west-2.rds.amazonaws.com" },
      { name: "DATABASE_PORT", value: "5432" },
      {
        name: "MASTER_SECRET_ARN",
        value: "arn:aws:secretsmanager:eu-west-2:111122223333:secret:master",
      },
      {
        name: "APPLICATION_SECRET_A_ARN",
        value: "arn:aws:secretsmanager:eu-west-2:111122223333:secret:app-a",
      },
      {
        name: "APPLICATION_SECRET_B_ARN",
        value: "arn:aws:secretsmanager:eu-west-2:111122223333:secret:app-b",
      },
    );
  }
  return environment;
}

function workloadProps(kind: string): Record<string, unknown> {
  const labels = workloadLabels(kind);
  const expectedPlacement = kind === "runtime" ? placement.runtime : placement.privileged;
  const podSpec = {
    serviceAccountName: `orders-${kind}`,
    automountServiceAccountToken: false,
    enableServiceLinks: false,
    restartPolicy: kind === "runtime" || kind === "broker" ? "Always" : "Never",
    runtimeClassName: expectedPlacement.runtimeClassName,
    nodeSelector: {
      [expectedPlacement.nodePool.key]: expectedPlacement.nodePool.value,
    },
    affinity: {
      nodeAffinity: {
        requiredDuringSchedulingIgnoredDuringExecution: {
          nodeSelectorTerms: [
            {
              matchExpressions: [
                {
                  key: expectedPlacement.nodePool.key,
                  operator: "In",
                  values: [expectedPlacement.nodePool.value],
                },
              ],
            },
          ],
        },
      },
    },
    tolerations: [
      {
        key: expectedPlacement.toleration.key,
        operator: "Equal",
        value: expectedPlacement.toleration.value,
        effect: expectedPlacement.toleration.effect,
      },
    ],
    schedulerName: expectedPlacement.schedulerName,
    priorityClassName: expectedPlacement.priorityClassName,
    securityContext: {
      runAsNonRoot: true,
      seccompProfile: { type: "RuntimeDefault" },
    },
    containers: [
      {
        name: kind,
        image: imageFor(kind),
        imagePullPolicy: "IfNotPresent",
        command: [`/app/${kind}`],
        env: environmentFor(kind),
        ...(kind === "runtime" || kind === "broker"
          ? {
              ports: [
                {
                  name: "https",
                  containerPort: kind === "runtime" ? 8080 : 7443,
                },
              ],
            }
          : {}),
        resources: {
          requests: { cpu: "100m", memory: "128Mi" },
          limits: { cpu: "1", memory: "512Mi" },
        },
        volumeMounts: [
          {
            name: "aws-web-identity",
            mountPath: "/var/run/secrets/hulumi/identity/token",
            subPath: "token",
            readOnly: true,
          },
          { name: "tmp", mountPath: "/tmp" },
        ],
        securityContext: {
          runAsNonRoot: true,
          allowPrivilegeEscalation: false,
          readOnlyRootFilesystem: true,
          privileged: false,
          seccompProfile: { type: "RuntimeDefault" },
          capabilities: { drop: ["ALL"] },
        },
      },
    ],
  };
  if (kind === "rotation") {
    return {
      metadata: { labels },
      spec: {
        suspend: true,
        jobTemplate: {
          spec: {
            template: {
              metadata: { labels },
              spec: podSpec,
            },
          },
        },
      },
    };
  }
  return {
    metadata: { labels },
    spec: {
      ...(kind === "runtime" || kind === "broker" ? { replicas: 0 } : { suspend: true }),
      template: {
        metadata: { labels },
        spec: podSpec,
      },
    },
  };
}

function admissionExpressions(): string[] {
  const identities = ["runtime", "broker", "migrator", "rotation"];
  const serviceAccounts = identities.map((kind) => `orders-${kind}`);
  const serviceAccountSet = `[${serviceAccounts
    .map((account) => JSON.stringify(account))
    .join(", ")}]`;
  const labels = "object.metadata.labels";
  const protectedPod = `(object.spec.serviceAccountName in ${serviceAccountSet} || (has(${labels}) && (("hulumi.dev/component" in ${labels} && ${labels}["hulumi.dev/component"] == "BrokeredAuroraPostgresBoundary") || ("hulumi.dev/boundary" in ${labels} && ${labels}["hulumi.dev/boundary"] == "orders") || "hulumi.dev/identity-kind" in ${labels})))`;
  const exactVolumeMounts = `has(object.spec.containers[0].volumeMounts) && object.spec.containers[0].volumeMounts.size() == 2 && object.spec.containers[0].volumeMounts.exists(m, m.name == "aws-web-identity" && m.mountPath == "/var/run/secrets/hulumi/identity/token" && m.subPath == "token" && m.readOnly == true) && object.spec.containers[0].volumeMounts.exists(m, m.name == "tmp" && m.mountPath == "/tmp" && (!has(m.subPath) || m.subPath == "") && (!has(m.readOnly) || m.readOnly == false))`;
  const envelopes = identities.map((kind, kindIndex) => {
    const environment = environmentFor(kind);
    const expectedPlacement = kind === "runtime" ? placement.runtime : placement.privileged;
    const nodeKey = JSON.stringify(expectedPlacement.nodePool.key);
    const nodeValue = JSON.stringify(expectedPlacement.nodePool.value);
    const exactPlacement = `has(object.spec.runtimeClassName) && object.spec.runtimeClassName == ${JSON.stringify(
      expectedPlacement.runtimeClassName,
    )} && has(object.spec.nodeSelector) && object.spec.nodeSelector.size() == 1 && object.spec.nodeSelector[${nodeKey}] == ${nodeValue} && has(object.spec.affinity) && has(object.spec.affinity.nodeAffinity) && has(object.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution) && object.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms.size() == 1 && object.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[0].matchExpressions.size() == 1 && object.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[0].matchExpressions[0].key == ${nodeKey} && object.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[0].matchExpressions[0].operator == "In" && object.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[0].matchExpressions[0].values == [${nodeValue}] && has(object.spec.tolerations) && object.spec.tolerations.size() == 1 && object.spec.tolerations[0].key == ${JSON.stringify(
      expectedPlacement.toleration.key,
    )} && object.spec.tolerations[0].operator == "Equal" && object.spec.tolerations[0].value == ${JSON.stringify(
      expectedPlacement.toleration.value,
    )} && object.spec.tolerations[0].effect == ${JSON.stringify(
      expectedPlacement.toleration.effect,
    )} && object.spec.schedulerName == ${JSON.stringify(
      expectedPlacement.schedulerName,
    )} && object.spec.priorityClassName == ${JSON.stringify(expectedPlacement.priorityClassName)}`;
    const environmentExpression = `has(object.spec.containers[0].env) && object.spec.containers[0].env.size() == ${environment.length} && ${environment
      .map(
        ({ name, value }, index) =>
          `object.spec.containers[0].env[${index}].name == ${JSON.stringify(name)} && has(object.spec.containers[0].env[${index}].value) && object.spec.containers[0].env[${index}].value == ${JSON.stringify(value)} && !has(object.spec.containers[0].env[${index}].valueFrom)`,
      )
      .join(" && ")}`;
    const expectedPorts =
      kind === "runtime" || kind === "broker"
        ? `(has(c.ports) && c.ports.size() == 1 && c.ports[0].name == "https" && c.ports[0].containerPort == ${kind === "runtime" ? 8080 : 7443} && (!has(c.ports[0].protocol) || c.ports[0].protocol == "TCP"))`
        : "(!has(c.ports) || c.ports.size() == 0)";
    const exactContainerControls = `object.spec.containers.all(c, c.imagePullPolicy == "IfNotPresent" && (!has(c.args) || c.args.size() == 0) && ${expectedPorts} && (!has(c.lifecycle)) && (!has(c.livenessProbe)) && (!has(c.readinessProbe)) && (!has(c.startupProbe)) && (!has(c.stdin) || c.stdin == false) && (!has(c.stdinOnce) || c.stdinOnce == false) && (!has(c.tty) || c.tty == false) && (!has(c.workingDir) || c.workingDir == "") && has(c.resources) && c.resources.requests.cpu == "100m" && c.resources.requests.memory == "128Mi" && c.resources.limits.cpu == "1" && c.resources.limits.memory == "512Mi")`;
    return `(object.spec.serviceAccountName == ${JSON.stringify(
      serviceAccounts[kindIndex],
    )} && has(${labels}) && ${labels}["hulumi.dev/component"] == "BrokeredAuroraPostgresBoundary" && ${labels}["hulumi.dev/boundary"] == "orders" && ${labels}["hulumi.dev/identity-kind"] == ${JSON.stringify(
      kind,
    )} && ${labels}["app.kubernetes.io/name"] == ${JSON.stringify(
      `orders-${kind}`,
    )} && ${labels}["app.kubernetes.io/part-of"] == "orders" && object.spec.containers.size() == 1 && object.spec.containers[0].name == ${JSON.stringify(
      kind,
    )} && object.spec.containers[0].image == ${JSON.stringify(
      imageFor(kind),
    )} && has(object.spec.containers[0].command) && object.spec.containers[0].command == [${JSON.stringify(
      `/app/${kind}`,
    )}] && ${environmentExpression} && ${exactVolumeMounts} && ${exactContainerControls} && ${exactPlacement})`;
  });
  return [
    `!${protectedPod} || (${envelopes.join(" || ")})`,
    `!${protectedPod} || ((!has(object.spec.hostNetwork) || object.spec.hostNetwork == false) && (!has(object.spec.hostPID) || object.spec.hostPID == false) && (!has(object.spec.hostIPC) || object.spec.hostIPC == false) && (!has(object.spec.shareProcessNamespace) || object.spec.shareProcessNamespace == false) && (!has(object.spec.hostAliases) || object.spec.hostAliases.size() == 0) && (!has(object.spec.dnsConfig)) && (!has(object.spec.dnsPolicy) || object.spec.dnsPolicy == "ClusterFirst") && (!has(object.spec.initContainers) || object.spec.initContainers.size() == 0) && (!has(object.spec.ephemeralContainers) || object.spec.ephemeralContainers.size() == 0) && object.spec.automountServiceAccountToken == false && object.spec.enableServiceLinks == false && has(object.spec.securityContext) && object.spec.securityContext.runAsNonRoot == true && object.spec.securityContext.seccompProfile.type == "RuntimeDefault" && object.spec.containers.all(c, has(c.securityContext) && (!has(c.securityContext.privileged) || c.securityContext.privileged == false) && c.securityContext.runAsNonRoot == true && c.securityContext.allowPrivilegeEscalation == false && c.securityContext.readOnlyRootFilesystem == true && (!has(c.securityContext.procMount) || c.securityContext.procMount == "Default") && c.securityContext.seccompProfile.type == "RuntimeDefault" && c.securityContext.capabilities.drop.size() == 1 && c.securityContext.capabilities.drop[0] == "ALL" && (!has(c.securityContext.capabilities.add) || c.securityContext.capabilities.add.size() == 0)))`,
    `!${protectedPod} || (object.spec.containers.all(c, (!has(c.envFrom) || c.envFrom.size() == 0) && (!has(c.env) || c.env.all(e, !has(e.valueFrom) && (!has(e.valueFrom) || !has(e.valueFrom.secretKeyRef))))) && object.spec.volumes.size() == 2 && object.spec.volumes.all(v, !has(v.secret) && (!has(v.projected) || v.projected.sources.all(s, !has(s.secret)))) && object.spec.volumes.exists(v, v.name == "aws-web-identity" && has(v.projected) && v.projected.sources.size() == 1 && has(v.projected.sources[0].serviceAccountToken) && v.projected.sources[0].serviceAccountToken.audience == "sts.amazonaws.com" && v.projected.sources[0].serviceAccountToken.expirationSeconds == 900 && v.projected.sources[0].serviceAccountToken.path == "token") && object.spec.volumes.exists(v, v.name == "tmp" && has(v.emptyDir)))`,
  ];
}

function networkPolicyProps(kind: string): Record<string, unknown> {
  const labels = workloadLabels(kind);
  const dnsEgress = {
    to: [{ ipBlock: { cidr: "10.42.0.2/32" } }],
    ports: [
      { protocol: "UDP", port: 53 },
      { protocol: "TCP", port: 53 },
    ],
  };
  const base = {
    metadata: {
      name: kind === "runtime" ? "orders-runtime-closed-egress" : `orders-${kind}-closed-network`,
      namespace: "guardian-data",
      labels,
    },
  };
  if (kind === "runtime") {
    return {
      ...base,
      spec: {
        podSelector: { matchLabels: labels },
        policyTypes: ["Ingress", "Egress"],
        ingress: [],
        egress: [
          {
            to: [{ podSelector: { matchLabels: workloadLabels("broker") } }],
            ports: [{ protocol: "TCP", port: 7443 }],
          },
          dnsEgress,
        ],
      },
    };
  }
  const egress = [
    {
      to: [{ ipBlock: { cidr: "10.42.8.0/24" } }],
      ports: [{ protocol: "TCP", port: 5432 }],
    },
    {
      to: [{ ipBlock: { cidr: "10.42.10.0/28" } }],
      ports: [{ protocol: "TCP", port: 443 }],
    },
    dnsEgress,
  ];
  return {
    ...base,
    spec: {
      podSelector: { matchLabels: labels },
      policyTypes: ["Ingress", "Egress"],
      ingress:
        kind === "broker"
          ? [
              {
                from: [{ podSelector: { matchLabels: workloadLabels("runtime") } }],
                ports: [{ protocol: "TCP", port: 7443 }],
              },
            ]
          : [],
      egress,
    },
  };
}

function closedBoundary(): PolicyResource[] {
  const identities = ["runtime", "broker", "migrator", "rotation"];
  const resources = [
    resource("hulumi:platform:BrokeredAuroraPostgresBoundary", "orders", {
      policyContract: {
        awsRegion: "eu-west-2",
        namespace: "guardian-data",
        oidcProviderArn:
          "arn:aws:iam::111122223333:oidc-provider/oidc.eks.eu-west-2.amazonaws.com/id/EXAMPLE",
        oidcIssuer: "https://oidc.eks.eu-west-2.amazonaws.com/id/EXAMPLE",
        kmsKeyArn: "arn:aws:kms:eu-west-2:111122223333:key/x",
        masterSecretArn: "arn:aws:secretsmanager:eu-west-2:111122223333:secret:master",
        applicationSecretNames: ["app-a", "app-b"],
        database: {
          endpoint: "orders.cluster-example.eu-west-2.rds.amazonaws.com",
          securityGroupId: "sg-database",
          port: 5432,
          cidrs: ["10.42.8.0/24"],
        },
        dnsResolverCidrs: ["10.42.0.2/32"],
        endpointCidrs: ["10.42.10.0/28"],
        endpointSecurityGroupIds: {
          secretsManager: "sg-secrets-endpoint",
          kms: "sg-kms-endpoint",
          dynamodb: "sg-dynamodb-endpoint",
        },
        dynamodbVpcEndpointId: "vpce-0123456789abcdef0",
        dynamodbEndpointUrl:
          "https://vpce-0123456789abcdef0-example.dynamodb.eu-west-2.vpce.amazonaws.com",
        capability: {
          issuer: "https://identity.guardian.example",
          audience: "guardian-db-broker",
          jwksJson: '{"keys":[{"kid":"key-1"}]}',
          maxTtlSeconds: 60,
        },
        placement,
        rollout: { phase: "infrastructure" },
        workloads: {
          runtime: { image: imageFor("runtime"), command: ["/app/runtime"], port: 8080 },
          broker: { image: imageFor("broker"), command: ["/app/broker"], port: 7443 },
          migrator: { image: imageFor("migrator"), command: ["/app/migrator"] },
          rotation: { image: imageFor("rotation"), command: ["/app/rotation"] },
        },
      },
    }),
    resource("hulumi:baseline:aws:SecureSecret", "orders-application-a", {
      secretArn: "arn:aws:secretsmanager:eu-west-2:111122223333:secret:app-a",
      rotationPosture: "advisory-missing",
    }),
    resource("hulumi:baseline:aws:SecureSecret", "orders-application-b", {
      secretArn: "arn:aws:secretsmanager:eu-west-2:111122223333:secret:app-b",
      rotationPosture: "advisory-missing",
    }),
    resource("aws:secretsmanager/secret:Secret", "orders-application-a-secret", {
      name: "app-a",
      arn: "arn:aws:secretsmanager:eu-west-2:111122223333:secret:app-a",
      kmsKeyId: "arn:aws:kms:eu-west-2:111122223333:key/x",
      tags: {
        "hulumi:component": "SecureSecret",
        "hulumi:boundary": "orders",
        "hulumi:credential-slot": "a",
      },
    }),
    resource("aws:secretsmanager/secret:Secret", "orders-application-b-secret", {
      name: "app-b",
      arn: "arn:aws:secretsmanager:eu-west-2:111122223333:secret:app-b",
      kmsKeyId: "arn:aws:kms:eu-west-2:111122223333:key/x",
      tags: {
        "hulumi:component": "SecureSecret",
        "hulumi:boundary": "orders",
        "hulumi:credential-slot": "b",
      },
    }),
    ...identities.map((kind) =>
      resource("aws:iam/role:Role", `orders-${kind}-role`, {
        name: `orders-${kind}`,
        arn: `arn:aws:iam::111122223333:role/orders-${kind}`,
        tags: boundaryTags(kind),
        assumeRolePolicy: JSON.stringify({
          Statement: [
            {
              Effect: "Allow",
              Action: "sts:AssumeRoleWithWebIdentity",
              Principal: {
                Federated:
                  "arn:aws:iam::111122223333:oidc-provider/oidc.eks.eu-west-2.amazonaws.com/id/EXAMPLE",
              },
              Condition: {
                StringEquals: {
                  "oidc.eks.eu-west-2.amazonaws.com/id/EXAMPLE:aud": "sts.amazonaws.com",
                  "oidc.eks.eu-west-2.amazonaws.com/id/EXAMPLE:sub": `system:serviceaccount:guardian-data:orders-${kind}`,
                },
              },
            },
          ],
        }),
      }),
    ),
    ...identities.map((kind) =>
      resource("kubernetes:core/v1:ServiceAccount", `orders-${kind}-sa`, {
        metadata: {
          name: `orders-${kind}`,
          namespace: "guardian-data",
          labels: workloadLabels(kind),
          annotations: {
            "eks.amazonaws.com/role-arn": `arn:aws:iam::111122223333:role/orders-${kind}`,
          },
        },
        automountServiceAccountToken: false,
      }),
    ),
    ...identities.map((kind) =>
      resource(
        "kubernetes:apiextensions.k8s.io:CustomResource",
        `orders-${kind}-security-group-policy`,
        {
          apiVersion: "vpcresources.k8s.aws/v1beta1",
          kind: "SecurityGroupPolicy",
          metadata: {
            name: `orders-${kind}`,
            namespace: "guardian-data",
            labels: workloadLabels(kind),
          },
          spec: {
            podSelector: { matchLabels: workloadLabels(kind) },
            securityGroups: { groupIds: [`orders-${kind}-sg_id`] },
          },
        },
      ),
    ),
    ...identities.map((kind) =>
      resource(
        "kubernetes:networking.k8s.io/v1:NetworkPolicy",
        `orders-${kind}-network`,
        networkPolicyProps(kind),
      ),
    ),
    resource("kubernetes:apps/v1:Deployment", "runtime", workloadProps("runtime")),
    resource("kubernetes:apps/v1:Deployment", "broker", workloadProps("broker")),
    resource("kubernetes:batch/v1:Job", "migrator", workloadProps("migrator")),
    resource("kubernetes:batch/v1:CronJob", "rotation", workloadProps("rotation")),
    resource("aws:iam/rolePolicy:RolePolicy", "broker-policy", {
      role: "orders-broker",
      policy: JSON.stringify({
        Statement: [
          {
            Effect: "Allow",
            Action: ["secretsmanager:GetSecretValue"],
            Resource: [
              "arn:aws:secretsmanager:eu-west-2:111122223333:secret:app-a",
              "arn:aws:secretsmanager:eu-west-2:111122223333:secret:app-b",
            ],
            Condition: {
              StringEquals: { "secretsmanager:VersionStage": "AWSCURRENT" },
            },
          },
          {
            Effect: "Allow",
            Action: ["secretsmanager:DescribeSecret"],
            Resource: [
              "arn:aws:secretsmanager:eu-west-2:111122223333:secret:app-a",
              "arn:aws:secretsmanager:eu-west-2:111122223333:secret:app-b",
            ],
          },
          {
            Effect: "Allow",
            Action: ["kms:Decrypt"],
            Resource: "arn:aws:kms:eu-west-2:111122223333:key/x",
            Condition: {
              StringEquals: {
                "kms:ViaService": "secretsmanager.eu-west-2.amazonaws.com",
              },
              "ForAnyValue:StringEquals": {
                "kms:EncryptionContext:SecretARN": [
                  "arn:aws:secretsmanager:eu-west-2:111122223333:secret:app-a",
                  "arn:aws:secretsmanager:eu-west-2:111122223333:secret:app-b",
                ],
              },
            },
          },
        ],
      }),
    }),
    resource("aws:iam/rolePolicy:RolePolicy", "migrator-policy", {
      role: "orders-migrator",
      policy: JSON.stringify({
        Statement: [
          {
            Effect: "Allow",
            Action: ["secretsmanager:GetSecretValue"],
            Resource: [
              "arn:aws:secretsmanager:eu-west-2:111122223333:secret:app-a",
              "arn:aws:secretsmanager:eu-west-2:111122223333:secret:app-b",
              "arn:aws:secretsmanager:eu-west-2:111122223333:secret:master",
            ],
            Condition: {
              StringEquals: { "secretsmanager:VersionStage": "AWSCURRENT" },
            },
          },
          {
            Effect: "Allow",
            Action: ["secretsmanager:DescribeSecret"],
            Resource: [
              "arn:aws:secretsmanager:eu-west-2:111122223333:secret:app-a",
              "arn:aws:secretsmanager:eu-west-2:111122223333:secret:app-b",
              "arn:aws:secretsmanager:eu-west-2:111122223333:secret:master",
            ],
          },
          {
            Effect: "Allow",
            Action: ["kms:Decrypt"],
            Resource: "arn:aws:kms:eu-west-2:111122223333:key/x",
            Condition: {
              StringEquals: {
                "kms:ViaService": "secretsmanager.eu-west-2.amazonaws.com",
              },
              "ForAnyValue:StringEquals": {
                "kms:EncryptionContext:SecretARN": [
                  "arn:aws:secretsmanager:eu-west-2:111122223333:secret:app-a",
                  "arn:aws:secretsmanager:eu-west-2:111122223333:secret:app-b",
                  "arn:aws:secretsmanager:eu-west-2:111122223333:secret:master",
                ],
              },
            },
          },
        ],
      }),
    }),
    resource("aws:iam/rolePolicy:RolePolicy", "rotation-policy", {
      role: "orders-rotation",
      policy: JSON.stringify({
        Statement: [
          {
            Effect: "Allow",
            Action: ["secretsmanager:GetSecretValue"],
            Resource: [
              "arn:aws:secretsmanager:eu-west-2:111122223333:secret:app-a",
              "arn:aws:secretsmanager:eu-west-2:111122223333:secret:app-b",
              "arn:aws:secretsmanager:eu-west-2:111122223333:secret:master",
            ],
            Condition: {
              StringEquals: { "secretsmanager:VersionStage": "AWSCURRENT" },
            },
          },
          {
            Effect: "Allow",
            Action: ["secretsmanager:DescribeSecret"],
            Resource: [
              "arn:aws:secretsmanager:eu-west-2:111122223333:secret:app-a",
              "arn:aws:secretsmanager:eu-west-2:111122223333:secret:app-b",
              "arn:aws:secretsmanager:eu-west-2:111122223333:secret:master",
            ],
          },
          {
            Effect: "Allow",
            Action: ["secretsmanager:PutSecretValue", "secretsmanager:UpdateSecretVersionStage"],
            Resource: [
              "arn:aws:secretsmanager:eu-west-2:111122223333:secret:app-a",
              "arn:aws:secretsmanager:eu-west-2:111122223333:secret:app-b",
            ],
          },
          {
            Effect: "Allow",
            Action: ["kms:Decrypt"],
            Resource: "arn:aws:kms:eu-west-2:111122223333:key/x",
            Condition: {
              StringEquals: {
                "kms:ViaService": "secretsmanager.eu-west-2.amazonaws.com",
              },
              "ForAnyValue:StringEquals": {
                "kms:EncryptionContext:SecretARN": [
                  "arn:aws:secretsmanager:eu-west-2:111122223333:secret:app-a",
                  "arn:aws:secretsmanager:eu-west-2:111122223333:secret:app-b",
                  "arn:aws:secretsmanager:eu-west-2:111122223333:secret:master",
                ],
              },
            },
          },
          {
            Effect: "Allow",
            Action: ["kms:GenerateDataKey"],
            Resource: "arn:aws:kms:eu-west-2:111122223333:key/x",
            Condition: {
              StringEquals: {
                "kms:ViaService": "secretsmanager.eu-west-2.amazonaws.com",
              },
              "ForAnyValue:StringEquals": {
                "kms:EncryptionContext:SecretARN": [
                  "arn:aws:secretsmanager:eu-west-2:111122223333:secret:app-a",
                  "arn:aws:secretsmanager:eu-west-2:111122223333:secret:app-b",
                ],
              },
            },
          },
        ],
      }),
    }),
    resource("aws:iam/rolePolicy:RolePolicy", "broker-replay-policy", {
      role: "orders-broker",
      policy: JSON.stringify({
        Statement: [
          {
            Effect: "Allow",
            Action: ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:DescribeTable"],
            Resource: "arn:aws:dynamodb:eu-west-2:111122223333:table/orders-capability-replay",
            Condition: {
              StringEquals: { "aws:SourceVpce": "vpce-0123456789abcdef0" },
            },
          },
        ],
      }),
    }),
    resource("aws:ec2/securityGroup:SecurityGroup", "orders-runtime-sg", {
      tags: boundaryTags("runtime"),
    }),
    resource("aws:ec2/securityGroup:SecurityGroup", "orders-broker-sg", {
      tags: boundaryTags("broker"),
    }),
    resource("aws:ec2/securityGroup:SecurityGroup", "orders-migrator-sg", {
      tags: boundaryTags("migrator"),
    }),
    resource("aws:ec2/securityGroup:SecurityGroup", "orders-rotation-sg", {
      tags: boundaryTags("rotation"),
    }),
    resource("aws:vpc/securityGroupEgressRule:SecurityGroupEgressRule", "runtime-to-broker", {
      securityGroupId: "orders-runtime-sg_id",
      referencedSecurityGroupId: "orders-broker-sg_id",
      ipProtocol: "tcp",
      fromPort: 7443,
      toPort: 7443,
    }),
    resource("aws:vpc/securityGroupEgressRule:SecurityGroupEgressRule", "broker-to-db", {
      securityGroupId: "orders-broker-sg_id",
      referencedSecurityGroupId: "sg-database",
      ipProtocol: "tcp",
      fromPort: 5432,
      toPort: 5432,
    }),
    resource(
      "aws:vpc/securityGroupEgressRule:SecurityGroupEgressRule",
      "broker-to-dynamodb-endpoint",
      {
        securityGroupId: "orders-broker-sg_id",
        referencedSecurityGroupId: "sg-dynamodb-endpoint",
        ipProtocol: "tcp",
        fromPort: 443,
        toPort: 443,
      },
    ),
    resource("aws:dynamodb/table:Table", "replay", {
      name: "orders-capability-replay",
      arn: "arn:aws:dynamodb:eu-west-2:111122223333:table/orders-capability-replay",
      tags: {
        "hulumi:component": "BrokeredAuroraPostgresBoundary",
        "hulumi:boundary": "orders",
        "hulumi:purpose": "capability-replay",
      },
      ttl: { enabled: true, attributeName: "expiresAt" },
      serverSideEncryption: {
        enabled: true,
        kmsKeyArn: "arn:aws:kms:eu-west-2:111122223333:key/x",
      },
    }),
    resource(
      "kubernetes:admissionregistration.k8s.io/v1:ValidatingAdmissionPolicy",
      "orders-envelope",
      {
        metadata: {
          name: "orders-closed-workload-envelope",
          labels: {
            "hulumi.dev/component": "BrokeredAuroraPostgresBoundary",
            "hulumi.dev/boundary": "orders",
          },
        },
        spec: {
          failurePolicy: "Fail",
          matchConstraints: {
            resourceRules: [
              {
                apiGroups: [""],
                apiVersions: ["v1"],
                operations: ["CREATE", "UPDATE"],
                resources: ["pods", "pods/ephemeralcontainers"],
              },
            ],
          },
          validations: admissionExpressions().map((expression) => ({ expression })),
        },
      },
    ),
    resource(
      "kubernetes:admissionregistration.k8s.io/v1:ValidatingAdmissionPolicyBinding",
      "orders-envelope-binding",
      {
        metadata: {
          labels: {
            "hulumi.dev/component": "BrokeredAuroraPostgresBoundary",
            "hulumi.dev/boundary": "orders",
          },
        },
        spec: {
          policyName: "orders-closed-workload-envelope",
          validationActions: ["Deny"],
          matchResources: {
            namespaceSelector: {
              matchLabels: { "kubernetes.io/metadata.name": "guardian-data" },
            },
          },
        },
      },
    ),
  ];
  const boundary = resources[0];
  const componentBySlot = new Map(
    resources
      .filter((entry) => entry.type === "hulumi:baseline:aws:SecureSecret")
      .map((entry) => [entry.name.endsWith("-a") ? "a" : "b", entry]),
  );
  for (const component of componentBySlot.values()) component.parent = boundary;
  for (const secret of resources.filter(
    (entry) => entry.type === "aws:secretsmanager/secret:Secret",
  )) {
    const slot = String(
      (secret.props as Record<string, unknown>).tags &&
        ((secret.props as Record<string, unknown>).tags as Record<string, unknown>)[
          "hulumi:credential-slot"
        ],
    );
    const component = componentBySlot.get(slot);
    if (component !== undefined) secret.parent = component;
  }
  return resources;
}

function firstCreatePreviewBoundary(options: { knownBadKms?: boolean } = {}): PolicyResource[] {
  const resources = closedBoundary();
  const boundary = resources.find(
    (entry) => entry.type === "hulumi:platform:BrokeredAuroraPostgresBoundary",
  )!;
  for (const resource of resources) {
    if (resource !== boundary && resource.parent === undefined) resource.parent = boundary;
  }

  for (const resource of resources) {
    const props = clone(resource.props as Record<string, unknown>);
    if (resource.type === "hulumi:baseline:aws:SecureSecret") {
      props.secretArn = PULUMI_UNKNOWN_STRING;
      resource.props = unknownCheckingProxy(props);
      continue;
    }
    if (resource.type === "aws:secretsmanager/secret:Secret") {
      props.arn = PULUMI_UNKNOWN_STRING;
      if (options.knownBadKms === true && resource.name === "orders-application-a-secret") {
        props.kmsKeyId = "arn:aws:kms:eu-west-2:123456789012:key/wrong";
      }
      resource.props = unknownCheckingProxy(props);
      continue;
    }
    if (resource.type === "aws:iam/role:Role") {
      props.arn = PULUMI_UNKNOWN_STRING;
      resource.props = unknownCheckingProxy(props);
      continue;
    }
    if (resource.type === "kubernetes:core/v1:ServiceAccount") {
      const metadata = props.metadata as Record<string, unknown>;
      const annotations = metadata.annotations as Record<string, unknown>;
      annotations["eks.amazonaws.com/role-arn"] = PULUMI_UNKNOWN_STRING;
      resource.props = unknownCheckingProxy(props);
      continue;
    }
    if (resource.type === "aws:iam/rolePolicy:RolePolicy") {
      props.policy = PULUMI_UNKNOWN_STRING;
      resource.props = unknownCheckingProxy(props);
    }
  }

  return resources;
}

describe("HulumiBrokeredPostgresBoundaryPack", () => {
  let violations: string[];

  beforeEach(() => {
    violations = [];
  });

  async function evaluate(resources: PolicyResource[]) {
    const mod = (await import("../../src/platform")) as Record<string, unknown>;
    expect(mod.brokeredPg1ClosedAuthorityBoundary).toBeDefined();
    const policy = mod.brokeredPg1ClosedAuthorityBoundary as {
      validateStack: (args: StackValidationArgs, report: (message: string) => void) => void;
    };
    policy.validateStack(stack(resources), (message) => violations.push(message));
  }

  it("accepts the positive twin with four identities, runtime-to-broker-only, and replay controls", async () => {
    const resources = closedBoundary();
    resources.push(
      resource("aws:secretsmanager/secretVersion:SecretVersion", "unrelated-stack-secret", {}),
    );
    await evaluate(resources);
    expect(violations).toEqual([]);
  });

  it("fails closed with one actionable violation when a legacy component omits policyContract", async () => {
    const resources = closedBoundary();
    const boundary = resources.find(
      (entry) => entry.type === "hulumi:platform:BrokeredAuroraPostgresBoundary",
    )!;
    boundary.props = clone(
      (boundary.props as Record<string, unknown>).policyContract as Record<string, unknown>,
    );

    await evaluate(resources);
    expect(violations).toEqual([
      expect.stringMatching(/must publish.*policyContract.*update.*together/i),
    ]);
  });

  it("emits no mandatory false positive before Pulumi defers first-create provider outputs", async () => {
    let deferred: unknown;
    try {
      await evaluate(firstCreatePreviewBoundary());
    } catch (error) {
      deferred = error;
    }

    expect(deferred).toBeInstanceOf(UnknownValueError);
    expect(violations).toEqual([]);
  });

  it("rejects known bad KMS input while provider-generated ARNs remain unknown", async () => {
    let deferred: unknown;
    try {
      await evaluate(firstCreatePreviewBoundary({ knownBadKms: true }));
    } catch (error) {
      deferred = error;
    }

    expect(deferred).toBeInstanceOf(UnknownValueError);
    expect(violations).toEqual([
      expect.stringMatching(/application-secret.*exact boundary KMS key/i),
    ]);
  });

  it("normalizes IAM action casing while requiring a sole exact IRSA trust statement", async () => {
    const resources = closedBoundary();
    const runtimeRole = resources.find((entry) => entry.name === "orders-runtime-role")!;
    const trust = JSON.parse(
      String((runtimeRole.props as Record<string, unknown>).assumeRolePolicy),
    );
    trust.Statement[0].Action = "STS:ASSUMEROLEWITHWEBIDENTITY";
    runtimeRole.props = {
      ...(runtimeRole.props as Record<string, unknown>),
      assumeRolePolicy: JSON.stringify(trust),
    };

    await evaluate(resources);
    expect(violations).toEqual([]);

    violations = [];
    trust.Statement.push({
      Effect: "Allow",
      Action: "sts:AssumeRoleWithWebIdentity",
      Principal: { Federated: "*" },
      Condition: {
        StringLike: {
          "oidc.eks.eu-west-2.amazonaws.com/id/EXAMPLE:sub":
            "system:serviceaccount:guardian-data:*",
        },
      },
    });
    runtimeRole.props = {
      ...(runtimeRole.props as Record<string, unknown>),
      assumeRolePolicy: JSON.stringify(trust),
    };
    await evaluate(resources);
    expect(violations.join("\n")).toMatch(/sole|exact.*IRSA|IRSA.*exact/i);
  });

  it("rejects a known role ARN whose provider output omits the trust policy", async () => {
    const resources = closedBoundary();
    const runtimeRole = resources.find((entry) => entry.name === "orders-runtime-role")!;
    const roleProps = runtimeRole.props as Record<string, unknown>;
    delete roleProps.assumeRolePolicy;

    await evaluate(resources);
    expect(violations.join("\n")).toMatch(/runtime role.*IRSA trust/i);
  });

  it("rejects an omitted trust policy before an unknown role ARN is deferred", async () => {
    const resources = closedBoundary();
    const runtimeRole = resources.find((entry) => entry.name === "orders-runtime-role")!;
    const roleProps = { ...(runtimeRole.props as Record<string, unknown>) };
    delete roleProps.assumeRolePolicy;
    roleProps.arn = PULUMI_UNKNOWN_STRING;
    runtimeRole.props = unknownCheckingProxy(roleProps);

    let deferred: unknown;
    try {
      await evaluate(resources);
    } catch (error) {
      deferred = error;
    }

    expect(deferred).toBeInstanceOf(UnknownValueError);
    expect(violations).toEqual([expect.stringMatching(/runtime role.*IRSA trust/i)]);
  });

  it("rejects every managed-policy grant path for the four boundary roles", async () => {
    const resources = closedBoundary();
    const runtimeRole = resources.find((entry) => entry.name === "orders-runtime-role")!;
    runtimeRole.props = {
      ...(runtimeRole.props as Record<string, unknown>),
      managedPolicyArns: ["arn:aws:iam::aws:policy/AdministratorAccess"],
    };
    resources.push(
      resource("aws:iam/rolePolicyAttachment:RolePolicyAttachment", "broker-managed", {
        role: "orders-broker",
        policyArn: "arn:aws:iam::aws:policy/ReadOnlyAccess",
      }),
      resource("aws:iam/policyAttachment:PolicyAttachment", "migrator-managed", {
        roles: ["orders-migrator"],
        policyArn: "arn:aws:iam::aws:policy/PowerUserAccess",
      }),
    );

    await evaluate(resources);
    expect(violations.join("\n")).toMatch(/managed.policy|attachment/i);
  });

  it("rejects wildcard, cross-role, and unrelated exact inline authority", async () => {
    const resources = closedBoundary();
    const brokerPolicy = resources.find((entry) => entry.name === "broker-policy")!;
    const brokerDocument = JSON.parse(
      String((brokerPolicy.props as Record<string, unknown>).policy),
    );
    brokerDocument.Statement[0].Resource.push(
      "arn:aws:secretsmanager:eu-west-2:111122223333:secret:unrelated",
    );
    brokerDocument.Statement.push({
      Effect: "Allow",
      Action: ["sts:AssumeRole", "*"],
      Resource: "arn:aws:iam::111122223333:role/orders-migrator",
    });
    brokerPolicy.props = {
      ...(brokerPolicy.props as Record<string, unknown>),
      policy: JSON.stringify(brokerDocument),
    };

    const migratorPolicy = resources.find((entry) => entry.name === "migrator-policy")!;
    const migratorDocument = JSON.parse(
      String((migratorPolicy.props as Record<string, unknown>).policy),
    );
    migratorDocument.Statement.push({
      Effect: "Allow",
      NotAction: "iam:DeleteRole",
      Resource: "arn:aws:s3:::unrelated",
    });
    migratorPolicy.props = {
      ...(migratorPolicy.props as Record<string, unknown>),
      policy: JSON.stringify(migratorDocument),
    };

    const rotationPolicy = resources.find((entry) => entry.name === "rotation-policy")!;
    const rotationDocument = JSON.parse(
      String((rotationPolicy.props as Record<string, unknown>).policy),
    );
    rotationDocument.Statement[1].Resource = "arn:aws:kms:eu-west-2:111122223333:key/unrelated";
    rotationPolicy.props = {
      ...(rotationPolicy.props as Record<string, unknown>),
      policy: JSON.stringify(rotationDocument),
    };

    await evaluate(resources);
    expect(violations.join("\n")).toMatch(/broker.*unexpected|broker.*exact/i);
    expect(violations.join("\n")).toMatch(/migrator.*unexpected|migrator.*exact/i);
    expect(violations.join("\n")).toMatch(/rotation.*exact/i);
  });

  it("rejects the negative twin when runtime can read secrets or reach the database", async () => {
    const resources = closedBoundary();
    resources.push(
      resource("aws:iam/rolePolicy:RolePolicy", "runtime-policy", {
        role: "orders-runtime",
        policy: JSON.stringify({
          Statement: [
            {
              Effect: "Allow",
              Action: ["secretsmanager:GetSecretValue", "kms:Decrypt", "dynamodb:PutItem"],
              Resource: "*",
            },
          ],
        }),
      }),
      resource("aws:vpc/securityGroupEgressRule:SecurityGroupEgressRule", "runtime-to-db", {
        securityGroupId: "orders-runtime-sg_id",
        referencedSecurityGroupId: "sg-database",
        fromPort: 5432,
        toPort: 5432,
      }),
    );

    await evaluate(resources);
    expect(violations.join("\n")).toMatch(/runtime.*secret|runtime.*database/i);
  });

  it("rejects the negative twin when broker can read the master secret", async () => {
    const resources = closedBoundary();
    const brokerPolicy = resources.find((entry) => entry.name === "broker-policy")!;
    brokerPolicy.props = {
      role: "orders-broker",
      policy: JSON.stringify({
        Statement: [
          {
            Effect: "Allow",
            Action: "secretsmanager:GetSecretValue",
            Resource: "arn:aws:secretsmanager:eu-west-2:111122223333:secret:master",
          },
        ],
      }),
    };

    await evaluate(resources);
    expect(violations.join("\n")).toMatch(/broker.*master/i);
  });

  it("rejects SecretVersion, Kubernetes Secret, mutable workload images, and unencrypted replay", async () => {
    const resources = closedBoundary().filter((entry) => entry.type !== "aws:dynamodb/table:Table");
    const runtime = resources.find((entry) => entry.name === "runtime")!;
    const runtimeSpec = (
      runtime.props as { spec: { template: { spec: { containers: unknown[] } } } }
    ).spec.template.spec;
    runtimeSpec.containers = [
      {
        image: "registry.example/runtime:latest",
        command: ["/app/runtime"],
        securityContext: {
          runAsNonRoot: true,
          allowPrivilegeEscalation: false,
          readOnlyRootFilesystem: true,
          privileged: false,
          seccompProfile: { type: "RuntimeDefault" },
          capabilities: { drop: ["ALL"] },
        },
      },
    ];
    resources.push(
      resource("aws:secretsmanager/secretVersion:SecretVersion", "plaintext", {
        tags: boundaryTags("broker"),
      }),
      resource("kubernetes:core/v1:Secret", "database-password", {
        metadata: { labels: workloadLabels("broker") },
      }),
      resource("hulumi:k8s:RdsCredentialSecret", "rds-credential", {
        tags: boundaryTags("broker"),
      }),
      resource("aws:dynamodb/table:Table", "replay", {
        tags: {
          "hulumi:component": "BrokeredAuroraPostgresBoundary",
          "hulumi:boundary": "orders",
          "hulumi:purpose": "capability-replay",
        },
        ttl: { enabled: false, attributeName: "expiresAt" },
        serverSideEncryption: { enabled: false },
      }),
    );

    await evaluate(resources);
    expect(violations.join("\n")).toMatch(/SecretVersion/);
    expect(violations.join("\n")).toMatch(/Kubernetes Secret/);
    expect(violations.join("\n")).toMatch(/RdsCredentialSecret/);
    expect(violations.join("\n")).toMatch(/immutable|digest/);
    expect(violations.join("\n")).toMatch(/replay.*encrypted|TTL/i);
  });

  it("rejects the negative twin when broker replay authority or scoped admission is absent", async () => {
    const resources = closedBoundary().filter(
      (entry) =>
        entry.name !== "broker-replay-policy" &&
        entry.type !== "kubernetes:admissionregistration.k8s.io/v1:ValidatingAdmissionPolicy",
    );

    await evaluate(resources);
    expect(violations.join("\n")).toMatch(/broker.*PutItem\/GetItem/i);
    expect(violations.join("\n")).toMatch(/ValidatingAdmissionPolicy/i);
  });

  it("requires exactly PutItem/GetItem/DescribeTable on the exact replay table", async () => {
    const resources = closedBoundary();
    const replayPolicy = resources.find((entry) => entry.name === "broker-replay-policy")!;
    const policy = JSON.parse(String((replayPolicy.props as Record<string, unknown>).policy));
    policy.Statement[0].Action.push("dynamodb:DeleteItem");
    replayPolicy.props = {
      ...(replayPolicy.props as Record<string, unknown>),
      policy: JSON.stringify(policy),
    };

    await evaluate(resources);
    expect(violations.join("\n")).toMatch(/exact.*replay|replay.*only/i);
  });

  it("requires the broker-to-DynamoDB endpoint path and exact admission env values and mounts", async () => {
    const resources = closedBoundary().filter(
      (entry) => entry.name !== "broker-to-dynamodb-endpoint",
    );
    const admission = resources.find((entry) => entry.name === "orders-envelope")!;
    const admissionProps = clone(admission.props as Record<string, unknown>);
    const spec = admissionProps.spec as {
      validations: Array<{ expression: string }>;
    };
    spec.validations[0].expression = spec.validations[0].expression
      .replace("arn:aws:iam::111122223333:role/orders-broker", "unbound-role-value")
      .replace("volumeMounts", "unbound-mounts");
    admission.props = admissionProps;

    await evaluate(resources);
    expect(violations.join("\n")).toMatch(/DynamoDB.*path|replay.*network/i);
    expect(violations.join("\n")).toMatch(/admission.*exact|environment.*mount/i);
  });

  it("rejects vacuous admission CEL and loss of ephemeral-container subresource coverage", async () => {
    const resources = closedBoundary();
    const admission = resources.find((entry) => entry.name === "orders-envelope")!;
    const admissionProps = clone(admission.props as Record<string, unknown>);
    const spec = admissionProps.spec as {
      matchConstraints: { resourceRules: Array<{ resources: string[] }> };
      validations: Array<{ expression: string }>;
    };
    spec.validations[0].expression = `${spec.validations[0].expression} || true`;
    spec.matchConstraints.resourceRules[0].resources = ["pods"];
    admission.props = admissionProps;

    await evaluate(resources);
    expect(violations.join("\n")).toMatch(/admission.*exact|restricted Pod envelope/i);
  });

  it("rejects missing workload network bindings and every broad security-group grant form", async () => {
    const resources = closedBoundary().filter((entry) => entry.name !== "orders-rotation-network");
    const brokerSgp = resources.find(
      (entry) => entry.name === "orders-broker-security-group-policy",
    )!;
    const brokerSgpProps = clone(brokerSgp.props as Record<string, unknown>) as {
      spec: { securityGroups: { groupIds: string[] } };
    };
    brokerSgpProps.spec.securityGroups.groupIds = ["sg-unrelated"];
    brokerSgp.props = brokerSgpProps;
    resources.push(
      resource("aws:ec2/securityGroupRule:SecurityGroupRule", "legacy-broad", {
        type: "egress",
        securityGroupId: "orders-broker-sg_id",
        cidrBlocks: ["0.0.0.0/0"],
        protocol: "-1",
      }),
      resource("aws:vpc/securityGroupEgressRule:SecurityGroupEgressRule", "broker-broad-egress", {
        securityGroupId: "orders-broker-sg_id",
        cidrIpv4: "0.0.0.0/0",
        ipProtocol: "-1",
      }),
    );

    await evaluate(resources);
    expect(violations.join("\n")).toMatch(/rotation.*NetworkPolicy/i);
    expect(violations.join("\n")).toMatch(/broker.*SecurityGroupPolicy/i);
    expect(violations.join("\n")).toMatch(/legacy.*SecurityGroupRule/i);
    expect(violations.join("\n")).toMatch(/broker.*egress.*outside/i);
  });

  it("rejects serving or rotation workload state that bypasses rollout gates", async () => {
    const resources = closedBoundary();
    const boundary = resources.find(
      (entry) => entry.type === "hulumi:platform:BrokeredAuroraPostgresBoundary",
    )!;
    updatePolicyContract(boundary, {
      rollout: { phase: "infrastructure", verifiedGates: [] },
    });
    const runtime = resources.find((entry) => entry.name === "runtime")!;
    const rotation = resources.find((entry) => entry.name === "rotation")!;
    (runtime.props as { spec: { replicas: number } }).spec.replicas = 2;
    (rotation.props as { spec: { suspend: boolean } }).spec.suspend = false;

    await evaluate(resources);
    expect(violations.join("\n")).toMatch(/rollout|inert|suspend|replicas/i);
  });

  it("rejects caller gate strings as activation authority even when every named string is present", async () => {
    const resources = closedBoundary();
    const boundary = resources.find(
      (entry) => entry.type === "hulumi:platform:BrokeredAuroraPostgresBoundary",
    )!;
    updatePolicyContract(boundary, {
      rollout: {
        phase: "runtime",
        verifiedGates: [
          "migrator-postconditions",
          "application-credentials-prepopulated",
          "broker-health",
        ],
      },
    });
    const runtime = resources.find((entry) => entry.name === "runtime")!;
    const broker = resources.find((entry) => entry.name === "broker")!;
    (runtime.props as { spec: { replicas: number } }).spec.replicas = 2;
    (broker.props as { spec: { replicas: number } }).spec.replicas = 2;

    await evaluate(resources);
    expect(violations.join("\n")).toMatch(/self-attested|immutable evidence|must remain inert/i);
  });

  it("rejects co-placement and placement mutations for privileged workloads", async () => {
    const resources = closedBoundary();
    const boundary = resources.find(
      (entry) => entry.type === "hulumi:platform:BrokeredAuroraPostgresBoundary",
    )!;
    updatePolicyContract(boundary, {
      placement: {
        runtime: {
          runtimeClassName: "runc",
          nodePool: {
            key: "guardian.node-restriction.kubernetes.io/workload-pool",
            value: "shared",
          },
          toleration: {
            key: "hulumi.dev/workload-pool",
            value: "shared",
            effect: "NoSchedule",
          },
          schedulerName: "default-scheduler",
          priorityClassName: "guardian-runtime",
        },
        privileged: {
          runtimeClassName: "runc",
          nodePool: {
            key: "guardian.node-restriction.kubernetes.io/workload-pool",
            value: "shared",
          },
          toleration: {
            key: "hulumi.dev/workload-pool",
            value: "shared",
            effect: "NoSchedule",
          },
          schedulerName: "default-scheduler",
          priorityClassName: "guardian-runtime",
        },
      },
    });

    await evaluate(resources);
    expect(violations.join("\n")).toMatch(/disjoint|placement|node pool/i);
  });

  it("rejects master-secret write or stage authority for the rotation identity", async () => {
    const resources = closedBoundary();
    const rotationPolicy = resources.find((entry) => entry.name === "rotation-policy")!;
    const policy = JSON.parse(String((rotationPolicy.props as Record<string, unknown>).policy)) as {
      Statement: Array<{ Action: string[]; Resource: string[] }>;
    };
    policy.Statement.find((statement) =>
      statement.Action.includes("secretsmanager:PutSecretValue"),
    )!.Resource.push("arn:aws:secretsmanager:eu-west-2:111122223333:secret:master");
    rotationPolicy.props = {
      ...(rotationPolicy.props as Record<string, unknown>),
      policy: JSON.stringify(policy),
    };

    await evaluate(resources);
    expect(violations.join("\n")).toMatch(/rotation.*master.*write|master.*write.*rotation/i);
  });

  it("rejects rotation data-key authority for the master secret or another KMS key", async () => {
    const masterContextResources = closedBoundary();
    const masterContextPolicy = masterContextResources.find(
      (entry) => entry.name === "rotation-policy",
    )!;
    const masterContextDocument = JSON.parse(
      String((masterContextPolicy.props as Record<string, unknown>).policy),
    ) as {
      Statement: Array<{
        Action: string[];
        Resource: string;
        Condition: {
          "ForAnyValue:StringEquals": {
            "kms:EncryptionContext:SecretARN": string[];
          };
        };
      }>;
    };
    masterContextDocument.Statement.find((statement) =>
      statement.Action.includes("kms:GenerateDataKey"),
    )!.Condition["ForAnyValue:StringEquals"]["kms:EncryptionContext:SecretARN"].push(
      "arn:aws:secretsmanager:eu-west-2:111122223333:secret:master",
    );
    masterContextPolicy.props = {
      ...(masterContextPolicy.props as Record<string, unknown>),
      policy: JSON.stringify(masterContextDocument),
    };

    await evaluate(masterContextResources);
    expect(violations.join("\n")).toMatch(/GenerateDataKey.*application-secret.*contexts/i);

    violations = [];
    const otherKeyResources = closedBoundary();
    const otherKeyPolicy = otherKeyResources.find((entry) => entry.name === "rotation-policy")!;
    const otherKeyDocument = JSON.parse(
      String((otherKeyPolicy.props as Record<string, unknown>).policy),
    ) as {
      Statement: Array<{ Action: string[]; Resource: string }>;
    };
    otherKeyDocument.Statement.find((statement) =>
      statement.Action.includes("kms:GenerateDataKey"),
    )!.Resource = "arn:aws:kms:eu-west-2:111122223333:key/unrelated";
    otherKeyPolicy.props = {
      ...(otherKeyPolicy.props as Record<string, unknown>),
      policy: JSON.stringify(otherKeyDocument),
    };

    await evaluate(otherKeyResources);
    expect(violations.join("\n")).toMatch(/GenerateDataKey.*boundary KMS key/i);
  });

  it("rejects a mismatched SecureSecret output or child KMS binding", async () => {
    const componentResources = closedBoundary();
    for (const secret of componentResources.filter(
      (entry) => entry.type === "hulumi:baseline:aws:SecureSecret",
    )) {
      secret.props = {
        ...(secret.props as Record<string, unknown>),
        secretArn: "arn:aws:secretsmanager:eu-west-2:111122223333:secret:unrelated",
      };
    }

    await evaluate(componentResources);
    expect(violations.join("\n")).toMatch(
      /application-secret.*SecureSecret.*correlate.*child.*exact boundary KMS key/i,
    );

    violations = [];
    const missingArns = closedBoundary();
    for (const secret of missingArns.filter(
      (entry) => entry.type === "hulumi:baseline:aws:SecureSecret",
    )) {
      delete (secret.props as Record<string, unknown>).secretArn;
    }
    for (const secret of missingArns.filter(
      (entry) => entry.type === "aws:secretsmanager/secret:Secret",
    )) {
      delete (secret.props as Record<string, unknown>).arn;
    }

    await evaluate(missingArns);
    expect(violations.join("\n")).toMatch(
      /application-secret.*SecureSecret.*correlate.*child.*exact boundary KMS key/i,
    );

    violations = [];
    const childResources = closedBoundary();
    for (const secret of childResources.filter(
      (entry) => entry.type === "aws:secretsmanager/secret:Secret",
    )) {
      secret.props = {
        ...(secret.props as Record<string, unknown>),
        kmsKeyId: "arn:aws:kms:eu-west-2:111122223333:key/unrelated",
      };
    }

    await evaluate(childResources);
    expect(violations.join("\n")).toMatch(
      /application-secret.*SecureSecret.*correlate.*child.*exact boundary KMS key/i,
    );

    violations = [];
    const missingChildKmsResources = closedBoundary();
    for (const secret of missingChildKmsResources.filter(
      (entry) => entry.type === "aws:secretsmanager/secret:Secret",
    )) {
      delete (secret.props as Record<string, unknown>).kmsKeyId;
    }

    await evaluate(missingChildKmsResources);
    expect(violations.join("\n")).toMatch(
      /application-secret.*SecureSecret.*correlate.*child.*exact boundary KMS key/i,
    );
  });

  it("rejects replay SSE bound to a different non-empty KMS key", async () => {
    const resources = closedBoundary();
    const replay = resources.find((entry) => entry.name === "replay")!;
    const replayProps = replay.props as {
      serverSideEncryption: { enabled: boolean; kmsKeyArn: string };
    };
    replayProps.serverSideEncryption.kmsKeyArn = "arn:aws:kms:eu-west-2:111122223333:key/unrelated";

    await evaluate(resources);
    expect(violations.join("\n")).toMatch(/replay table.*exact boundary KMS key/i);
  });

  it("rejects an untagged additive NetworkPolicy selecting a protected workload", async () => {
    const resources = closedBoundary();
    resources.push(
      resource("kubernetes:networking.k8s.io/v1:NetworkPolicy", "untagged-broad-egress", {
        metadata: {
          name: "untagged-broad-egress",
          namespace: "guardian-data",
        },
        spec: {
          podSelector: { matchLabels: {} },
          policyTypes: ["Egress"],
          egress: [
            {
              to: [{ ipBlock: { cidr: "0.0.0.0/0" } }],
            },
          ],
        },
      }),
    );

    await evaluate(resources);
    expect(violations.join("\n")).toMatch(/additive|NetworkPolicy|broad egress/i);
  });

  it("rejects workload and admission mutations that disagree with authoritative child roles", async () => {
    const resources = closedBoundary();
    const broker = resources.find((entry) => entry.name === "broker")!;
    const brokerSpec = (
      broker.props as {
        spec: {
          template: {
            spec: {
              containers: Array<{ env: Array<{ name: string; value: string }> }>;
            };
          };
        };
      }
    ).spec.template.spec;
    brokerSpec.containers[0].env.find((entry) => entry.name === "AWS_ROLE_ARN")!.value =
      "arn:aws:iam::999900001111:role/orders-broker";
    const admission = resources.find((entry) => entry.name === "orders-envelope")!;
    const admissionProps = clone(admission.props as Record<string, unknown>) as {
      spec: { validations: Array<{ expression: string }> };
    };
    admissionProps.spec.validations[0].expression =
      admissionProps.spec.validations[0].expression.replace(
        "arn:aws:iam::111122223333:role/orders-broker",
        "arn:aws:iam::999900001111:role/orders-broker",
      );
    admission.props = admissionProps;

    await evaluate(resources);
    expect(violations.join("\n")).toMatch(/authoritative|role ARN|admission/i);
  });

  it("rejects same-name application secret ARNs outside the boundary partition, region, or account", async () => {
    const resources = closedBoundary();
    const replacement = (value: string) =>
      value
        .replace(
          "arn:aws:secretsmanager:eu-west-2:111122223333:secret:app-a",
          "arn:aws:secretsmanager:us-east-1:999900001111:secret:app-a",
        )
        .replace(
          "arn:aws:secretsmanager:eu-west-2:111122223333:secret:app-b",
          "arn:aws:secretsmanager:us-east-1:999900001111:secret:app-b",
        );
    for (const policyName of ["broker-policy", "migrator-policy", "rotation-policy"]) {
      const policy = resources.find((entry) => entry.name === policyName)!;
      policy.props = {
        ...(policy.props as Record<string, unknown>),
        policy: replacement(String((policy.props as Record<string, unknown>).policy)),
      };
    }
    for (const secret of resources.filter(
      (entry) => entry.type === "aws:secretsmanager/secret:Secret",
    )) {
      secret.props = {
        ...(secret.props as Record<string, unknown>),
        arn: replacement(String((secret.props as Record<string, unknown>).arn)),
      };
    }
    for (const workload of resources.filter((entry) =>
      [
        "kubernetes:apps/v1:Deployment",
        "kubernetes:batch/v1:Job",
        "kubernetes:batch/v1:CronJob",
      ].includes(entry.type),
    )) {
      workload.props = JSON.parse(replacement(JSON.stringify(workload.props))) as Record<
        string,
        unknown
      >;
    }
    const admission = resources.find((entry) => entry.name === "orders-envelope")!;
    admission.props = JSON.parse(replacement(JSON.stringify(admission.props))) as Record<
      string,
      unknown
    >;

    await evaluate(resources);
    expect(violations.join("\n")).toMatch(/partition|region|account|authoritative secret/i);
  });

  it("rejects broad private resolver CIDRs even when every generated rule agrees", async () => {
    const resources = closedBoundary();
    const boundary = resources.find(
      (entry) => entry.type === "hulumi:platform:BrokeredAuroraPostgresBoundary",
    )!;
    updatePolicyContract(boundary, {
      dnsResolverCidrs: ["10.0.0.0/8"],
    });
    for (const network of resources.filter(
      (entry) => entry.type === "kubernetes:networking.k8s.io/v1:NetworkPolicy",
    )) {
      network.props = JSON.parse(
        JSON.stringify(network.props).replaceAll("10.42.0.2/32", "10.0.0.0/8"),
      ) as Record<string, unknown>;
    }

    await evaluate(resources);
    expect(violations.join("\n")).toMatch(/DNS|resolver|\/32/i);
  });
});
