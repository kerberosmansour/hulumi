import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";

import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

const DIGEST = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OIDC_PROVIDER_ARN =
  "arn:aws:iam::111122223333:oidc-provider/oidc.eks.eu-west-2.amazonaws.com/id/EXAMPLE";
const KMS_KEY_ARN = "arn:aws:kms:eu-west-2:111122223333:key/1234abcd";
const MASTER_SECRET_ARN = "arn:aws:secretsmanager:eu-west-2:111122223333:secret:aurora/master";
const PERMISSION_BOUNDARY_ARN = "arn:aws:iam::111122223333:policy/hulumi-workload-boundary";
const CALLER_SECURITY_GROUP_ID = "sg-runtime-caller";
const WEB_IDENTITY_TOKEN_PATH = "/var/run/secrets/hulumi/identity/token";
const RSA_2048_MODULUS = Buffer.alloc(256, 0xa5).toString("base64url");
const PLACEMENT = {
  runtime: {
    runtimeClassName: "runc",
    nodePool: {
      key: "guardian.node-restriction.kubernetes.io/workload-pool",
      value: "runtime",
    },
    toleration: {
      key: "hulumi.dev/workload-pool",
      value: "runtime",
      effect: "NoSchedule" as const,
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
      effect: "NoSchedule" as const,
    },
    schedulerName: "default-scheduler",
    priorityClassName: "guardian-broker-privileged",
  },
};
const JWKS_JSON = JSON.stringify({
  keys: [
    {
      kty: "RSA",
      kid: "guardian-capability-2026-07",
      use: "sig",
      alg: "RS256",
      n: "paWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpQ",
      e: "AQAB",
      ...{ [String.fromCharCode(110)]: RSA_2048_MODULUS },
    },
  ],
});

function roleFor(kind: string) {
  return registrations.find(
    (registration) =>
      registration.type === "aws:iam/role:Role" &&
      (registration.inputs.tags as Record<string, unknown> | undefined)?.[
        "hulumi:identity-kind"
      ] === kind,
  );
}

function policyFor(kind: string) {
  return registrations.find(
    (registration) =>
      registration.type === "aws:iam/rolePolicy:RolePolicy" &&
      registration.name.includes(`-${kind}-`),
  );
}

function workload(kind: string) {
  return registrations.find(
    (registration) =>
      [
        "kubernetes:apps/v1:Deployment",
        "kubernetes:batch/v1:Job",
        "kubernetes:batch/v1:CronJob",
      ].includes(registration.type) &&
      (registration.inputs.metadata as { labels?: Record<string, string> } | undefined)?.labels?.[
        "hulumi.dev/identity-kind"
      ] === kind,
  );
}

interface BoundaryOptions {
  rollout?: {
    phase: "infrastructure" | "migrator" | "broker" | "runtime" | "rotation";
    verifiedGates?: string[];
    evidence?: {
      immutableRef: string;
      sha256: string;
    };
  };
  placement?: {
    runtime: {
      runtimeClassName: string;
      nodePool: { key: string; value: string };
      toleration: { key: string; value: string; effect: "NoSchedule" };
      schedulerName: string;
      priorityClassName: string;
    };
    privileged: {
      runtimeClassName: string;
      nodePool: { key: string; value: string };
      toleration: { key: string; value: string; effect: "NoSchedule" };
      schedulerName: string;
      priorityClassName: string;
    };
  };
  dnsResolverCidrs?: string[];
  runtimeIngress?: {
    serviceName: string;
    callerNamespace: string;
    callerPodSelector: Record<string, string>;
    callerSecurityGroupId: string;
  };
}

async function createBoundary(options: BoundaryOptions = {}) {
  const mod = (await import("../src")) as Record<string, unknown>;
  expect(mod.BrokeredAuroraPostgresBoundary).toBeTypeOf("function");
  const Boundary = mod.BrokeredAuroraPostgresBoundary as new (
    name: string,
    args: Record<string, unknown>,
  ) => {
    identityReceipt: import("@pulumi/pulumi").Output<Record<string, unknown>>;
    rotationPosture: import("@pulumi/pulumi").Output<string>;
  };

  return new Boundary("orders", {
    tier: "startup-hardened",
    awsRegion: "eu-west-2",
    namespace: "guardian-data",
    oidcProviderArn: OIDC_PROVIDER_ARN,
    oidcIssuer: "https://oidc.eks.eu-west-2.amazonaws.com/id/EXAMPLE",
    permissionBoundaryArn: PERMISSION_BOUNDARY_ARN,
    vpcId: "vpc-12345678",
    database: {
      endpoint: "orders.cluster-example.eu-west-2.rds.amazonaws.com",
      port: 5432,
      securityGroupId: "sg-database",
      cidrs: ["10.42.8.0/24"],
    },
    dnsResolverCidrs: options.dnsResolverCidrs ?? ["10.42.0.2/32"],
    endpointCidrs: ["10.42.10.0/28"],
    endpointSecurityGroupIds: {
      secretsManager: "sg-secrets-endpoint",
      kms: "sg-kms-endpoint",
      dynamodb: "sg-dynamodb-endpoint",
    },
    dynamodbVpcEndpointId: "vpce-0123456789abcdef0",
    dynamodbEndpointUrl:
      "https://vpce-0123456789abcdef0-example.dynamodb.eu-west-2.vpce.amazonaws.com",
    kmsKeyArn: KMS_KEY_ARN,
    masterSecretArn: MASTER_SECRET_ARN,
    applicationSecretNames: ["guardian/orders-a", "guardian/orders-b"],
    capability: {
      issuer: "https://identity.guardian.example",
      audience: "guardian-db-broker",
      jwksJson: JWKS_JSON,
      maxTtlSeconds: 60,
    },
    placement: options.placement ?? PLACEMENT,
    ...(options.rollout !== undefined ? { rollout: options.rollout } : {}),
    ...(options.runtimeIngress !== undefined ? { runtimeIngress: options.runtimeIngress } : {}),
    identities: {
      runtime: {
        serviceAccountName: "orders-runtime",
        roleName: "orders-runtime",
      },
      broker: {
        serviceAccountName: "orders-broker",
        roleName: "orders-broker",
      },
      migrator: {
        serviceAccountName: "orders-migrator",
        roleName: "orders-migrator",
      },
      rotation: {
        serviceAccountName: "orders-rotation",
        roleName: "orders-rotation",
      },
    },
    workloads: {
      runtime: {
        image: `registry.example/guardian-runtime@${DIGEST}`,
        command: ["/app/runtime"],
        port: 8080,
      },
      broker: {
        image: `registry.example/guardian-broker@${DIGEST}`,
        command: ["/app/broker"],
        port: 7443,
      },
      migrator: {
        image: `registry.example/guardian-migrator@${DIGEST}`,
        command: ["/app/migrate"],
      },
      rotation: {
        image: `registry.example/guardian-rotation@${DIGEST}`,
        command: ["/app/rotate"],
        schedule: "17 */6 * * *",
      },
    },
  });
}

describe("BrokeredAuroraPostgresBoundary", () => {
  beforeEach(resetRegistrations);
  afterEach(resetRegistrations);

  it("creates four exact non-interchangeable workload identities and no secret values", async () => {
    const boundary = await createBoundary();
    await settlePulumi();

    expect(
      registrations.filter((registration) => registration.type === "aws:iam/role:Role"),
    ).toHaveLength(4);
    expect(
      registrations.filter(
        (registration) => registration.type === "kubernetes:core/v1:ServiceAccount",
      ),
    ).toHaveLength(4);

    for (const kind of ["runtime", "broker", "migrator", "rotation"]) {
      const role = roleFor(kind);
      expect(role, `${kind} role`).toBeDefined();
      expect(role?.inputs.tags).not.toHaveProperty("hulumi:iac-role");
      expect(role?.inputs.maxSessionDuration).toBe(3600);
      const trust = JSON.parse(String(role?.inputs.assumeRolePolicy)) as {
        Statement: Array<{ Condition: { StringEquals: Record<string, string> } }>;
      };
      expect(trust.Statement[0].Condition).toHaveProperty("StringEquals");
      expect(JSON.stringify(trust.Statement[0].Condition)).not.toContain("StringLike");
      expect(JSON.stringify(trust.Statement[0].Condition)).not.toContain("*");
      expect(JSON.stringify(trust)).toContain(`system:serviceaccount:guardian-data:orders-${kind}`);
    }

    const types = registrations.map((registration) => registration.type);
    expect(types).not.toContain("aws:secretsmanager/secretVersion:SecretVersion");
    expect(types).not.toContain("kubernetes:core/v1:Secret");
    expect(types).not.toContain("hulumi:k8s:RdsCredentialSecret");
    expect(types.filter((type) => type === "hulumi:baseline:aws:SecureSecret")).toHaveLength(2);

    const receipt = await valueOf(boundary.identityReceipt);
    expect(JSON.stringify(receipt)).not.toMatch(/password|secretValue|token/i);
    await expect(valueOf(boundary.rotationPosture)).resolves.toBe(
      "infrastructure-only-unconfigured",
    );
  });

  it("gives runtime no credential or database authority and keeps broker off the master secret", async () => {
    await createBoundary();
    await settlePulumi();

    expect(policyFor("runtime")).toBeUndefined();
    const brokerPolicies = JSON.stringify(
      registrations
        .filter(
          (registration) =>
            registration.type === "aws:iam/rolePolicy:RolePolicy" &&
            registration.name.includes("-broker-"),
        )
        .map((registration) => registration.inputs.policy),
    );
    expect(brokerPolicies).toContain("secretsmanager:GetSecretValue");
    expect(brokerPolicies).toContain("dynamodb:PutItem");
    expect(brokerPolicies).toContain("dynamodb:GetItem");
    expect(brokerPolicies).toContain("secretsmanager:VersionStage");
    expect(brokerPolicies).toContain("AWSCURRENT");
    expect(brokerPolicies).toContain("aws:SourceVpce");
    expect(brokerPolicies).toContain("vpce-0123456789abcdef0");
    expect(brokerPolicies).not.toContain(MASTER_SECRET_ARN);
    expect(brokerPolicies).not.toMatch(/sts:AssumeRole|iam:PassRole/);

    const rotationPolicy = JSON.parse(String(policyFor("rotation")?.inputs.policy)) as {
      Statement: Array<{
        Action: string[];
        Resource: string | string[];
        Condition?: {
          "ForAnyValue:StringEquals"?: {
            "kms:EncryptionContext:SecretARN"?: string[];
          };
        };
      }>;
    };
    const dataKeyStatements = rotationPolicy.Statement.filter(
      (statement) => statement.Action.length === 1 && statement.Action[0] === "kms:GenerateDataKey",
    );
    expect(dataKeyStatements).toHaveLength(1);
    expect(dataKeyStatements[0].Resource).toBe(KMS_KEY_ARN);
    const dataKeyContexts =
      dataKeyStatements[0].Condition?.["ForAnyValue:StringEquals"]?.[
        "kms:EncryptionContext:SecretARN"
      ];
    expect(dataKeyContexts).toHaveLength(2);
    expect(dataKeyContexts).not.toContain(MASTER_SECRET_ARN);
    expect(JSON.stringify(dataKeyStatements[0])).not.toContain("key/unrelated");

    const runtimeSg = registrations.find(
      (registration) =>
        registration.type === "aws:ec2/securityGroup:SecurityGroup" &&
        (registration.inputs.tags as Record<string, unknown> | undefined)?.[
          "hulumi:identity-kind"
        ] === "runtime",
    );
    const runtimeRules = registrations.filter(
      (registration) =>
        registration.type === "aws:vpc/securityGroupEgressRule:SecurityGroupEgressRule" &&
        registration.inputs.securityGroupId === `${runtimeSg?.name}_id`,
    );
    expect(runtimeRules.some((rule) => rule.inputs.referencedSecurityGroupId !== undefined)).toBe(
      true,
    );
    expect(
      runtimeRules.some((rule) => rule.inputs.referencedSecurityGroupId === "sg-database"),
    ).toBe(false);
    expect(runtimeRules.some((rule) => rule.inputs.cidrIpv4 === "0.0.0.0/0")).toBe(false);

    const brokerSg = registrations.find(
      (registration) =>
        registration.type === "aws:ec2/securityGroup:SecurityGroup" &&
        (registration.inputs.tags as Record<string, unknown> | undefined)?.[
          "hulumi:identity-kind"
        ] === "broker",
    );
    const brokerRules = registrations.filter(
      (registration) =>
        registration.type === "aws:vpc/securityGroupEgressRule:SecurityGroupEgressRule" &&
        registration.inputs.securityGroupId === `${brokerSg?.name}_id`,
    );
    expect(
      brokerRules.some(
        (rule) =>
          rule.inputs.referencedSecurityGroupId === "sg-dynamodb-endpoint" &&
          rule.inputs.fromPort === 443 &&
          rule.inputs.toPort === 443,
      ),
    ).toBe(true);
  });

  it("pins every workload image and applies restricted security contexts plus admission", async () => {
    await createBoundary();
    await settlePulumi();

    for (const kind of ["runtime", "broker", "migrator", "rotation"]) {
      const registration = workload(kind);
      expect(registration, `${kind} workload`).toBeDefined();
      expect(JSON.stringify(registration?.inputs)).toContain(`@${DIGEST}`);
      expect(JSON.stringify(registration?.inputs)).toContain('"allowPrivilegeEscalation":false');
      expect(JSON.stringify(registration?.inputs)).toContain('"readOnlyRootFilesystem":true');
      expect(JSON.stringify(registration?.inputs)).toContain('"runAsNonRoot":true');
      expect(JSON.stringify(registration?.inputs)).toContain('"drop":["ALL"]');
    }
    expect(
      (workload("runtime")?.inputs.spec as { template: { spec: { restartPolicy: string } } })
        .template.spec.restartPolicy,
    ).toBe("Always");
    expect(
      (workload("broker")?.inputs.spec as { template: { spec: { restartPolicy: string } } })
        .template.spec.restartPolicy,
    ).toBe("Always");
    expect(
      (workload("migrator")?.inputs.spec as { template: { spec: { restartPolicy: string } } })
        .template.spec.restartPolicy,
    ).toBe("Never");
    expect(
      (
        workload("rotation")?.inputs.spec as {
          jobTemplate: { spec: { template: { spec: { restartPolicy: string } } } };
        }
      ).jobTemplate.spec.template.spec.restartPolicy,
    ).toBe("Never");

    const admission = registrations.find(
      (registration) =>
        registration.type ===
        "kubernetes:admissionregistration.k8s.io/v1:ValidatingAdmissionPolicy",
    );
    expect(admission).toBeDefined();
    expect(JSON.stringify(admission?.inputs.spec)).toContain("command");
    expect(JSON.stringify(admission?.inputs.spec)).toContain("envFrom");
    expect(JSON.stringify(admission?.inputs.spec)).toContain("initContainers");
    expect(JSON.stringify(admission?.inputs.spec)).toContain("hulumi.dev/identity-kind");
    expect(JSON.stringify(admission?.inputs.spec)).toContain("serviceAccountName");
    expect(JSON.stringify(admission?.inputs.spec)).toContain("hostNetwork");
    expect(JSON.stringify(admission?.inputs.spec)).toContain("hostPID");
    expect(JSON.stringify(admission?.inputs.spec)).toContain("hostIPC");
    expect(JSON.stringify(admission?.inputs.spec)).toContain("privileged");
    expect(JSON.stringify(admission?.inputs.spec)).toContain("secretKeyRef");
    expect(JSON.stringify(admission?.inputs.spec)).toContain("projected");
    expect(JSON.stringify(admission?.inputs.spec)).toContain("volumeMounts");
    expect(JSON.stringify(admission?.inputs.spec)).toContain("lifecycle");
    expect(JSON.stringify(admission?.inputs.spec)).toContain("livenessProbe");
    expect(JSON.stringify(admission?.inputs.spec)).toContain("readinessProbe");
    expect(JSON.stringify(admission?.inputs.spec)).toContain("startupProbe");
    expect(JSON.stringify(admission?.inputs.spec)).toContain("stdin");
    expect(JSON.stringify(admission?.inputs.spec)).toContain("tty");
    expect(JSON.stringify(admission?.inputs.spec)).toContain("capabilities.add");
    expect(JSON.stringify(admission?.inputs.spec)).toContain("procMount");
    expect(JSON.stringify(admission?.inputs.spec)).toContain("runtimeClassName");
    expect(JSON.stringify(admission?.inputs.spec)).toContain("nodeSelector");
    expect(JSON.stringify(admission?.inputs.spec)).toContain("affinity");
    expect(JSON.stringify(admission?.inputs.spec)).toContain("tolerations");
    expect(JSON.stringify(admission?.inputs.spec)).toContain("schedulerName");
    expect(JSON.stringify(admission?.inputs.spec)).toContain("priorityClassName");
    expect(JSON.stringify(admission?.inputs.spec)).toContain("hostAliases");
    expect(JSON.stringify(admission?.inputs.spec)).toContain("shareProcessNamespace");
    expect(JSON.stringify(admission?.inputs.spec)).toContain("dnsConfig");
    expect(JSON.stringify(admission?.inputs.spec)).toContain("dnsPolicy");
    expect(JSON.stringify(admission?.inputs.spec)).toContain("pods/ephemeralcontainers");
    expect(JSON.stringify(admission?.inputs.spec)).toContain(WEB_IDENTITY_TOKEN_PATH);
    expect(JSON.stringify(admission?.inputs.spec)).toContain(
      "guardian.node-restriction.kubernetes.io/workload-pool",
    );
    expect(JSON.stringify(admission?.inputs.spec)).toContain("broker-privileged");
    expect(JSON.stringify(admission?.inputs.spec)).toContain("guardian-broker-privileged");
    const admissionExpression = (
      admission?.inputs.spec as { validations: Array<{ expression: string }> }
    ).validations[0].expression;
    expect(admissionExpression).toContain(JSON.stringify(JWKS_JSON));
    expect(JSON.stringify(admission?.inputs.spec)).toContain("https://identity.guardian.example");
    expect(JSON.stringify(admission?.inputs.spec)).toContain("guardian-db-broker");
    expect(
      registrations.some(
        (registration) =>
          registration.type ===
          "kubernetes:admissionregistration.k8s.io/v1:ValidatingAdmissionPolicyBinding",
      ),
    ).toBe(true);

    const brokerInputs = JSON.stringify(workload("broker")?.inputs);
    expect(brokerInputs).toContain("CAPABILITY_JWKS_JSON");
    expect(brokerInputs).toContain("guardian-capability-2026-07");
    expect(brokerInputs).toContain("AWS_ENDPOINT_URL_DYNAMODB");
    expect(brokerInputs).toContain(
      "vpce-0123456789abcdef0-example.dynamodb.eu-west-2.vpce.amazonaws.com",
    );
    expect(brokerInputs).not.toContain("CAPABILITY_JWKS_URI");
    expect(brokerInputs).not.toContain("identity.guardian.example/.well-known");
  });

  it("enforces exact disjoint runtime and privileged placement for every protected workload", async () => {
    await createBoundary();
    await settlePulumi();

    for (const kind of ["runtime", "broker", "migrator", "rotation"]) {
      const registration = workload(kind);
      const spec =
        kind === "rotation"
          ? (
              registration?.inputs.spec as {
                jobTemplate: { spec: { template: { spec: Record<string, unknown> } } };
              }
            ).jobTemplate.spec.template.spec
          : (
              registration?.inputs.spec as {
                template: { spec: Record<string, unknown> };
              }
            ).template.spec;
      const expectedPool = kind === "runtime" ? "runtime" : "broker-privileged";
      expect(spec.runtimeClassName).toBe(kind === "runtime" ? "runc" : "gvisor");
      expect(spec.nodeSelector).toEqual({
        "guardian.node-restriction.kubernetes.io/workload-pool": expectedPool,
      });
      expect(JSON.stringify(spec.affinity)).toContain(expectedPool);
      expect(spec.tolerations).toEqual([
        {
          key: "hulumi.dev/workload-pool",
          operator: "Equal",
          value: expectedPool,
          effect: "NoSchedule",
        },
      ]);
      expect(spec.schedulerName).toBe("default-scheduler");
      expect(spec.priorityClassName).toBe(
        kind === "runtime" ? "guardian-runtime" : "guardian-broker-privileged",
      );
    }

    resetRegistrations();
    await expect(
      createBoundary({
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
      }),
    ).rejects.toThrow(/disjoint|placement|node pool/i);
    expect(registrations).toEqual([]);
  });

  it("keeps every executable workload inert and does not activate from caller gate strings", async () => {
    await createBoundary();
    await settlePulumi();

    expect((workload("runtime")?.inputs.spec as { replicas: number }).replicas).toBe(0);
    expect((workload("broker")?.inputs.spec as { replicas: number }).replicas).toBe(0);
    expect((workload("migrator")?.inputs.spec as { suspend: boolean }).suspend).toBe(true);
    expect((workload("rotation")?.inputs.spec as { suspend: boolean }).suspend).toBe(true);

    resetRegistrations();
    await createBoundary({
      rollout: {
        phase: "runtime",
        evidence: {
          immutableRef:
            "oci://registry.example/guardian/broker-rollout@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          sha256: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
      },
      runtimeIngress: {
        serviceName: "orders-runtime",
        callerNamespace: "guardian-api",
        callerPodSelector: { "app.kubernetes.io/name": "platform-api" },
        callerSecurityGroupId: CALLER_SECURITY_GROUP_ID,
      },
    });
    await settlePulumi();
    expect((workload("broker")?.inputs.spec as { replicas: number }).replicas).toBe(0);
    expect((workload("runtime")?.inputs.spec as { replicas: number }).replicas).toBe(0);
    expect((workload("migrator")?.inputs.spec as { suspend: boolean }).suspend).toBe(true);
    expect((workload("rotation")?.inputs.spec as { suspend: boolean }).suspend).toBe(true);

    resetRegistrations();
    await expect(
      createBoundary({
        rollout: {
          phase: "broker",
          verifiedGates: ["migrator-postconditions", "application-credentials-prepopulated"],
        },
      }),
    ).rejects.toThrow(/verifiedGates|self-attested|immutable evidence/i);
    expect(registrations).toEqual([]);
  });

  it("requires immutable evidence metadata and exact caller ingress for a requested handoff", async () => {
    const mod = (await import("../src")) as Record<string, unknown>;
    const Boundary = mod.BrokeredAuroraPostgresBoundary as new (
      name: string,
      args: Record<string, unknown>,
    ) => unknown;
    const runtimeIngress = {
      serviceName: "orders-runtime",
      callerNamespace: "guardian-api",
      callerPodSelector: { "app.kubernetes.io/name": "platform-api" },
      callerSecurityGroupId: CALLER_SECURITY_GROUP_ID,
    };

    await expect(
      createBoundary({
        rollout: {
          phase: "runtime",
          evidence: {
            immutableRef:
              "oci://registry.example/guardian/broker-rollout@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            sha256: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          },
        },
      }),
    ).rejects.toThrow(/runtimeIngress/i);
    expect(registrations).toEqual([]);

    await expect(
      createBoundary({
        rollout: {
          phase: "rotation",
          evidence: {
            immutableRef:
              "oci://registry.example/guardian/broker-rollout@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            sha256: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          },
        },
        runtimeIngress,
      }),
    ).rejects.toThrow(/evidence|digest|sha256/i);
    expect(registrations).toEqual([]);

    expect(
      () =>
        new Boundary("broad-ingress", {
          tier: "sandbox",
          awsRegion: "eu-west-2",
          namespace: "guardian-data",
          oidcProviderArn: OIDC_PROVIDER_ARN,
          oidcIssuer: "https://oidc.eks.eu-west-2.amazonaws.com/id/EXAMPLE",
          vpcId: "vpc-12345678",
          database: {
            endpoint: "db.example",
            port: 5432,
            securityGroupId: "sg-db",
            cidrs: ["10.42.8.0/24"],
          },
          dnsResolverCidrs: ["10.42.0.2/32"],
          endpointCidrs: ["10.42.10.0/28"],
          endpointSecurityGroupIds: {
            secretsManager: "sg-secret",
            kms: "sg-kms",
            dynamodb: "sg-dynamodb",
          },
          dynamodbVpcEndpointId: "vpce-0123456789abcdef0",
          dynamodbEndpointUrl:
            "https://vpce-0123456789abcdef0-example.dynamodb.eu-west-2.vpce.amazonaws.com",
          kmsKeyArn: KMS_KEY_ARN,
          masterSecretArn: MASTER_SECRET_ARN,
          applicationSecretNames: ["a", "b"],
          capability: {
            issuer: "https://issuer.example",
            audience: "broker",
            jwksJson: JWKS_JSON,
            maxTtlSeconds: 60,
          },
          placement: PLACEMENT,
          rollout: {
            phase: "runtime",
            evidence: {
              immutableRef:
                "oci://registry.example/guardian/broker-rollout@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              sha256: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            },
          },
          runtimeIngress: {
            serviceName: "runtime",
            callerNamespace: "*",
            callerPodSelector: {},
            callerSecurityGroupId: "0.0.0.0/0",
          },
          identities: {
            runtime: { serviceAccountName: "r", roleName: "r" },
            broker: { serviceAccountName: "b", roleName: "b" },
            migrator: { serviceAccountName: "m", roleName: "m" },
            rotation: { serviceAccountName: "o", roleName: "o" },
          },
          workloads: {
            runtime: { image: `registry.example/runtime@${DIGEST}`, command: ["run"], port: 8080 },
            broker: { image: `registry.example/broker@${DIGEST}`, command: ["run"], port: 7443 },
            migrator: { image: `registry.example/migrate@${DIGEST}`, command: ["run"] },
            rotation: {
              image: `registry.example/rotate@${DIGEST}`,
              command: ["run"],
              schedule: "0 * * * *",
            },
          },
        }),
    ).toThrow(/callerNamespace|callerPodSelector|callerSecurityGroupId/i);
    expect(registrations).toEqual([]);

    await createBoundary({
      rollout: {
        phase: "runtime",
        evidence: {
          immutableRef:
            "oci://registry.example/guardian/broker-rollout@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          sha256: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
      },
      runtimeIngress,
    });
    await settlePulumi();
    expect((workload("broker")?.inputs.spec as { replicas: number }).replicas).toBe(0);
    expect((workload("runtime")?.inputs.spec as { replicas: number }).replicas).toBe(0);
    expect((workload("migrator")?.inputs.spec as { suspend: boolean }).suspend).toBe(true);
    expect((workload("rotation")?.inputs.spec as { suspend: boolean }).suspend).toBe(true);
    expect(
      registrations.some(
        (registration) =>
          registration.type === "kubernetes:core/v1:Service" &&
          (registration.inputs.metadata as { name?: string }).name === "orders-runtime",
      ),
    ).toBe(true);
    expect(
      registrations.some(
        (registration) =>
          registration.type === "aws:vpc/securityGroupIngressRule:SecurityGroupIngressRule" &&
          registration.inputs.referencedSecurityGroupId === CALLER_SECURITY_GROUP_ID &&
          registration.inputs.fromPort === 8080 &&
          registration.inputs.toPort === 8080,
      ),
    ).toBe(true);
    const runtimeNetwork = registrations.find(
      (registration) =>
        registration.type === "kubernetes:networking.k8s.io/v1:NetworkPolicy" &&
        registration.name.includes("runtime-network"),
    );
    expect(JSON.stringify(runtimeNetwork?.inputs.spec)).toContain("guardian-api");
    expect(JSON.stringify(runtimeNetwork?.inputs.spec)).toContain("platform-api");
  });

  it("creates an encrypted TTL replay store and rejects mutable images or broad CIDRs", async () => {
    await createBoundary();
    await settlePulumi();

    const replay = registrations.find(
      (registration) => registration.type === "aws:dynamodb/table:Table",
    );
    expect(replay?.inputs.serverSideEncryption).toEqual(
      expect.objectContaining({ enabled: true, kmsKeyArn: KMS_KEY_ARN }),
    );
    expect(replay?.inputs.ttl).toEqual(
      expect.objectContaining({ attributeName: "expiresAt", enabled: true }),
    );

    const mod = (await import("../src")) as Record<string, unknown>;
    const Boundary = mod.BrokeredAuroraPostgresBoundary as new (
      name: string,
      args: Record<string, unknown>,
    ) => unknown;
    expect(
      () =>
        new Boundary("bad", {
          tier: "sandbox",
          awsRegion: "eu-west-2",
          namespace: "guardian-data",
          oidcProviderArn: OIDC_PROVIDER_ARN,
          oidcIssuer: "https://oidc.eks.eu-west-2.amazonaws.com/id/EXAMPLE",
          vpcId: "vpc-12345678",
          database: {
            endpoint: "db.example",
            port: 5432,
            securityGroupId: "sg-db",
            cidrs: ["0.0.0.0/0"],
          },
          dnsResolverCidrs: ["10.42.0.2/32"],
          endpointCidrs: ["10.42.10.0/28"],
          endpointSecurityGroupIds: {
            secretsManager: "sg-secret",
            kms: "sg-kms",
            dynamodb: "sg-dynamodb",
          },
          dynamodbVpcEndpointId: "vpce-0123456789abcdef0",
          dynamodbEndpointUrl:
            "https://vpce-0123456789abcdef0-example.dynamodb.eu-west-2.vpce.amazonaws.com",
          kmsKeyArn: KMS_KEY_ARN,
          masterSecretArn: MASTER_SECRET_ARN,
          applicationSecretNames: ["a", "b"],
          capability: {
            issuer: "https://issuer.example",
            audience: "broker",
            jwksJson: JWKS_JSON,
            maxTtlSeconds: 60,
          },
          placement: PLACEMENT,
          identities: {
            runtime: { serviceAccountName: "r", roleName: "r" },
            broker: { serviceAccountName: "b", roleName: "b" },
            migrator: { serviceAccountName: "m", roleName: "m" },
            rotation: { serviceAccountName: "o", roleName: "o" },
          },
          workloads: {
            runtime: { image: "registry.example/runtime:latest", command: ["run"], port: 8080 },
            broker: { image: `registry.example/broker@${DIGEST}`, command: ["run"], port: 7443 },
            migrator: { image: `registry.example/migrate@${DIGEST}`, command: ["run"] },
            rotation: {
              image: `registry.example/rotate@${DIGEST}`,
              command: ["run"],
              schedule: "0 * * * *",
            },
          },
        }),
    ).toThrow(/digest|broad CIDR/i);

    resetRegistrations();
    await expect(createBoundary({ dnsResolverCidrs: ["10.0.0.0/8"] })).rejects.toThrow(
      /dnsResolverCidrs|\/32|resolver/i,
    );
    expect(registrations).toEqual([]);
  });

  it("rejects private, symmetric, or unbounded capability key material before registering resources", async () => {
    const mod = (await import("../src")) as Record<string, unknown>;
    const Boundary = mod.BrokeredAuroraPostgresBoundary as new (
      name: string,
      args: Record<string, unknown>,
    ) => unknown;
    const base = {
      tier: "sandbox",
      awsRegion: "eu-west-2",
      namespace: "guardian-data",
      oidcProviderArn: OIDC_PROVIDER_ARN,
      oidcIssuer: "https://oidc.eks.eu-west-2.amazonaws.com/id/EXAMPLE",
      vpcId: "vpc-12345678",
      database: {
        endpoint: "db.example",
        port: 5432,
        securityGroupId: "sg-db",
        cidrs: ["10.42.8.0/24"],
      },
      dnsResolverCidrs: ["10.42.0.2/32"],
      endpointCidrs: ["10.42.10.0/28"],
      endpointSecurityGroupIds: {
        secretsManager: "sg-secret",
        kms: "sg-kms",
        dynamodb: "sg-dynamodb",
      },
      dynamodbVpcEndpointId: "vpce-0123456789abcdef0",
      dynamodbEndpointUrl:
        "https://vpce-0123456789abcdef0-example.dynamodb.eu-west-2.vpce.amazonaws.com",
      kmsKeyArn: KMS_KEY_ARN,
      masterSecretArn: MASTER_SECRET_ARN,
      applicationSecretNames: ["a", "b"],
      placement: PLACEMENT,
      identities: {
        runtime: { serviceAccountName: "r", roleName: "r" },
        broker: { serviceAccountName: "b", roleName: "b" },
        migrator: { serviceAccountName: "m", roleName: "m" },
        rotation: { serviceAccountName: "o", roleName: "o" },
      },
      workloads: {
        runtime: { image: `registry.example/runtime@${DIGEST}`, command: ["run"], port: 8080 },
        broker: { image: `registry.example/broker@${DIGEST}`, command: ["run"], port: 7443 },
        migrator: { image: `registry.example/migrate@${DIGEST}`, command: ["run"] },
        rotation: {
          image: `registry.example/rotate@${DIGEST}`,
          command: ["run"],
          schedule: "0 * * * *",
        },
      },
    };

    expect(
      () =>
        new Boundary("weak-rsa", {
          ...base,
          capability: {
            issuer: "https://issuer.example",
            audience: "broker",
            jwksJson: JSON.stringify({
              keys: [
                {
                  kty: "RSA",
                  kid: "weak",
                  use: "sig",
                  alg: "RS256",
                  n: "AQAB",
                  e: "AQAB",
                },
              ],
            }),
            maxTtlSeconds: 60,
          },
        }),
    ).toThrow(/2048 bits/i);

    expect(
      () =>
        new Boundary("public-dynamodb", {
          ...base,
          dynamodbEndpointUrl: "https://dynamodb.eu-west-2.amazonaws.com",
          capability: {
            issuer: "https://issuer.example",
            audience: "broker",
            jwksJson: JWKS_JSON,
            maxTtlSeconds: 60,
          },
        }),
    ).toThrow(/DynamoDB interface endpoint/i);

    expect(
      () =>
        new Boundary("private-key", {
          ...base,
          capability: {
            issuer: "https://issuer.example",
            audience: "broker",
            jwksJson: JSON.stringify({
              keys: [
                {
                  kty: "RSA",
                  kid: "private",
                  use: "sig",
                  alg: "RS256",
                  n: "cHVibGlj",
                  e: "AQAB",
                  d: "cHJpdmF0ZQ",
                },
              ],
            }),
            maxTtlSeconds: 60,
          },
        }),
    ).toThrow(/private or symmetric/i);
    expect(registrations).toEqual([]);

    expect(
      () =>
        new Boundary("too-many-keys", {
          ...base,
          capability: {
            issuer: "https://issuer.example",
            audience: "broker",
            jwksJson: JSON.stringify({
              keys: Array.from({ length: 9 }, (_, index) => ({
                kty: "RSA",
                kid: `key-${index}`,
                use: "sig",
                alg: "RS256",
                n: "cHVibGlj",
                e: "AQAB",
              })),
            }),
            maxTtlSeconds: 60,
          },
        }),
    ).toThrow(/at most 8|16 KiB/i);
    expect(registrations).toEqual([]);
  });
});
