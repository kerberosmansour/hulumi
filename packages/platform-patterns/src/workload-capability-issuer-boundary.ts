import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";
import { Buffer } from "node:buffer";
import { URL } from "node:url";

import { assertValidTier } from "./tier";
import type {
  WorkloadCapabilityIssuerBoundaryArgs,
  WorkloadCapabilityIssuerPlacementArgs,
} from "./workload-capability-issuer-boundary.args";
import type {
  WorkloadCapabilityIssuerBoundaryOutputs,
  WorkloadCapabilityIssuerIdentityReceipt,
} from "./workload-capability-issuer-boundary.outputs";

export const WORKLOAD_CAPABILITY_ISSUER_BOUNDARY_COMPONENT_TYPE =
  "hulumi:platform:WorkloadCapabilityIssuerBoundary";

const DEFAULT_OIDC_AUDIENCE = "sts.amazonaws.com";
const WEB_IDENTITY_VOLUME_NAME = "aws-iam-token";
const WEB_IDENTITY_TOKEN_DIR = "/var/run/secrets/eks.amazonaws.com/serviceaccount";
const WEB_IDENTITY_TOKEN_PATH = `${WEB_IDENTITY_TOKEN_DIR}/token`;
const IMMUTABLE_IMAGE = /@sha256:[a-f0-9]{64}$/iu;
const CIDR = /^(?:\d{1,3}\.){3}\d{1,3}\/(?:[0-9]|[12][0-9]|3[0-2])$/u;
const KUBERNETES_DNS_LABEL = /^[a-z0-9](?:[-a-z0-9]{0,61}[a-z0-9])?$/u;
const IAM_ROLE_NAME = /^[A-Za-z0-9+=,.@_-]{1,64}$/u;
const BASE64URL = /^[A-Za-z0-9_-]+$/u;
const SECURITY_GROUP_ID = /^sg-[A-Za-z0-9-]+$/u;
const NODE_RESTRICTION_LABEL =
  /^(?:node-restriction\.kubernetes\.io|[a-z0-9.-]+\.node-restriction\.kubernetes\.io)\/[A-Za-z0-9_.-]+$/u;
const PRIVATE_JWK_FIELDS = ["d", "p", "q", "dp", "dq", "qi", "oth", "k"] as const;
const MAX_JWKS_KEYS = 8;
const MAX_JWKS_BYTES = 16 * 1024;
const INFRASTRUCTURE_LIMITS = [
  "IaC only: the consumer supplies the issuer executable and authority-table records.",
  "The issuer Deployment remains inert at zero replicas until external live gates pass.",
  "Static public workload JWKS only; no public JWKS retrieval egress is created.",
  "The transport TLS identity remains in Secrets Manager and never enters Pulumi state or a Kubernetes Secret.",
  "Pulumi mocks and preview structure are not live IAM, endpoint, admission, or workload evidence.",
] as const;

function requireExact(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`WorkloadCapabilityIssuerBoundary: ${label} must be non-empty`);
  }
  if (trimmed.includes("*")) {
    throw new Error(`WorkloadCapabilityIssuerBoundary: ${label} must not contain a wildcard`);
  }
  return trimmed;
}

interface AwsArnContext {
  readonly partition: string;
  readonly account: string;
}

function parseOidcProviderArn(value: string): AwsArnContext {
  const exact = requireExact(value, "oidcProviderArn");
  const match = /^arn:(aws(?:-cn|-us-gov)?):iam::(\d{12}):oidc-provider\/[A-Za-z0-9./_-]+$/u.exec(
    exact,
  );
  if (match === null) {
    throw new Error(
      "WorkloadCapabilityIssuerBoundary: oidcProviderArn must be an exact IAM OIDC-provider ARN",
    );
  }
  return { partition: match[1], account: match[2] };
}

function validatedResourceArn(
  input: pulumi.Input<string>,
  label: string,
  context: AwsArnContext,
  awsRegion: string,
  service: "dynamodb" | "kms" | "secretsmanager",
  resourcePattern: RegExp,
): pulumi.Output<string> {
  const validate = (value: string): string => {
    const exact = requireExact(value, label);
    const match = /^arn:(aws(?:-cn|-us-gov)?):([^:]+):([^:]+):(\d{12}):(.+)$/u.exec(exact);
    if (
      match === null ||
      match[1] !== context.partition ||
      match[2] !== service ||
      match[3] !== awsRegion ||
      match[4] !== context.account ||
      !resourcePattern.test(match[5])
    ) {
      throw new Error(
        `WorkloadCapabilityIssuerBoundary: ${label} must be an exact ${service} ARN in the boundary partition, region, and account`,
      );
    }
    return exact;
  };
  if (typeof input === "string") validate(input);
  return pulumi.output(input).apply(validate);
}

function validatedAuthorityTable(
  input: pulumi.Input<string>,
  context: AwsArnContext,
  awsRegion: string,
): pulumi.Output<{ readonly arn: string; readonly name: string }> {
  return validatedResourceArn(
    input,
    "authorityTable.arn",
    context,
    awsRegion,
    "dynamodb",
    /^table\/[A-Za-z0-9_.-]{3,255}$/u,
  ).apply((arn) => ({
    arn,
    name: arn.slice(arn.lastIndexOf(":table/") + ":table/".length),
  }));
}

function requireHttpsUrl(value: string, label: string): string {
  requireExact(value, label);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`WorkloadCapabilityIssuerBoundary: ${label} must be an exact HTTPS URL`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.hash !== ""
  ) {
    throw new Error(`WorkloadCapabilityIssuerBoundary: ${label} must be an exact HTTPS URL`);
  }
  return parsed.toString().replace(/\/$/u, "");
}

function requireJwkString(key: Record<string, unknown>, field: string, label: string): string {
  const value = key[field];
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("*") ||
    !BASE64URL.test(value)
  ) {
    throw new Error(
      `WorkloadCapabilityIssuerBoundary: workloadIdentity.jwksJson ${label}.${field} must be non-empty base64url`,
    );
  }
  return value;
}

function canonicalWorkloadJwks(value: string): string {
  if (Buffer.byteLength(value, "utf8") > MAX_JWKS_BYTES) {
    throw new Error(
      "WorkloadCapabilityIssuerBoundary: workloadIdentity.jwksJson must not exceed 16 KiB",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(
      "WorkloadCapabilityIssuerBoundary: workloadIdentity.jwksJson must be valid JSON",
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      "WorkloadCapabilityIssuerBoundary: workloadIdentity.jwksJson must be a JWKS object",
    );
  }
  const keys = (parsed as Record<string, unknown>).keys;
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > MAX_JWKS_KEYS) {
    throw new Error(
      "WorkloadCapabilityIssuerBoundary: workloadIdentity.jwksJson must contain 1–8 public RSA keys",
    );
  }
  const kids = new Set<string>();
  const publicKeys = keys.map((entry, index) => {
    const label = `keys[${index}]`;
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(
        `WorkloadCapabilityIssuerBoundary: workloadIdentity.jwksJson ${label} must be an object`,
      );
    }
    const key = entry as Record<string, unknown>;
    if (PRIVATE_JWK_FIELDS.some((field) => key[field] !== undefined)) {
      throw new Error(
        `WorkloadCapabilityIssuerBoundary: workloadIdentity.jwksJson ${label} contains private or symmetric key material`,
      );
    }
    if (key.kty !== "RSA" || key.alg !== "RS256" || key.use !== "sig") {
      throw new Error(
        `WorkloadCapabilityIssuerBoundary: workloadIdentity.jwksJson ${label} must be public RSA/RS256 signing material`,
      );
    }
    const kid =
      typeof key.kid === "string" && key.kid.trim() !== "" && !key.kid.includes("*")
        ? key.kid
        : undefined;
    if (kid === undefined || kids.has(kid)) {
      throw new Error(
        `WorkloadCapabilityIssuerBoundary: workloadIdentity.jwksJson ${label}.kid must be exact and unique`,
      );
    }
    kids.add(kid);
    const modulus = requireJwkString(key, "n", label);
    const exponent = requireJwkString(key, "e", label);
    if (Buffer.from(modulus, "base64url").byteLength < 256 || exponent !== "AQAB") {
      throw new Error(
        `WorkloadCapabilityIssuerBoundary: workloadIdentity.jwksJson ${label} must use an RSA modulus of at least 2048 bits and exponent 65537`,
      );
    }
    return {
      kty: "RSA",
      kid,
      use: "sig",
      alg: "RS256",
      n: modulus,
      e: exponent,
    };
  });
  return JSON.stringify({ keys: publicKeys });
}

function validateCidr(value: string, label: string, requiredPrefix?: number): void {
  if (value === "0.0.0.0/0" || value === "::/0") {
    throw new Error(
      `WorkloadCapabilityIssuerBoundary: broad CIDR ${value} is forbidden in ${label}`,
    );
  }
  if (!CIDR.test(value)) {
    throw new Error(
      `WorkloadCapabilityIssuerBoundary: ${label} must contain exact IPv4 CIDRs; got ${value}`,
    );
  }
  const [address] = value.split("/");
  if (address.split(".").some((octet) => Number(octet) > 255)) {
    throw new Error(`WorkloadCapabilityIssuerBoundary: invalid IPv4 CIDR ${value} in ${label}`);
  }
  const [first, second] = address.split(".").map(Number);
  const isPrivate =
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168);
  if (!isPrivate) {
    throw new Error(
      `WorkloadCapabilityIssuerBoundary: ${label} must contain private IPv4 CIDRs; got ${value}`,
    );
  }
  if (requiredPrefix !== undefined && !value.endsWith(`/${requiredPrefix}`)) {
    throw new Error(
      `WorkloadCapabilityIssuerBoundary: ${label} must contain exact IPv4 /${requiredPrefix} entries; got ${value}`,
    );
  }
}

function validatePlacement(placement: WorkloadCapabilityIssuerPlacementArgs): void {
  requireExact(placement.runtimeClassName, "placement.runtimeClassName");
  const nodePoolKey = requireExact(placement.nodePool.key, "placement.nodePool.key");
  requireExact(placement.nodePool.value, "placement.nodePool.value");
  if (!NODE_RESTRICTION_LABEL.test(nodePoolKey)) {
    throw new Error(
      "WorkloadCapabilityIssuerBoundary: placement.nodePool.key must use the NodeRestriction protected-label prefix",
    );
  }
  requireExact(placement.toleration.key, "placement.toleration.key");
  requireExact(placement.toleration.value, "placement.toleration.value");
  if (placement.toleration.effect !== "NoSchedule") {
    throw new Error(
      "WorkloadCapabilityIssuerBoundary: placement.toleration.effect must be NoSchedule",
    );
  }
  requireExact(placement.schedulerName, "placement.schedulerName");
  requireExact(placement.priorityClassName, "placement.priorityClassName");
}

interface ValidatedArgs {
  readonly arnContext: AwsArnContext;
  readonly capabilityIssuer: string;
  readonly dynamodbEndpointUrl: string;
  readonly workloadIssuer: string;
  readonly workloadJwksJson: string;
}

function validateArgs(args: WorkloadCapabilityIssuerBoundaryArgs): ValidatedArgs {
  assertValidTier(args.tier);
  if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/u.test(args.awsRegion)) {
    throw new Error("WorkloadCapabilityIssuerBoundary: awsRegion must be an exact AWS region");
  }
  requireExact(args.namespace, "namespace");
  if (!KUBERNETES_DNS_LABEL.test(args.namespace)) {
    throw new Error("WorkloadCapabilityIssuerBoundary: namespace must be a Kubernetes DNS label");
  }
  const arnContext = parseOidcProviderArn(args.oidcProviderArn);
  requireHttpsUrl(args.oidcIssuer, "oidcIssuer");
  if ((args.oidcAudience ?? DEFAULT_OIDC_AUDIENCE) !== DEFAULT_OIDC_AUDIENCE) {
    throw new Error(
      `WorkloadCapabilityIssuerBoundary: IRSA oidcAudience must be ${DEFAULT_OIDC_AUDIENCE}`,
    );
  }
  if (args.tags?.["hulumi:iac-role"] !== undefined) {
    throw new Error(
      "WorkloadCapabilityIssuerBoundary: workload identity must not carry hulumi:iac-role",
    );
  }
  if (args.tier === "startup-hardened" && args.permissionBoundaryArn === undefined) {
    throw new Error(
      "WorkloadCapabilityIssuerBoundary: startup-hardened requires permissionBoundaryArn",
    );
  }

  requireExact(args.identity.serviceAccountName, "identity.serviceAccountName");
  requireExact(args.identity.roleName, "identity.roleName");
  if (!KUBERNETES_DNS_LABEL.test(args.identity.serviceAccountName)) {
    throw new Error(
      "WorkloadCapabilityIssuerBoundary: identity.serviceAccountName must be a Kubernetes DNS label",
    );
  }
  if (!IAM_ROLE_NAME.test(args.identity.roleName)) {
    throw new Error(
      "WorkloadCapabilityIssuerBoundary: identity.roleName must be an exact AWS IAM role name",
    );
  }
  requireExact(args.serviceName, "serviceName");
  requireExact(args.caller.namespace, "caller.namespace");
  if (
    !KUBERNETES_DNS_LABEL.test(args.serviceName) ||
    !KUBERNETES_DNS_LABEL.test(args.caller.namespace)
  ) {
    throw new Error(
      "WorkloadCapabilityIssuerBoundary: serviceName and caller.namespace must be exact Kubernetes DNS labels",
    );
  }
  const selectorEntries = Object.entries(args.caller.podSelector);
  if (selectorEntries.length === 0) {
    throw new Error("WorkloadCapabilityIssuerBoundary: caller.podSelector must be non-empty");
  }
  for (const [key, value] of selectorEntries) {
    requireExact(key, "caller.podSelector key");
    requireExact(value, `caller.podSelector.${key}`);
  }
  if (
    typeof args.caller.securityGroupId === "string" &&
    !SECURITY_GROUP_ID.test(args.caller.securityGroupId)
  ) {
    throw new Error(
      "WorkloadCapabilityIssuerBoundary: caller.securityGroupId must be an exact security-group id",
    );
  }

  if (!IMMUTABLE_IMAGE.test(args.workload.image)) {
    throw new Error(
      "WorkloadCapabilityIssuerBoundary: workload image must use an immutable @sha256 digest",
    );
  }
  if (
    args.workload.command.length === 0 ||
    args.workload.command.some((entry) => entry.trim() === "")
  ) {
    throw new Error(
      "WorkloadCapabilityIssuerBoundary: workload command must contain exact non-empty argv entries",
    );
  }
  if (args.workload.args !== undefined && args.workload.args.some((entry) => entry.trim() === "")) {
    throw new Error(
      "WorkloadCapabilityIssuerBoundary: workload args must contain exact non-empty argv entries",
    );
  }
  if (
    !Number.isInteger(args.workload.port) ||
    args.workload.port < 1 ||
    args.workload.port > 65535
  ) {
    throw new Error("WorkloadCapabilityIssuerBoundary: workload.port must be 1..65535");
  }
  if (
    !Number.isInteger(args.dependencyDeadlineMs) ||
    args.dependencyDeadlineMs < 100 ||
    args.dependencyDeadlineMs > 10_000
  ) {
    throw new Error("WorkloadCapabilityIssuerBoundary: dependencyDeadlineMs must be 100..10000");
  }
  if (
    !Number.isInteger(args.capability.maxTtlSeconds) ||
    args.capability.maxTtlSeconds < 1 ||
    args.capability.maxTtlSeconds > 60
  ) {
    throw new Error("WorkloadCapabilityIssuerBoundary: capability.maxTtlSeconds must be 1..60");
  }
  const capabilityIssuer = requireHttpsUrl(args.capability.issuer, "capability.issuer");
  requireExact(args.capability.audience, "capability.audience");
  const workloadIssuer = requireHttpsUrl(args.workloadIdentity.issuer, "workloadIdentity.issuer");
  requireExact(args.workloadIdentity.audience, "workloadIdentity.audience");
  const workloadJwksJson = canonicalWorkloadJwks(args.workloadIdentity.jwksJson);

  for (const [label, cidrs] of [
    ["dnsResolverCidrs", args.dnsResolverCidrs],
    ["endpointCidrs", args.endpointCidrs],
  ] as const) {
    if (cidrs.length === 0) {
      throw new Error(`WorkloadCapabilityIssuerBoundary: ${label} must be non-empty`);
    }
    cidrs.forEach((cidr) =>
      validateCidr(cidr, label, label === "dnsResolverCidrs" ? 32 : undefined),
    );
  }
  requireExact(args.clusterDns.namespace, "clusterDns.namespace");
  if (!KUBERNETES_DNS_LABEL.test(args.clusterDns.namespace)) {
    throw new Error(
      "WorkloadCapabilityIssuerBoundary: clusterDns.namespace must be an exact Kubernetes DNS label",
    );
  }
  const clusterDnsSelectorEntries = Object.entries(args.clusterDns.podSelector);
  if (clusterDnsSelectorEntries.length === 0) {
    throw new Error("WorkloadCapabilityIssuerBoundary: clusterDns.podSelector must be non-empty");
  }
  for (const [key, value] of clusterDnsSelectorEntries) {
    requireExact(key, "clusterDns.podSelector key");
    requireExact(value, `clusterDns.podSelector.${key}`);
  }
  if (
    typeof args.clusterDns.securityGroupId === "string" &&
    !SECURITY_GROUP_ID.test(args.clusterDns.securityGroupId)
  ) {
    throw new Error(
      "WorkloadCapabilityIssuerBoundary: clusterDns.securityGroupId must be an exact security-group id",
    );
  }
  const dynamodbEndpointUrl = requireHttpsUrl(args.dynamodbEndpointUrl, "dynamodbEndpointUrl");
  const dynamodbEndpoint = new URL(dynamodbEndpointUrl);
  const dynamodbVpcEndpointId = requireExact(args.dynamodbVpcEndpointId, "dynamodbVpcEndpointId");
  if (
    !/^vpce-[0-9a-f]{8,}$/u.test(dynamodbVpcEndpointId) ||
    (!dynamodbEndpoint.hostname.startsWith(`${dynamodbVpcEndpointId}.`) &&
      !dynamodbEndpoint.hostname.startsWith(`${dynamodbVpcEndpointId}-`)) ||
    !dynamodbEndpoint.hostname.endsWith(`.dynamodb.${args.awsRegion}.vpce.amazonaws.com`) ||
    dynamodbEndpoint.pathname !== "/" ||
    dynamodbEndpoint.search !== "" ||
    dynamodbEndpoint.port !== ""
  ) {
    throw new Error(
      "WorkloadCapabilityIssuerBoundary: dynamodbEndpointUrl must be the exact regional DynamoDB interface endpoint HTTPS URL",
    );
  }
  validatePlacement(args.placement);
  return {
    arnContext,
    capabilityIssuer,
    dynamodbEndpointUrl,
    workloadIssuer,
    workloadJwksJson,
  };
}

function issuerConditionPrefix(issuer: string): string {
  return issuer.replace(/^https:\/\//u, "").replace(/\/$/u, "");
}

function trustPolicy(args: WorkloadCapabilityIssuerBoundaryArgs): string {
  const prefix = issuerConditionPrefix(args.oidcIssuer);
  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Federated: args.oidcProviderArn },
        Action: "sts:AssumeRoleWithWebIdentity",
        Condition: {
          StringEquals: {
            [`${prefix}:aud`]: args.oidcAudience ?? DEFAULT_OIDC_AUDIENCE,
            [`${prefix}:sub`]: `system:serviceaccount:${args.namespace}:${args.identity.serviceAccountName}`,
          },
        },
      },
    ],
  });
}

function labels(name: string): Record<string, string> {
  return {
    "app.kubernetes.io/name": name,
    "app.kubernetes.io/part-of": name,
    "hulumi.dev/component": "WorkloadCapabilityIssuerBoundary",
    "hulumi.dev/boundary": name,
    "hulumi.dev/identity-kind": "issuer",
  };
}

function podTemplateLabels(resourceLabels: Record<string, string>): Record<string, string> {
  return {
    ...resourceLabels,
    "sidecar.istio.io/inject": "false",
  };
}

function celStringList(values: readonly string[]): string {
  return `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
}

export class WorkloadCapabilityIssuerBoundary
  extends pulumi.ComponentResource
  implements WorkloadCapabilityIssuerBoundaryOutputs
{
  public readonly policyContract: pulumi.Output<
    pulumi.Unwrap<WorkloadCapabilityIssuerBoundaryArgs>
  >;
  public readonly roleArn: pulumi.Output<string>;
  public readonly serviceAccountName: pulumi.Output<string>;
  public readonly securityGroupId: pulumi.Output<string>;
  public readonly serviceName: pulumi.Output<string>;
  public readonly identityReceipt: pulumi.Output<WorkloadCapabilityIssuerIdentityReceipt>;

  constructor(
    name: string,
    args: WorkloadCapabilityIssuerBoundaryArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    const validated = validateArgs(args);
    const signingKeyArn = validatedResourceArn(
      args.signingKeyArn,
      "signingKeyArn",
      validated.arnContext,
      args.awsRegion,
      "kms",
      /^key\/[A-Za-z0-9-]+$/u,
    );
    const authorityTable = validatedAuthorityTable(
      args.authorityTable.arn,
      validated.arnContext,
      args.awsRegion,
    );
    const crossValidatedAuthorityTableArn = authorityTable.apply(({ arn }) => arn);
    const crossValidatedAuthorityTableName = authorityTable.apply(
      ({ name: tableName }) => tableName,
    );
    const tlsIdentitySecretArn = validatedResourceArn(
      args.transportTls.identitySecretArn,
      "transportTls.identitySecretArn",
      validated.arnContext,
      args.awsRegion,
      "secretsmanager",
      /^secret:[A-Za-z0-9/_+=.@-]+$/u,
    );
    const tlsKmsKeyArn = validatedResourceArn(
      args.transportTls.kmsKeyArn,
      "transportTls.kmsKeyArn",
      validated.arnContext,
      args.awsRegion,
      "kms",
      /^key\/[A-Za-z0-9-]+$/u,
    );
    const policyContract = {
      ...args,
      signingKeyArn,
      authorityTable: {
        arn: crossValidatedAuthorityTableArn,
      },
      transportTls: {
        identitySecretArn: tlsIdentitySecretArn,
        kmsKeyArn: tlsKmsKeyArn,
      },
      capability: { ...args.capability, issuer: validated.capabilityIssuer },
      workloadIdentity: {
        ...args.workloadIdentity,
        issuer: validated.workloadIssuer,
        jwksJson: validated.workloadJwksJson,
      },
      dynamodbEndpointUrl: validated.dynamodbEndpointUrl,
    };
    super(
      WORKLOAD_CAPABILITY_ISSUER_BOUNDARY_COMPONENT_TYPE,
      name,
      policyContract as pulumi.Inputs,
      opts,
    );
    this.policyContract = pulumi.output(policyContract);
    const parent = { parent: this } as const;
    const resourceLabels = labels(name);
    const resourceTags = {
      ...(args.tags ?? {}),
      "hulumi:component": "WorkloadCapabilityIssuerBoundary",
      "hulumi:boundary": name,
      "hulumi:tier": args.tier,
      "hulumi:identity-kind": "issuer",
    };

    const role = new aws.iam.Role(
      `${name}-issuer-role`,
      {
        name: args.identity.roleName,
        assumeRolePolicy: trustPolicy(args),
        maxSessionDuration: 3600,
        ...(args.permissionBoundaryArn !== undefined
          ? { permissionsBoundary: args.permissionBoundaryArn }
          : {}),
        tags: resourceTags,
      },
      parent,
    );
    const securityGroup = new aws.ec2.SecurityGroup(
      `${name}-issuer-sg`,
      {
        namePrefix: `${name}-issuer-`,
        description: `Hulumi ${name} closed workload-capability issuer security group`,
        vpcId: args.vpcId,
        ingress: [],
        egress: [],
        tags: resourceTags,
      },
      parent,
    );
    new k8s.apiextensions.CustomResource(
      `${name}-issuer-security-group-policy`,
      {
        apiVersion: "vpcresources.k8s.aws/v1beta1",
        kind: "SecurityGroupPolicy",
        metadata: {
          name: `${name}-issuer`,
          namespace: args.namespace,
          labels: resourceLabels,
        },
        spec: {
          podSelector: { matchLabels: resourceLabels },
          securityGroups: { groupIds: [securityGroup.id] },
        },
      },
      parent,
    );

    new aws.iam.RolePolicy(
      `${name}-issuer-authority-policy`,
      {
        role: role.name,
        policy: pulumi
          .all([signingKeyArn, crossValidatedAuthorityTableArn, tlsIdentitySecretArn, tlsKmsKeyArn])
          .apply(([signingKeyArn, authorityTableArn, tlsIdentitySecretArn, tlsKmsKeyArn]) =>
            JSON.stringify({
              Version: "2012-10-17",
              Statement: [
                {
                  Sid: "ExactCapabilitySigning",
                  Effect: "Allow",
                  Action: ["kms:Sign", "kms:GetPublicKey"],
                  Resource: signingKeyArn,
                },
                {
                  Sid: "ExactAuthorityRead",
                  Effect: "Allow",
                  Action: ["dynamodb:GetItem", "dynamodb:DescribeTable"],
                  Resource: authorityTableArn,
                  Condition: {
                    StringEquals: { "aws:SourceVpce": args.dynamodbVpcEndpointId },
                  },
                },
                {
                  Sid: "ExactCurrentTlsIdentity",
                  Effect: "Allow",
                  Action: ["secretsmanager:GetSecretValue"],
                  Resource: tlsIdentitySecretArn,
                  Condition: {
                    StringEquals: { "secretsmanager:VersionStage": "AWSCURRENT" },
                  },
                },
                {
                  Sid: "ExactTlsIdentityMetadata",
                  Effect: "Allow",
                  Action: ["secretsmanager:DescribeSecret"],
                  Resource: tlsIdentitySecretArn,
                },
                {
                  Sid: "ExactTlsIdentityDecrypt",
                  Effect: "Allow",
                  Action: ["kms:Decrypt"],
                  Resource: tlsKmsKeyArn,
                  Condition: {
                    StringEquals: {
                      "kms:ViaService": `secretsmanager.${args.awsRegion}.amazonaws.com`,
                      "kms:EncryptionContext:SecretARN": tlsIdentitySecretArn,
                    },
                  },
                },
              ],
            }),
          ),
      },
      parent,
    );

    const linkEndpoint = (
      logicalName: string,
      endpointSecurityGroupId: pulumi.Input<string>,
      description: string,
    ) => {
      new aws.vpc.SecurityGroupEgressRule(
        `${logicalName}-egress`,
        {
          securityGroupId: securityGroup.id,
          referencedSecurityGroupId: endpointSecurityGroupId,
          ipProtocol: "tcp",
          fromPort: 443,
          toPort: 443,
          description,
        },
        parent,
      );
      new aws.vpc.SecurityGroupIngressRule(
        `${logicalName}-ingress`,
        {
          securityGroupId: endpointSecurityGroupId,
          referencedSecurityGroupId: securityGroup.id,
          ipProtocol: "tcp",
          fromPort: 443,
          toPort: 443,
          description,
        },
        parent,
      );
    };
    linkEndpoint(
      `${name}-issuer-to-sts-endpoint`,
      args.endpointSecurityGroupIds.sts,
      "issuer exact STS endpoint path for IRSA credential exchange",
    );
    linkEndpoint(
      `${name}-issuer-to-kms-endpoint`,
      args.endpointSecurityGroupIds.kms,
      "issuer exact KMS endpoint path",
    );
    linkEndpoint(
      `${name}-issuer-to-dynamodb-endpoint`,
      args.endpointSecurityGroupIds.dynamodb,
      "issuer exact DynamoDB authority endpoint path",
    );
    linkEndpoint(
      `${name}-issuer-to-secrets-endpoint`,
      args.endpointSecurityGroupIds.secretsManager,
      "issuer exact Secrets Manager TLS identity endpoint path",
    );
    new aws.vpc.SecurityGroupEgressRule(
      `${name}-caller-to-issuer-egress`,
      {
        securityGroupId: args.caller.securityGroupId,
        referencedSecurityGroupId: securityGroup.id,
        ipProtocol: "tcp",
        fromPort: args.workload.port,
        toPort: args.workload.port,
        description: "exact caller workload to capability issuer",
      },
      parent,
    );
    new aws.vpc.SecurityGroupIngressRule(
      `${name}-caller-to-issuer-ingress`,
      {
        securityGroupId: securityGroup.id,
        referencedSecurityGroupId: args.caller.securityGroupId,
        ipProtocol: "tcp",
        fromPort: args.workload.port,
        toPort: args.workload.port,
        description: "exact caller workload to capability issuer",
      },
      parent,
    );
    for (const protocol of ["tcp", "udp"] as const) {
      new aws.vpc.SecurityGroupEgressRule(
        `${name}-issuer-cluster-dns-${protocol}-egress`,
        {
          securityGroupId: securityGroup.id,
          referencedSecurityGroupId: args.clusterDns.securityGroupId,
          ipProtocol: protocol,
          fromPort: 53,
          toPort: 53,
          description: `issuer exact cluster DNS ${protocol.toUpperCase()} egress`,
        },
        parent,
      );
      new aws.vpc.SecurityGroupIngressRule(
        `${name}-issuer-cluster-dns-${protocol}-ingress`,
        {
          securityGroupId: args.clusterDns.securityGroupId,
          referencedSecurityGroupId: securityGroup.id,
          ipProtocol: protocol,
          fromPort: 53,
          toPort: 53,
          description: `issuer exact cluster DNS ${protocol.toUpperCase()} ingress`,
        },
        parent,
      );
    }
    for (const [index, cidr] of args.dnsResolverCidrs.entries()) {
      for (const protocol of ["tcp", "udp"] as const) {
        new aws.vpc.SecurityGroupEgressRule(
          `${name}-issuer-dns-${protocol}-${index}`,
          {
            securityGroupId: securityGroup.id,
            cidrIpv4: cidr,
            ipProtocol: protocol,
            fromPort: 53,
            toPort: 53,
            description: `issuer exact Route 53 Resolver ${protocol.toUpperCase()}`,
          },
          parent,
        );
      }
    }

    new k8s.networking.v1.NetworkPolicy(
      `${name}-issuer-network`,
      {
        metadata: {
          name: `${name}-issuer-closed-network`,
          namespace: args.namespace,
          labels: resourceLabels,
        },
        spec: {
          podSelector: { matchLabels: resourceLabels },
          policyTypes: ["Ingress", "Egress"],
          ingress: [
            {
              from: [
                {
                  namespaceSelector: {
                    matchLabels: { "kubernetes.io/metadata.name": args.caller.namespace },
                  },
                  podSelector: { matchLabels: { ...args.caller.podSelector } },
                },
              ],
              ports: [{ protocol: "TCP", port: args.workload.port }],
            },
          ],
          egress: [
            {
              to: args.endpointCidrs.map((cidr) => ({ ipBlock: { cidr } })),
              ports: [{ protocol: "TCP", port: 443 }],
            },
            {
              to: [
                {
                  namespaceSelector: {
                    matchLabels: {
                      "kubernetes.io/metadata.name": args.clusterDns.namespace,
                    },
                  },
                  podSelector: { matchLabels: { ...args.clusterDns.podSelector } },
                },
              ],
              ports: [
                { protocol: "UDP", port: 53 },
                { protocol: "TCP", port: 53 },
              ],
            },
            {
              to: args.dnsResolverCidrs.map((cidr) => ({ ipBlock: { cidr } })),
              ports: [
                { protocol: "UDP", port: 53 },
                { protocol: "TCP", port: 53 },
              ],
            },
          ],
        },
      },
      parent,
    );

    const environment: k8s.types.input.core.v1.EnvVar[] = [
      { name: "AWS_REGION", value: args.awsRegion },
      { name: "AWS_DEFAULT_REGION", value: args.awsRegion },
      { name: "AWS_STS_REGIONAL_ENDPOINTS", value: "regional" },
      { name: "AWS_ROLE_ARN", value: role.arn },
      { name: "AWS_WEB_IDENTITY_TOKEN_FILE", value: WEB_IDENTITY_TOKEN_PATH },
      { name: "GPIL_BOUNDARY_MODE", value: "issuer" },
      { name: "GPIL_BIND_ADDR", value: `0.0.0.0:${args.workload.port}` },
      { name: "GPIL_TLS_MODE", value: "native" },
      { name: "GPIL_DEPENDENCY_DEADLINE_MS", value: String(args.dependencyDeadlineMs) },
      { name: "CAPABILITY_ISSUER", value: validated.capabilityIssuer },
      { name: "CAPABILITY_AUDIENCE", value: args.capability.audience },
      { name: "CAPABILITY_MAX_TTL_SECONDS", value: String(args.capability.maxTtlSeconds) },
      { name: "CAPABILITY_SIGNING_KEY_ARN", value: signingKeyArn },
      {
        name: "CAPABILITY_AUTHORITY_REGISTRY_TABLE",
        value: crossValidatedAuthorityTableName,
      },
      { name: "WORKLOAD_JWT_ISSUER", value: validated.workloadIssuer },
      { name: "WORKLOAD_JWT_AUDIENCE", value: args.workloadIdentity.audience },
      { name: "WORKLOAD_JWKS_JSON", value: validated.workloadJwksJson },
      { name: "TLS_IDENTITY_SECRET_ARN", value: tlsIdentitySecretArn },
      { name: "AWS_ENDPOINT_URL_DYNAMODB", value: validated.dynamodbEndpointUrl },
    ];
    const container: k8s.types.input.core.v1.Container = {
      name: "issuer",
      image: args.workload.image,
      imagePullPolicy: "IfNotPresent",
      command: [...args.workload.command],
      ...(args.workload.args !== undefined ? { args: [...args.workload.args] } : {}),
      env: environment,
      ports: [{ name: "https", containerPort: args.workload.port, protocol: "TCP" }],
      securityContext: {
        allowPrivilegeEscalation: false,
        readOnlyRootFilesystem: true,
        runAsNonRoot: true,
        capabilities: { drop: ["ALL"] },
        seccompProfile: { type: "RuntimeDefault" },
      },
      resources: {
        requests: { cpu: "100m", memory: "128Mi" },
        limits: { cpu: "1", memory: "512Mi" },
      },
      volumeMounts: [
        {
          name: WEB_IDENTITY_VOLUME_NAME,
          mountPath: WEB_IDENTITY_TOKEN_DIR,
          readOnly: true,
        },
        { name: "tmp", mountPath: "/tmp" },
      ],
    };
    const podSpec: k8s.types.input.core.v1.PodSpec = {
      serviceAccountName: args.identity.serviceAccountName,
      automountServiceAccountToken: false,
      enableServiceLinks: false,
      restartPolicy: "Always",
      runtimeClassName: args.placement.runtimeClassName,
      nodeSelector: { [args.placement.nodePool.key]: args.placement.nodePool.value },
      affinity: {
        nodeAffinity: {
          requiredDuringSchedulingIgnoredDuringExecution: {
            nodeSelectorTerms: [
              {
                matchExpressions: [
                  {
                    key: args.placement.nodePool.key,
                    operator: "In",
                    values: [args.placement.nodePool.value],
                  },
                ],
              },
            ],
          },
        },
      },
      tolerations: [
        {
          key: args.placement.toleration.key,
          operator: "Equal",
          value: args.placement.toleration.value,
          effect: args.placement.toleration.effect,
        },
      ],
      schedulerName: args.placement.schedulerName,
      priorityClassName: args.placement.priorityClassName,
      securityContext: {
        runAsNonRoot: true,
        seccompProfile: { type: "RuntimeDefault" },
      },
      containers: [container],
      volumes: [
        {
          name: WEB_IDENTITY_VOLUME_NAME,
          projected: {
            defaultMode: 0o444,
            sources: [
              {
                serviceAccountToken: {
                  audience: DEFAULT_OIDC_AUDIENCE,
                  expirationSeconds: 900,
                  path: "token",
                },
              },
            ],
          },
        },
        { name: "tmp", emptyDir: { sizeLimit: "64Mi" } },
      ],
    };
    const environmentValues = environment.map((entry) => {
      if (typeof entry.name !== "string" || entry.value === undefined) {
        throw new Error(
          "WorkloadCapabilityIssuerBoundary: protected environment must use exact literal names and explicit values",
        );
      }
      return { name: entry.name, value: entry.value };
    });
    const exactEnvironment = pulumi
      .all(environmentValues.map((entry) => entry.value as pulumi.Input<string>))
      .apply(
        (values) =>
          `has(object.spec.containers[0].env) && object.spec.containers[0].env.size() == ${environmentValues.length} && ${environmentValues
            .map(
              (entry, index) =>
                `object.spec.containers[0].env[${index}].name == ${JSON.stringify(entry.name)} && has(object.spec.containers[0].env[${index}].value) && object.spec.containers[0].env[${index}].value == ${JSON.stringify(values[index])} && !has(object.spec.containers[0].env[${index}].valueFrom)`,
            )
            .join(" && ")}`,
      );
    const expectedArgs =
      args.workload.args === undefined
        ? "(!has(c.args) || c.args.size() == 0)"
        : `(has(c.args) && c.args == ${celStringList(args.workload.args)})`;
    const placement = args.placement;
    const nodeKey = JSON.stringify(placement.nodePool.key);
    const nodeValue = JSON.stringify(placement.nodePool.value);
    const configuredToleration = `t.key == ${JSON.stringify(
      placement.toleration.key,
    )} && t.operator == "Equal" && has(t.value) && t.value == ${JSON.stringify(
      placement.toleration.value,
    )} && t.effect == "NoSchedule" && !has(t.tolerationSeconds)`;
    const kubernetesDefaultToleration = (key: string): string =>
      `t.key == ${JSON.stringify(
        key,
      )} && t.operator == "Exists" && !has(t.value) && t.effect == "NoExecute" && has(t.tolerationSeconds) && t.tolerationSeconds == 300`;
    const notReadyToleration = kubernetesDefaultToleration("node.kubernetes.io/not-ready");
    const unreachableToleration = kubernetesDefaultToleration("node.kubernetes.io/unreachable");
    const exactTolerations = `has(object.spec.tolerations) && (object.spec.tolerations.size() == 1 || object.spec.tolerations.size() == 3) && object.spec.tolerations.exists(t, ${configuredToleration}) && (object.spec.tolerations.size() == 1 || (object.spec.tolerations.exists(t, ${notReadyToleration}) && object.spec.tolerations.exists(t, ${unreachableToleration}))) && object.spec.tolerations.all(t, (${configuredToleration}) || (${notReadyToleration}) || (${unreachableToleration}))`;
    const exactPlacement = `has(object.spec.runtimeClassName) && object.spec.runtimeClassName == ${JSON.stringify(
      placement.runtimeClassName,
    )} && has(object.spec.nodeSelector) && object.spec.nodeSelector.size() == 1 && object.spec.nodeSelector[${nodeKey}] == ${nodeValue} && has(object.spec.affinity) && has(object.spec.affinity.nodeAffinity) && has(object.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution) && object.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms.size() == 1 && object.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[0].matchExpressions.size() == 1 && object.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[0].matchExpressions[0].key == ${nodeKey} && object.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[0].matchExpressions[0].operator == "In" && object.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[0].matchExpressions[0].values == [${nodeValue}] && ${exactTolerations} && object.spec.schedulerName == ${JSON.stringify(
      placement.schedulerName,
    )} && object.spec.priorityClassName == ${JSON.stringify(placement.priorityClassName)}`;
    const labelPath = "object.metadata.labels";
    const protectedPod = `(object.spec.serviceAccountName == ${JSON.stringify(
      args.identity.serviceAccountName,
    )} || (has(${labelPath}) && "hulumi.dev/component" in ${labelPath} && ${labelPath}["hulumi.dev/component"] == "WorkloadCapabilityIssuerBoundary" && "hulumi.dev/boundary" in ${labelPath} && ${labelPath}["hulumi.dev/boundary"] == ${JSON.stringify(
      name,
    )}))`;
    const exactEnvelope = exactEnvironment.apply(
      (environmentExpression) =>
        `object.spec.serviceAccountName == ${JSON.stringify(
          args.identity.serviceAccountName,
        )} && has(${labelPath}) && ${labelPath}["hulumi.dev/component"] == "WorkloadCapabilityIssuerBoundary" && ${labelPath}["hulumi.dev/boundary"] == ${JSON.stringify(
          name,
        )} && ${labelPath}["hulumi.dev/identity-kind"] == "issuer" && ${labelPath}["app.kubernetes.io/name"] == ${JSON.stringify(
          name,
        )} && ${labelPath}["app.kubernetes.io/part-of"] == ${JSON.stringify(
          name,
        )} && object.spec.containers.size() == 1 && object.spec.containers[0].name == "issuer" && object.spec.containers[0].image == ${JSON.stringify(
          args.workload.image,
        )} && object.spec.containers[0].imagePullPolicy == "IfNotPresent" && object.spec.containers[0].command == ${celStringList(
          args.workload.command,
        )} && ${expectedArgs.replaceAll("c.", "object.spec.containers[0].")} && object.spec.containers[0].ports.size() == 1 && object.spec.containers[0].ports[0].name == "https" && object.spec.containers[0].ports[0].containerPort == ${args.workload.port} && object.spec.containers[0].ports[0].protocol == "TCP" && ${environmentExpression} && has(object.spec.containers[0].volumeMounts) && object.spec.containers[0].volumeMounts.size() == 2 && object.spec.containers[0].volumeMounts.exists(m, m.name == "aws-iam-token" && m.mountPath == ${JSON.stringify(
          WEB_IDENTITY_TOKEN_DIR,
        )} && (!has(m.subPath) || m.subPath == "") && m.readOnly == true) && object.spec.containers[0].volumeMounts.exists(m, m.name == "tmp" && m.mountPath == "/tmp" && (!has(m.subPath) || m.subPath == "") && (!has(m.readOnly) || m.readOnly == false)) && (!has(object.spec.containers[0].lifecycle)) && (!has(object.spec.containers[0].livenessProbe)) && (!has(object.spec.containers[0].readinessProbe)) && (!has(object.spec.containers[0].startupProbe)) && has(object.spec.containers[0].resources) && object.spec.containers[0].resources.requests.cpu == "100m" && object.spec.containers[0].resources.requests.memory == "128Mi" && object.spec.containers[0].resources.limits.cpu == "1" && object.spec.containers[0].resources.limits.memory == "512Mi" && ${exactPlacement}`,
    );
    const admissionPolicyName = `${name}-closed-workload-envelope`;
    const admissionPolicy = new k8s.admissionregistration.v1.ValidatingAdmissionPolicy(
      `${name}-issuer-workload-envelope`,
      {
        metadata: {
          name: admissionPolicyName,
          labels: resourceLabels,
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
          validations: [
            {
              expression: exactEnvelope.apply((envelope) => `!${protectedPod} || (${envelope})`),
              message:
                "Protected issuer labels and ServiceAccount require the exact one-container workload envelope.",
              reason: "Forbidden",
            },
            {
              expression: `!${protectedPod} || ((!has(object.spec.hostNetwork) || object.spec.hostNetwork == false) && (!has(object.spec.hostPID) || object.spec.hostPID == false) && (!has(object.spec.hostIPC) || object.spec.hostIPC == false) && (!has(object.spec.shareProcessNamespace) || object.spec.shareProcessNamespace == false) && (!has(object.spec.hostAliases) || object.spec.hostAliases.size() == 0) && (!has(object.spec.dnsConfig)) && (!has(object.spec.dnsPolicy) || object.spec.dnsPolicy == "ClusterFirst") && (!has(object.spec.initContainers) || object.spec.initContainers.size() == 0) && (!has(object.spec.ephemeralContainers) || object.spec.ephemeralContainers.size() == 0) && object.spec.automountServiceAccountToken == false && object.spec.enableServiceLinks == false && has(object.spec.securityContext) && object.spec.securityContext.runAsNonRoot == true && object.spec.securityContext.seccompProfile.type == "RuntimeDefault" && object.spec.containers.all(c, has(c.securityContext) && (!has(c.securityContext.privileged) || c.securityContext.privileged == false) && c.securityContext.runAsNonRoot == true && c.securityContext.allowPrivilegeEscalation == false && c.securityContext.readOnlyRootFilesystem == true && (!has(c.securityContext.procMount) || c.securityContext.procMount == "Default") && c.securityContext.seccompProfile.type == "RuntimeDefault" && c.securityContext.capabilities.drop.size() == 1 && c.securityContext.capabilities.drop[0] == "ALL" && (!has(c.securityContext.capabilities.add) || c.securityContext.capabilities.add.size() == 0) && (!has(c.envFrom) || c.envFrom.size() == 0) && c.env.all(e, !has(e.valueFrom) && (!has(e.valueFrom) || !has(e.valueFrom.secretKeyRef)))))`,
              message:
                "Protected issuer Pods require restricted security controls with no sidecars, init containers, probes, lifecycle hooks, or environment indirection.",
              reason: "Forbidden",
            },
            {
              expression: `!${protectedPod} || (object.spec.volumes.size() == 2 && object.spec.volumes.all(v, !has(v.secret) && (!has(v.projected) || v.projected.sources.all(s, !has(s.secret)))) && object.spec.volumes.exists(v, v.name == "aws-iam-token" && has(v.projected) && v.projected.defaultMode == 292 && v.projected.sources.size() == 1 && has(v.projected.sources[0].serviceAccountToken) && v.projected.sources[0].serviceAccountToken.audience == "sts.amazonaws.com" && v.projected.sources[0].serviceAccountToken.expirationSeconds == 900 && v.projected.sources[0].serviceAccountToken.path == "token") && object.spec.volumes.exists(v, v.name == "tmp" && has(v.emptyDir) && v.emptyDir.sizeLimit == "64Mi"))`,
              message:
                "Protected issuer Pods may use only the exact projected identity token and bounded emptyDir; Kubernetes Secret sources are forbidden.",
              reason: "Forbidden",
            },
          ],
        },
      },
      parent,
    );
    const admissionBinding = new k8s.admissionregistration.v1.ValidatingAdmissionPolicyBinding(
      `${name}-issuer-workload-envelope-binding`,
      {
        metadata: {
          name: `${admissionPolicyName}-binding`,
          labels: resourceLabels,
        },
        spec: {
          policyName: admissionPolicyName,
          validationActions: ["Deny"],
          matchResources: {
            namespaceSelector: {
              matchLabels: { "kubernetes.io/metadata.name": args.namespace },
            },
          },
        },
      },
      { parent: this, dependsOn: [admissionPolicy] },
    );

    new k8s.core.v1.ServiceAccount(
      `${name}-issuer-sa`,
      {
        metadata: {
          name: args.identity.serviceAccountName,
          namespace: args.namespace,
          labels: resourceLabels,
          annotations: {
            "eks.amazonaws.com/role-arn": role.arn,
            "eks.amazonaws.com/sts-regional-endpoints": "true",
          },
        },
        automountServiceAccountToken: false,
      },
      { parent: this, dependsOn: [admissionBinding] },
    );
    new k8s.apps.v1.Deployment(
      `${name}-issuer`,
      {
        metadata: { name, namespace: args.namespace, labels: resourceLabels },
        spec: {
          replicas: 0,
          selector: { matchLabels: resourceLabels },
          template: {
            metadata: { labels: podTemplateLabels(resourceLabels) },
            spec: podSpec,
          },
        },
      },
      { parent: this, dependsOn: [admissionBinding] },
    );
    const service = new k8s.core.v1.Service(
      `${name}-issuer-service`,
      {
        metadata: {
          name: args.serviceName,
          namespace: args.namespace,
          labels: resourceLabels,
        },
        spec: {
          type: "ClusterIP",
          selector: resourceLabels,
          ports: [
            {
              name: "https",
              port: args.workload.port,
              targetPort: args.workload.port,
              protocol: "TCP",
            },
          ],
        },
      },
      parent,
    );

    this.roleArn = role.arn;
    this.serviceAccountName = pulumi.output(args.identity.serviceAccountName);
    this.securityGroupId = securityGroup.id;
    this.serviceName = service.metadata.name;
    this.identityReceipt = pulumi
      .all([role.arn, securityGroup.id, service.metadata.name, crossValidatedAuthorityTableName])
      .apply(
        ([roleArn, securityGroupId, serviceName, authorityTableName]) =>
          ({
            boundary: name,
            namespace: args.namespace,
            serviceAccountName: args.identity.serviceAccountName,
            roleArn,
            securityGroupId,
            serviceName,
            authorityTableName,
            capability: {
              issuer: validated.capabilityIssuer,
              audience: args.capability.audience,
              maxTtlSeconds: args.capability.maxTtlSeconds,
            },
            limits: [...INFRASTRUCTURE_LIMITS],
          }) satisfies WorkloadCapabilityIssuerIdentityReceipt,
      );
    this.registerOutputs({
      policyContract: this.policyContract,
      roleArn: this.roleArn,
      serviceAccountName: this.serviceAccountName,
      securityGroupId: this.securityGroupId,
      serviceName: this.serviceName,
      identityReceipt: this.identityReceipt,
    });
  }
}
