import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";
import { aws as hulumiAws } from "@hulumi/baseline";
import { Buffer } from "node:buffer";
import { URL } from "node:url";

import { assertValidTier } from "./tier";
import type {
  BrokeredAuroraPostgresBoundaryArgs,
  BrokeredPostgresIdentityArgs,
  BrokeredPostgresIdentityKind,
  BrokeredPostgresPlacementProfileArgs,
  BrokeredPostgresRolloutPhase,
  BrokeredPostgresWorkloadArgs,
} from "./brokered-aurora-postgres-boundary.args";
import type {
  BrokeredAuroraPostgresBoundaryOutputs,
  BrokeredPostgresIdentityReceipt,
  BrokeredPostgresRotationPosture,
} from "./brokered-aurora-postgres-boundary.outputs";

export const BROKERED_AURORA_POSTGRES_BOUNDARY_COMPONENT_TYPE =
  "hulumi:platform:BrokeredAuroraPostgresBoundary";

const IDENTITY_KINDS: readonly BrokeredPostgresIdentityKind[] = [
  "runtime",
  "broker",
  "migrator",
  "rotation",
];
const DEFAULT_OIDC_AUDIENCE = "sts.amazonaws.com";
const WEB_IDENTITY_VOLUME_NAME = "aws-iam-token";
const WEB_IDENTITY_TOKEN_DIR = "/var/run/secrets/eks.amazonaws.com/serviceaccount";
const WEB_IDENTITY_TOKEN_PATH = `${WEB_IDENTITY_TOKEN_DIR}/token`;
const IMMUTABLE_IMAGE = /@sha256:[a-f0-9]{64}$/iu;
const CIDR = /^(?:\d{1,3}\.){3}\d{1,3}\/(?:[0-9]|[12][0-9]|3[0-2])$/u;
const KUBERNETES_DNS_LABEL = /^[a-z0-9](?:[-a-z0-9]{0,61}[a-z0-9])?$/u;
const IAM_ROLE_NAME = /^[A-Za-z0-9+=,.@_-]{1,64}$/u;
const BASE64URL = /^[A-Za-z0-9_-]+$/u;
const MAX_JWKS_KEYS = 8;
const MAX_JWKS_BYTES = 16 * 1024;
const BROAD_CIDRS = new Set(["0.0.0.0/0", "::/0"]);
const SECURITY_GROUP_ID = /^sg-[A-Za-z0-9-]+$/u;
const SHA256_DIGEST = /^sha256:([a-f0-9]{64})$/u;
const IMMUTABLE_EVIDENCE_REF = /^oci:\/\/[^\s]+@sha256:([a-f0-9]{64})$/u;
const NODE_RESTRICTION_LABEL =
  /^(?:node-restriction\.kubernetes\.io|[a-z0-9.-]+\.node-restriction\.kubernetes\.io)\/[A-Za-z0-9_.-]+$/u;
const PRIVATE_JWK_FIELDS = ["d", "p", "q", "dp", "dq", "qi", "oth", "k"] as const;
const ROLLOUT_PHASES: readonly BrokeredPostgresRolloutPhase[] = [
  "infrastructure",
  "migrator",
  "broker",
  "runtime",
  "rotation",
];
const INFRASTRUCTURE_LIMITS = [
  "IaC only: the consumer supplies the broker, migrator, and rotation executables.",
  "Does not implement PostgreSQL role/bootstrap/rotation logic or authority scans.",
  "Pulumi mocks and policy previews are not live-cloud or actual-login evidence.",
  "IRSA is rendered; EKS Pod Identity associations require a separate reviewed adapter.",
  "External content-addressed rollout evidence is recorded but never activates workloads.",
] as const;

function requireExact(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`BrokeredAuroraPostgresBoundary: ${label} must be non-empty`);
  }
  if (trimmed.includes("*")) {
    throw new Error(`BrokeredAuroraPostgresBoundary: ${label} must not contain a wildcard`);
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
      "BrokeredAuroraPostgresBoundary: oidcProviderArn must be an exact IAM OIDC-provider ARN",
    );
  }
  return { partition: match[1], account: match[2] };
}

function validatedResourceArn(
  input: pulumi.Input<string>,
  label: string,
  context: AwsArnContext,
  awsRegion: string,
  service: "kms" | "secretsmanager",
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
        `BrokeredAuroraPostgresBoundary: ${label} must be an exact ${service} ARN in the boundary partition, region, and account`,
      );
    }
    return exact;
  };
  if (typeof input === "string") validate(input);
  return pulumi.output(input).apply(validate);
}

function requireHttpsUrl(value: string, label: string): string {
  requireExact(value, label);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`BrokeredAuroraPostgresBoundary: ${label} must be an exact HTTPS URL`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.hash !== ""
  ) {
    throw new Error(`BrokeredAuroraPostgresBoundary: ${label} must be an exact HTTPS URL`);
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
      `BrokeredAuroraPostgresBoundary: capability.jwksJson ${label}.${field} must be non-empty base64url`,
    );
  }
  return value;
}

function canonicalPublicJwks(value: string): string {
  if (Buffer.byteLength(value, "utf8") > MAX_JWKS_BYTES) {
    throw new Error("BrokeredAuroraPostgresBoundary: capability.jwksJson must not exceed 16 KiB");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("BrokeredAuroraPostgresBoundary: capability.jwksJson must be valid JSON");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("BrokeredAuroraPostgresBoundary: capability.jwksJson must be a JWKS object");
  }
  const keys = (parsed as Record<string, unknown>).keys;
  if (!Array.isArray(keys) || keys.length === 0) {
    throw new Error(
      "BrokeredAuroraPostgresBoundary: capability.jwksJson must contain at least one public key",
    );
  }
  if (keys.length > MAX_JWKS_KEYS) {
    throw new Error(
      "BrokeredAuroraPostgresBoundary: capability.jwksJson must contain at most 8 public keys",
    );
  }

  const kids = new Set<string>();
  const publicKeys = keys.map((entry, index): Record<string, string> => {
    const label = `keys[${index}]`;
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(
        `BrokeredAuroraPostgresBoundary: capability.jwksJson ${label} must be an object`,
      );
    }
    const key = entry as Record<string, unknown>;
    if (PRIVATE_JWK_FIELDS.some((field) => key[field] !== undefined)) {
      throw new Error(
        `BrokeredAuroraPostgresBoundary: capability.jwksJson ${label} contains private or symmetric key material`,
      );
    }
    const kid =
      typeof key.kid === "string" && key.kid.trim() !== "" && !key.kid.includes("*")
        ? key.kid
        : undefined;
    if (kid === undefined || kids.has(kid)) {
      throw new Error(
        `BrokeredAuroraPostgresBoundary: capability.jwksJson ${label}.kid must be exact and unique`,
      );
    }
    kids.add(kid);
    if (key.use !== "sig") {
      throw new Error(
        `BrokeredAuroraPostgresBoundary: capability.jwksJson ${label}.use must be sig`,
      );
    }

    if (key.kty === "RSA" && key.alg === "RS256") {
      const modulus = requireJwkString(key, "n", label);
      const exponent = requireJwkString(key, "e", label);
      if (Buffer.from(modulus, "base64url").byteLength < 256 || exponent !== "AQAB") {
        throw new Error(
          `BrokeredAuroraPostgresBoundary: capability.jwksJson ${label} must use an RSA modulus of at least 2048 bits and exponent 65537`,
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
    }
    if (key.kty === "EC" && key.alg === "ES256" && key.crv === "P-256") {
      const x = requireJwkString(key, "x", label);
      const y = requireJwkString(key, "y", label);
      if (
        Buffer.from(x, "base64url").byteLength !== 32 ||
        Buffer.from(y, "base64url").byteLength !== 32
      ) {
        throw new Error(
          `BrokeredAuroraPostgresBoundary: capability.jwksJson ${label} P-256 coordinates must be 32 bytes`,
        );
      }
      return {
        kty: "EC",
        kid,
        use: "sig",
        alg: "ES256",
        crv: "P-256",
        x,
        y,
      };
    }
    if (key.kty === "OKP" && key.alg === "EdDSA" && key.crv === "Ed25519") {
      const x = requireJwkString(key, "x", label);
      if (Buffer.from(x, "base64url").byteLength !== 32) {
        throw new Error(
          `BrokeredAuroraPostgresBoundary: capability.jwksJson ${label} Ed25519 public key must be 32 bytes`,
        );
      }
      return {
        kty: "OKP",
        kid,
        use: "sig",
        alg: "EdDSA",
        crv: "Ed25519",
        x,
      };
    }
    throw new Error(
      `BrokeredAuroraPostgresBoundary: capability.jwksJson ${label} must be RSA/RS256, P-256/ES256, or Ed25519/EdDSA`,
    );
  });

  const canonical = JSON.stringify({ keys: publicKeys });
  if (Buffer.byteLength(canonical, "utf8") > MAX_JWKS_BYTES) {
    throw new Error(
      "BrokeredAuroraPostgresBoundary: canonical capability.jwksJson must not exceed 16 KiB",
    );
  }
  return canonical;
}

function validateCidr(value: string, label: string, requiredPrefix?: number): void {
  if (BROAD_CIDRS.has(value)) {
    throw new Error(`BrokeredAuroraPostgresBoundary: broad CIDR ${value} is forbidden in ${label}`);
  }
  if (!CIDR.test(value)) {
    throw new Error(
      `BrokeredAuroraPostgresBoundary: ${label} must contain exact IPv4 CIDRs; got ${value}`,
    );
  }
  const [address] = value.split("/");
  if (address.split(".").some((octet) => Number(octet) > 255)) {
    throw new Error(`BrokeredAuroraPostgresBoundary: invalid IPv4 CIDR ${value} in ${label}`);
  }
  const [first, second] = address.split(".").map(Number);
  const isPrivate =
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168);
  if (!isPrivate) {
    throw new Error(
      `BrokeredAuroraPostgresBoundary: ${label} must contain private IPv4 CIDRs; got ${value}`,
    );
  }
  if (requiredPrefix !== undefined && !value.endsWith(`/${requiredPrefix}`)) {
    throw new Error(
      `BrokeredAuroraPostgresBoundary: ${label} must contain exact IPv4 /${requiredPrefix} entries; got ${value}`,
    );
  }
}

function validatePlacementProfile(
  profile: BrokeredPostgresPlacementProfileArgs,
  label: string,
): void {
  requireExact(profile.runtimeClassName, `${label}.runtimeClassName`);
  const nodePoolKey = requireExact(profile.nodePool.key, `${label}.nodePool.key`);
  requireExact(profile.nodePool.value, `${label}.nodePool.value`);
  if (!NODE_RESTRICTION_LABEL.test(nodePoolKey)) {
    throw new Error(
      `BrokeredAuroraPostgresBoundary: ${label}.nodePool.key must use the NodeRestriction protected-label prefix`,
    );
  }
  requireExact(profile.toleration.key, `${label}.toleration.key`);
  requireExact(profile.toleration.value, `${label}.toleration.value`);
  if (profile.toleration.effect !== "NoSchedule") {
    throw new Error(
      `BrokeredAuroraPostgresBoundary: ${label}.toleration.effect must be NoSchedule`,
    );
  }
  requireExact(profile.schedulerName, `${label}.schedulerName`);
  requireExact(profile.priorityClassName, `${label}.priorityClassName`);
}

function validateWorkload(
  kind: BrokeredPostgresIdentityKind,
  workload: BrokeredPostgresWorkloadArgs,
) {
  if (!IMMUTABLE_IMAGE.test(workload.image)) {
    throw new Error(
      `BrokeredAuroraPostgresBoundary: ${kind} image must use an immutable @sha256 digest`,
    );
  }
  if (workload.command.length === 0 || workload.command.some((entry) => entry.trim() === "")) {
    throw new Error(
      `BrokeredAuroraPostgresBoundary: ${kind} command must contain exact non-empty argv entries`,
    );
  }
}

function validateIdentity(
  kind: BrokeredPostgresIdentityKind,
  identity: BrokeredPostgresIdentityArgs,
) {
  requireExact(identity.serviceAccountName, `${kind} serviceAccountName`);
  requireExact(identity.roleName, `${kind} roleName`);
  if (!KUBERNETES_DNS_LABEL.test(identity.serviceAccountName)) {
    throw new Error(
      `BrokeredAuroraPostgresBoundary: ${kind} serviceAccountName must be a Kubernetes DNS label`,
    );
  }
  if (!IAM_ROLE_NAME.test(identity.roleName)) {
    throw new Error(
      `BrokeredAuroraPostgresBoundary: ${kind} roleName must be an exact AWS IAM role name`,
    );
  }
}

interface ValidatedBoundaryArgs {
  readonly arnContext: AwsArnContext;
  readonly capabilityJwksJson: string;
  readonly dynamodbEndpointUrl: string;
}

function validateArgs(args: BrokeredAuroraPostgresBoundaryArgs): ValidatedBoundaryArgs {
  assertValidTier(args.tier);
  if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/u.test(args.awsRegion)) {
    throw new Error("BrokeredAuroraPostgresBoundary: awsRegion must be an exact AWS region");
  }
  requireExact(args.namespace, "namespace");
  if (!KUBERNETES_DNS_LABEL.test(args.namespace)) {
    throw new Error("BrokeredAuroraPostgresBoundary: namespace must be a Kubernetes DNS label");
  }
  const arnContext = parseOidcProviderArn(args.oidcProviderArn);
  requireHttpsUrl(args.oidcIssuer, "oidcIssuer");
  const audience = requireExact(args.oidcAudience ?? DEFAULT_OIDC_AUDIENCE, "oidcAudience");
  if (audience !== DEFAULT_OIDC_AUDIENCE) {
    throw new Error(
      `BrokeredAuroraPostgresBoundary: IRSA oidcAudience must be ${DEFAULT_OIDC_AUDIENCE}`,
    );
  }
  if (args.tags?.["hulumi:iac-role"] !== undefined) {
    throw new Error(
      "BrokeredAuroraPostgresBoundary: workload identities must not carry hulumi:iac-role",
    );
  }
  if (args.tier === "startup-hardened" && args.permissionBoundaryArn === undefined) {
    throw new Error(
      "BrokeredAuroraPostgresBoundary: startup-hardened requires permissionBoundaryArn",
    );
  }
  if (
    !Number.isInteger(args.database.port) ||
    args.database.port < 1 ||
    args.database.port > 65535
  ) {
    throw new Error("BrokeredAuroraPostgresBoundary: database.port must be 1..65535");
  }
  for (const [label, cidrs] of [
    ["database.cidrs", args.database.cidrs],
    ["dnsResolverCidrs", args.dnsResolverCidrs],
    ["endpointCidrs", args.endpointCidrs],
  ] as const) {
    if (cidrs.length === 0) {
      throw new Error(`BrokeredAuroraPostgresBoundary: ${label} must be non-empty`);
    }
    cidrs.forEach((cidr) =>
      validateCidr(cidr, label, label === "dnsResolverCidrs" ? 32 : undefined),
    );
  }
  const dynamodbEndpointUrl = requireHttpsUrl(args.dynamodbEndpointUrl, "dynamodbEndpointUrl");
  const dynamodbEndpoint = new URL(dynamodbEndpointUrl);
  const dynamodbVpcEndpointId = requireExact(args.dynamodbVpcEndpointId, "dynamodbVpcEndpointId");
  if (
    !/^vpce-[0-9a-f]{8,}$/u.test(dynamodbVpcEndpointId) ||
    !dynamodbEndpoint.hostname.startsWith("vpce-") ||
    (!dynamodbEndpoint.hostname.startsWith(`${dynamodbVpcEndpointId}.`) &&
      !dynamodbEndpoint.hostname.startsWith(`${dynamodbVpcEndpointId}-`)) ||
    !dynamodbEndpoint.hostname.endsWith(`.dynamodb.${args.awsRegion}.vpce.amazonaws.com`) ||
    dynamodbEndpoint.pathname !== "/" ||
    dynamodbEndpoint.search !== "" ||
    dynamodbEndpoint.port !== ""
  ) {
    throw new Error(
      "BrokeredAuroraPostgresBoundary: dynamodbEndpointUrl must be the exact regional DynamoDB interface endpoint HTTPS URL",
    );
  }
  if (args.applicationSecretNames[0] === args.applicationSecretNames[1]) {
    throw new Error(
      "BrokeredAuroraPostgresBoundary: alternating application secret names must be distinct",
    );
  }
  args.applicationSecretNames.forEach((name, index) =>
    requireExact(name, `applicationSecretNames[${index}]`),
  );
  requireHttpsUrl(args.capability.issuer, "capability.issuer");
  requireExact(args.capability.audience, "capability.audience");
  const capabilityJwksJson = canonicalPublicJwks(args.capability.jwksJson);
  if (
    !Number.isInteger(args.capability.maxTtlSeconds) ||
    args.capability.maxTtlSeconds < 1 ||
    args.capability.maxTtlSeconds > 300
  ) {
    throw new Error(
      "BrokeredAuroraPostgresBoundary: capability.maxTtlSeconds must be an integer from 1 to 300",
    );
  }
  for (const kind of IDENTITY_KINDS) {
    validateIdentity(kind, args.identities[kind]);
    validateWorkload(kind, args.workloads[kind]);
  }
  const serviceAccounts = IDENTITY_KINDS.map((kind) => args.identities[kind].serviceAccountName);
  const roleNames = IDENTITY_KINDS.map((kind) => args.identities[kind].roleName);
  if (new Set(serviceAccounts).size !== serviceAccounts.length) {
    throw new Error(
      "BrokeredAuroraPostgresBoundary: all four ServiceAccount names must be distinct",
    );
  }
  if (new Set(roleNames).size !== roleNames.length) {
    throw new Error("BrokeredAuroraPostgresBoundary: all four IAM role names must be distinct");
  }
  for (const [label, port] of [
    ["runtime port", args.workloads.runtime.port],
    ["broker port", args.workloads.broker.port],
  ] as const) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`BrokeredAuroraPostgresBoundary: ${label} must be 1..65535`);
    }
  }
  if (args.workloads.rotation.schedule.trim().split(/\s+/u).length !== 5) {
    throw new Error(
      "BrokeredAuroraPostgresBoundary: rotation schedule must be an exact five-field CronJob schedule",
    );
  }
  validatePlacementProfile(args.placement.runtime, "placement.runtime");
  validatePlacementProfile(args.placement.privileged, "placement.privileged");
  if (
    args.placement.runtime.nodePool.key !== args.placement.privileged.nodePool.key ||
    args.placement.runtime.nodePool.value === args.placement.privileged.nodePool.value
  ) {
    throw new Error(
      "BrokeredAuroraPostgresBoundary: runtime and privileged placement must use disjoint node pools under the same protected node label",
    );
  }
  if (
    args.placement.runtime.toleration.key === args.placement.privileged.toleration.key &&
    args.placement.runtime.toleration.value === args.placement.privileged.toleration.value &&
    args.placement.runtime.toleration.effect === args.placement.privileged.toleration.effect
  ) {
    throw new Error(
      "BrokeredAuroraPostgresBoundary: runtime and privileged placement must not share a toleration",
    );
  }
  const rolloutPhase = args.rollout?.phase ?? "infrastructure";
  if (!ROLLOUT_PHASES.includes(rolloutPhase)) {
    throw new Error("BrokeredAuroraPostgresBoundary: rollout.phase is invalid");
  }
  if (
    args.rollout !== undefined &&
    Object.prototype.hasOwnProperty.call(args.rollout, "verifiedGates")
  ) {
    throw new Error(
      "BrokeredAuroraPostgresBoundary: self-attested rollout.verifiedGates strings are not activation evidence",
    );
  }
  const evidence = args.rollout?.evidence;
  if (rolloutPhase !== "infrastructure" && evidence === undefined) {
    throw new Error(
      `BrokeredAuroraPostgresBoundary: requested rollout phase ${rolloutPhase} requires content-addressed immutable evidence metadata`,
    );
  }
  if (evidence !== undefined) {
    const refMatch = IMMUTABLE_EVIDENCE_REF.exec(evidence.immutableRef);
    const digestMatch = SHA256_DIGEST.exec(evidence.sha256);
    if (refMatch === null || digestMatch === null || refMatch[1] !== digestMatch[1]) {
      throw new Error(
        "BrokeredAuroraPostgresBoundary: rollout evidence immutableRef and sha256 must carry the same exact OCI sha256 digest",
      );
    }
  }
  if (
    (rolloutPhase === "runtime" || rolloutPhase === "rotation") &&
    args.runtimeIngress === undefined
  ) {
    throw new Error(
      `BrokeredAuroraPostgresBoundary: runtimeIngress is required for rollout phase ${rolloutPhase}`,
    );
  }
  if (args.runtimeIngress !== undefined) {
    const ingress = args.runtimeIngress;
    requireExact(ingress.serviceName, "runtimeIngress.serviceName");
    requireExact(ingress.callerNamespace, "runtimeIngress.callerNamespace");
    if (
      !KUBERNETES_DNS_LABEL.test(ingress.serviceName) ||
      !KUBERNETES_DNS_LABEL.test(ingress.callerNamespace)
    ) {
      throw new Error(
        "BrokeredAuroraPostgresBoundary: runtimeIngress serviceName and callerNamespace must be exact Kubernetes DNS labels",
      );
    }
    const selectorEntries = Object.entries(ingress.callerPodSelector);
    if (selectorEntries.length === 0) {
      throw new Error(
        "BrokeredAuroraPostgresBoundary: runtimeIngress.callerPodSelector must be non-empty",
      );
    }
    for (const [key, value] of selectorEntries) {
      requireExact(key, "runtimeIngress.callerPodSelector key");
      requireExact(value, `runtimeIngress.callerPodSelector.${key}`);
    }
    if (
      typeof ingress.callerSecurityGroupId === "string" &&
      !SECURITY_GROUP_ID.test(ingress.callerSecurityGroupId)
    ) {
      throw new Error(
        "BrokeredAuroraPostgresBoundary: runtimeIngress.callerSecurityGroupId must be an exact security-group id",
      );
    }
  }
  return { arnContext, capabilityJwksJson, dynamodbEndpointUrl };
}

function issuerConditionPrefix(issuer: string): string {
  return issuer.replace(/^https:\/\//u, "").replace(/\/$/u, "");
}

function trustPolicy(
  args: BrokeredAuroraPostgresBoundaryArgs,
  identity: BrokeredPostgresIdentityArgs,
): string {
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
            [`${prefix}:sub`]: `system:serviceaccount:${args.namespace}:${identity.serviceAccountName}`,
          },
        },
      },
    ],
  });
}

function identityTags(
  name: string,
  args: BrokeredAuroraPostgresBoundaryArgs,
  kind: BrokeredPostgresIdentityKind,
): Record<string, string> {
  return {
    ...(args.tags ?? {}),
    "hulumi:component": "BrokeredAuroraPostgresBoundary",
    "hulumi:boundary": name,
    "hulumi:tier": args.tier,
    "hulumi:identity-kind": kind,
  };
}

function allowStatements(
  secretArns: pulumi.Input<readonly string[]>,
  kmsKeyArn: pulumi.Input<string>,
  awsRegion: string,
  secretActions: readonly string[],
  currentStageOnly: boolean,
): pulumi.Output<string> {
  return pulumi.all([secretArns, kmsKeyArn]).apply(([secrets, kms]) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        ...(currentStageOnly
          ? [
              {
                Sid: "ExactCurrentSecretValueAccess",
                Effect: "Allow",
                Action: ["secretsmanager:GetSecretValue"],
                Resource: secrets,
                Condition: {
                  StringEquals: { "secretsmanager:VersionStage": "AWSCURRENT" },
                },
              },
              {
                Sid: "ExactSecretMetadataAccess",
                Effect: "Allow",
                Action: ["secretsmanager:DescribeSecret"],
                Resource: secrets,
              },
            ]
          : [
              {
                Sid: "ExactSecretAccess",
                Effect: "Allow",
                Action: secretActions,
                Resource: secrets,
              },
            ]),
        {
          Sid: "ExactCredentialKeyAccess",
          Effect: "Allow",
          Action: ["kms:Decrypt"],
          Resource: kms,
          Condition: {
            StringEquals: {
              "kms:ViaService": `secretsmanager.${awsRegion}.amazonaws.com`,
            },
            "ForAnyValue:StringEquals": {
              "kms:EncryptionContext:SecretARN": secrets,
            },
          },
        },
      ],
    }),
  );
}

function transportTlsStatements(
  identitySecretArn: pulumi.Input<string>,
  kmsKeyArn: pulumi.Input<string>,
  awsRegion: string,
): pulumi.Output<string> {
  return pulumi.all([identitySecretArn, kmsKeyArn]).apply(([secretArn, kmsArn]) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "ExactCurrentTlsIdentity",
          Effect: "Allow",
          Action: ["secretsmanager:GetSecretValue"],
          Resource: secretArn,
          Condition: {
            StringEquals: { "secretsmanager:VersionStage": "AWSCURRENT" },
          },
        },
        {
          Sid: "ExactTlsIdentityMetadata",
          Effect: "Allow",
          Action: ["secretsmanager:DescribeSecret"],
          Resource: secretArn,
        },
        {
          Sid: "ExactTlsIdentityDecrypt",
          Effect: "Allow",
          Action: ["kms:Decrypt"],
          Resource: kmsArn,
          Condition: {
            StringEquals: {
              "kms:ViaService": `secretsmanager.${awsRegion}.amazonaws.com`,
              "kms:EncryptionContext:SecretARN": secretArn,
            },
          },
        },
      ],
    }),
  );
}

function rotationStatements(
  applicationSecretArns: pulumi.Input<readonly string[]>,
  masterSecretArn: pulumi.Input<string>,
  kmsKeyArn: pulumi.Input<string>,
  awsRegion: string,
): pulumi.Output<string> {
  return pulumi
    .all([applicationSecretArns, masterSecretArn, kmsKeyArn])
    .apply(([applicationSecrets, masterSecret, kms]) => {
      const readableSecrets = [...applicationSecrets, masterSecret];
      return JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "ExactCurrentCredentialRead",
            Effect: "Allow",
            Action: ["secretsmanager:GetSecretValue"],
            Resource: readableSecrets,
            Condition: {
              StringEquals: { "secretsmanager:VersionStage": "AWSCURRENT" },
            },
          },
          {
            Sid: "ExactCredentialMetadataRead",
            Effect: "Allow",
            Action: ["secretsmanager:DescribeSecret"],
            Resource: readableSecrets,
          },
          {
            Sid: "ApplicationSlotWriteAndStageOnly",
            Effect: "Allow",
            Action: ["secretsmanager:PutSecretValue", "secretsmanager:UpdateSecretVersionStage"],
            Resource: applicationSecrets,
          },
          {
            Sid: "ExactCredentialKeyAccess",
            Effect: "Allow",
            Action: ["kms:Decrypt"],
            Resource: kms,
            Condition: {
              StringEquals: {
                "kms:ViaService": `secretsmanager.${awsRegion}.amazonaws.com`,
              },
              "ForAnyValue:StringEquals": {
                "kms:EncryptionContext:SecretARN": readableSecrets,
              },
            },
          },
          {
            Sid: "ApplicationSlotDataKeyOnly",
            Effect: "Allow",
            Action: ["kms:GenerateDataKey"],
            Resource: kms,
            Condition: {
              StringEquals: {
                "kms:ViaService": `secretsmanager.${awsRegion}.amazonaws.com`,
              },
              "ForAnyValue:StringEquals": {
                "kms:EncryptionContext:SecretARN": applicationSecrets,
              },
            },
          },
        ],
      });
    });
}

function podLabels(name: string, kind: BrokeredPostgresIdentityKind): Record<string, string> {
  return {
    "app.kubernetes.io/name": `${name}-${kind}`,
    "app.kubernetes.io/part-of": name,
    "hulumi.dev/component": "BrokeredAuroraPostgresBoundary",
    "hulumi.dev/boundary": name,
    "hulumi.dev/identity-kind": kind,
  };
}

function restrictedContainer(
  name: string,
  workload: BrokeredPostgresWorkloadArgs,
  env: k8s.types.input.core.v1.EnvVar[],
  port?: number,
): k8s.types.input.core.v1.Container {
  return {
    name,
    image: workload.image,
    imagePullPolicy: "IfNotPresent",
    command: [...workload.command],
    ...(workload.args !== undefined ? { args: [...workload.args] } : {}),
    env,
    ...(port !== undefined ? { ports: [{ name: "https", containerPort: port }] } : {}),
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
}

function podSpec(
  identity: BrokeredPostgresIdentityArgs,
  container: k8s.types.input.core.v1.Container,
  restartPolicy: "Always" | "Never",
  placement: BrokeredPostgresPlacementProfileArgs,
): k8s.types.input.core.v1.PodSpec {
  return {
    serviceAccountName: identity.serviceAccountName,
    automountServiceAccountToken: false,
    enableServiceLinks: false,
    restartPolicy,
    runtimeClassName: placement.runtimeClassName,
    nodeSelector: { [placement.nodePool.key]: placement.nodePool.value },
    affinity: {
      nodeAffinity: {
        requiredDuringSchedulingIgnoredDuringExecution: {
          nodeSelectorTerms: [
            {
              matchExpressions: [
                {
                  key: placement.nodePool.key,
                  operator: "In",
                  values: [placement.nodePool.value],
                },
              ],
            },
          ],
        },
      },
    },
    tolerations: [
      {
        key: placement.toleration.key,
        operator: "Equal",
        value: placement.toleration.value,
        effect: placement.toleration.effect,
      },
    ],
    schedulerName: placement.schedulerName,
    priorityClassName: placement.priorityClassName,
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
}

function awsIdentityEnv(
  roleArn: pulumi.Input<string>,
  awsRegion: string,
): k8s.types.input.core.v1.EnvVar[] {
  return [
    { name: "AWS_REGION", value: awsRegion },
    { name: "AWS_DEFAULT_REGION", value: awsRegion },
    { name: "AWS_STS_REGIONAL_ENDPOINTS", value: "regional" },
    { name: "AWS_ROLE_ARN", value: roleArn },
    { name: "AWS_WEB_IDENTITY_TOKEN_FILE", value: WEB_IDENTITY_TOKEN_PATH },
  ];
}

function networkPolicyPorts(
  protocol: "TCP" | "UDP",
  port: number,
): k8s.types.input.networking.v1.NetworkPolicyPort {
  return { protocol, port };
}

function celStringList(values: readonly string[]): string {
  return `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
}

export class BrokeredAuroraPostgresBoundary
  extends pulumi.ComponentResource
  implements BrokeredAuroraPostgresBoundaryOutputs
{
  public readonly policyContract: pulumi.Output<pulumi.Unwrap<BrokeredAuroraPostgresBoundaryArgs>>;
  public readonly roleArns: pulumi.Output<Record<BrokeredPostgresIdentityKind, string>>;
  public readonly serviceAccountNames: pulumi.Output<Record<BrokeredPostgresIdentityKind, string>>;
  public readonly securityGroupIds: pulumi.Output<Record<BrokeredPostgresIdentityKind, string>>;
  public readonly applicationSecretArns: pulumi.Output<readonly [string, string]>;
  public readonly replayTableArn: pulumi.Output<string>;
  public readonly replayTableName: pulumi.Output<string>;
  public readonly brokerServiceName: pulumi.Output<string>;
  public readonly runtimeServiceName: pulumi.Output<string | undefined>;
  public readonly rotationPosture: pulumi.Output<BrokeredPostgresRotationPosture>;
  public readonly migrationOrdering: pulumi.Output<readonly string[]>;
  public readonly identityReceipt: pulumi.Output<BrokeredPostgresIdentityReceipt>;

  constructor(
    name: string,
    args: BrokeredAuroraPostgresBoundaryArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    const { arnContext, capabilityJwksJson, dynamodbEndpointUrl } = validateArgs(args);
    const transportTls =
      args.transportTls === undefined
        ? undefined
        : {
            identitySecretArn: validatedResourceArn(
              args.transportTls.identitySecretArn,
              "transportTls.identitySecretArn",
              arnContext,
              args.awsRegion,
              "secretsmanager",
              /^secret:[A-Za-z0-9/_+=.@-]+$/u,
            ),
            kmsKeyArn: validatedResourceArn(
              args.transportTls.kmsKeyArn,
              "transportTls.kmsKeyArn",
              arnContext,
              args.awsRegion,
              "kms",
              /^key\/[A-Za-z0-9-]+$/u,
            ),
          };
    const policyContract = {
      ...args,
      capability: {
        ...args.capability,
        jwksJson: capabilityJwksJson,
      },
      ...(transportTls === undefined ? {} : { transportTls }),
      dynamodbEndpointUrl,
    };
    super(
      BROKERED_AURORA_POSTGRES_BOUNDARY_COMPONENT_TYPE,
      name,
      policyContract as pulumi.Inputs,
      opts,
    );

    // Preserve Pulumi's aggregate secret marking for callers. The raw
    // structure is separately registered below so one unknown/secret leaf
    // does not erase every known field from CrossGuard serialization.
    this.policyContract = pulumi.output(policyContract);
    const parent = { parent: this } as const;
    const roles = {} as Record<BrokeredPostgresIdentityKind, aws.iam.Role>;
    const securityGroups = {} as Record<BrokeredPostgresIdentityKind, aws.ec2.SecurityGroup>;

    for (const kind of IDENTITY_KINDS) {
      const identity = args.identities[kind];
      const tags = identityTags(name, args, kind);
      roles[kind] = new aws.iam.Role(
        `${name}-${kind}-role`,
        {
          name: identity.roleName,
          assumeRolePolicy: trustPolicy(args, identity),
          maxSessionDuration: 3600,
          ...(args.permissionBoundaryArn !== undefined
            ? { permissionsBoundary: args.permissionBoundaryArn }
            : {}),
          tags,
        },
        parent,
      );
      securityGroups[kind] = new aws.ec2.SecurityGroup(
        `${name}-${kind}-sg`,
        {
          namePrefix: `${name}-${kind}-`,
          description: `Hulumi ${name} ${kind} closed-boundary security group`,
          vpcId: args.vpcId,
          ingress: [],
          egress: [],
          tags,
        },
        parent,
      );

      new k8s.core.v1.ServiceAccount(
        `${name}-${kind}-sa`,
        {
          metadata: {
            name: identity.serviceAccountName,
            namespace: args.namespace,
            labels: podLabels(name, kind),
            annotations: {
              "eks.amazonaws.com/role-arn": roles[kind].arn,
              "eks.amazonaws.com/sts-regional-endpoints": "true",
            },
          },
          automountServiceAccountToken: false,
        },
        parent,
      );

      new k8s.apiextensions.CustomResource(
        `${name}-${kind}-security-group-policy`,
        {
          apiVersion: "vpcresources.k8s.aws/v1beta1",
          kind: "SecurityGroupPolicy",
          metadata: {
            name: `${name}-${kind}`,
            namespace: args.namespace,
            labels: podLabels(name, kind),
          },
          spec: {
            podSelector: { matchLabels: podLabels(name, kind) },
            securityGroups: { groupIds: [securityGroups[kind].id] },
          },
        },
        parent,
      );
    }

    const applicationSecretA = new hulumiAws.SecureSecret(
      `${name}-application-a`,
      {
        tier: args.tier,
        secretName: args.applicationSecretNames[0],
        kmsKeyId: args.kmsKeyArn,
        description: `${name} alternating broker login A; value populated only at runtime`,
        tags: {
          ...(args.tags ?? {}),
          "hulumi:boundary": name,
          "hulumi:credential-slot": "a",
        },
      },
      parent,
    );
    const applicationSecretB = new hulumiAws.SecureSecret(
      `${name}-application-b`,
      {
        tier: args.tier,
        secretName: args.applicationSecretNames[1],
        kmsKeyId: args.kmsKeyArn,
        description: `${name} alternating broker login B; value populated only at runtime`,
        tags: {
          ...(args.tags ?? {}),
          "hulumi:boundary": name,
          "hulumi:credential-slot": "b",
        },
      },
      parent,
    );
    this.applicationSecretArns = pulumi
      .all([applicationSecretA.secretArn, applicationSecretB.secretArn])
      .apply(([a, b]) => [a, b] as const);

    new aws.iam.RolePolicy(
      `${name}-broker-policy`,
      {
        role: roles.broker.name,
        policy: allowStatements(
          this.applicationSecretArns,
          args.kmsKeyArn,
          args.awsRegion,
          ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
          true,
        ),
      },
      parent,
    );
    new aws.iam.RolePolicy(
      `${name}-migrator-policy`,
      {
        role: roles.migrator.name,
        policy: allowStatements(
          pulumi
            .all([this.applicationSecretArns, args.masterSecretArn])
            .apply(([application, master]) => [...application, master]),
          args.kmsKeyArn,
          args.awsRegion,
          ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
          true,
        ),
      },
      parent,
    );
    if (transportTls !== undefined) {
      new aws.iam.RolePolicy(
        `${name}-broker-transport-tls-policy`,
        {
          role: roles.broker.name,
          policy: transportTlsStatements(
            transportTls.identitySecretArn,
            transportTls.kmsKeyArn,
            args.awsRegion,
          ),
        },
        parent,
      );
    }
    new aws.iam.RolePolicy(
      `${name}-rotation-policy`,
      {
        role: roles.rotation.name,
        policy: rotationStatements(
          this.applicationSecretArns,
          args.masterSecretArn,
          args.kmsKeyArn,
          args.awsRegion,
        ),
      },
      parent,
    );

    const replayTable = new aws.dynamodb.Table(
      `${name}-capability-replay`,
      {
        name: `${name}-capability-replay`,
        billingMode: "PAY_PER_REQUEST",
        hashKey: "jti",
        attributes: [{ name: "jti", type: "S" }],
        ttl: { attributeName: "expiresAt", enabled: true },
        serverSideEncryption: { enabled: true, kmsKeyArn: args.kmsKeyArn },
        pointInTimeRecovery: { enabled: true },
        tags: {
          ...(args.tags ?? {}),
          "hulumi:component": "BrokeredAuroraPostgresBoundary",
          "hulumi:boundary": name,
          "hulumi:purpose": "capability-replay",
        },
      },
      parent,
    );
    this.replayTableArn = replayTable.arn;
    this.replayTableName = replayTable.name;
    new aws.iam.RolePolicy(
      `${name}-broker-replay-policy`,
      {
        role: roles.broker.name,
        policy: replayTable.arn.apply((tableArn) =>
          JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Sid: "AtomicCapabilityReplayClaim",
                Effect: "Allow",
                Action: ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:DescribeTable"],
                Resource: tableArn,
                Condition: {
                  StringEquals: {
                    "aws:SourceVpce": args.dynamodbVpcEndpointId,
                  },
                },
              },
            ],
          }),
        ),
      },
      parent,
    );

    const link = (
      logicalName: string,
      source: aws.ec2.SecurityGroup,
      targetId: pulumi.Input<string>,
      port: number,
      description: string,
    ) => {
      new aws.vpc.SecurityGroupEgressRule(
        `${logicalName}-egress`,
        {
          securityGroupId: source.id,
          referencedSecurityGroupId: targetId,
          ipProtocol: "tcp",
          fromPort: port,
          toPort: port,
          description,
        },
        parent,
      );
      new aws.vpc.SecurityGroupIngressRule(
        `${logicalName}-ingress`,
        {
          securityGroupId: targetId,
          referencedSecurityGroupId: source.id,
          ipProtocol: "tcp",
          fromPort: port,
          toPort: port,
          description,
        },
        parent,
      );
    };

    link(
      `${name}-runtime-to-broker`,
      securityGroups.runtime,
      securityGroups.broker.id,
      args.workloads.broker.port,
      "Application runtime to broker only",
    );
    for (const kind of ["broker", "migrator", "rotation"] as const) {
      link(
        `${name}-${kind}-to-sts-endpoint`,
        securityGroups[kind],
        args.endpointSecurityGroupIds.sts,
        443,
        `${kind} exact STS endpoint path for IRSA credential exchange`,
      );
      link(
        `${name}-${kind}-to-database`,
        securityGroups[kind],
        args.database.securityGroupId,
        args.database.port,
        `${kind} exact PostgreSQL path`,
      );
      link(
        `${name}-${kind}-to-secrets-endpoint`,
        securityGroups[kind],
        args.endpointSecurityGroupIds.secretsManager,
        443,
        `${kind} exact Secrets Manager endpoint path`,
      );
      link(
        `${name}-${kind}-to-kms-endpoint`,
        securityGroups[kind],
        args.endpointSecurityGroupIds.kms,
        443,
        `${kind} exact KMS endpoint path`,
      );
    }
    link(
      `${name}-broker-to-dynamodb-endpoint`,
      securityGroups.broker,
      args.endpointSecurityGroupIds.dynamodb,
      443,
      "broker exact DynamoDB replay endpoint path",
    );
    if (args.runtimeIngress !== undefined) {
      new aws.vpc.SecurityGroupEgressRule(
        `${name}-caller-to-runtime-egress`,
        {
          securityGroupId: args.runtimeIngress.callerSecurityGroupId,
          referencedSecurityGroupId: securityGroups.runtime.id,
          ipProtocol: "tcp",
          fromPort: args.workloads.runtime.port,
          toPort: args.workloads.runtime.port,
          description: "exact caller workload to runtime",
        },
        parent,
      );
      new aws.vpc.SecurityGroupIngressRule(
        `${name}-caller-to-runtime-ingress`,
        {
          securityGroupId: securityGroups.runtime.id,
          referencedSecurityGroupId: args.runtimeIngress.callerSecurityGroupId,
          ipProtocol: "tcp",
          fromPort: args.workloads.runtime.port,
          toPort: args.workloads.runtime.port,
          description: "exact caller workload to runtime",
        },
        parent,
      );
    }
    for (const kind of IDENTITY_KINDS) {
      for (const [index, cidr] of args.dnsResolverCidrs.entries()) {
        for (const protocol of ["tcp", "udp"] as const) {
          new aws.vpc.SecurityGroupEgressRule(
            `${name}-${kind}-dns-${protocol}-${index}`,
            {
              securityGroupId: securityGroups[kind].id,
              cidrIpv4: cidr,
              ipProtocol: protocol,
              fromPort: 53,
              toPort: 53,
              description: `${kind} exact Route 53 Resolver ${protocol.toUpperCase()}`,
            },
            parent,
          );
        }
      }
    }

    const brokerLabels = podLabels(name, "broker");
    const runtimeLabels = podLabels(name, "runtime");
    new k8s.networking.v1.NetworkPolicy(
      `${name}-runtime-network`,
      {
        metadata: {
          name: `${name}-runtime-closed-egress`,
          namespace: args.namespace,
          labels: runtimeLabels,
        },
        spec: {
          podSelector: { matchLabels: runtimeLabels },
          policyTypes: ["Ingress", "Egress"],
          ingress:
            args.runtimeIngress === undefined
              ? []
              : [
                  {
                    from: [
                      {
                        namespaceSelector: {
                          matchLabels: {
                            "kubernetes.io/metadata.name": args.runtimeIngress.callerNamespace,
                          },
                        },
                        podSelector: {
                          matchLabels: { ...args.runtimeIngress.callerPodSelector },
                        },
                      },
                    ],
                    ports: [networkPolicyPorts("TCP", args.workloads.runtime.port)],
                  },
                ],
          egress: [
            {
              to: [{ podSelector: { matchLabels: brokerLabels } }],
              ports: [networkPolicyPorts("TCP", args.workloads.broker.port)],
            },
            {
              to: args.dnsResolverCidrs.map((cidr) => ({ ipBlock: { cidr } })),
              ports: [networkPolicyPorts("UDP", 53), networkPolicyPorts("TCP", 53)],
            },
          ],
        },
      },
      parent,
    );
    new k8s.networking.v1.NetworkPolicy(
      `${name}-broker-network`,
      {
        metadata: {
          name: `${name}-broker-closed-network`,
          namespace: args.namespace,
          labels: brokerLabels,
        },
        spec: {
          podSelector: { matchLabels: brokerLabels },
          policyTypes: ["Ingress", "Egress"],
          ingress: [
            {
              from: [{ podSelector: { matchLabels: runtimeLabels } }],
              ports: [networkPolicyPorts("TCP", args.workloads.broker.port)],
            },
          ],
          egress: [
            {
              to: args.database.cidrs.map((cidr) => ({ ipBlock: { cidr } })),
              ports: [networkPolicyPorts("TCP", args.database.port)],
            },
            {
              to: args.endpointCidrs.map((cidr) => ({ ipBlock: { cidr } })),
              ports: [networkPolicyPorts("TCP", 443)],
            },
            {
              to: args.dnsResolverCidrs.map((cidr) => ({ ipBlock: { cidr } })),
              ports: [networkPolicyPorts("UDP", 53), networkPolicyPorts("TCP", 53)],
            },
          ],
        },
      },
      parent,
    );
    for (const kind of ["migrator", "rotation"] as const) {
      const labels = podLabels(name, kind);
      new k8s.networking.v1.NetworkPolicy(
        `${name}-${kind}-network`,
        {
          metadata: {
            name: `${name}-${kind}-closed-network`,
            namespace: args.namespace,
            labels,
          },
          spec: {
            podSelector: { matchLabels: labels },
            policyTypes: ["Ingress", "Egress"],
            ingress: [],
            egress: [
              {
                to: args.database.cidrs.map((cidr) => ({ ipBlock: { cidr } })),
                ports: [networkPolicyPorts("TCP", args.database.port)],
              },
              {
                to: args.endpointCidrs.map((cidr) => ({ ipBlock: { cidr } })),
                ports: [networkPolicyPorts("TCP", 443)],
              },
              {
                to: args.dnsResolverCidrs.map((cidr) => ({ ipBlock: { cidr } })),
                ports: [networkPolicyPorts("UDP", 53), networkPolicyPorts("TCP", 53)],
              },
            ],
          },
        },
        parent,
      );
    }

    const brokerService = new k8s.core.v1.Service(
      `${name}-broker-service`,
      {
        metadata: {
          name: `${name}-broker`,
          namespace: args.namespace,
          labels: brokerLabels,
        },
        spec: {
          type: "ClusterIP",
          selector: brokerLabels,
          ports: [
            {
              name: "https",
              port: args.workloads.broker.port,
              targetPort: args.workloads.broker.port,
              protocol: "TCP",
            },
          ],
        },
      },
      parent,
    );
    this.brokerServiceName = brokerService.metadata.name;
    if (args.runtimeIngress === undefined) {
      this.runtimeServiceName = pulumi.output(undefined);
    } else {
      const runtimeService = new k8s.core.v1.Service(
        `${name}-runtime-service`,
        {
          metadata: {
            name: args.runtimeIngress.serviceName,
            namespace: args.namespace,
            labels: runtimeLabels,
          },
          spec: {
            type: "ClusterIP",
            selector: runtimeLabels,
            ports: [
              {
                name: "https",
                port: args.workloads.runtime.port,
                targetPort: args.workloads.runtime.port,
                protocol: "TCP",
              },
            ],
          },
        },
        parent,
      );
      this.runtimeServiceName = runtimeService.metadata.name;
    }

    const runtimeEnv = [
      ...awsIdentityEnv(roles.runtime.arn, args.awsRegion),
      {
        name: "BROKER_URL",
        value: `https://${name}-broker.${args.namespace}.svc.cluster.local:${args.workloads.broker.port}`,
      },
      { name: "CAPABILITY_AUDIENCE", value: args.capability.audience },
    ];
    const brokerEnv = [
      ...awsIdentityEnv(roles.broker.arn, args.awsRegion),
      { name: "DATABASE_HOST", value: args.database.endpoint },
      { name: "DATABASE_PORT", value: String(args.database.port) },
      { name: "APPLICATION_SECRET_A_ARN", value: applicationSecretA.secretArn },
      { name: "APPLICATION_SECRET_B_ARN", value: applicationSecretB.secretArn },
      { name: "CAPABILITY_ISSUER", value: args.capability.issuer },
      { name: "CAPABILITY_AUDIENCE", value: args.capability.audience },
      { name: "CAPABILITY_JWKS_JSON", value: capabilityJwksJson },
      { name: "CAPABILITY_MAX_TTL_SECONDS", value: String(args.capability.maxTtlSeconds) },
      { name: "CAPABILITY_REPLAY_TABLE", value: replayTable.name },
      { name: "AWS_ENDPOINT_URL_DYNAMODB", value: dynamodbEndpointUrl },
      ...(transportTls === undefined
        ? []
        : [
            { name: "GPIL_TLS_MODE", value: "native" },
            {
              name: "TLS_IDENTITY_SECRET_ARN",
              value: transportTls.identitySecretArn,
            },
          ]),
    ];
    const migratorEnv = [
      ...awsIdentityEnv(roles.migrator.arn, args.awsRegion),
      { name: "DATABASE_HOST", value: args.database.endpoint },
      { name: "DATABASE_PORT", value: String(args.database.port) },
      { name: "MASTER_SECRET_ARN", value: args.masterSecretArn },
      { name: "APPLICATION_SECRET_A_ARN", value: applicationSecretA.secretArn },
      { name: "APPLICATION_SECRET_B_ARN", value: applicationSecretB.secretArn },
    ];
    const rotationEnv = [
      ...awsIdentityEnv(roles.rotation.arn, args.awsRegion),
      { name: "DATABASE_HOST", value: args.database.endpoint },
      { name: "DATABASE_PORT", value: String(args.database.port) },
      { name: "MASTER_SECRET_ARN", value: args.masterSecretArn },
      { name: "APPLICATION_SECRET_A_ARN", value: applicationSecretA.secretArn },
      { name: "APPLICATION_SECRET_B_ARN", value: applicationSecretB.secretArn },
    ];

    const runtimeContainer = restrictedContainer(
      "runtime",
      args.workloads.runtime,
      runtimeEnv,
      args.workloads.runtime.port,
    );
    const brokerContainer = restrictedContainer(
      "broker",
      args.workloads.broker,
      brokerEnv,
      args.workloads.broker.port,
    );
    const migratorContainer = restrictedContainer("migrator", args.workloads.migrator, migratorEnv);
    const rotationContainer = restrictedContainer("rotation", args.workloads.rotation, rotationEnv);

    new k8s.apps.v1.Deployment(
      `${name}-runtime`,
      {
        metadata: { name: `${name}-runtime`, namespace: args.namespace, labels: runtimeLabels },
        spec: {
          replicas: 0,
          selector: { matchLabels: runtimeLabels },
          template: {
            metadata: { labels: runtimeLabels },
            spec: {
              ...podSpec(
                args.identities.runtime,
                runtimeContainer,
                "Always",
                args.placement.runtime,
              ),
            },
          },
        },
      },
      parent,
    );
    new k8s.apps.v1.Deployment(
      `${name}-broker`,
      {
        metadata: { name: `${name}-broker`, namespace: args.namespace, labels: brokerLabels },
        spec: {
          replicas: 0,
          selector: { matchLabels: brokerLabels },
          template: {
            metadata: { labels: brokerLabels },
            spec: {
              ...podSpec(
                args.identities.broker,
                brokerContainer,
                "Always",
                args.placement.privileged,
              ),
            },
          },
        },
      },
      parent,
    );
    new k8s.batch.v1.Job(
      `${name}-migrator`,
      {
        metadata: {
          name: `${name}-migrator`,
          namespace: args.namespace,
          labels: podLabels(name, "migrator"),
          // The migrator ships suspended: no pod is created, and status stays
          // type=Suspended with active/succeeded/failed all zero. Awaiting
          // readiness on it therefore cannot succeed — not slowly, but never —
          // so the provider is told to skip the await rather than block until
          // its timeout. Inertness is the point; this makes the deployment
          // honest about it instead of waiting for an activation that only an
          // operator may perform.
          annotations: { "pulumi.com/skipAwait": "true" },
        },
        spec: {
          backoffLimit: 1,
          suspend: true,
          template: {
            metadata: { labels: podLabels(name, "migrator") },
            spec: podSpec(
              args.identities.migrator,
              migratorContainer,
              "Never",
              args.placement.privileged,
            ),
          },
        },
      },
      parent,
    );
    new k8s.batch.v1.CronJob(
      `${name}-rotation`,
      {
        metadata: {
          name: `${name}-rotation`,
          namespace: args.namespace,
          labels: podLabels(name, "rotation"),
        },
        spec: {
          schedule: args.workloads.rotation.schedule,
          suspend: true,
          concurrencyPolicy: "Forbid",
          successfulJobsHistoryLimit: 1,
          failedJobsHistoryLimit: 1,
          jobTemplate: {
            spec: {
              backoffLimit: 1,
              template: {
                metadata: { labels: podLabels(name, "rotation") },
                spec: podSpec(
                  args.identities.rotation,
                  rotationContainer,
                  "Never",
                  args.placement.privileged,
                ),
              },
            },
          },
        },
      },
      parent,
    );

    const protectedServiceAccounts = IDENTITY_KINDS.map(
      (kind) => args.identities[kind].serviceAccountName,
    );
    const serviceAccountSet = celStringList(protectedServiceAccounts);
    const labels = "object.metadata.labels";
    const protectedPod = `(object.spec.serviceAccountName in ${serviceAccountSet} || (has(${labels}) && "hulumi.dev/component" in ${labels} && ${labels}["hulumi.dev/component"] == "BrokeredAuroraPostgresBoundary" && "hulumi.dev/boundary" in ${labels} && ${labels}["hulumi.dev/boundary"] == ${JSON.stringify(
      name,
    )}))`;
    const exactEnvironment = (
      env: readonly k8s.types.input.core.v1.EnvVar[],
    ): pulumi.Output<string> => {
      const entries = env.map((entry) => {
        if (typeof entry.name !== "string") {
          throw new Error(
            "BrokeredAuroraPostgresBoundary: protected environment names must be literal strings",
          );
        }
        if (entry.value === undefined) {
          throw new Error(
            "BrokeredAuroraPostgresBoundary: protected environment values must be explicit",
          );
        }
        return { name: entry.name, value: entry.value };
      });
      return pulumi
        .all(entries.map((entry) => entry.value as pulumi.Input<string>))
        .apply(
          (values) =>
            `has(object.spec.containers[0].env) && object.spec.containers[0].env.size() == ${entries.length} && ${entries
              .map(
                (entry, index) =>
                  `object.spec.containers[0].env[${index}].name == ${JSON.stringify(entry.name)} && has(object.spec.containers[0].env[${index}].value) && object.spec.containers[0].env[${index}].value == ${JSON.stringify(values[index])} && !has(object.spec.containers[0].env[${index}].valueFrom)`,
              )
              .join(" && ")}`,
        );
    };
    const environments: Record<
      BrokeredPostgresIdentityKind,
      readonly k8s.types.input.core.v1.EnvVar[]
    > = {
      runtime: runtimeEnv,
      broker: brokerEnv,
      migrator: migratorEnv,
      rotation: rotationEnv,
    };
    const exactVolumeMounts = `has(object.spec.containers[0].volumeMounts) && object.spec.containers[0].volumeMounts.size() == 2 && object.spec.containers[0].volumeMounts.exists(m, m.name == "aws-iam-token" && m.mountPath == ${JSON.stringify(
      WEB_IDENTITY_TOKEN_DIR,
    )} && (!has(m.subPath) || m.subPath == "") && m.readOnly == true) && object.spec.containers[0].volumeMounts.exists(m, m.name == "tmp" && m.mountPath == "/tmp" && (!has(m.subPath) || m.subPath == "") && (!has(m.readOnly) || m.readOnly == false))`;
    const exactPlacement = (placement: BrokeredPostgresPlacementProfileArgs): string => {
      const nodeKey = JSON.stringify(placement.nodePool.key);
      const nodeValue = JSON.stringify(placement.nodePool.value);
      return `has(object.spec.runtimeClassName) && object.spec.runtimeClassName == ${JSON.stringify(
        placement.runtimeClassName,
      )} && has(object.spec.nodeSelector) && object.spec.nodeSelector.size() == 1 && object.spec.nodeSelector[${nodeKey}] == ${nodeValue} && has(object.spec.affinity) && has(object.spec.affinity.nodeAffinity) && has(object.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution) && object.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms.size() == 1 && object.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[0].matchExpressions.size() == 1 && object.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[0].matchExpressions[0].key == ${nodeKey} && object.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[0].matchExpressions[0].operator == "In" && object.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[0].matchExpressions[0].values == [${nodeValue}] && has(object.spec.tolerations) && object.spec.tolerations.size() == 1 && object.spec.tolerations[0].key == ${JSON.stringify(
        placement.toleration.key,
      )} && object.spec.tolerations[0].operator == "Equal" && object.spec.tolerations[0].value == ${JSON.stringify(
        placement.toleration.value,
      )} && object.spec.tolerations[0].effect == ${JSON.stringify(
        placement.toleration.effect,
      )} && object.spec.schedulerName == ${JSON.stringify(
        placement.schedulerName,
      )} && object.spec.priorityClassName == ${JSON.stringify(placement.priorityClassName)}`;
    };
    const exactEnvelope = pulumi
      .all(IDENTITY_KINDS.map((kind) => exactEnvironment(environments[kind])))
      .apply((environmentExpressions) =>
        IDENTITY_KINDS.map((kind, index) => {
          const workload = args.workloads[kind];
          const placement = kind === "runtime" ? args.placement.runtime : args.placement.privileged;
          const servingPort =
            kind === "runtime" || kind === "broker" ? args.workloads[kind].port : undefined;
          const expectedArgs =
            workload.args === undefined
              ? "(!has(c.args) || c.args.size() == 0)"
              : `(has(c.args) && c.args == ${celStringList(workload.args)})`;
          const expectedPorts =
            servingPort === undefined
              ? "(!has(c.ports) || c.ports.size() == 0)"
              : `(has(c.ports) && c.ports.size() == 1 && c.ports[0].name == "https" && c.ports[0].containerPort == ${servingPort} && (!has(c.ports[0].protocol) || c.ports[0].protocol == "TCP"))`;
          const exactContainerControls = `object.spec.containers.all(c, c.imagePullPolicy == "IfNotPresent" && ${expectedArgs} && ${expectedPorts} && (!has(c.lifecycle)) && (!has(c.livenessProbe)) && (!has(c.readinessProbe)) && (!has(c.startupProbe)) && (!has(c.stdin) || c.stdin == false) && (!has(c.stdinOnce) || c.stdinOnce == false) && (!has(c.tty) || c.tty == false) && (!has(c.workingDir) || c.workingDir == "") && has(c.resources) && c.resources.requests.cpu == "100m" && c.resources.requests.memory == "128Mi" && c.resources.limits.cpu == "1" && c.resources.limits.memory == "512Mi")`;
          return `(object.spec.serviceAccountName == ${JSON.stringify(
            args.identities[kind].serviceAccountName,
          )} && has(${labels}) && ${labels}["hulumi.dev/component"] == "BrokeredAuroraPostgresBoundary" && ${labels}["hulumi.dev/boundary"] == ${JSON.stringify(
            name,
          )} && ${labels}["hulumi.dev/identity-kind"] == ${JSON.stringify(
            kind,
          )} && ${labels}["app.kubernetes.io/name"] == ${JSON.stringify(
            `${name}-${kind}`,
          )} && ${labels}["app.kubernetes.io/part-of"] == ${JSON.stringify(
            name,
          )} && object.spec.containers.size() == 1 && object.spec.containers[0].name == ${JSON.stringify(
            kind,
          )} && object.spec.containers[0].image == ${JSON.stringify(
            workload.image,
          )} && has(object.spec.containers[0].command) && object.spec.containers[0].command == ${celStringList(
            workload.command,
          )} && ${environmentExpressions[index]} && ${exactVolumeMounts} && ${exactContainerControls} && ${exactPlacement(
            placement,
          )})`;
        }).join(" || "),
      );
    const admissionPolicyName = `${name}-closed-workload-envelope`;
    new k8s.admissionregistration.v1.ValidatingAdmissionPolicy(
      `${name}-workload-envelope`,
      {
        metadata: {
          name: admissionPolicyName,
          labels: {
            "hulumi.dev/component": "BrokeredAuroraPostgresBoundary",
            "hulumi.dev/boundary": name,
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
          validations: [
            {
              expression: exactEnvelope.apply((envelope) => `!${protectedPod} || (${envelope})`),
              message:
                "Protected broker-boundary labels and ServiceAccounts require their exact label, identity, image, command, arguments, and environment envelope.",
              reason: "Forbidden",
            },
            {
              expression: `!${protectedPod} || ((!has(object.spec.hostNetwork) || object.spec.hostNetwork == false) && (!has(object.spec.hostPID) || object.spec.hostPID == false) && (!has(object.spec.hostIPC) || object.spec.hostIPC == false) && (!has(object.spec.shareProcessNamespace) || object.spec.shareProcessNamespace == false) && (!has(object.spec.hostAliases) || object.spec.hostAliases.size() == 0) && (!has(object.spec.dnsConfig)) && (!has(object.spec.dnsPolicy) || object.spec.dnsPolicy == "ClusterFirst") && (!has(object.spec.initContainers) || object.spec.initContainers.size() == 0) && (!has(object.spec.ephemeralContainers) || object.spec.ephemeralContainers.size() == 0) && object.spec.automountServiceAccountToken == false && object.spec.enableServiceLinks == false && has(object.spec.securityContext) && object.spec.securityContext.runAsNonRoot == true && object.spec.securityContext.seccompProfile.type == "RuntimeDefault" && object.spec.containers.all(c, has(c.securityContext) && (!has(c.securityContext.privileged) || c.securityContext.privileged == false) && c.securityContext.runAsNonRoot == true && c.securityContext.allowPrivilegeEscalation == false && c.securityContext.readOnlyRootFilesystem == true && (!has(c.securityContext.procMount) || c.securityContext.procMount == "Default") && c.securityContext.seccompProfile.type == "RuntimeDefault" && c.securityContext.capabilities.drop.size() == 1 && c.securityContext.capabilities.drop[0] == "ALL" && (!has(c.securityContext.capabilities.add) || c.securityContext.capabilities.add.size() == 0)))`,
              message: "Protected broker-boundary Pods require the restricted security context.",
              reason: "Forbidden",
            },
            {
              expression: `!${protectedPod} || (object.spec.containers.all(c, (!has(c.envFrom) || c.envFrom.size() == 0) && (!has(c.env) || c.env.all(e, !has(e.valueFrom) && (!has(e.valueFrom) || !has(e.valueFrom.secretKeyRef))))) && object.spec.volumes.size() == 2 && object.spec.volumes.all(v, !has(v.secret) && (!has(v.projected) || v.projected.sources.all(s, !has(s.secret)))) && object.spec.volumes.exists(v, v.name == "aws-iam-token" && has(v.projected) && v.projected.defaultMode == 292 && v.projected.sources.size() == 1 && has(v.projected.sources[0].serviceAccountToken) && v.projected.sources[0].serviceAccountToken.audience == "sts.amazonaws.com" && v.projected.sources[0].serviceAccountToken.expirationSeconds == 900 && v.projected.sources[0].serviceAccountToken.path == "token") && object.spec.volumes.exists(v, v.name == "tmp" && has(v.emptyDir) && v.emptyDir.sizeLimit == "64Mi"))`,
              message:
                "Protected broker-boundary Pods must use only the exact projected identity token and emptyDir volumes, with no envFrom, secretKeyRef, or Kubernetes Secret source.",
              reason: "Forbidden",
            },
          ],
        },
      },
      parent,
    );
    new k8s.admissionregistration.v1.ValidatingAdmissionPolicyBinding(
      `${name}-workload-envelope-binding`,
      {
        metadata: {
          name: `${admissionPolicyName}-binding`,
          labels: {
            "hulumi.dev/component": "BrokeredAuroraPostgresBoundary",
            "hulumi.dev/boundary": name,
          },
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
      parent,
    );

    this.roleArns = pulumi
      .all(IDENTITY_KINDS.map((kind) => roles[kind].arn))
      .apply(
        ([runtime, broker, migrator, rotation]) =>
          ({ runtime, broker, migrator, rotation }) as Record<BrokeredPostgresIdentityKind, string>,
      );
    this.serviceAccountNames = pulumi.output({
      runtime: args.identities.runtime.serviceAccountName,
      broker: args.identities.broker.serviceAccountName,
      migrator: args.identities.migrator.serviceAccountName,
      rotation: args.identities.rotation.serviceAccountName,
    });
    this.securityGroupIds = pulumi
      .all(IDENTITY_KINDS.map((kind) => securityGroups[kind].id))
      .apply(
        ([runtime, broker, migrator, rotation]) =>
          ({ runtime, broker, migrator, rotation }) as Record<BrokeredPostgresIdentityKind, string>,
      );
    this.rotationPosture = pulumi.output("infrastructure-only-unconfigured" as const);
    this.migrationOrdering = pulumi.output([
      "hulumi-workloads-remain-inert",
      "migrator-job-succeeds",
      "postgres-authority-postconditions-pass",
      "application-credentials-prepopulated",
      "external-content-addressed-evidence-verified",
      "external-broker-rollout",
      "external-runtime-rollout",
    ]);
    this.identityReceipt = pulumi
      .all([this.roleArns, this.securityGroupIds])
      .apply(([roleArns, securityGroupIds]): BrokeredPostgresIdentityReceipt => ({
        boundary: name,
        namespace: args.namespace,
        identities: {
          runtime: {
            serviceAccountName: args.identities.runtime.serviceAccountName,
            roleArn: roleArns.runtime,
            securityGroupId: securityGroupIds.runtime,
          },
          broker: {
            serviceAccountName: args.identities.broker.serviceAccountName,
            roleArn: roleArns.broker,
            securityGroupId: securityGroupIds.broker,
          },
          migrator: {
            serviceAccountName: args.identities.migrator.serviceAccountName,
            roleArn: roleArns.migrator,
            securityGroupId: securityGroupIds.migrator,
          },
          rotation: {
            serviceAccountName: args.identities.rotation.serviceAccountName,
            roleArn: roleArns.rotation,
            securityGroupId: securityGroupIds.rotation,
          },
        },
        capability: {
          issuer: args.capability.issuer,
          audience: args.capability.audience,
          maxTtlSeconds: args.capability.maxTtlSeconds,
        },
        limits: [...INFRASTRUCTURE_LIMITS],
      }));

    this.registerOutputs({
      // Keep the contract structurally serialized: wrapping the whole object in
      // one Output makes a single unknown provider leaf hide every known input
      // from CrossGuard during a first-create preview.
      policyContract,
      roleArns: this.roleArns,
      serviceAccountNames: this.serviceAccountNames,
      securityGroupIds: this.securityGroupIds,
      applicationSecretArns: this.applicationSecretArns,
      replayTableArn: this.replayTableArn,
      replayTableName: this.replayTableName,
      brokerServiceName: this.brokerServiceName,
      runtimeServiceName: this.runtimeServiceName,
      rotationPosture: this.rotationPosture,
      migrationOrdering: this.migrationOrdering,
      identityReceipt: this.identityReceipt,
    });
  }
}
