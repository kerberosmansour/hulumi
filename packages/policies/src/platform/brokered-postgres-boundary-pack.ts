import { UnknownValueError, type PolicyResource, type StackValidationPolicy } from "@pulumi/policy";

import type { PackMetadata } from "../metadata";

export const BROKERED_PG_1_RULE_ID = "BROKERED_PG_1_CLOSED_AUTHORITY_BOUNDARY";

const COMPONENT_TYPE = "hulumi:platform:BrokeredAuroraPostgresBoundary";
const IAM_ROLE_TYPE = "aws:iam/role:Role";
const ROLE_POLICY_TYPE = "aws:iam/rolePolicy:RolePolicy";
const ROLE_POLICY_ATTACHMENT_TYPE = "aws:iam/rolePolicyAttachment:RolePolicyAttachment";
const POLICY_ATTACHMENT_TYPE = "aws:iam/policyAttachment:PolicyAttachment";
const SECURITY_GROUP_TYPE = "aws:ec2/securityGroup:SecurityGroup";
const SG_EGRESS_TYPE = "aws:vpc/securityGroupEgressRule:SecurityGroupEgressRule";
const SG_INGRESS_TYPE = "aws:vpc/securityGroupIngressRule:SecurityGroupIngressRule";
const LEGACY_SG_RULE_TYPE = "aws:ec2/securityGroupRule:SecurityGroupRule";
const SERVICE_ACCOUNT_TYPE = "kubernetes:core/v1:ServiceAccount";
const NETWORK_POLICY_TYPE = "kubernetes:networking.k8s.io/v1:NetworkPolicy";
const CUSTOM_RESOURCE_TYPE = "kubernetes:apiextensions.k8s.io:CustomResource";
const SECURITY_GROUP_POLICY_TYPE = "kubernetes:vpcresources.k8s.aws/v1beta1:SecurityGroupPolicy";
const SECURE_SECRET_TYPE = "hulumi:baseline:aws:SecureSecret";
const SECRETS_MANAGER_SECRET_TYPE = "aws:secretsmanager/secret:Secret";
const SECRET_VERSION_TYPE = "aws:secretsmanager/secretVersion:SecretVersion";
const KUBERNETES_SECRET_TYPE = "kubernetes:core/v1:Secret";
const RDS_CREDENTIAL_SECRET_TYPE = "hulumi:k8s:RdsCredentialSecret";
const DYNAMODB_TABLE_TYPE = "aws:dynamodb/table:Table";
const ADMISSION_POLICY_TYPE =
  "kubernetes:admissionregistration.k8s.io/v1:ValidatingAdmissionPolicy";
const ADMISSION_BINDING_TYPE =
  "kubernetes:admissionregistration.k8s.io/v1:ValidatingAdmissionPolicyBinding";
const WORKLOAD_TYPES = new Set([
  "kubernetes:apps/v1:Deployment",
  "kubernetes:batch/v1:Job",
  "kubernetes:batch/v1:CronJob",
]);
const IDENTITY_KINDS = ["runtime", "broker", "migrator", "rotation"] as const;
const DOCS_URL =
  "https://github.com/kerberosmansour/hulumi/blob/main/docs/components/brokered-aurora-postgres-boundary.md";
const IMMUTABLE_IMAGE = /@sha256:[a-f0-9]{64}$/iu;
const SHA256_DIGEST = /^sha256:([a-f0-9]{64})$/u;
const IMMUTABLE_EVIDENCE_REF = /^oci:\/\/[^\s]+@sha256:([a-f0-9]{64})$/u;
const NODE_RESTRICTION_LABEL =
  /^(?:node-restriction\.kubernetes\.io|[a-z0-9.-]+\.node-restriction\.kubernetes\.io)\/[A-Za-z0-9_.-]+$/u;

type IdentityKind = (typeof IDENTITY_KINDS)[number];

interface ArnParts {
  readonly partition: string;
  readonly service: string;
  readonly region: string;
  readonly account: string;
  readonly resource: string;
}

interface PlacementProfile {
  readonly runtimeClassName: string;
  readonly nodePoolKey: string;
  readonly nodePoolValue: string;
  readonly tolerationKey: string;
  readonly tolerationValue: string;
  readonly tolerationEffect: string;
  readonly schedulerName: string;
  readonly priorityClassName: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  const record = asRecord(value);
  if (record === undefined) return value;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, canonicalValue(record[key])]),
  );
}

function sameStructure(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(canonicalValue(actual)) === JSON.stringify(canonicalValue(expected));
}

const KUBERNETES_SERVER_METADATA_FIELDS = new Set([
  "creationTimestamp",
  "generation",
  "managedFields",
  "resourceVersion",
  "uid",
]);

function comparableNetworkPolicyProps(props: unknown): Record<string, unknown> {
  const record = asRecord(props);
  const metadata = asRecord(record?.metadata);
  const spec = asRecord(record?.spec);
  const comparableMetadata =
    metadata === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(metadata).filter(([key]) => !KUBERNETES_SERVER_METADATA_FIELDS.has(key)),
        );
  return {
    metadata: comparableMetadata,
    spec:
      spec === undefined
        ? undefined
        : { ...spec, ingress: spec.ingress === undefined ? [] : spec.ingress },
  };
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function parseJson(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return undefined;
    }
  }
  return asRecord(value);
}

function parseArn(value: unknown): ArnParts | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^arn:(aws(?:-cn|-us-gov)?):([^:]+):([^:]*):(\d{12}):(.+)$/u.exec(value);
  if (match === null) return undefined;
  return {
    partition: match[1],
    service: match[2],
    region: match[3],
    account: match[4],
    resource: match[5],
  };
}

function stringProp(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

interface PreviewString {
  readonly value: string | undefined;
  readonly unknown: boolean;
}

function previewStringProp(
  record: Record<string, unknown> | undefined,
  key: string,
): PreviewString {
  try {
    return { value: stringProp(record, key), unknown: false };
  } catch (error) {
    if (error instanceof UnknownValueError) {
      return { value: undefined, unknown: true };
    }
    throw error;
  }
}

function placementProfile(value: unknown): PlacementProfile | undefined {
  const profile = asRecord(value);
  const nodePool = asRecord(profile?.nodePool);
  const toleration = asRecord(profile?.toleration);
  const parsed = {
    runtimeClassName: stringProp(profile, "runtimeClassName"),
    nodePoolKey: stringProp(nodePool, "key"),
    nodePoolValue: stringProp(nodePool, "value"),
    tolerationKey: stringProp(toleration, "key"),
    tolerationValue: stringProp(toleration, "value"),
    tolerationEffect: stringProp(toleration, "effect"),
    schedulerName: stringProp(profile, "schedulerName"),
    priorityClassName: stringProp(profile, "priorityClassName"),
  };
  return Object.values(parsed).every((entry) => entry !== undefined)
    ? (parsed as PlacementProfile)
    : undefined;
}

function statements(value: unknown): Record<string, unknown>[] {
  const raw = parseJson(value)?.Statement;
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .map(asRecord)
    .filter((entry): entry is Record<string, unknown> => entry !== undefined);
}

function tagsOf(resource: PolicyResource): Record<string, unknown> | undefined {
  const props = asRecord(resource.props);
  return (
    asRecord(props?.tags) ??
    asRecord(asRecord(props?.metadata)?.labels) ??
    (asRecord(asRecord(asRecord(props?.spec)?.template)?.metadata)?.labels as
      | Record<string, unknown>
      | undefined)
  );
}

function identityKind(resource: PolicyResource): IdentityKind | undefined {
  const value =
    tagsOf(resource)?.["hulumi:identity-kind"] ?? tagsOf(resource)?.["hulumi.dev/identity-kind"];
  return (IDENTITY_KINDS as readonly string[]).includes(String(value))
    ? (value as IdentityKind)
    : undefined;
}

function boundaryTag(resource: PolicyResource): string | undefined {
  const value = tagsOf(resource)?.["hulumi:boundary"] ?? tagsOf(resource)?.["hulumi.dev/boundary"];
  return typeof value === "string" ? value : undefined;
}

function isDescendantOf(resource: PolicyResource, boundary: PolicyResource): boolean {
  let parent = resource.parent;
  while (parent !== undefined) {
    if (parent.urn === boundary.urn) return true;
    parent = parent.parent;
  }
  return false;
}

function boundaryResources(
  resources: readonly PolicyResource[],
  boundary: PolicyResource,
): PolicyResource[] {
  return resources.filter(
    (resource) => boundaryTag(resource) === boundary.name || isDescendantOf(resource, boundary),
  );
}

function actualResourceName(resource: PolicyResource): string {
  const props = asRecord(resource.props);
  return typeof props?.name === "string" ? props.name : resource.name;
}

function candidateIds(resource: PolicyResource): Set<string> {
  const props = asRecord(resource.props);
  return new Set(
    [resource.name, props?.name, props?.id, props?.arn]
      .filter((value): value is string => typeof value === "string" && value !== "")
      .flatMap((value) => [value, `${value}_id`]),
  );
}

function metadataName(resource: PolicyResource): string {
  const metadata = asRecord(asRecord(resource.props)?.metadata);
  return typeof metadata?.name === "string" ? metadata.name : resource.name;
}

function hasExactIrsaTrust(
  role: PolicyResource,
  namespace: string,
  serviceAccount: string,
  oidcProviderArn: string,
  oidcIssuer: string,
): boolean | undefined {
  const roleProps = asRecord(role.props);
  let trustPolicy: unknown;
  try {
    trustPolicy = roleProps?.assumeRolePolicy;
  } catch (error) {
    if (error instanceof UnknownValueError) return undefined;
    throw error;
  }
  if (trustPolicy === undefined) return false;
  const trustStatements = statements(trustPolicy);
  if (trustStatements.length !== 1) return false;
  const statement = trustStatements[0];
  if (statement.Effect !== "Allow") return false;
  const actions = strings(statement.Action).map((action) => action.toLowerCase());
  if (actions.length !== 1 || actions[0] !== "sts:assumerolewithwebidentity") return false;
  const principal = asRecord(statement.Principal);
  if (
    principal === undefined ||
    Object.keys(principal).length !== 1 ||
    principal.Federated !== oidcProviderArn
  ) {
    return false;
  }
  const condition = asRecord(statement.Condition);
  if (
    condition === undefined ||
    Object.keys(condition).length !== 1 ||
    condition.StringLike !== undefined
  ) {
    return false;
  }
  const equals = asRecord(condition.StringEquals);
  if (equals === undefined || Object.keys(equals).length !== 2) return false;
  const prefix = oidcIssuer.replace(/^https:\/\//u, "").replace(/\/$/u, "");
  return (
    equals[`${prefix}:aud`] === "sts.amazonaws.com" &&
    equals[`${prefix}:sub`] === `system:serviceaccount:${namespace}:${serviceAccount}` &&
    Object.values(equals).every(
      (value) => typeof value === "string" && value !== "" && !value.includes("*"),
    )
  );
}

function serviceAccountName(resource: PolicyResource): string {
  const metadata = asRecord(asRecord(resource.props)?.metadata);
  return typeof metadata?.name === "string" ? metadata.name : resource.name;
}

function rolePoliciesFor(
  resources: readonly PolicyResource[],
  role: PolicyResource,
): PolicyResource[] {
  const candidates = candidateIds(role);
  candidates.add(actualResourceName(role));
  return resources.filter((resource) => {
    if (resource.type !== ROLE_POLICY_TYPE) return false;
    const roleRef = asRecord(resource.props)?.role;
    return typeof roleRef === "string" && candidates.has(roleRef);
  });
}

function allowedActions(resource: PolicyResource): string[] {
  return statements(asRecord(resource.props)?.policy).flatMap((statement) =>
    statement.Effect === "Allow"
      ? strings(statement.Action).map((action) => action.toLowerCase())
      : [],
  );
}

function allowedResources(resource: PolicyResource): string[] {
  return statements(asRecord(resource.props)?.policy).flatMap((statement) =>
    statement.Effect === "Allow" ? strings(statement.Resource) : [],
  );
}

function sameStrings(actual: readonly string[], expected: readonly string[]): boolean {
  return (
    actual.length === expected.length &&
    [...actual].sort().every((value, index) => value === [...expected].sort()[index])
  );
}

function hasExactActions(statement: Record<string, unknown>, expected: readonly string[]): boolean {
  return sameStrings(
    strings(statement.Action).map((action) => action.toLowerCase()),
    expected.map((action) => action.toLowerCase()),
  );
}

function exactCurrentStageCondition(statement: Record<string, unknown>): boolean {
  const condition = asRecord(statement.Condition);
  const equals = asRecord(condition?.StringEquals);
  return (
    condition !== undefined &&
    Object.keys(condition).length === 1 &&
    equals !== undefined &&
    Object.keys(equals).length === 1 &&
    equals["secretsmanager:VersionStage"] === "AWSCURRENT"
  );
}

function exactKmsCondition(
  statement: Record<string, unknown>,
  region: string,
  secretArns: readonly string[],
): boolean {
  const condition = asRecord(statement.Condition);
  const equals = asRecord(condition?.StringEquals);
  const encryption = asRecord(condition?.["ForAnyValue:StringEquals"]);
  return (
    condition !== undefined &&
    Object.keys(condition).length === 2 &&
    equals !== undefined &&
    Object.keys(equals).length === 1 &&
    equals["kms:ViaService"] === `secretsmanager.${region}.amazonaws.com` &&
    encryption !== undefined &&
    Object.keys(encryption).length === 1 &&
    sameStrings(strings(encryption["kms:EncryptionContext:SecretARN"]), secretArns)
  );
}

function podSpec(resource: PolicyResource): Record<string, unknown> | undefined {
  const spec = asRecord(resource.props)?.spec;
  const direct = asRecord(asRecord(spec)?.template)?.spec;
  if (asRecord(direct) !== undefined) return asRecord(direct);
  const cron = asRecord(asRecord(asRecord(asRecord(spec)?.jobTemplate)?.spec)?.template)?.spec;
  return asRecord(cron);
}

function containerIsRestricted(container: Record<string, unknown>): boolean {
  if (typeof container.image !== "string" || !IMMUTABLE_IMAGE.test(container.image)) return false;
  if (!Array.isArray(container.command) || container.command.length === 0) return false;
  if (Array.isArray(container.envFrom) && container.envFrom.length > 0) return false;
  const env = Array.isArray(container.env) ? container.env.map(asRecord) : [];
  if (env.some((entry) => entry?.valueFrom !== undefined)) return false;
  const security = asRecord(container.securityContext);
  const capabilities = asRecord(security?.capabilities);
  return (
    security?.runAsNonRoot === true &&
    security.allowPrivilegeEscalation === false &&
    security.readOnlyRootFilesystem === true &&
    security.privileged !== true &&
    asRecord(security.seccompProfile)?.type === "RuntimeDefault" &&
    strings(capabilities?.drop).includes("ALL")
  );
}

function podSpecHasExactPlacement(
  spec: Record<string, unknown>,
  placement: PlacementProfile | undefined,
): boolean {
  if (placement === undefined) return false;
  return (
    spec.runtimeClassName === placement.runtimeClassName &&
    sameStructure(asRecord(spec.nodeSelector), {
      [placement.nodePoolKey]: placement.nodePoolValue,
    }) &&
    sameStructure(asRecord(spec.affinity), {
      nodeAffinity: {
        requiredDuringSchedulingIgnoredDuringExecution: {
          nodeSelectorTerms: [
            {
              matchExpressions: [
                {
                  key: placement.nodePoolKey,
                  operator: "In",
                  values: [placement.nodePoolValue],
                },
              ],
            },
          ],
        },
      },
    }) &&
    sameStructure(spec.tolerations, [
      {
        key: placement.tolerationKey,
        operator: "Equal",
        value: placement.tolerationValue,
        effect: placement.tolerationEffect,
      },
    ]) &&
    spec.schedulerName === placement.schedulerName &&
    spec.priorityClassName === placement.priorityClassName
  );
}

function isSecurityGroupPolicy(resource: PolicyResource): boolean {
  const resourceProps = asRecord(resource.props);
  if (resource.type === CUSTOM_RESOURCE_TYPE) {
    return (
      resourceProps?.apiVersion === "vpcresources.k8s.aws/v1beta1" &&
      resourceProps.kind === "SecurityGroupPolicy"
    );
  }
  if (resource.type !== SECURITY_GROUP_POLICY_TYPE) return false;
  return (
    (resourceProps?.apiVersion === undefined ||
      resourceProps.apiVersion === "vpcresources.k8s.aws/v1beta1") &&
    (resourceProps?.kind === undefined || resourceProps.kind === "SecurityGroupPolicy")
  );
}

function podSpecIsRestricted(
  spec: Record<string, unknown>,
  kind: IdentityKind,
  placement: PlacementProfile | undefined,
): boolean {
  const initContainers = Array.isArray(spec.initContainers) ? spec.initContainers : [];
  const ephemeralContainers = Array.isArray(spec.ephemeralContainers)
    ? spec.ephemeralContainers
    : [];
  const expectedRestart = kind === "runtime" || kind === "broker" ? "Always" : "Never";
  return (
    spec.automountServiceAccountToken === false &&
    spec.enableServiceLinks === false &&
    spec.restartPolicy === expectedRestart &&
    spec.hostNetwork !== true &&
    spec.hostPID !== true &&
    spec.hostIPC !== true &&
    initContainers.length === 0 &&
    ephemeralContainers.length === 0 &&
    podSpecHasExactPlacement(spec, placement) &&
    asRecord(spec.securityContext)?.runAsNonRoot === true &&
    asRecord(asRecord(spec.securityContext)?.seccompProfile)?.type === "RuntimeDefault"
  );
}

function celStringList(values: readonly string[]): string {
  return `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
}

function expectedAdmissionExpressions(
  name: string,
  boundaryProps: Record<string, unknown> | undefined,
  serviceAccounts: readonly PolicyResource[],
  roleByKind: ReadonlyMap<IdentityKind, PolicyResource>,
  applicationSecretArns: readonly string[],
  replayStore: PolicyResource | undefined,
): string[] | undefined {
  const protectedServiceAccounts = IDENTITY_KINDS.map((kind) =>
    serviceAccountName(
      serviceAccounts.find((resource) => identityKind(resource) === kind) ??
        ({ name: "", props: {} } as PolicyResource),
    ),
  );
  if (protectedServiceAccounts.some((account) => account === "")) return undefined;
  const serviceAccountSet = celStringList(protectedServiceAccounts);
  const labels = "object.metadata.labels";
  const protectedPod = `(object.spec.serviceAccountName in ${serviceAccountSet} || (has(${labels}) && (("hulumi.dev/component" in ${labels} && ${labels}["hulumi.dev/component"] == "BrokeredAuroraPostgresBoundary") || ("hulumi.dev/boundary" in ${labels} && ${labels}["hulumi.dev/boundary"] == ${JSON.stringify(
    name,
  )}) || "hulumi.dev/identity-kind" in ${labels})))`;
  const exactVolumeMounts = `has(object.spec.containers[0].volumeMounts) && object.spec.containers[0].volumeMounts.size() == 2 && object.spec.containers[0].volumeMounts.exists(m, m.name == "aws-iam-token" && m.mountPath == "/var/run/secrets/eks.amazonaws.com/serviceaccount" && (!has(m.subPath) || m.subPath == "") && m.readOnly == true) && object.spec.containers[0].volumeMounts.exists(m, m.name == "tmp" && m.mountPath == "/tmp" && (!has(m.subPath) || m.subPath == "") && (!has(m.readOnly) || m.readOnly == false))`;
  const workloads = asRecord(boundaryProps?.workloads);
  const database = asRecord(boundaryProps?.database);
  const capability = asRecord(boundaryProps?.capability);
  const placement = asRecord(boundaryProps?.placement);
  const runtimePlacement = placementProfile(placement?.runtime);
  const privilegedPlacement = placementProfile(placement?.privileged);
  const namespace = stringProp(boundaryProps, "namespace");
  const awsRegion = stringProp(boundaryProps, "awsRegion");
  const masterSecretArn = stringProp(boundaryProps, "masterSecretArn");
  const dynamodbEndpointUrl = stringProp(boundaryProps, "dynamodbEndpointUrl");
  const replayTableName = stringProp(asRecord(replayStore?.props), "name");
  if (
    applicationSecretArns.length !== 2 ||
    namespace === undefined ||
    awsRegion === undefined ||
    masterSecretArn === undefined ||
    dynamodbEndpointUrl === undefined ||
    replayTableName === undefined ||
    runtimePlacement === undefined ||
    privilegedPlacement === undefined
  ) {
    return undefined;
  }
  const exactPlacementExpression = (profile: PlacementProfile): string => {
    const nodeKey = JSON.stringify(profile.nodePoolKey);
    const nodeValue = JSON.stringify(profile.nodePoolValue);
    return `has(object.spec.runtimeClassName) && object.spec.runtimeClassName == ${JSON.stringify(
      profile.runtimeClassName,
    )} && has(object.spec.nodeSelector) && object.spec.nodeSelector.size() == 1 && object.spec.nodeSelector[${nodeKey}] == ${nodeValue} && has(object.spec.affinity) && has(object.spec.affinity.nodeAffinity) && has(object.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution) && object.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms.size() == 1 && object.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[0].matchExpressions.size() == 1 && object.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[0].matchExpressions[0].key == ${nodeKey} && object.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[0].matchExpressions[0].operator == "In" && object.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[0].matchExpressions[0].values == [${nodeValue}] && has(object.spec.tolerations) && object.spec.tolerations.size() == 1 && object.spec.tolerations[0].key == ${JSON.stringify(
      profile.tolerationKey,
    )} && object.spec.tolerations[0].operator == "Equal" && object.spec.tolerations[0].value == ${JSON.stringify(
      profile.tolerationValue,
    )} && object.spec.tolerations[0].effect == ${JSON.stringify(
      profile.tolerationEffect,
    )} && object.spec.schedulerName == ${JSON.stringify(
      profile.schedulerName,
    )} && object.spec.priorityClassName == ${JSON.stringify(profile.priorityClassName)}`;
  };
  const envelopes: string[] = [];
  for (const kind of IDENTITY_KINDS) {
    const workload = asRecord(workloads?.[kind]);
    const roleArn = stringProp(asRecord(roleByKind.get(kind)?.props), "arn");
    const image = stringProp(workload, "image");
    const command = strings(workload?.command);
    if (roleArn === undefined || image === undefined || command.length === 0) return undefined;
    const baseEnvironment = [
      { name: "AWS_REGION", value: awsRegion },
      { name: "AWS_DEFAULT_REGION", value: awsRegion },
      { name: "AWS_STS_REGIONAL_ENDPOINTS", value: "regional" },
      { name: "AWS_ROLE_ARN", value: roleArn },
      {
        name: "AWS_WEB_IDENTITY_TOKEN_FILE",
        value: "/var/run/secrets/eks.amazonaws.com/serviceaccount/token",
      },
    ];
    const environment =
      kind === "runtime"
        ? [
            ...baseEnvironment,
            {
              name: "BROKER_URL",
              value: `https://${name}-broker.${namespace}.svc.cluster.local:${String(
                asRecord(workloads?.broker)?.port,
              )}`,
            },
            {
              name: "CAPABILITY_AUDIENCE",
              value: stringProp(capability, "audience"),
            },
          ]
        : kind === "broker"
          ? [
              ...baseEnvironment,
              { name: "DATABASE_HOST", value: stringProp(database, "endpoint") },
              { name: "DATABASE_PORT", value: String(database?.port) },
              { name: "APPLICATION_SECRET_A_ARN", value: applicationSecretArns[0] },
              { name: "APPLICATION_SECRET_B_ARN", value: applicationSecretArns[1] },
              { name: "CAPABILITY_ISSUER", value: stringProp(capability, "issuer") },
              { name: "CAPABILITY_AUDIENCE", value: stringProp(capability, "audience") },
              { name: "CAPABILITY_JWKS_JSON", value: stringProp(capability, "jwksJson") },
              {
                name: "CAPABILITY_MAX_TTL_SECONDS",
                value: String(capability?.maxTtlSeconds),
              },
              { name: "CAPABILITY_REPLAY_TABLE", value: replayTableName },
              { name: "AWS_ENDPOINT_URL_DYNAMODB", value: dynamodbEndpointUrl },
            ]
          : [
              ...baseEnvironment,
              { name: "DATABASE_HOST", value: stringProp(database, "endpoint") },
              { name: "DATABASE_PORT", value: String(database?.port) },
              { name: "MASTER_SECRET_ARN", value: masterSecretArn },
              { name: "APPLICATION_SECRET_A_ARN", value: applicationSecretArns[0] },
              { name: "APPLICATION_SECRET_B_ARN", value: applicationSecretArns[1] },
            ];
    if (
      environment.some((entry) => typeof entry.name !== "string" || typeof entry.value !== "string")
    ) {
      return undefined;
    }
    const environmentExpression = `has(object.spec.containers[0].env) && object.spec.containers[0].env.size() == ${environment.length} && ${environment
      .map(
        (entry, index) =>
          `object.spec.containers[0].env[${index}].name == ${JSON.stringify(entry.name)} && has(object.spec.containers[0].env[${index}].value) && object.spec.containers[0].env[${index}].value == ${JSON.stringify(entry.value)} && !has(object.spec.containers[0].env[${index}].valueFrom)`,
      )
      .join(" && ")}`;
    const args = Array.isArray(workload?.args) ? strings(workload?.args) : undefined;
    const expectedArgs =
      args === undefined
        ? "(!has(c.args) || c.args.size() == 0)"
        : `(has(c.args) && c.args == ${celStringList(args)})`;
    const expectedPorts =
      kind === "runtime" || kind === "broker"
        ? `(has(c.ports) && c.ports.size() == 1 && c.ports[0].name == "https" && c.ports[0].containerPort == ${String(workload?.port)} && (!has(c.ports[0].protocol) || c.ports[0].protocol == "TCP"))`
        : "(!has(c.ports) || c.ports.size() == 0)";
    const exactContainerControls = `object.spec.containers.all(c, c.imagePullPolicy == "IfNotPresent" && ${expectedArgs} && ${expectedPorts} && (!has(c.lifecycle)) && (!has(c.livenessProbe)) && (!has(c.readinessProbe)) && (!has(c.startupProbe)) && (!has(c.stdin) || c.stdin == false) && (!has(c.stdinOnce) || c.stdinOnce == false) && (!has(c.tty) || c.tty == false) && (!has(c.workingDir) || c.workingDir == "") && has(c.resources) && c.resources.requests.cpu == "100m" && c.resources.requests.memory == "128Mi" && c.resources.limits.cpu == "1" && c.resources.limits.memory == "512Mi")`;
    const expectedPlacement = kind === "runtime" ? runtimePlacement : privilegedPlacement;
    envelopes.push(
      `(object.spec.serviceAccountName == ${JSON.stringify(
        protectedServiceAccounts[IDENTITY_KINDS.indexOf(kind)],
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
        image,
      )} && has(object.spec.containers[0].command) && object.spec.containers[0].command == ${celStringList(
        command,
      )} && ${environmentExpression} && ${exactVolumeMounts} && ${exactContainerControls} && ${exactPlacementExpression(
        expectedPlacement,
      )})`,
    );
  }
  return [
    `!${protectedPod} || (${envelopes.join(" || ")})`,
    `!${protectedPod} || ((!has(object.spec.hostNetwork) || object.spec.hostNetwork == false) && (!has(object.spec.hostPID) || object.spec.hostPID == false) && (!has(object.spec.hostIPC) || object.spec.hostIPC == false) && (!has(object.spec.shareProcessNamespace) || object.spec.shareProcessNamespace == false) && (!has(object.spec.hostAliases) || object.spec.hostAliases.size() == 0) && (!has(object.spec.dnsConfig)) && (!has(object.spec.dnsPolicy) || object.spec.dnsPolicy == "ClusterFirst") && (!has(object.spec.initContainers) || object.spec.initContainers.size() == 0) && (!has(object.spec.ephemeralContainers) || object.spec.ephemeralContainers.size() == 0) && object.spec.automountServiceAccountToken == false && object.spec.enableServiceLinks == false && has(object.spec.securityContext) && object.spec.securityContext.runAsNonRoot == true && object.spec.securityContext.seccompProfile.type == "RuntimeDefault" && object.spec.containers.all(c, has(c.securityContext) && (!has(c.securityContext.privileged) || c.securityContext.privileged == false) && c.securityContext.runAsNonRoot == true && c.securityContext.allowPrivilegeEscalation == false && c.securityContext.readOnlyRootFilesystem == true && (!has(c.securityContext.procMount) || c.securityContext.procMount == "Default") && c.securityContext.seccompProfile.type == "RuntimeDefault" && c.securityContext.capabilities.drop.size() == 1 && c.securityContext.capabilities.drop[0] == "ALL" && (!has(c.securityContext.capabilities.add) || c.securityContext.capabilities.add.size() == 0)))`,
    `!${protectedPod} || (object.spec.containers.all(c, (!has(c.envFrom) || c.envFrom.size() == 0) && (!has(c.env) || c.env.all(e, !has(e.valueFrom) && (!has(e.valueFrom) || !has(e.valueFrom.secretKeyRef))))) && object.spec.volumes.size() == 2 && object.spec.volumes.all(v, !has(v.secret) && (!has(v.projected) || v.projected.sources.all(s, !has(s.secret)))) && object.spec.volumes.exists(v, v.name == "aws-iam-token" && has(v.projected) && v.projected.defaultMode == 292 && v.projected.sources.size() == 1 && has(v.projected.sources[0].serviceAccountToken) && v.projected.sources[0].serviceAccountToken.audience == "sts.amazonaws.com" && v.projected.sources[0].serviceAccountToken.expirationSeconds == 900 && v.projected.sources[0].serviceAccountToken.path == "token") && object.spec.volumes.exists(v, v.name == "tmp" && has(v.emptyDir) && v.emptyDir.sizeLimit == "64Mi"))`,
  ];
}

function expectedNetworkPolicyProps(
  name: string,
  namespace: string,
  kind: IdentityKind,
  boundaryProps: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const labels = {
    "app.kubernetes.io/name": `${name}-${kind}`,
    "app.kubernetes.io/part-of": name,
    "hulumi.dev/component": "BrokeredAuroraPostgresBoundary",
    "hulumi.dev/boundary": name,
    "hulumi.dev/identity-kind": kind,
  };
  const labelsFor = (target: IdentityKind) => ({
    ...labels,
    "app.kubernetes.io/name": `${name}-${target}`,
    "hulumi.dev/identity-kind": target,
  });
  const database = asRecord(boundaryProps?.database);
  const workloads = asRecord(boundaryProps?.workloads);
  const dnsResolverCidrs = strings(boundaryProps?.dnsResolverCidrs);
  const endpointCidrs = strings(boundaryProps?.endpointCidrs);
  const dnsEgress = {
    to: dnsResolverCidrs.map((cidr) => ({ ipBlock: { cidr } })),
    ports: [
      { protocol: "UDP", port: 53 },
      { protocol: "TCP", port: 53 },
    ],
  };
  if (kind === "runtime") {
    const runtimeIngress = asRecord(boundaryProps?.runtimeIngress);
    return {
      metadata: {
        name: `${name}-runtime-closed-egress`,
        namespace,
        labels,
      },
      spec: {
        podSelector: { matchLabels: labels },
        policyTypes: ["Ingress", "Egress"],
        ingress:
          runtimeIngress === undefined
            ? []
            : [
                {
                  from: [
                    {
                      namespaceSelector: {
                        matchLabels: {
                          "kubernetes.io/metadata.name": runtimeIngress.callerNamespace,
                        },
                      },
                      podSelector: {
                        matchLabels: asRecord(runtimeIngress.callerPodSelector),
                      },
                    },
                  ],
                  ports: [
                    {
                      protocol: "TCP",
                      port: asRecord(workloads?.runtime)?.port,
                    },
                  ],
                },
              ],
        egress: [
          {
            to: [{ podSelector: { matchLabels: labelsFor("broker") } }],
            ports: [
              {
                protocol: "TCP",
                port: asRecord(workloads?.broker)?.port,
              },
            ],
          },
          dnsEgress,
        ],
      },
    };
  }
  const egress = [
    {
      to: strings(database?.cidrs).map((cidr) => ({ ipBlock: { cidr } })),
      ports: [{ protocol: "TCP", port: database?.port }],
    },
    {
      to: endpointCidrs.map((cidr) => ({ ipBlock: { cidr } })),
      ports: [{ protocol: "TCP", port: 443 }],
    },
    dnsEgress,
  ];
  return {
    metadata: {
      name: `${name}-${kind}-closed-network`,
      namespace,
      labels,
    },
    spec: {
      podSelector: { matchLabels: labels },
      policyTypes: ["Ingress", "Egress"],
      ingress:
        kind === "broker"
          ? [
              {
                from: [{ podSelector: { matchLabels: labelsFor("runtime") } }],
                ports: [
                  {
                    protocol: "TCP",
                    port: asRecord(workloads?.broker)?.port,
                  },
                ],
              },
            ]
          : [],
      egress,
    },
  };
}

function networkPolicySelectsLabels(
  resource: PolicyResource,
  namespace: string,
  labels: Readonly<Record<string, string>>,
): boolean {
  const props = asRecord(resource.props);
  const metadata = asRecord(props?.metadata);
  if (resource.type !== NETWORK_POLICY_TYPE || metadata?.namespace !== namespace) return false;
  const selector = asRecord(asRecord(props?.spec)?.podSelector);
  if (selector === undefined) return true;
  const matchLabels = asRecord(selector.matchLabels) ?? {};
  if (
    Object.entries(matchLabels).some(
      ([key, value]) => typeof value !== "string" || labels[key] !== value,
    )
  ) {
    return false;
  }
  const expressions = Array.isArray(selector.matchExpressions)
    ? selector.matchExpressions.map(asRecord)
    : [];
  for (const expression of expressions) {
    const key = stringProp(expression, "key");
    const operator = stringProp(expression, "operator");
    if (key === undefined || operator === undefined) return true;
    const actual = labels[key];
    const values = strings(expression?.values);
    if (operator === "In" && (actual === undefined || !values.includes(actual))) return false;
    if (operator === "NotIn" && actual !== undefined && values.includes(actual)) return false;
    if (operator === "Exists" && actual === undefined) return false;
    if (operator === "DoesNotExist" && actual !== undefined) return false;
    if (!["In", "NotIn", "Exists", "DoesNotExist"].includes(operator)) return true;
  }
  return true;
}

function validateBoundary(
  boundary: PolicyResource,
  resources: readonly PolicyResource[],
  reportViolation: (message: string) => void,
): void {
  const name = boundary.name;
  const componentOutputs = asRecord(boundary.props);
  const props = asRecord(componentOutputs?.policyContract);
  if (props === undefined) {
    reportViolation(
      `${BROKERED_PG_1_RULE_ID}: ${name} must publish the BrokeredAuroraPostgresBoundary policyContract; update @hulumi/platform-patterns and @hulumi/policies together. Docs: ${DOCS_URL}`,
    );
    return;
  }
  const namespace = typeof props?.namespace === "string" ? props.namespace : "";
  const oidcProviderArn = typeof props?.oidcProviderArn === "string" ? props.oidcProviderArn : "";
  const oidcIssuer = typeof props?.oidcIssuer === "string" ? props.oidcIssuer : "";
  const scoped = boundaryResources(resources, boundary);
  const roles = scoped.filter((resource) => resource.type === IAM_ROLE_TYPE);
  const serviceAccounts = scoped.filter((resource) => resource.type === SERVICE_ACCOUNT_TYPE);
  const roleByKind = new Map<IdentityKind, PolicyResource>();
  const awsRegion = stringProp(props, "awsRegion");
  const applicationSecretNames = strings(props?.applicationSecretNames);
  const oidcArn = parseArn(oidcProviderArn);
  const masterSecretArn = stringProp(props, "masterSecretArn");
  const masterArn = parseArn(masterSecretArn);
  const kmsKeyArn = stringProp(props, "kmsKeyArn");
  const kmsArn = parseArn(kmsKeyArn);
  const validBoundaryArnContext =
    awsRegion !== undefined &&
    oidcArn?.service === "iam" &&
    oidcArn.region === "" &&
    oidcArn.resource.startsWith("oidc-provider/") &&
    masterArn?.service === "secretsmanager" &&
    masterArn.region === awsRegion &&
    masterArn.partition === oidcArn.partition &&
    masterArn.account === oidcArn.account &&
    masterArn.resource.startsWith("secret:") &&
    kmsArn?.service === "kms" &&
    kmsArn.region === awsRegion &&
    kmsArn.partition === oidcArn.partition &&
    kmsArn.account === oidcArn.account &&
    kmsArn.resource.startsWith("key/");
  if (!validBoundaryArnContext) {
    reportViolation(
      `${BROKERED_PG_1_RULE_ID}: ${name} boundary IAM, master-secret, and KMS ARNs must use one exact partition, region, and 12-digit account. Docs: ${DOCS_URL}`,
    );
  }

  const secureSecretComponents = scoped.filter((resource) => resource.type === SECURE_SECRET_TYPE);
  const applicationSecrets = scoped.filter(
    (resource) => resource.type === SECRETS_MANAGER_SECRET_TYPE,
  );
  const applicationSecretArns: string[] = [];
  const componentContracts = secureSecretComponents.map((resource) => {
    const componentProps = asRecord(resource.props);
    return {
      resource,
      secretArn: previewStringProp(componentProps, "secretArn"),
    };
  });
  const childContracts = applicationSecrets.map((resource) => {
    const secretProps = asRecord(resource.props);
    return {
      resource,
      name: stringProp(secretProps, "name"),
      kmsKeyId: stringProp(secretProps, "kmsKeyId"),
      arn: previewStringProp(secretProps, "arn"),
    };
  });
  let exactApplicationSecretChildren =
    applicationSecretNames.length === 2 &&
    secureSecretComponents.length === 2 &&
    applicationSecrets.length === 2;
  const matchedComponentUrns = new Set<string>();
  for (const secretName of applicationSecretNames) {
    const matchingSecrets = childContracts.filter((contract) => contract.name === secretName);
    if (matchingSecrets.length !== 1) {
      exactApplicationSecretChildren = false;
      continue;
    }
    const secret = matchingSecrets[0];
    const matchingComponents = componentContracts.filter(
      (contract) => secret.resource.parent?.urn === contract.resource.urn,
    );
    if (
      matchingComponents.length !== 1 ||
      matchedComponentUrns.has(matchingComponents[0]?.resource.urn ?? "") ||
      secret.kmsKeyId !== kmsKeyArn
    ) {
      exactApplicationSecretChildren = false;
      continue;
    }
    const component = matchingComponents[0];
    matchedComponentUrns.add(component.resource.urn);
    const componentArn = component.secretArn;
    const arn = secret.arn;
    // Both ARNs are provider-generated and may be unknown (or absent) together
    // on the first create preview. Contain that deferral to ARN correlation so
    // known child-parent and KMS inputs remain mandatory on the same preview.
    if (componentArn.unknown !== arn.unknown) {
      exactApplicationSecretChildren = false;
      continue;
    }
    if (componentArn.unknown && arn.unknown) continue;
    if ((componentArn.value === undefined) !== (arn.value === undefined)) {
      exactApplicationSecretChildren = false;
      continue;
    }
    if (componentArn.value === undefined || arn.value === undefined) {
      exactApplicationSecretChildren = false;
      continue;
    }
    if (componentArn.value !== arn.value) {
      exactApplicationSecretChildren = false;
      continue;
    }
    const parsed = parseArn(arn.value);
    const escapedName = secretName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const exactContext =
      kmsKeyArn !== undefined &&
      parsed?.service === "secretsmanager" &&
      parsed.partition === oidcArn?.partition &&
      parsed.region === awsRegion &&
      parsed.account === oidcArn?.account &&
      (parsed.resource === `secret:${secretName}` ||
        new RegExp(`^secret:${escapedName}-[A-Za-z0-9]{6}$`, "u").test(parsed.resource));
    if (exactContext) {
      applicationSecretArns.push(arn.value);
    } else {
      exactApplicationSecretChildren = false;
    }
  }
  if (!exactApplicationSecretChildren) {
    reportViolation(
      `${BROKERED_PG_1_RULE_ID}: ${name} requires each application-secret SecureSecret output to correlate to exactly one direct Secrets Manager child using the exact boundary KMS key and the same full ARN in the boundary partition, region, and account. Docs: ${DOCS_URL}`,
    );
  }

  // Validate every known trust policy before reading any provider-generated
  // role ARN. A first-create unknown on an earlier ServiceAccount must not
  // suppress a known trust violation on a later identity.
  for (const kind of IDENTITY_KINDS) {
    const matchingRoles = roles.filter((resource) => identityKind(resource) === kind);
    const matchingAccounts = serviceAccounts.filter((resource) => identityKind(resource) === kind);
    if (matchingRoles.length !== 1 || matchingAccounts.length !== 1) continue;
    const role = matchingRoles[0];
    const account = matchingAccounts[0];
    if (
      hasExactIrsaTrust(
        role,
        namespace,
        serviceAccountName(account),
        oidcProviderArn,
        oidcIssuer,
      ) === false
    ) {
      reportViolation(
        `${BROKERED_PG_1_RULE_ID}: ${kind} role ${role.urn} lacks the sole exact provider+audience+subject IRSA trust statement for its ServiceAccount. Docs: ${DOCS_URL}`,
      );
    }
  }

  for (const kind of IDENTITY_KINDS) {
    const matchingRoles = roles.filter((resource) => identityKind(resource) === kind);
    const matchingAccounts = serviceAccounts.filter((resource) => identityKind(resource) === kind);
    if (matchingRoles.length !== 1 || matchingAccounts.length !== 1) {
      reportViolation(
        `${BROKERED_PG_1_RULE_ID}: ${name} requires exactly one ${kind} IAM role and ServiceAccount. Docs: ${DOCS_URL}`,
      );
      continue;
    }
    const role = matchingRoles[0];
    roleByKind.set(kind, role);
    const account = matchingAccounts[0];
    const accountMetadata = asRecord(asRecord(account.props)?.metadata);
    const accountAnnotations = asRecord(accountMetadata?.annotations);
    if (tagsOf(role)?.["hulumi:iac-role"] !== undefined) {
      reportViolation(
        `${BROKERED_PG_1_RULE_ID}: ${kind} workload role ${role.urn} must not carry hulumi:iac-role. Docs: ${DOCS_URL}`,
      );
    }
    const annotatedRoleArn = accountAnnotations?.["eks.amazonaws.com/role-arn"];
    const regionalStsAnnotation = accountAnnotations?.["eks.amazonaws.com/sts-regional-endpoints"];
    const roleArn = stringProp(asRecord(role.props), "arn");
    const parsedRoleArn = parseArn(roleArn);
    const exactRoleArn =
      roleArn !== undefined &&
      parsedRoleArn?.service === "iam" &&
      parsedRoleArn.region === "" &&
      parsedRoleArn.partition === oidcArn?.partition &&
      parsedRoleArn.account === oidcArn?.account &&
      parsedRoleArn.resource === `role/${actualResourceName(role)}`;
    if (
      accountMetadata?.namespace !== namespace ||
      asRecord(account.props)?.automountServiceAccountToken !== false ||
      !exactRoleArn ||
      annotatedRoleArn !== roleArn ||
      regionalStsAnnotation !== "true"
    ) {
      reportViolation(
        `${BROKERED_PG_1_RULE_ID}: ${kind} ServiceAccount must bind its authoritative full IAM role ARN, regional STS annotation, namespace, and disabled token automount. Docs: ${DOCS_URL}`,
      );
    }
    const roleCandidates = candidateIds(role);
    roleCandidates.add(actualResourceName(role));
    const managedPolicyArns = strings(asRecord(role.props)?.managedPolicyArns);
    const managedAttachments = resources.filter((resource) => {
      const attachmentProps = asRecord(resource.props);
      if (resource.type === ROLE_POLICY_ATTACHMENT_TYPE) {
        const roleRef = attachmentProps?.role;
        return typeof roleRef === "string" && roleCandidates.has(roleRef);
      }
      if (resource.type === POLICY_ATTACHMENT_TYPE) {
        return strings(attachmentProps?.roles).some((roleRef) => roleCandidates.has(roleRef));
      }
      return false;
    });
    if (managedPolicyArns.length > 0 || managedAttachments.length > 0) {
      reportViolation(
        `${BROKERED_PG_1_RULE_ID}: ${kind} role ${role.urn} must not receive managed-policy ARNs or policy attachments. Docs: ${DOCS_URL}`,
      );
    }
    const allowedByKind: Record<IdentityKind, Set<string>> = {
      runtime: new Set(),
      broker: new Set([
        "secretsmanager:getsecretvalue",
        "secretsmanager:describesecret",
        "kms:decrypt",
        "dynamodb:putitem",
        "dynamodb:getitem",
        "dynamodb:describetable",
      ]),
      migrator: new Set([
        "secretsmanager:getsecretvalue",
        "secretsmanager:describesecret",
        "kms:decrypt",
      ]),
      rotation: new Set([
        "secretsmanager:getsecretvalue",
        "secretsmanager:describesecret",
        "secretsmanager:putsecretvalue",
        "secretsmanager:updatesecretversionstage",
        "kms:decrypt",
        "kms:generatedatakey",
      ]),
    };
    const inlinePolicies = rolePoliciesFor(resources, role);
    const unsafeInlineStatements = inlinePolicies
      .flatMap((policy) => statements(asRecord(policy.props)?.policy))
      .filter((statement) => {
        if (statement.NotAction !== undefined || statement.NotResource !== undefined) return true;
        if (statement.Effect !== "Allow") return false;
        const actions = strings(statement.Action).map((action) => action.toLowerCase());
        const resourcesInStatement = strings(statement.Resource);
        return (
          actions.length === 0 ||
          actions.some((action) => action.includes("*") || !allowedByKind[kind].has(action)) ||
          resourcesInStatement.length === 0 ||
          resourcesInStatement.some((resource) => resource === "*" || resource.includes("*"))
        );
      });
    if (unsafeInlineStatements.length > 0 || (kind === "runtime" && inlinePolicies.length > 0)) {
      reportViolation(
        `${BROKERED_PG_1_RULE_ID}: ${kind} role ${role.urn} has an unexpected wildcard, NotAction/NotResource, or non-allowlisted inline authority statement. Docs: ${DOCS_URL}`,
      );
    }
  }

  const runtimeRole = roles.find((resource) => identityKind(resource) === "runtime");
  if (runtimeRole !== undefined) {
    const forbidden = rolePoliciesFor(resources, runtimeRole)
      .flatMap(allowedActions)
      .filter(
        (action) =>
          action.startsWith("secretsmanager:") ||
          action.startsWith("kms:") ||
          action.startsWith("rds:") ||
          action.startsWith("rds-db:") ||
          action.startsWith("dynamodb:") ||
          action === "sts:assumerole" ||
          action === "iam:passrole",
      );
    if (forbidden.length > 0) {
      reportViolation(
        `${BROKERED_PG_1_RULE_ID}: runtime role ${runtimeRole.urn} has forbidden secret/database/assume-pass authority: ${forbidden.join(", ")}. Docs: ${DOCS_URL}`,
      );
    }
  }

  const brokerRole = roles.find((resource) => identityKind(resource) === "broker");
  if (brokerRole !== undefined && masterSecretArn !== undefined) {
    const brokerPolicies = rolePoliciesFor(resources, brokerRole);
    const brokerResources = brokerPolicies.flatMap(allowedResources);
    if (brokerResources.includes(masterSecretArn) || brokerResources.includes("*")) {
      reportViolation(
        `${BROKERED_PG_1_RULE_ID}: broker role ${brokerRole.urn} can read the master secret. Docs: ${DOCS_URL}`,
      );
    }
    const brokerGetStatements = brokerPolicies
      .flatMap((policy) => statements(asRecord(policy.props)?.policy))
      .filter(
        (statement) =>
          statement.Effect === "Allow" &&
          strings(statement.Action)
            .map((action) => action.toLowerCase())
            .includes("secretsmanager:getsecretvalue"),
      );
    if (
      brokerGetStatements.length !== 1 ||
      asRecord(asRecord(brokerGetStatements[0]?.Condition)?.StringEquals)?.[
        "secretsmanager:VersionStage"
      ] !== "AWSCURRENT"
    ) {
      reportViolation(
        `${BROKERED_PG_1_RULE_ID}: broker GetSecretValue authority must be scoped to the AWSCURRENT stage on exact application secrets. Docs: ${DOCS_URL}`,
      );
    }
  }

  const allowStatementsFor = (kind: IdentityKind): Record<string, unknown>[] => {
    const role = roles.find((resource) => identityKind(resource) === kind);
    return role === undefined
      ? []
      : rolePoliciesFor(resources, role)
          .flatMap((policy) => statements(asRecord(policy.props)?.policy))
          .filter((statement) => statement.Effect === "Allow");
  };
  const exactAuthorityFor = (kind: "broker" | "migrator" | "rotation"): boolean => {
    const allow = allowStatementsFor(kind);
    const expectedSecrets =
      kind === "broker"
        ? applicationSecretArns
        : [...applicationSecretArns, String(masterSecretArn ?? "")];
    const kms = allow.filter((statement) => hasExactActions(statement, ["kms:Decrypt"]));
    if (
      !exactApplicationSecretChildren ||
      kms.length !== 1 ||
      kmsKeyArn === undefined ||
      awsRegion === undefined ||
      !sameStrings(strings(kms[0].Resource), [kmsKeyArn]) ||
      !exactKmsCondition(kms[0], awsRegion, expectedSecrets)
    ) {
      return false;
    }
    if (kind === "rotation") {
      const dataKeys = allow.filter((statement) =>
        hasExactActions(statement, ["kms:GenerateDataKey"]),
      );
      const current = allow.filter((statement) =>
        hasExactActions(statement, ["secretsmanager:GetSecretValue"]),
      );
      const describe = allow.filter((statement) =>
        hasExactActions(statement, ["secretsmanager:DescribeSecret"]),
      );
      const applicationWrites = allow.filter((statement) =>
        hasExactActions(statement, [
          "secretsmanager:PutSecretValue",
          "secretsmanager:UpdateSecretVersionStage",
        ]),
      );
      return (
        allow.length === 5 &&
        dataKeys.length === 1 &&
        current.length === 1 &&
        describe.length === 1 &&
        applicationWrites.length === 1 &&
        sameStrings(strings(dataKeys[0].Resource), [kmsKeyArn]) &&
        exactKmsCondition(dataKeys[0], awsRegion, applicationSecretArns) &&
        sameStrings(strings(current[0].Resource), expectedSecrets) &&
        sameStrings(strings(describe[0].Resource), expectedSecrets) &&
        sameStrings(strings(applicationWrites[0].Resource), applicationSecretArns) &&
        exactCurrentStageCondition(current[0]) &&
        describe[0].Condition === undefined &&
        applicationWrites[0].Condition === undefined
      );
    }
    const current = allow.filter((statement) =>
      hasExactActions(statement, ["secretsmanager:GetSecretValue"]),
    );
    const describe = allow.filter((statement) =>
      hasExactActions(statement, ["secretsmanager:DescribeSecret"]),
    );
    const expectedStatementCount = kind === "broker" ? 4 : 3;
    return (
      allow.length === expectedStatementCount &&
      current.length === 1 &&
      describe.length === 1 &&
      sameStrings(strings(current[0].Resource), expectedSecrets) &&
      sameStrings(strings(describe[0].Resource), expectedSecrets) &&
      exactCurrentStageCondition(current[0]) &&
      describe[0].Condition === undefined
    );
  };
  const rotationWritesMaster = allowStatementsFor("rotation").some(
    (statement) =>
      (hasExactActions(statement, ["secretsmanager:PutSecretValue"]) ||
        strings(statement.Action)
          .map((action) => action.toLowerCase())
          .some(
            (action) =>
              action === "secretsmanager:putsecretvalue" ||
              action === "secretsmanager:updatesecretversionstage",
          )) &&
      masterSecretArn !== undefined &&
      strings(statement.Resource).includes(masterSecretArn),
  );
  if (rotationWritesMaster) {
    reportViolation(
      `${BROKERED_PG_1_RULE_ID}: rotation master-secret write or stage authority is forbidden; only application slots may be written or staged. Docs: ${DOCS_URL}`,
    );
  }
  for (const kind of ["broker", "migrator", "rotation"] as const) {
    if (!exactAuthorityFor(kind)) {
      reportViolation(
        kind === "rotation"
          ? `${BROKERED_PG_1_RULE_ID}: rotation kms:GenerateDataKey authority must use the exact boundary KMS key and only the exact application-secret encryption contexts; all remaining inline authority must match the exact secret, stage, and KMS contract with no additional statements. Docs: ${DOCS_URL}`
          : `${BROKERED_PG_1_RULE_ID}: ${kind} inline authority must match the exact application/master secret, KMS, stage, and replay contract with no additional statements. Docs: ${DOCS_URL}`,
      );
    }
  }

  const runtimeSg = scoped.find(
    (resource) => resource.type === SECURITY_GROUP_TYPE && identityKind(resource) === "runtime",
  );
  const brokerSg = scoped.find(
    (resource) => resource.type === SECURITY_GROUP_TYPE && identityKind(resource) === "broker",
  );
  if (runtimeSg === undefined || brokerSg === undefined) {
    reportViolation(
      `${BROKERED_PG_1_RULE_ID}: ${name} is missing separate runtime and broker security groups. Docs: ${DOCS_URL}`,
    );
  } else {
    const runtimeIds = candidateIds(runtimeSg);
    const brokerIds = candidateIds(brokerSg);
    const runtimeEgress = resources.filter((resource) => {
      if (resource.type !== SG_EGRESS_TYPE) return false;
      const source = asRecord(resource.props)?.securityGroupId;
      return typeof source === "string" && runtimeIds.has(source);
    });
    const hasBrokerPath = runtimeEgress.some((resource) => {
      const target = asRecord(resource.props)?.referencedSecurityGroupId;
      return typeof target === "string" && brokerIds.has(target);
    });
    if (!hasBrokerPath) {
      reportViolation(
        `${BROKERED_PG_1_RULE_ID}: runtime has no exact security-group path to broker. Docs: ${DOCS_URL}`,
      );
    }
    const unsafe = runtimeEgress.filter((resource) => {
      const rule = asRecord(resource.props);
      const target = rule?.referencedSecurityGroupId;
      const isBroker =
        typeof target === "string" && brokerIds.has(target) && rule?.ipProtocol === "tcp";
      const isDns =
        (rule?.ipProtocol === "tcp" || rule?.ipProtocol === "udp") &&
        rule.fromPort === 53 &&
        rule.toPort === 53 &&
        typeof rule.cidrIpv4 === "string" &&
        rule.cidrIpv4 !== "0.0.0.0/0";
      return !isBroker && !isDns;
    });
    if (unsafe.length > 0) {
      reportViolation(
        `${BROKERED_PG_1_RULE_ID}: runtime has database or non-broker egress outside the DNS exception: ${unsafe.map((resource) => resource.urn).join(", ")}. Docs: ${DOCS_URL}`,
      );
    }

    const database = asRecord(props?.database);
    const databaseSecurityGroupId = database?.securityGroupId;
    const brokerEgress = resources.filter((resource) => {
      if (resource.type !== SG_EGRESS_TYPE) return false;
      const source = asRecord(resource.props)?.securityGroupId;
      return typeof source === "string" && brokerIds.has(source);
    });
    if (
      typeof databaseSecurityGroupId === "string" &&
      !brokerEgress.some(
        (resource) =>
          asRecord(resource.props)?.referencedSecurityGroupId === databaseSecurityGroupId &&
          asRecord(resource.props)?.ipProtocol === "tcp" &&
          asRecord(resource.props)?.fromPort === database?.port &&
          asRecord(resource.props)?.toPort === database?.port,
      )
    ) {
      reportViolation(
        `${BROKERED_PG_1_RULE_ID}: broker has no exact security-group path to the database. Docs: ${DOCS_URL}`,
      );
    }
    const dynamodbEndpointSecurityGroupId = asRecord(props?.endpointSecurityGroupIds)?.dynamodb;
    if (
      typeof dynamodbEndpointSecurityGroupId !== "string" ||
      !brokerEgress.some(
        (resource) =>
          asRecord(resource.props)?.referencedSecurityGroupId === dynamodbEndpointSecurityGroupId &&
          asRecord(resource.props)?.ipProtocol === "tcp" &&
          asRecord(resource.props)?.fromPort === 443 &&
          asRecord(resource.props)?.toPort === 443,
      )
    ) {
      reportViolation(
        `${BROKERED_PG_1_RULE_ID}: broker has no exact DynamoDB replay network path through the declared endpoint security group. Docs: ${DOCS_URL}`,
      );
    }
  }

  const securityGroupByKind = new Map<IdentityKind, PolicyResource>();
  for (const kind of IDENTITY_KINDS) {
    const matches = scoped.filter(
      (resource) => resource.type === SECURITY_GROUP_TYPE && identityKind(resource) === kind,
    );
    if (matches.length === 1) securityGroupByKind.set(kind, matches[0]);
  }
  const endpointSecurityGroups = asRecord(props?.endpointSecurityGroupIds);
  const databaseProps = asRecord(props?.database);
  const dnsResolverCidrs = strings(props?.dnsResolverCidrs);
  const isPrivateResolverHost = (cidr: string): boolean => {
    const [address, prefix] = cidr.split("/");
    const octets = address.split(".").map(Number);
    if (
      prefix !== "32" ||
      octets.length !== 4 ||
      octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
    ) {
      return false;
    }
    return (
      octets[0] === 10 ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168)
    );
  };
  if (
    dnsResolverCidrs.length === 0 ||
    dnsResolverCidrs.some((cidr) => !isPrivateResolverHost(cidr))
  ) {
    reportViolation(
      `${BROKERED_PG_1_RULE_ID}: DNS resolver egress must use exact private IPv4 /32 entries; broad resolver CIDRs are forbidden. Docs: ${DOCS_URL}`,
    );
  }
  const placement = asRecord(props?.placement);
  const runtimePlacement = placementProfile(placement?.runtime);
  const privilegedPlacement = placementProfile(placement?.privileged);
  const placementIsDisjoint =
    runtimePlacement !== undefined &&
    privilegedPlacement !== undefined &&
    NODE_RESTRICTION_LABEL.test(runtimePlacement.nodePoolKey) &&
    NODE_RESTRICTION_LABEL.test(privilegedPlacement.nodePoolKey) &&
    runtimePlacement.nodePoolKey === privilegedPlacement.nodePoolKey &&
    runtimePlacement.nodePoolValue !== privilegedPlacement.nodePoolValue &&
    (runtimePlacement.tolerationKey !== privilegedPlacement.tolerationKey ||
      runtimePlacement.tolerationValue !== privilegedPlacement.tolerationValue ||
      runtimePlacement.tolerationEffect !== privilegedPlacement.tolerationEffect) &&
    runtimePlacement.tolerationEffect === "NoSchedule" &&
    privilegedPlacement.tolerationEffect === "NoSchedule";
  if (!placementIsDisjoint) {
    reportViolation(
      `${BROKERED_PG_1_RULE_ID}: runtime and broker/migrator/rotation placement must use exact reviewed disjoint node pools and tolerations under a NodeRestriction-protected label. Docs: ${DOCS_URL}`,
    );
  }
  for (const kind of IDENTITY_KINDS) {
    const securityGroup = securityGroupByKind.get(kind);
    if (securityGroup === undefined) continue;
    const ids = candidateIds(securityGroup);
    const securityGroupProps = asRecord(securityGroup.props);
    if (
      (Array.isArray(securityGroupProps?.ingress) && securityGroupProps.ingress.length > 0) ||
      (Array.isArray(securityGroupProps?.egress) && securityGroupProps.egress.length > 0)
    ) {
      reportViolation(
        `${BROKERED_PG_1_RULE_ID}: ${kind} security group must not use inline ingress or egress rules. Docs: ${DOCS_URL}`,
      );
    }
    const legacyRules = resources.filter((resource) => {
      if (resource.type !== LEGACY_SG_RULE_TYPE) return false;
      const rule = asRecord(resource.props);
      return (
        (typeof rule?.securityGroupId === "string" && ids.has(rule.securityGroupId)) ||
        (typeof rule?.sourceSecurityGroupId === "string" && ids.has(rule.sourceSecurityGroupId))
      );
    });
    if (legacyRules.length > 0) {
      reportViolation(
        `${BROKERED_PG_1_RULE_ID}: ${kind} security group must not use legacy combined SecurityGroupRule grants. Docs: ${DOCS_URL}`,
      );
    }
    const egressRules = resources.filter((resource) => {
      if (resource.type !== SG_EGRESS_TYPE) return false;
      const source = asRecord(resource.props)?.securityGroupId;
      return typeof source === "string" && ids.has(source);
    });
    const brokerIds =
      securityGroupByKind.get("broker") === undefined
        ? new Set<string>()
        : candidateIds(securityGroupByKind.get("broker")!);
    const allowedTarget = (rule: Record<string, unknown>): boolean => {
      const target = rule.referencedSecurityGroupId;
      const protocol = rule.ipProtocol;
      const fromPort = rule.fromPort;
      const toPort = rule.toPort;
      if (kind === "runtime" && typeof target === "string" && brokerIds.has(target)) {
        return (
          protocol === "tcp" &&
          fromPort === asRecord(asRecord(props?.workloads)?.broker)?.port &&
          toPort === asRecord(asRecord(props?.workloads)?.broker)?.port
        );
      }
      const databaseAllowed =
        kind !== "runtime" &&
        target === databaseProps?.securityGroupId &&
        protocol === "tcp" &&
        fromPort === databaseProps?.port &&
        toPort === databaseProps?.port;
      const endpointTargets =
        kind === "broker"
          ? [
              endpointSecurityGroups?.secretsManager,
              endpointSecurityGroups?.kms,
              endpointSecurityGroups?.dynamodb,
            ]
          : kind === "migrator" || kind === "rotation"
            ? [endpointSecurityGroups?.secretsManager, endpointSecurityGroups?.kms]
            : [];
      const endpointAllowed =
        endpointTargets.includes(target) &&
        protocol === "tcp" &&
        fromPort === 443 &&
        toPort === 443;
      const dnsAllowed =
        typeof rule.cidrIpv4 === "string" &&
        dnsResolverCidrs.includes(rule.cidrIpv4) &&
        (protocol === "tcp" || protocol === "udp") &&
        fromPort === 53 &&
        toPort === 53;
      return databaseAllowed || endpointAllowed || dnsAllowed;
    };
    if (egressRules.some((resource) => !allowedTarget(asRecord(resource.props) ?? {}))) {
      reportViolation(
        `${BROKERED_PG_1_RULE_ID}: ${kind} security group has egress outside its exact broker, database, endpoint, and DNS paths. Docs: ${DOCS_URL}`,
      );
    }
    const ingressRules = resources.filter((resource) => {
      if (resource.type !== SG_INGRESS_TYPE) return false;
      const target = asRecord(resource.props)?.securityGroupId;
      return typeof target === "string" && ids.has(target);
    });
    const runtimeIds =
      securityGroupByKind.get("runtime") === undefined
        ? new Set<string>()
        : candidateIds(securityGroupByKind.get("runtime")!);
    const runtimeIngress = asRecord(props?.runtimeIngress);
    const allowedIngress = (rule: Record<string, unknown>): boolean => {
      if (
        kind === "broker" &&
        typeof rule.referencedSecurityGroupId === "string" &&
        runtimeIds.has(rule.referencedSecurityGroupId)
      ) {
        const port = asRecord(asRecord(props?.workloads)?.broker)?.port;
        return rule.ipProtocol === "tcp" && rule.fromPort === port && rule.toPort === port;
      }
      if (
        kind === "runtime" &&
        runtimeIngress !== undefined &&
        rule.referencedSecurityGroupId === runtimeIngress.callerSecurityGroupId
      ) {
        const port = asRecord(asRecord(props?.workloads)?.runtime)?.port;
        return rule.ipProtocol === "tcp" && rule.fromPort === port && rule.toPort === port;
      }
      return false;
    };
    if (ingressRules.some((resource) => !allowedIngress(asRecord(resource.props) ?? {}))) {
      reportViolation(
        `${BROKERED_PG_1_RULE_ID}: ${kind} security group has ingress outside its exact caller/runtime path. Docs: ${DOCS_URL}`,
      );
    }
  }

  const workloadByKind = new Map<IdentityKind, PolicyResource>();
  for (const kind of IDENTITY_KINDS) {
    const matching = scoped.filter(
      (resource) => WORKLOAD_TYPES.has(resource.type) && identityKind(resource) === kind,
    );
    if (matching.length !== 1) {
      reportViolation(
        `${BROKERED_PG_1_RULE_ID}: ${name} requires exactly one ${kind} workload envelope. Docs: ${DOCS_URL}`,
      );
      continue;
    }
    workloadByKind.set(kind, matching[0]);
    const spec = podSpec(matching[0]);
    const containers = Array.isArray(spec?.containers)
      ? spec.containers
          .map(asRecord)
          .filter((entry): entry is Record<string, unknown> => entry !== undefined)
      : [];
    if (
      spec?.serviceAccountName !==
        serviceAccountName(
          serviceAccounts.find((resource) => identityKind(resource) === kind) ??
            ({ name: "", props: {} } as PolicyResource),
        ) ||
      spec === undefined ||
      !podSpecIsRestricted(
        spec,
        kind,
        kind === "runtime" ? runtimePlacement : privilegedPlacement,
      ) ||
      containers.length !== 1 ||
      !containers.every(containerIsRestricted)
    ) {
      reportViolation(
        `${BROKERED_PG_1_RULE_ID}: ${kind} workload must use its exact ServiceAccount, immutable digest, restricted security context, and reviewed placement. Docs: ${DOCS_URL}`,
      );
    }
  }
  for (const kind of IDENTITY_KINDS) {
    const protectedLabels = {
      "app.kubernetes.io/name": `${name}-${kind}`,
      "app.kubernetes.io/part-of": name,
      "hulumi.dev/component": "BrokeredAuroraPostgresBoundary",
      "hulumi.dev/boundary": name,
      "hulumi.dev/identity-kind": kind,
    };
    const networkPolicies = resources.filter((resource) =>
      networkPolicySelectsLabels(resource, namespace, protectedLabels),
    );
    const expectedNetwork = expectedNetworkPolicyProps(name, namespace, kind, props);
    if (
      networkPolicies.length !== 1 ||
      !sameStructure(
        comparableNetworkPolicyProps(networkPolicies[0]?.props),
        comparableNetworkPolicyProps(expectedNetwork),
      )
    ) {
      reportViolation(
        `${BROKERED_PG_1_RULE_ID}: ${kind} requires exactly one closed NetworkPolicy; untagged or additive policies selecting the protected workload are forbidden. Docs: ${DOCS_URL}`,
      );
    }
    const securityGroupPolicies = scoped.filter((resource) => {
      return isSecurityGroupPolicy(resource) && identityKind(resource) === kind;
    });
    const securityGroup = securityGroupByKind.get(kind);
    const policyProps = asRecord(securityGroupPolicies[0]?.props);
    const policyMetadata = asRecord(policyProps?.metadata);
    const policySpec = asRecord(policyProps?.spec);
    const podSelector = asRecord(policySpec?.podSelector);
    const groupIds = strings(asRecord(policySpec?.securityGroups)?.groupIds);
    const expectedLabels = {
      "app.kubernetes.io/name": `${name}-${kind}`,
      "app.kubernetes.io/part-of": name,
      "hulumi.dev/component": "BrokeredAuroraPostgresBoundary",
      "hulumi.dev/boundary": name,
      "hulumi.dev/identity-kind": kind,
    };
    if (
      securityGroupPolicies.length !== 1 ||
      securityGroup === undefined ||
      policyMetadata?.namespace !== namespace ||
      !sameStructure(asRecord(podSelector?.matchLabels), expectedLabels) ||
      groupIds.length !== 1 ||
      !candidateIds(securityGroup).has(groupIds[0])
    ) {
      reportViolation(
        `${BROKERED_PG_1_RULE_ID}: ${kind} requires one exact SecurityGroupPolicy selecting its workload and security group. Docs: ${DOCS_URL}`,
      );
    }
  }
  const rollout = asRecord(props?.rollout);
  const rolloutPhase = typeof rollout?.phase === "string" ? rollout.phase : "infrastructure";
  const phaseOrder = ["infrastructure", "migrator", "broker", "runtime", "rotation"];
  const evidence = asRecord(rollout?.evidence);
  const evidenceRef = stringProp(evidence, "immutableRef");
  const evidenceSha = stringProp(evidence, "sha256");
  const refDigest =
    evidenceRef === undefined ? undefined : IMMUTABLE_EVIDENCE_REF.exec(evidenceRef)?.[1];
  const shaDigest = evidenceSha === undefined ? undefined : SHA256_DIGEST.exec(evidenceSha)?.[1];
  const exactEvidence =
    evidence !== undefined &&
    refDigest !== undefined &&
    shaDigest !== undefined &&
    refDigest === shaDigest;
  const runtimeWorkloadSpec = asRecord(workloadByKind.get("runtime")?.props)?.spec;
  const brokerWorkloadSpec = asRecord(workloadByKind.get("broker")?.props)?.spec;
  const migratorWorkloadSpec = asRecord(workloadByKind.get("migrator")?.props)?.spec;
  const rotationWorkloadSpec = asRecord(workloadByKind.get("rotation")?.props)?.spec;
  if (
    !phaseOrder.includes(rolloutPhase) ||
    rollout?.verifiedGates !== undefined ||
    (rolloutPhase !== "infrastructure" && !exactEvidence) ||
    (rolloutPhase === "infrastructure" && evidence !== undefined && !exactEvidence) ||
    asRecord(runtimeWorkloadSpec)?.replicas !== 0 ||
    asRecord(brokerWorkloadSpec)?.replicas !== 0 ||
    asRecord(migratorWorkloadSpec)?.suspend !== true ||
    asRecord(rotationWorkloadSpec)?.suspend !== true
  ) {
    reportViolation(
      `${BROKERED_PG_1_RULE_ID}: self-attested rollout strings are not activation authority; all workloads must remain inert and non-infrastructure handoffs require matching immutable OCI evidence metadata. Docs: ${DOCS_URL}`,
    );
  }

  const replayStores = scoped.filter(
    (resource) =>
      resource.type === DYNAMODB_TABLE_TYPE &&
      tagsOf(resource)?.["hulumi:purpose"] === "capability-replay",
  );
  if (replayStores.length !== 1) {
    reportViolation(
      `${BROKERED_PG_1_RULE_ID}: ${name} requires exactly one capability replay table. Docs: ${DOCS_URL}`,
    );
  } else {
    const replay = asRecord(replayStores[0].props);
    const ttl = asRecord(replay?.ttl);
    const encryption = asRecord(replay?.serverSideEncryption);
    if (
      ttl?.enabled !== true ||
      ttl.attributeName !== "expiresAt" ||
      encryption?.enabled !== true ||
      kmsKeyArn === undefined ||
      encryption.kmsKeyArn !== kmsKeyArn
    ) {
      reportViolation(
        `${BROKERED_PG_1_RULE_ID}: capability replay table must use enabled TTL and the exact boundary KMS key for SSE. Docs: ${DOCS_URL}`,
      );
    }

    if (brokerRole !== undefined) {
      const replayIds = candidateIds(replayStores[0]);
      const brokerDynamoStatements = rolePoliciesFor(resources, brokerRole)
        .flatMap((policy) => statements(asRecord(policy.props)?.policy))
        .filter(
          (statement) =>
            statement.Effect === "Allow" &&
            strings(statement.Action).some((action) =>
              action.toLowerCase().startsWith("dynamodb:"),
            ),
        );
      const brokerDynamoActions = brokerDynamoStatements.flatMap((statement) =>
        strings(statement.Action).map((action) => action.toLowerCase()),
      );
      const brokerDynamoResources = brokerDynamoStatements.flatMap((statement) =>
        strings(statement.Resource),
      );
      const expectedActions = new Set([
        "dynamodb:putitem",
        "dynamodb:getitem",
        "dynamodb:describetable",
      ]);
      const sourceVpce = props?.dynamodbVpcEndpointId;
      const sourceConditions = brokerDynamoStatements.flatMap((statement) => {
        const condition = asRecord(statement.Condition);
        const equals = asRecord(condition?.StringEquals);
        return equals === undefined ? [] : [equals["aws:SourceVpce"]];
      });
      if (
        brokerDynamoStatements.length !== 1 ||
        brokerDynamoActions.length !== expectedActions.size ||
        brokerDynamoActions.some((action) => !expectedActions.has(action)) ||
        brokerDynamoResources.length !== 1 ||
        !replayIds.has(brokerDynamoResources[0]) ||
        typeof sourceVpce !== "string" ||
        sourceConditions.length !== 1 ||
        sourceConditions[0] !== sourceVpce
      ) {
        reportViolation(
          `${BROKERED_PG_1_RULE_ID}: broker must have exactly PutItem/GetItem/DescribeTable on the exact capability replay table through the declared DynamoDB VPC endpoint. Docs: ${DOCS_URL}`,
        );
      }
    }
  }

  const admissionPolicies = scoped.filter((resource) => resource.type === ADMISSION_POLICY_TYPE);
  if (admissionPolicies.length !== 1) {
    reportViolation(
      `${BROKERED_PG_1_RULE_ID}: ${name} requires exactly one scoped fail-closed ValidatingAdmissionPolicy. Docs: ${DOCS_URL}`,
    );
  } else {
    const admissionSpec = asRecord(admissionPolicies[0].props)?.spec;
    const validationExpressions = Array.isArray(asRecord(admissionSpec)?.validations)
      ? (asRecord(admissionSpec)?.validations as unknown[])
          .map(asRecord)
          .map((validation) => validation?.expression)
          .filter((expression): expression is string => typeof expression === "string")
      : [];
    const expectedExpressions = expectedAdmissionExpressions(
      name,
      props,
      serviceAccounts,
      roleByKind,
      applicationSecretArns,
      replayStores.length === 1 ? replayStores[0] : undefined,
    );
    const resourceRules = Array.isArray(
      asRecord(asRecord(admissionSpec)?.matchConstraints)?.resourceRules,
    )
      ? (asRecord(asRecord(admissionSpec)?.matchConstraints)?.resourceRules as unknown[])
      : [];
    const resourceRule = resourceRules.length === 1 ? asRecord(resourceRules[0]) : undefined;
    if (
      asRecord(admissionSpec)?.failurePolicy !== "Fail" ||
      expectedExpressions === undefined ||
      JSON.stringify(validationExpressions) !== JSON.stringify(expectedExpressions) ||
      JSON.stringify(strings(resourceRule?.apiGroups)) !== JSON.stringify([""]) ||
      JSON.stringify(strings(resourceRule?.apiVersions)) !== JSON.stringify(["v1"]) ||
      JSON.stringify(strings(resourceRule?.operations)) !== JSON.stringify(["CREATE", "UPDATE"]) ||
      JSON.stringify(strings(resourceRule?.resources)) !==
        JSON.stringify(["pods", "pods/ephemeralcontainers"])
    ) {
      reportViolation(
        `${BROKERED_PG_1_RULE_ID}: ${name} admission policy does not bind the exact protected identity, image, command, environment, and restricted Pod envelope. Docs: ${DOCS_URL}`,
      );
    }
  }

  const admissionBindings = scoped.filter((resource) => resource.type === ADMISSION_BINDING_TYPE);
  if (admissionBindings.length !== 1) {
    reportViolation(
      `${BROKERED_PG_1_RULE_ID}: ${name} requires exactly one scoped ValidatingAdmissionPolicyBinding. Docs: ${DOCS_URL}`,
    );
  } else if (admissionPolicies.length === 1) {
    const bindingSpec = asRecord(admissionBindings[0].props)?.spec;
    const namespaceLabels = asRecord(
      asRecord(asRecord(bindingSpec)?.matchResources)?.namespaceSelector,
    )?.matchLabels;
    if (
      asRecord(bindingSpec)?.policyName !== metadataName(admissionPolicies[0]) ||
      JSON.stringify(strings(asRecord(bindingSpec)?.validationActions)) !==
        JSON.stringify(["Deny"]) ||
      asRecord(namespaceLabels)?.["kubernetes.io/metadata.name"] !== namespace
    ) {
      reportViolation(
        `${BROKERED_PG_1_RULE_ID}: ${name} admission binding must deny through the exact scoped policy. Docs: ${DOCS_URL}`,
      );
    }
  }

  for (const resource of scoped) {
    if (resource.type === SECRET_VERSION_TYPE) {
      reportViolation(
        `${BROKERED_PG_1_RULE_ID}: SecretVersion ${resource.urn} is forbidden; secret values must not transit Pulumi. Docs: ${DOCS_URL}`,
      );
    } else if (resource.type === KUBERNETES_SECRET_TYPE) {
      reportViolation(
        `${BROKERED_PG_1_RULE_ID}: Kubernetes Secret ${resource.urn} is forbidden in the brokered database composition. Docs: ${DOCS_URL}`,
      );
    } else if (resource.type === RDS_CREDENTIAL_SECRET_TYPE) {
      reportViolation(
        `${BROKERED_PG_1_RULE_ID}: RdsCredentialSecret ${resource.urn} is incompatible with the value-free brokered database composition. Docs: ${DOCS_URL}`,
      );
    }
  }
}

export const brokeredPg1ClosedAuthorityBoundary: StackValidationPolicy = {
  name: BROKERED_PG_1_RULE_ID,
  description:
    "Requires the four-way Aurora/PostgreSQL workload identity split, runtime-to-broker-only authority, value-free secret containers, immutable restricted workloads, and encrypted replay state.",
  enforcementLevel: "mandatory",
  validateStack: (args, reportViolation) => {
    for (const boundary of args.resources.filter((resource) => resource.type === COMPONENT_TYPE)) {
      validateBoundary(boundary, args.resources, reportViolation);
    }
  },
};

export const hulumiBrokeredPostgresBoundaryPackMetadata: PackMetadata = {
  id: "hulumi-brokered-postgres-boundary-pack",
  title: "Hulumi Brokered PostgreSQL Boundary Pack",
  framework: "hulumi",
  frameworkVersion: "1.5.0",
  severity: "critical",
  rules: [
    {
      id: BROKERED_PG_1_RULE_ID,
      title: "Brokered PostgreSQL authority boundary remains closed",
      description: brokeredPg1ClosedAuthorityBoundary.description!,
      severity: "critical",
      enforcement: "mandatory",
      frameworkIds: ["NIST-800-53-r5:AC-3", "NIST-800-53-r5:AC-6"],
      docsUrl: DOCS_URL,
    },
  ],
};
