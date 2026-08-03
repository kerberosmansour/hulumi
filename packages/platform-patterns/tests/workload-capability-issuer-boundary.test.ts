import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as pulumi from "@pulumi/pulumi";
import { Buffer } from "node:buffer";

import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

const DIGEST = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OIDC_PROVIDER_ARN =
  "arn:aws:iam::111122223333:oidc-provider/oidc.eks.eu-west-2.amazonaws.com/id/EXAMPLE";
const SIGNING_KEY_ARN =
  "arn:aws:kms:eu-west-2:111122223333:key/11111111-2222-3333-4444-555555555555";
const TLS_KEY_ARN = "arn:aws:kms:eu-west-2:111122223333:key/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const TLS_SECRET_ARN =
  "arn:aws:secretsmanager:eu-west-2:111122223333:secret:gpil/issuer-transport-tls";
const AUTHORITY_TABLE_ARN =
  "arn:aws:dynamodb:eu-west-2:111122223333:table/gpil-capability-authority";
const CLUSTER_DNS = {
  namespace: "kube-system",
  podSelector: { "k8s-app": "kube-dns" },
  securityGroupId: "sg-cluster-dns",
};
const WEB_IDENTITY_TOKEN_PATH = "/var/run/secrets/eks.amazonaws.com/serviceaccount/token";
const RSA_2048_MODULUS = Buffer.alloc(256, 0xa5).toString("base64url");
const WORKLOAD_JWKS_JSON = JSON.stringify({
  keys: [
    {
      kty: "RSA",
      kid: "guardian-workload-2026-07",
      use: "sig",
      alg: "RS256",
      n: RSA_2048_MODULUS,
      e: "AQAB",
    },
  ],
});
const PLACEMENT = {
  runtimeClassName: "gvisor",
  nodePool: {
    key: "guardian.node-restriction.kubernetes.io/workload-pool",
    value: "issuer-privileged",
  },
  toleration: {
    key: "hulumi.dev/workload-pool",
    value: "issuer-privileged",
    effect: "NoSchedule" as const,
  },
  schedulerName: "default-scheduler",
  priorityClassName: "guardian-issuer-privileged",
};

interface IssuerOptions {
  image?: string;
  endpointCidrs?: string[];
  workloadJwksJson?: string;
  callerNamespace?: string;
  callerPodSelector?: Record<string, string>;
  dynamodbEndpointUrl?: string;
  signingKeyArn?: string;
  authorityTableArn?: pulumi.Input<string>;
  tlsIdentitySecretArn?: string;
  tlsKmsKeyArn?: string;
  clusterDns?: {
    namespace: string;
    podSelector: Record<string, string>;
    securityGroupId: string;
  };
}

async function createIssuer(options: IssuerOptions = {}) {
  const mod = (await import("../src")) as Record<string, unknown>;
  expect(mod.WorkloadCapabilityIssuerBoundary).toBeTypeOf("function");
  const Boundary = mod.WorkloadCapabilityIssuerBoundary as new (
    name: string,
    args: Record<string, unknown>,
  ) => {
    policyContract: import("@pulumi/pulumi").Output<Record<string, unknown>>;
    identityReceipt: import("@pulumi/pulumi").Output<Record<string, unknown>>;
    serviceName: import("@pulumi/pulumi").Output<string>;
  };

  return new Boundary("gpil-issuer", {
    tier: "startup-hardened",
    awsRegion: "eu-west-2",
    namespace: "guardian-data",
    oidcProviderArn: OIDC_PROVIDER_ARN,
    oidcIssuer: "https://oidc.eks.eu-west-2.amazonaws.com/id/EXAMPLE",
    permissionBoundaryArn: "arn:aws:iam::111122223333:policy/hulumi-workload-boundary",
    vpcId: "vpc-12345678",
    dnsResolverCidrs: ["10.42.0.2/32"],
    clusterDns: options.clusterDns ?? CLUSTER_DNS,
    endpointCidrs: options.endpointCidrs ?? ["10.42.10.0/28"],
    endpointSecurityGroupIds: {
      sts: "sg-sts-endpoint",
      kms: "sg-kms-endpoint",
      dynamodb: "sg-dynamodb-endpoint",
      secretsManager: "sg-secrets-endpoint",
    },
    dynamodbVpcEndpointId: "vpce-0123456789abcdef0",
    dynamodbEndpointUrl:
      options.dynamodbEndpointUrl ??
      "https://vpce-0123456789abcdef0-example.dynamodb.eu-west-2.vpce.amazonaws.com",
    signingKeyArn: options.signingKeyArn ?? SIGNING_KEY_ARN,
    authorityTable: {
      arn: options.authorityTableArn ?? AUTHORITY_TABLE_ARN,
    },
    transportTls: {
      identitySecretArn: options.tlsIdentitySecretArn ?? TLS_SECRET_ARN,
      kmsKeyArn: options.tlsKmsKeyArn ?? TLS_KEY_ARN,
    },
    capability: {
      issuer: "https://gpil-issuer.guardian.example",
      audience: "guardian-gpil-broker",
      maxTtlSeconds: 60,
    },
    workloadIdentity: {
      issuer: "https://oidc.eks.eu-west-2.amazonaws.com/id/EXAMPLE",
      audience: "guardian-platform-api",
      jwksJson: options.workloadJwksJson ?? WORKLOAD_JWKS_JSON,
    },
    identity: {
      serviceAccountName: "gpil-issuer",
      roleName: "gpil-issuer",
    },
    caller: {
      namespace: options.callerNamespace ?? "guardian-api",
      podSelector: options.callerPodSelector ?? {
        "app.kubernetes.io/name": "platform-api",
      },
      securityGroupId: "sg-platform-api",
    },
    serviceName: "gpil-issuer",
    dependencyDeadlineMs: 2_000,
    workload: {
      image: options.image ?? `registry.example/gpil-data-boundary@${DIGEST}`,
      command: ["/app/gpil-data-boundary"],
      args: ["serve"],
      port: 7444,
    },
    placement: PLACEMENT,
  });
}

function issuerRole() {
  return registrations.find(
    (registration) =>
      registration.type === "aws:iam/role:Role" &&
      (registration.inputs.tags as Record<string, unknown> | undefined)?.[
        "hulumi:identity-kind"
      ] === "issuer",
  );
}

function issuerPolicy() {
  return registrations.find(
    (registration) =>
      registration.type === "aws:iam/rolePolicy:RolePolicy" &&
      registration.name.includes("issuer-authority"),
  );
}

function issuerDeployment() {
  return registrations.find(
    (registration) =>
      registration.type === "kubernetes:apps/v1:Deployment" &&
      registration.name.includes("gpil-issuer"),
  );
}

describe("WorkloadCapabilityIssuerBoundary", () => {
  beforeEach(resetRegistrations);
  afterEach(resetRegistrations);

  it("creates one exact non-interchangeable issuer IRSA identity and security-group binding", async () => {
    await createIssuer();
    await settlePulumi();

    expect(
      registrations.filter((registration) => registration.type === "aws:iam/role:Role"),
    ).toHaveLength(1);
    expect(
      registrations.filter(
        (registration) => registration.type === "kubernetes:core/v1:ServiceAccount",
      ),
    ).toHaveLength(1);
    expect(
      registrations.filter(
        (registration) => registration.type === "aws:ec2/securityGroup:SecurityGroup",
      ),
    ).toHaveLength(1);
    expect(
      registrations.filter(
        (registration) =>
          registration.type === "kubernetes:vpcresources.k8s.aws/v1beta1:SecurityGroupPolicy",
      ),
    ).toHaveLength(1);

    const role = issuerRole();
    expect(role?.inputs.tags).not.toHaveProperty("hulumi:iac-role");
    expect(role?.inputs.tags).toMatchObject({
      "hulumi:component": "WorkloadCapabilityIssuerBoundary",
      "hulumi:identity-kind": "issuer",
    });
    const trust = JSON.parse(String(role?.inputs.assumeRolePolicy)) as {
      Statement: Array<{ Condition: Record<string, Record<string, string>> }>;
    };
    expect(trust.Statement[0].Condition).toHaveProperty("StringEquals");
    expect(JSON.stringify(trust)).toContain("system:serviceaccount:guardian-data:gpil-issuer");
    expect(JSON.stringify(trust)).toContain("sts.amazonaws.com");
    expect(JSON.stringify(trust)).not.toMatch(/StringLike|\*/u);
  });

  it("grants only exact signing, authority-read, and AWSCURRENT transport-TLS cells", async () => {
    await createIssuer();
    await settlePulumi();

    const policy = JSON.parse(String(issuerPolicy()?.inputs.policy)) as {
      Statement: Array<{
        Sid: string;
        Action: string[];
        Resource: string | string[];
        Condition?: Record<string, Record<string, string>>;
      }>;
    };
    const bySid = Object.fromEntries(
      policy.Statement.map((statement) => [statement.Sid, statement]),
    );

    expect(bySid.ExactCapabilitySigning.Action).toEqual(["kms:Sign", "kms:GetPublicKey"]);
    expect(bySid.ExactCapabilitySigning.Resource).toBe(SIGNING_KEY_ARN);

    expect(bySid.ExactAuthorityRead.Action).toEqual(["dynamodb:GetItem", "dynamodb:DescribeTable"]);
    expect(bySid.ExactAuthorityRead.Resource).toBe(AUTHORITY_TABLE_ARN);
    expect(bySid.ExactAuthorityRead.Condition).toEqual({
      StringEquals: { "aws:SourceVpce": "vpce-0123456789abcdef0" },
    });

    expect(bySid.ExactCurrentTlsIdentity.Action).toEqual(["secretsmanager:GetSecretValue"]);
    expect(bySid.ExactCurrentTlsIdentity.Resource).toBe(TLS_SECRET_ARN);
    expect(bySid.ExactCurrentTlsIdentity.Condition).toEqual({
      StringEquals: { "secretsmanager:VersionStage": "AWSCURRENT" },
    });
    expect(bySid.ExactTlsIdentityMetadata.Action).toEqual(["secretsmanager:DescribeSecret"]);
    expect(bySid.ExactTlsIdentityMetadata.Resource).toBe(TLS_SECRET_ARN);
    expect(bySid.ExactTlsIdentityDecrypt.Action).toEqual(["kms:Decrypt"]);
    expect(bySid.ExactTlsIdentityDecrypt.Resource).toBe(TLS_KEY_ARN);
    expect(bySid.ExactTlsIdentityDecrypt.Condition).toEqual({
      StringEquals: {
        "kms:ViaService": "secretsmanager.eu-west-2.amazonaws.com",
        "kms:EncryptionContext:SecretARN": TLS_SECRET_ARN,
      },
    });

    const rendered = JSON.stringify(policy);
    expect(rendered).not.toMatch(
      /dynamodb:PutItem|dynamodb:Scan|secretsmanager:PutSecretValue|APPLICATION_SECRET|MASTER_SECRET|DATABASE_/u,
    );
    expect(rendered).not.toMatch(/sts:AssumeRole|iam:PassRole|\*/u);
  });

  it("derives the sole authority-table name from an Output-valued exact ARN", async () => {
    const boundary = await createIssuer({
      authorityTableArn: pulumi.output(AUTHORITY_TABLE_ARN),
    });
    await settlePulumi();

    const policy = JSON.parse(String(issuerPolicy()?.inputs.policy)) as {
      Statement: Array<{ Sid: string; Resource: string }>;
    };
    expect(
      policy.Statement.find((statement) => statement.Sid === "ExactAuthorityRead")?.Resource,
    ).toBe(AUTHORITY_TABLE_ARN);

    const deployment = issuerDeployment();
    const container = (
      (deployment?.inputs.spec as Record<string, unknown>).template as Record<string, unknown>
    ).spec as { containers: Array<{ env: Array<{ name: string; value: string }> }> };
    expect(
      container.containers[0].env.find(
        (entry) => entry.name === "CAPABILITY_AUTHORITY_REGISTRY_TABLE",
      )?.value,
    ).toBe("gpil-capability-authority");

    await expect(valueOf(boundary.identityReceipt)).resolves.toMatchObject({
      authorityTableName: "gpil-capability-authority",
    });
  });

  it("permits only exact caller ingress, interface endpoints, and DNS", async () => {
    await createIssuer();
    await settlePulumi();

    const issuerSg = registrations.find(
      (registration) =>
        registration.type === "aws:ec2/securityGroup:SecurityGroup" &&
        (registration.inputs.tags as Record<string, unknown> | undefined)?.[
          "hulumi:identity-kind"
        ] === "issuer",
    );
    const issuerSgId = `${issuerSg?.name}_id`;
    const egress = registrations.filter(
      (registration) =>
        registration.type === "aws:vpc/securityGroupEgressRule:SecurityGroupEgressRule" &&
        registration.inputs.securityGroupId === issuerSgId,
    );
    expect(egress.filter((rule) => rule.inputs.referencedSecurityGroupId !== undefined)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          inputs: expect.objectContaining({
            referencedSecurityGroupId: "sg-sts-endpoint",
            fromPort: 443,
            toPort: 443,
          }),
        }),
        expect.objectContaining({
          inputs: expect.objectContaining({
            referencedSecurityGroupId: "sg-kms-endpoint",
            fromPort: 443,
            toPort: 443,
          }),
        }),
        expect.objectContaining({
          inputs: expect.objectContaining({
            referencedSecurityGroupId: "sg-dynamodb-endpoint",
            fromPort: 443,
            toPort: 443,
          }),
        }),
        expect.objectContaining({
          inputs: expect.objectContaining({
            referencedSecurityGroupId: "sg-secrets-endpoint",
            fromPort: 443,
            toPort: 443,
          }),
        }),
      ]),
    );
    expect(egress.some((rule) => rule.inputs.cidrIpv4 === "0.0.0.0/0")).toBe(false);
    expect(
      registrations.some(
        (registration) =>
          registration.type === "aws:vpc/securityGroupIngressRule:SecurityGroupIngressRule" &&
          registration.inputs.securityGroupId === issuerSgId &&
          registration.inputs.referencedSecurityGroupId === "sg-platform-api" &&
          registration.inputs.fromPort === 7444 &&
          registration.inputs.toPort === 7444,
      ),
    ).toBe(true);

    const network = registrations.find(
      (registration) =>
        registration.type === "kubernetes:networking.k8s.io/v1:NetworkPolicy" &&
        registration.name.includes("issuer-network"),
    );
    const rendered = JSON.stringify(network?.inputs.spec);
    expect(rendered).toContain("guardian-api");
    expect(rendered).toContain("platform-api");
    expect(rendered).toContain("10.42.10.0/28");
    expect(rendered).toContain("10.42.0.2/32");
    expect(rendered).not.toContain("0.0.0.0/0");
  });

  it("routes the protected issuer security group through exact cluster DNS", async () => {
    await createIssuer();
    await settlePulumi();

    const issuerSg = registrations.find(
      (registration) =>
        registration.type === "aws:ec2/securityGroup:SecurityGroup" &&
        (registration.inputs.tags as Record<string, unknown> | undefined)?.[
          "hulumi:identity-kind"
        ] === "issuer",
    );
    expect(issuerSg).toBeDefined();
    const issuerSgId = `${issuerSg?.name}_id`;
    for (const protocol of ["tcp", "udp"]) {
      expect(
        registrations.some(
          (registration) =>
            registration.type === "aws:vpc/securityGroupEgressRule:SecurityGroupEgressRule" &&
            registration.inputs.securityGroupId === issuerSgId &&
            registration.inputs.referencedSecurityGroupId === CLUSTER_DNS.securityGroupId &&
            registration.inputs.ipProtocol === protocol &&
            registration.inputs.fromPort === 53 &&
            registration.inputs.toPort === 53,
        ),
        `issuer ${protocol.toUpperCase()} DNS egress`,
      ).toBe(true);
      expect(
        registrations.some(
          (registration) =>
            registration.type === "aws:vpc/securityGroupIngressRule:SecurityGroupIngressRule" &&
            registration.inputs.securityGroupId === CLUSTER_DNS.securityGroupId &&
            registration.inputs.referencedSecurityGroupId === issuerSgId &&
            registration.inputs.ipProtocol === protocol &&
            registration.inputs.fromPort === 53 &&
            registration.inputs.toPort === 53,
        ),
        `cluster DNS ${protocol.toUpperCase()} ingress from issuer`,
      ).toBe(true);
    }
  });

  it("uses exact namespace and Pod selectors for issuer cluster DNS NetworkPolicy egress", async () => {
    await createIssuer();
    await settlePulumi();

    const network = registrations.find(
      (registration) =>
        registration.type === "kubernetes:networking.k8s.io/v1:NetworkPolicy" &&
        registration.name.includes("issuer-network"),
    );
    const networkSpec = network?.inputs.spec as {
      egress: Array<{
        to?: Array<{
          namespaceSelector?: { matchLabels?: Record<string, string> };
          podSelector?: { matchLabels?: Record<string, string> };
        }>;
        ports?: Array<{ protocol?: string; port?: number }>;
      }>;
    };
    expect(
      networkSpec.egress.some(
        (rule) =>
          rule.to?.some(
            (target) =>
              target.namespaceSelector?.matchLabels?.["kubernetes.io/metadata.name"] ===
                CLUSTER_DNS.namespace &&
              target.podSelector?.matchLabels?.["k8s-app"] === CLUSTER_DNS.podSelector["k8s-app"],
          ) === true &&
          rule.ports?.some((port) => port.protocol === "TCP" && port.port === 53) === true &&
          rule.ports?.some((port) => port.protocol === "UDP" && port.port === 53) === true,
      ),
      "issuer selector-based cluster DNS egress",
    ).toBe(true);
  });

  it("disables Istio sidecar injection on the protected issuer Pod template", async () => {
    await createIssuer();
    await settlePulumi();

    const deployment = issuerDeployment();
    const templateLabels = (
      deployment?.inputs.spec as {
        template: { metadata: { labels: Record<string, string> } };
      }
    ).template.metadata.labels;
    expect(templateLabels).toMatchObject({ "sidecar.istio.io/inject": "false" });
  });

  it("renders one inert digest-pinned native-TLS container with exact GPIL issuer configuration", async () => {
    const boundary = await createIssuer();
    await settlePulumi();

    const deployment = issuerDeployment();
    const spec = deployment?.inputs.spec as {
      replicas: number;
      template: {
        spec: {
          serviceAccountName: string;
          automountServiceAccountToken: boolean;
          initContainers?: unknown[];
          containers: Array<{
            image: string;
            command: string[];
            args: string[];
            env: Array<{ name: string; value: unknown }>;
            securityContext: Record<string, unknown>;
            volumeMounts: Array<Record<string, unknown>>;
          }>;
          volumes: Array<Record<string, unknown>>;
        };
      };
    };
    expect(spec.replicas).toBe(0);
    expect(spec.template.spec.serviceAccountName).toBe("gpil-issuer");
    expect(spec.template.spec.automountServiceAccountToken).toBe(false);
    expect(spec.template.spec.initContainers).toBeUndefined();
    expect(spec.template.spec.containers).toHaveLength(1);
    const container = spec.template.spec.containers[0];
    expect(container.image).toBe(`registry.example/gpil-data-boundary@${DIGEST}`);
    expect(container.command).toEqual(["/app/gpil-data-boundary"]);
    expect(container.args).toEqual(["serve"]);
    expect(container.securityContext).toMatchObject({
      allowPrivilegeEscalation: false,
      readOnlyRootFilesystem: true,
      runAsNonRoot: true,
      capabilities: { drop: ["ALL"] },
    });
    expect(container.volumeMounts).toHaveLength(2);
    expect(container.volumeMounts).toContainEqual({
      name: "aws-iam-token",
      mountPath: "/var/run/secrets/eks.amazonaws.com/serviceaccount",
      readOnly: true,
    });
    expect(spec.template.spec.volumes).toHaveLength(2);
    expect(spec.template.spec.volumes).toContainEqual(
      expect.objectContaining({
        name: "aws-iam-token",
        projected: expect.objectContaining({ defaultMode: 0o444 }),
      }),
    );

    const env = Object.fromEntries(container.env.map((entry) => [entry.name, entry.value]));
    expect(env).toMatchObject({
      AWS_REGION: "eu-west-2",
      AWS_DEFAULT_REGION: "eu-west-2",
      AWS_STS_REGIONAL_ENDPOINTS: "regional",
      AWS_WEB_IDENTITY_TOKEN_FILE: WEB_IDENTITY_TOKEN_PATH,
      GPIL_BOUNDARY_MODE: "issuer",
      GPIL_BIND_ADDR: "0.0.0.0:7444",
      GPIL_TLS_MODE: "native",
      GPIL_DEPENDENCY_DEADLINE_MS: "2000",
      CAPABILITY_ISSUER: "https://gpil-issuer.guardian.example",
      CAPABILITY_AUDIENCE: "guardian-gpil-broker",
      CAPABILITY_MAX_TTL_SECONDS: "60",
      CAPABILITY_SIGNING_KEY_ARN: SIGNING_KEY_ARN,
      CAPABILITY_AUTHORITY_REGISTRY_TABLE: "gpil-capability-authority",
      WORKLOAD_JWT_ISSUER: "https://oidc.eks.eu-west-2.amazonaws.com/id/EXAMPLE",
      WORKLOAD_JWT_AUDIENCE: "guardian-platform-api",
      WORKLOAD_JWKS_JSON,
      TLS_IDENTITY_SECRET_ARN: TLS_SECRET_ARN,
      AWS_ENDPOINT_URL_DYNAMODB:
        "https://vpce-0123456789abcdef0-example.dynamodb.eu-west-2.vpce.amazonaws.com",
    });
    expect(env).not.toHaveProperty("WORKLOAD_JWKS_URL");
    expect(JSON.stringify(env)).not.toMatch(
      /DATABASE_|APPLICATION_SECRET|MASTER_SECRET|CAPABILITY_REPLAY_TABLE/u,
    );

    expect(
      registrations.filter((registration) => registration.type === "kubernetes:core/v1:Service"),
    ).toHaveLength(1);
    const service = registrations.find(
      (registration) => registration.type === "kubernetes:core/v1:Service",
    );
    expect(service?.inputs.spec).toMatchObject({ type: "ClusterIP" });
    expect(registrations.map((registration) => registration.type)).not.toContain(
      "kubernetes:core/v1:Secret",
    );
    expect(await valueOf(boundary.serviceName)).toBe("gpil-issuer");
  });

  it("binds protected issuer Pods to a fail-closed exact one-container admission envelope", async () => {
    await createIssuer();
    await settlePulumi();

    const admission = registrations.find(
      (registration) =>
        registration.type ===
        "kubernetes:admissionregistration.k8s.io/v1:ValidatingAdmissionPolicy",
    );
    const binding = registrations.find(
      (registration) =>
        registration.type ===
        "kubernetes:admissionregistration.k8s.io/v1:ValidatingAdmissionPolicyBinding",
    );
    expect(admission?.inputs.spec).toMatchObject({ failurePolicy: "Fail" });
    expect(binding?.inputs.spec).toMatchObject({ validationActions: ["Deny"] });
    const bindingIndex = registrations.indexOf(binding!);
    const serviceAccountIndex = registrations.findIndex(
      (registration) => registration.type === "kubernetes:core/v1:ServiceAccount",
    );
    const deploymentIndex = registrations.findIndex(
      (registration) => registration.type === "kubernetes:apps/v1:Deployment",
    );
    expect(bindingIndex).toBeGreaterThanOrEqual(0);
    expect(serviceAccountIndex).toBeGreaterThan(bindingIndex);
    expect(deploymentIndex).toBeGreaterThan(bindingIndex);
    const rendered = JSON.stringify(admission?.inputs.spec);
    for (const required of [
      "WorkloadCapabilityIssuerBoundary",
      "serviceAccountName",
      `@${DIGEST}`,
      "containers.size() == 1",
      "initContainers",
      "ephemeralContainers",
      "secretKeyRef",
      "envFrom",
      "hostNetwork",
      "hostPID",
      "hostIPC",
      "allowPrivilegeEscalation",
      "readOnlyRootFilesystem",
      "capabilities.add",
      "runtimeClassName",
      "nodeSelector",
      "tolerations",
      "lifecycle",
      "livenessProbe",
      "readinessProbe",
      "startupProbe",
      WEB_IDENTITY_TOKEN_PATH,
      TLS_SECRET_ARN,
      "pods/ephemeralcontainers",
    ]) {
      expect(rendered).toContain(required);
    }
    expect(rendered).toContain(
      "(object.spec.tolerations.size() == 1 || object.spec.tolerations.size() == 3)",
    );
    expect(rendered).toContain('t.key == \\"node.kubernetes.io/not-ready\\"');
    expect(rendered).toContain('t.key == \\"node.kubernetes.io/unreachable\\"');
    expect(rendered).toContain('t.operator == \\"Exists\\"');
    expect(rendered).toContain('t.effect == \\"NoExecute\\"');
    expect(rendered).toContain("t.tolerationSeconds == 300");
    expect(rendered).toContain("!has(t.value)");
    expect(rendered).toContain("!has(t.tolerationSeconds)");
    expect(rendered).toContain('t.key == \\"hulumi.dev/workload-pool\\"');
    expect(rendered).toContain("object.spec.tolerations.all(t,");
    const firstExpression = (
      admission?.inputs.spec as { validations: Array<{ expression: string }> }
    ).validations[0].expression;
    expect(firstExpression).toContain(JSON.stringify(WORKLOAD_JWKS_JSON));
    expect(firstExpression).toContain(
      '"hulumi.dev/component"] == "WorkloadCapabilityIssuerBoundary" && "hulumi.dev/boundary"',
    );
    expect(firstExpression).not.toContain('|| ("hulumi.dev/identity-kind" in');
    expect(firstExpression).not.toContain(
      '"WorkloadCapabilityIssuerBoundary") || ("hulumi.dev/boundary"',
    );
  });

  it("rejects mutable images, broad egress, remote workload JWKS, and endpoint drift before registration", async () => {
    await expect(
      createIssuer({ image: "registry.example/gpil-data-boundary:latest" }),
    ).rejects.toThrow(/immutable|sha256|digest/i);
    expect(registrations).toEqual([]);

    await expect(createIssuer({ endpointCidrs: ["0.0.0.0/0"] })).rejects.toThrow(
      /broad|CIDR|private/i,
    );
    expect(registrations).toEqual([]);

    await expect(
      createIssuer({
        workloadJwksJson:
          '{"keys":[{"kty":"oct","kid":"symmetric","use":"sig","alg":"HS256","k":"secret"}]}',
      }),
    ).rejects.toThrow(/JWKS|public|RSA|symmetric|private/i);
    expect(registrations).toEqual([]);

    await expect(
      createIssuer({ workloadJwksJson: "https://issuer.example/.well-known/jwks.json" }),
    ).rejects.toThrow(/JWKS|JSON/i);
    expect(registrations).toEqual([]);

    await expect(createIssuer({ callerNamespace: "*" })).rejects.toThrow(
      /caller|namespace|wildcard/i,
    );
    expect(registrations).toEqual([]);

    await expect(createIssuer({ callerPodSelector: {} })).rejects.toThrow(
      /caller|selector|non-empty/i,
    );
    expect(registrations).toEqual([]);

    await expect(
      createIssuer({ dynamodbEndpointUrl: "https://dynamodb.eu-west-2.amazonaws.com" }),
    ).rejects.toThrow(/DynamoDB|endpoint|vpce/i);
    expect(registrations).toEqual([]);

    await expect(createIssuer({ signingKeyArn: "*" })).rejects.toThrow(
      /signingKeyArn|wildcard|exact/i,
    );
    expect(registrations).toEqual([]);

    await expect(
      createIssuer({
        authorityTableArn: "arn:aws:s3:eu-west-2:111122223333:table/gpil-capability-authority",
      }),
    ).rejects.toThrow(/authorityTable|dynamodb|exact/i);
    expect(registrations).toEqual([]);

    for (const tableName of ["ab", "a".repeat(256)]) {
      await expect(
        createIssuer({
          authorityTableArn: `arn:aws:dynamodb:eu-west-2:111122223333:table/${tableName}`,
        }),
      ).rejects.toThrow(/authorityTable|dynamodb|exact/i);
      expect(registrations).toEqual([]);
    }

    await expect(
      createIssuer({
        tlsIdentitySecretArn:
          "arn:aws:secretsmanager:us-east-1:111122223333:secret:gpil/issuer-transport-tls",
      }),
    ).rejects.toThrow(/transportTls|region|exact/i);
    expect(registrations).toEqual([]);

    await expect(
      createIssuer({
        tlsKmsKeyArn: "arn:aws:kms:eu-west-2:999900001111:key/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      }),
    ).rejects.toThrow(/transportTls|account|exact/i);
    expect(registrations).toEqual([]);
  });

  it("rejects empty or wildcard cluster DNS namespaces and selectors before registration", async () => {
    const invalidClusterDns = [
      { ...CLUSTER_DNS, namespace: "" },
      { ...CLUSTER_DNS, namespace: "*" },
      { ...CLUSTER_DNS, podSelector: {} },
      { ...CLUSTER_DNS, podSelector: { "k8s-app": "*" } },
      { ...CLUSTER_DNS, securityGroupId: "0.0.0.0/0" },
    ];

    for (const clusterDns of invalidClusterDns) {
      resetRegistrations();
      let validationError: unknown;
      try {
        await createIssuer({ clusterDns });
      } catch (error) {
        validationError = error;
      }
      expect(
        validationError,
        `clusterDns should fail closed: ${JSON.stringify(clusterDns)}`,
      ).toBeInstanceOf(Error);
      expect(String(validationError)).toMatch(/clusterDns|namespace|selector|wildcard|non-empty/i);
      expect(registrations).toEqual([]);
    }
  });
});
