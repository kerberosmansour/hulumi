// HulumiHardeningPack rules — CrossGuard rule handlers + metadata. The
// actual PolicyPack instance lives in src/aws/packs/hulumi-hardening.ts
// because @pulumi/policy's PolicyPack constructor starts a gRPC server at
// module-load time (only one pack per process). Tests import from THIS
// file to exercise the rule handlers without side effects.
//
// Phased enforcement: H1/H2/H4 mandatory in M2; H3 advisory in M2,
// mandatory in M5 (paired with the SCP template).

import type {
  ResourceValidationPolicy,
  StackValidationPolicy,
  PolicyResource,
} from "@pulumi/policy";

import type { PackMetadata, EnforcementLevel } from "../metadata";
import { matchSuppression, type Suppression } from "./suppressions";
import { federatedIsGithubOidc } from "../github/github-oidc-issuer";
import { urnsShareParentComponent } from "../urn";

export const HULUMI_SECURE_BUCKET_TYPE = "hulumi:baseline:aws:SecureBucket";
export const RAW_S3_BUCKET_TYPES = ["aws:s3/bucket:Bucket", "aws:s3/bucketV2:BucketV2"] as const;
export const IAM_ROLE_TYPE = "aws:iam/role:Role";
const SECRETS_MANAGER_SECRET_POLICY_TYPE = "aws:secretsmanager/secretPolicy:SecretPolicy";
const EC2_LAUNCH_TEMPLATE_TYPE = "aws:ec2/launchTemplate:LaunchTemplate";
const CLOUDWATCH_METRIC_ALARM_TYPE = "aws:cloudwatch/metricAlarm:MetricAlarm";
const EVENT_RULE_TYPE = "aws:cloudwatch/eventRule:EventRule";
const EVENT_TARGET_TYPE = "aws:cloudwatch/eventTarget:EventTarget";
const SECURE_IAM_COMPONENTS = ["SecureIamDeploymentRole", "SecureWorkloadRole"] as const;

// M5 enforcement phase: H3 is now "mandatory" — paired with the SCP
// template at docs/deployment/scp.json. The SCP makes the
// `hulumi:iac-role=true` tag tamper-evident at AWS Organizations level;
// H3 enforces it at preview time. Documented as a v1.0.0 breaking
// change in CHANGELOG.md with migration steps (add tag OR apply SCP).
export const H3_ENFORCEMENT_LEVEL: EnforcementLevel = "mandatory";

const DOCS_BASE =
  "https://github.com/kerberosmansour/hulumi/blob/main/docs/components/secure-bucket.md";
const H2_DOCS = "https://github.com/kerberosmansour/hulumi/blob/main/docs/tiers.md#state-backend";
const STATE_BACKEND_DOCS =
  "https://github.com/kerberosmansour/hulumi/blob/main/docs/components/pulumi-state-backend-foundation.md";
const PRIMITIVES_DOCS =
  "https://github.com/kerberosmansour/hulumi/blob/main/docs/components/aws-secure-primitives.md";
const DETECTION_DOCS =
  "https://github.com/kerberosmansour/hulumi/blob/main/docs/components/security-detection-foundation.md";
const H3_DOCS = "https://github.com/kerberosmansour/hulumi/blob/main/docs/tiers.md#iac-role-tag";
const H4_DOCS =
  "https://github.com/kerberosmansour/hulumi/blob/main/docs/tiers.md#startup-hardened";

function readSuppressions(config: Record<string, unknown> | undefined): Suppression[] {
  const raw = config?.suppressions;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is Suppression => {
    if (x === null || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    return typeof o.ruleId === "string" && typeof o.reason === "string";
  });
}

function isSecureBucketManagedBucketUrn(urn: string): boolean {
  const trustedParent = `${HULUMI_SECURE_BUCKET_TYPE}$`;
  const trustedParentIdx = urn.indexOf(trustedParent);
  if (trustedParentIdx === -1) return false;

  const parentUrn = urn.slice(0, trustedParentIdx);
  const childUrn = urn.slice(trustedParentIdx + trustedParent.length);

  const childTypeMarker = RAW_S3_BUCKET_TYPES.map((type) => `${type}::`).find((marker) =>
    childUrn.startsWith(marker),
  );
  if (childTypeMarker === undefined) return false;

  const childName = childUrn.slice(childTypeMarker.length);
  const parentName = parentUrn.split("::").at(-1) ?? "";
  if (parentName === "" || parentName === "p") return childName.endsWith("-bucket");
  return childName === `${parentName}-bucket`;
}

export const h1BlocksRawBucket: ResourceValidationPolicy = {
  name: "HULUMI-H1-no-raw-bucket",
  description:
    "Raw aws.s3.Bucket / aws.s3.BucketV2 is disallowed outside of @hulumi/baseline.aws.SecureBucket. This rule guards against missing hardened-defaults (PublicAccessBlock, SSE-KMS, versioning, BucketOwnerEnforced, TLS-only policy) and enforces tag attribution required by policy H3 and the drift classifier.",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (!(RAW_S3_BUCKET_TYPES as readonly string[]).includes(args.type)) return;
    if (isSecureBucketManagedBucketUrn(args.urn)) return;
    const suppressions = readSuppressions(
      (args.getConfig ? args.getConfig() : undefined) as Record<string, unknown> | undefined,
    );
    if (matchSuppression("HULUMI-H1", args.urn, suppressions).suppressed) return;
    reportViolation(
      `HULUMI-H1: raw ${args.type} detected at ${args.urn}. Use @hulumi/baseline.aws.SecureBucket instead. Docs: ${DOCS_BASE}`,
    );
  },
};

export const h2BlocksUnencryptedStateBackend: StackValidationPolicy = {
  name: "HULUMI-H2-no-unencrypted-state-backend",
  description:
    "Pulumi state backend must not be file:// (leaks state to local disk with no access controls) and must not be an unencrypted S3 backend (state contains provider-opaque secrets in plaintext). For S3 backends where the encryption state cannot be determined from the resource tree, H2 emits an advisory instead of a mandatory violation.",
  enforcementLevel: "mandatory",
  validateStack: (args, reportViolation) => {
    const backend = process.env.PULUMI_BACKEND_URL ?? "";
    const suppressions = readSuppressions(
      (args.getConfig ? args.getConfig() : undefined) as Record<string, unknown> | undefined,
    );
    if (matchSuppression("HULUMI-H2", "stack", suppressions).suppressed) return;
    if (backend === "") return;
    if (backend.startsWith("file://")) {
      reportViolation(
        `HULUMI-H2: Pulumi backend ${backend} is a file:// URL; use Pulumi Cloud or an encrypted S3+DDB backend. Docs: ${H2_DOCS}`,
      );
      return;
    }
    if (backend.startsWith("s3://")) {
      const m = backend.match(/^s3:\/\/([^/?]+)/);
      const bucketName = m ? m[1] : "";
      if (bucketName === "") {
        reportViolation(
          `HULUMI-H2 advisory: Pulumi backend ${backend} is S3-based but the bucket name could not be parsed; encryption not verified. Docs: ${H2_DOCS}`,
          undefined,
        );
        return;
      }
      const backendBucket = args.resources.find((r) => {
        if (!(RAW_S3_BUCKET_TYPES as readonly string[]).includes(r.type)) return false;
        const bucketProp = (r.props as Record<string, unknown>).bucket;
        if (typeof bucketProp === "string" && bucketProp === bucketName) return true;
        return r.name === bucketName;
      });
      if (!backendBucket) {
        reportViolation(
          `HULUMI-H2 advisory: Pulumi backend ${backend} references a bucket not present in the current stack; encryption not verified. Docs: ${H2_DOCS}`,
          undefined,
        );
        return;
      }
      const hasSse = args.resources.some((r) => {
        if (
          r.type !==
            "aws:s3/bucketServerSideEncryptionConfiguration:BucketServerSideEncryptionConfiguration" &&
          r.type !==
            "aws:s3/bucketServerSideEncryptionConfigurationV2:BucketServerSideEncryptionConfigurationV2"
        ) {
          return false;
        }
        const bucketRef = (r.props as Record<string, unknown>).bucket;
        return bucketRef === backendBucket.name || bucketRef === backendBucket.props.id;
      });
      if (!hasSse) {
        reportViolation(
          `HULUMI-H2: Pulumi backend S3 bucket ${bucketName} has no BucketServerSideEncryptionConfiguration sibling in the stack. Docs: ${H2_DOCS}`,
        );
      }
    }
  },
};

function readPulumiSecretsProvider(
  config: Record<string, unknown> | undefined,
): string | undefined {
  const candidates = [
    config?.pulumiSecretsProvider,
    config?.secretsProvider,
    config?.["pulumi:secretsProvider"],
  ];
  return candidates.find((value): value is string => typeof value === "string");
}

export const state1ApprovedSecretsProvider: StackValidationPolicy = {
  name: "STATE-1-approved-pulumi-secrets-provider",
  description:
    "Pulumi stacks that use Hulumi state-backend posture must declare an approved Pulumi secrets provider. For AWS state backends, Hulumi accepts awskms:// providers and rejects missing or passphrase-backed providers so secret material is not protected only by local developer context.",
  enforcementLevel: "mandatory",
  validateStack: (args, reportViolation) => {
    const config = (args.getConfig ? args.getConfig() : undefined) as
      | Record<string, unknown>
      | undefined;
    const suppressions = readSuppressions(config);
    if (matchSuppression("STATE-1", "stack", suppressions).suppressed) return;
    const provider = readPulumiSecretsProvider(config);
    if (provider === undefined || !provider.startsWith("awskms://")) {
      reportViolation(
        `STATE-1: stack is missing an approved Pulumi secrets provider. Configure an awskms:// provider; passphrase and absent providers are not accepted for Hulumi-managed state. Docs: ${STATE_BACKEND_DOCS}`,
      );
    }
  },
};

function parseJsonPolicy(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }
  return asRecord(value);
}

function statementsOf(policy: Record<string, unknown> | undefined): Record<string, unknown>[] {
  const statements = policy?.Statement;
  if (Array.isArray(statements)) {
    return statements.filter((statement): statement is Record<string, unknown> => {
      return statement !== null && typeof statement === "object";
    });
  }
  return statements !== null && typeof statements === "object"
    ? [statements as Record<string, unknown>]
    : [];
}

function valueContainsWildcard(value: unknown): boolean {
  if (typeof value === "string") return value.includes("*");
  if (Array.isArray(value)) return value.some(valueContainsWildcard);
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(valueContainsWildcard);
  }
  return false;
}

function valueIsBroad(value: unknown): boolean {
  if (value === "*") return true;
  if (Array.isArray(value)) return value.some(valueIsBroad);
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(valueIsBroad);
  }
  return false;
}

function roleTrustUsesGithubOidc(statement: Record<string, unknown>): boolean {
  const principal = asRecord(statement.Principal);
  if (principal?.Federated === undefined) return false;
  return federatedIsGithubOidc(principal.Federated);
}

export const primitive1GithubOidcNoWildcard: ResourceValidationPolicy = {
  name: "PRIM-1-github-oidc-no-wildcard",
  description:
    "GitHub OIDC AWS role trust policies must use exact StringEquals subject conditions, never StringLike or wildcard subject values.",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (args.type !== IAM_ROLE_TYPE) return;
    const policy = parseJsonPolicy((args.props as Record<string, unknown>).assumeRolePolicy);
    for (const statement of statementsOf(policy)) {
      if (!roleTrustUsesGithubOidc(statement)) continue;
      const conditions = asRecord(statement.Condition);
      if (conditions === undefined) {
        reportViolation(
          `PRIM-1: GitHub OIDC role ${args.urn} has no exact subject condition. Docs: ${PRIMITIVES_DOCS}`,
        );
        return;
      }
      for (const [operator, condition] of Object.entries(conditions)) {
        const conditionRecord = asRecord(condition);
        const sub = conditionRecord?.["token.actions.githubusercontent.com:sub"];
        if (sub === undefined) continue;
        const baseOperator = operator.split(":").pop() ?? operator;
        if (baseOperator === "StringLike" || valueContainsWildcard(sub)) {
          reportViolation(
            `PRIM-1: GitHub OIDC role ${args.urn} uses wildcard or StringLike subject trust. Docs: ${PRIMITIVES_DOCS}`,
          );
          return;
        }
      }
    }
  },
};

export const primitive2SecretPolicyNoBroadAccess: ResourceValidationPolicy = {
  name: "PRIM-2-secret-policy-no-broad-access",
  description:
    "Secrets Manager resource policies must not grant broad principal or broad resource access.",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (args.type !== SECRETS_MANAGER_SECRET_POLICY_TYPE) return;
    const policy = parseJsonPolicy((args.props as Record<string, unknown>).policy);
    for (const statement of statementsOf(policy)) {
      if (statement.Effect !== "Allow") continue;
      if (valueIsBroad(statement.Principal) || valueIsBroad(statement.Resource)) {
        reportViolation(
          `PRIM-2: Secrets Manager resource policy ${args.urn} grants broad principal or resource access. Docs: ${PRIMITIVES_DOCS}`,
        );
        return;
      }
    }
  },
};

export const primitive3LaunchTemplateImdsv2Required: ResourceValidationPolicy = {
  name: "PRIM-3-launch-template-imdsv2-required",
  description: "EC2 launch templates must require IMDSv2 (`metadataOptions.httpTokens=required`).",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (args.type !== EC2_LAUNCH_TEMPLATE_TYPE) return;
    const metadata = asRecord((args.props as Record<string, unknown>).metadataOptions);
    if (metadata?.httpTokens === "required") return;
    reportViolation(
      `PRIM-3: launch template ${args.urn} does not require IMDSv2. Docs: ${PRIMITIVES_DOCS}`,
    );
  },
};

export const primitive4StartupRolePermissionBoundaryRequired: ResourceValidationPolicy = {
  name: "PRIM-4-startup-role-permission-boundary-required",
  description: "Startup-Hardened secure IAM primitive roles must use a permissions boundary.",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (args.type !== IAM_ROLE_TYPE) return;
    const props = args.props as Record<string, unknown>;
    const tags = asRecord(props.tags);
    const component = tags?.["hulumi:component"];
    if (!(typeof component === "string" && SECURE_IAM_COMPONENTS.includes(component as never))) {
      return;
    }
    if (tags?.["hulumi:tier"] !== "startup-hardened") return;
    if (typeof props.permissionsBoundary === "string" && props.permissionsBoundary.length > 0) {
      return;
    }
    reportViolation(
      `PRIM-4: startup-hardened IAM role ${args.urn} is missing a permissions boundary. Docs: ${PRIMITIVES_DOCS}`,
    );
  },
};

function detectionTags(props: Record<string, unknown>): Record<string, unknown> | undefined {
  return asRecord(props.tags);
}

function isDetectionComponent(tags: Record<string, unknown> | undefined): boolean {
  return tags?.["hulumi:component"] === "SecurityDetectionFoundation";
}

function isNonEmptyStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.some((entry) => typeof entry === "string" && entry !== "");
}

export const detect1CriticalAlarmActionsRequired: ResourceValidationPolicy = {
  name: "DETECT-1-critical-alarm-actions-required",
  description:
    "Startup-Hardened SecurityDetectionFoundation critical CloudWatch alarms must have at least one action so critical detection cannot silently degrade into a no-op alarm.",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (args.type !== CLOUDWATCH_METRIC_ALARM_TYPE) return;
    const props = args.props as Record<string, unknown>;
    const tags = detectionTags(props);
    if (!isDetectionComponent(tags)) return;
    if (tags?.["hulumi:tier"] !== "startup-hardened") return;
    if (tags?.["hulumi:detection-severity"] !== "critical") return;
    if (isNonEmptyStringArray(props.alarmActions)) return;
    reportViolation(
      `DETECT-1: startup-hardened critical detection alarm ${args.urn} has no alarmActions. Docs: ${DETECTION_DOCS}`,
    );
  },
};

function configRequiresSecurityDetection(config: Record<string, unknown> | undefined): boolean {
  return config?.requireSecurityDetectionFoundation === "startup-hardened";
}

function ruleName(resource: PolicyResource): string {
  const props = (resource.props ?? {}) as Record<string, unknown>;
  return typeof props.name === "string" && props.name !== "" ? props.name : resource.name;
}

function eventTargetReferencesRule(target: PolicyResource, rule: PolicyResource): boolean {
  const props = (target.props ?? {}) as Record<string, unknown>;
  const targetRule = props.rule;
  return targetRule === rule.name || targetRule === ruleName(rule);
}

export const detect2SecurityServiceDisablementRequired: StackValidationPolicy = {
  name: "DETECT-2-security-service-disablement-required",
  description:
    "When startup-hardened security detection is mandatory, the stack must include a SecurityDetectionFoundation security-service-disablement EventBridge rule with at least one target.",
  enforcementLevel: "mandatory",
  validateStack: (args, reportViolation) => {
    const config = (args.getConfig ? args.getConfig() : undefined) as
      | Record<string, unknown>
      | undefined;
    if (!configRequiresSecurityDetection(config)) return;
    const suppressions = readSuppressions(config);
    if (matchSuppression("DETECT-2", "stack", suppressions).suppressed) return;
    const disablementRule = args.resources.find((resource) => {
      if (resource.type !== EVENT_RULE_TYPE) return false;
      const tags = detectionTags((resource.props ?? {}) as Record<string, unknown>);
      return (
        isDetectionComponent(tags) &&
        tags?.["hulumi:detection-family"] === "security-service-disablement"
      );
    });
    if (disablementRule === undefined) {
      reportViolation(
        `DETECT-2: startup-hardened security detection is required but no security-service-disablement EventBridge rule is present. Docs: ${DETECTION_DOCS}`,
      );
      return;
    }
    const target = args.resources.find((resource) => {
      if (resource.type !== EVENT_TARGET_TYPE) return false;
      if (!eventTargetReferencesRule(resource, disablementRule)) return false;
      const arn = ((resource.props ?? {}) as Record<string, unknown>).arn;
      return typeof arn === "string" && arn !== "";
    });
    if (target === undefined) {
      reportViolation(
        `DETECT-2: security-service-disablement EventBridge rule ${disablementRule.name} has no target ARN. Docs: ${DETECTION_DOCS}`,
      );
    }
  },
};

function parseEventPattern(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }
  return asRecord(value);
}

function isCatchAllEventPattern(pattern: Record<string, unknown> | undefined): boolean {
  const source = pattern?.source;
  return !Array.isArray(source) || source.length === 0 || source.includes("*");
}

export const detect3NoCatchAllDetectionRules: ResourceValidationPolicy = {
  name: "DETECT-3-no-catch-all-detection-rules",
  description:
    "SecurityDetectionFoundation EventBridge rules must use finite source patterns unless explicitly tagged advisory; broad catch-all patterns create alert fatigue and hide real incidents.",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (args.type !== EVENT_RULE_TYPE) return;
    const props = args.props as Record<string, unknown>;
    const tags = detectionTags(props);
    if (!isDetectionComponent(tags)) return;
    if (tags?.["hulumi:detection-advisory"] === "true") return;
    if (!isCatchAllEventPattern(parseEventPattern(props.eventPattern))) return;
    reportViolation(
      `DETECT-3: detection rule ${args.urn} uses a catch-all EventBridge pattern without advisory tagging. Docs: ${DETECTION_DOCS}`,
    );
  },
};

export const h3AdvisoryIacRoleTag: ResourceValidationPolicy = {
  name: "HULUMI-H3-iac-role-tag",
  description:
    "IAM roles should carry the hulumi:iac-role=true tag so CloudTrail principal attribution can distinguish tool-driven changes from human console changes. Advisory in M2; mandatory in M5 once the SCP template ships.",
  enforcementLevel: H3_ENFORCEMENT_LEVEL,
  validateResource: (args, reportViolation) => {
    if (args.type !== IAM_ROLE_TYPE) return;
    const tags = (args.props as Record<string, unknown>).tags as Record<string, string> | undefined;
    if (tags && tags["hulumi:iac-role"] === "true") return;
    const suppressions = readSuppressions(
      (args.getConfig ? args.getConfig() : undefined) as Record<string, unknown> | undefined,
    );
    if (matchSuppression("HULUMI-H3", args.urn, suppressions).suppressed) return;
    reportViolation(
      `HULUMI-H3: IAM role ${args.name} is missing the hulumi:iac-role=true tag. Advisory in M2; mandatory once the SCP template ships in M5. Docs: ${H3_DOCS}`,
    );
  },
};

const BUCKET_LOGGING_TYPES = [
  "aws:s3/bucketLogging:BucketLogging",
  "aws:s3/bucketLoggingV2:BucketLoggingV2",
] as const;

export const h4StartupHardenedRequiresLogging: StackValidationPolicy = {
  name: "HULUMI-H4-startup-hardened-requires-logging",
  description:
    "Startup-Hardened SecureBucket instances must emit a sibling BucketLogging resource. Defense in depth: SecureBucket's own constructor throws when logBucketArn is missing, but an engineer who bypasses the component (or a mis-versioned snapshot) would slip past the component check. H4 enforces at policy layer.",
  enforcementLevel: "mandatory",
  validateStack: (args, reportViolation) => {
    const suppressions = readSuppressions(
      (args.getConfig ? args.getConfig() : undefined) as Record<string, unknown> | undefined,
    );
    const hardenedBuckets = args.resources.filter((r: PolicyResource) => {
      if (!(RAW_S3_BUCKET_TYPES as readonly string[]).includes(r.type)) return false;
      if (!isSecureBucketManagedBucketUrn(r.urn)) return false;
      const tags = (r.props as Record<string, unknown>).tags as Record<string, string> | undefined;
      return tags?.["hulumi:tier"] === "startup-hardened";
    });
    for (const bucket of hardenedBuckets) {
      if (matchSuppression("HULUMI-H4", bucket.urn, suppressions).suppressed) continue;
      const loggingSibling = args.resources.find(
        (r: PolicyResource) =>
          (BUCKET_LOGGING_TYPES as readonly string[]).includes(r.type) &&
          urnsShareParentComponent(bucket.urn, r.urn),
      );
      if (!loggingSibling) {
        reportViolation(
          `HULUMI-H4: SecureBucket ${bucket.name} declared tier=startup-hardened but no BucketLogging sibling resource is present in the stack. Docs: ${H4_DOCS}`,
        );
      }
    }
  },
};

const BUCKET_PAB_TYPES = ["aws:s3/bucketPublicAccessBlock:BucketPublicAccessBlock"] as const;
const BUCKET_SSE_TYPES = [
  "aws:s3/bucketServerSideEncryptionConfiguration:BucketServerSideEncryptionConfiguration",
  "aws:s3/bucketServerSideEncryptionConfigurationV2:BucketServerSideEncryptionConfigurationV2",
] as const;
const BUCKET_OWNERSHIP_TYPES = ["aws:s3/bucketOwnershipControls:BucketOwnershipControls"] as const;
const BUCKET_VERSIONING_TYPES = [
  "aws:s3/bucketVersioning:BucketVersioning",
  "aws:s3/bucketVersioningV2:BucketVersioningV2",
] as const;
const BUCKET_POLICY_TYPES = ["aws:s3/bucketPolicy:BucketPolicy"] as const;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function isAllPublicAccessBlocked(props: Record<string, unknown>): boolean {
  return (
    props.blockPublicAcls === true &&
    props.ignorePublicAcls === true &&
    props.blockPublicPolicy === true &&
    props.restrictPublicBuckets === true
  );
}

function isKmsSse(props: Record<string, unknown>): boolean {
  const rules = Array.isArray(props.rules) ? props.rules : [];
  return rules.some((rule) => {
    const apply = asRecord(asRecord(rule)?.applyServerSideEncryptionByDefault);
    return apply?.sseAlgorithm === "aws:kms";
  });
}

function isOwnerEnforced(props: Record<string, unknown>): boolean {
  const single = asRecord(props.rule);
  if (single?.objectOwnership === "BucketOwnerEnforced") return true;
  const many = Array.isArray(props.rules) ? props.rules : [];
  return many.some((rule) => asRecord(rule)?.objectOwnership === "BucketOwnerEnforced");
}

function isVersioningEnabled(props: Record<string, unknown>): boolean {
  return asRecord(props.versioningConfiguration)?.status === "Enabled";
}

function isTlsOnlyPolicy(props: Record<string, unknown>): boolean {
  let doc: unknown = props.policy;
  if (typeof doc === "string") {
    try {
      doc = JSON.parse(doc);
    } catch {
      return false;
    }
  }
  const statements = asRecord(doc)?.Statement;
  const list = Array.isArray(statements) ? statements : [];
  return list.some((raw) => {
    const stmt = asRecord(raw);
    if (stmt?.Effect !== "Deny") return false;
    const secureTransport = asRecord(asRecord(stmt.Condition)?.Bool)?.["aws:SecureTransport"];
    return secureTransport === "false" || secureTransport === false;
  });
}

// Value-binding helpers for H5: a sibling resource that has the right type
// and shape proves NOTHING unless it actually points at the exempted bucket.
// Without this, an attacker who forges a SecureBucket-typed parent can also
// add five decoy siblings (PublicAccessBlock + SSE + ownership + versioning
// + policy) targeting a *different* bucket — H5 finds the decoys via shared
// parent URN and reports no violation, while the actually-exempted raw
// bucket is fully unhardened. The siblings' `bucket` prop and the bucket
// policy's `Resource` ARNs must reference the exempted bucket explicitly.
function bucketTargetCandidates(bucket: PolicyResource): Set<string> {
  const out = new Set<string>();
  if (typeof bucket.name === "string" && bucket.name !== "") out.add(bucket.name);
  const props = (bucket.props ?? {}) as Record<string, unknown>;
  const bucketProp = props.bucket;
  if (typeof bucketProp === "string" && bucketProp !== "") out.add(bucketProp);
  const idProp = props.id;
  if (typeof idProp === "string" && idProp !== "") out.add(idProp);
  return out;
}

function bucketControlTargetsBucket(
  props: Record<string, unknown>,
  bucket: PolicyResource,
): boolean {
  const target = props.bucket;
  if (typeof target !== "string" || target === "") return false;
  return bucketTargetCandidates(bucket).has(target);
}

function isTlsOnlyPolicyForBucket(props: Record<string, unknown>, bucket: PolicyResource): boolean {
  if (!bucketControlTargetsBucket(props, bucket)) return false;
  let doc: unknown = props.policy;
  if (typeof doc === "string") {
    try {
      doc = JSON.parse(doc);
    } catch {
      return false;
    }
  }
  const statements = asRecord(doc)?.Statement;
  const list = Array.isArray(statements) ? statements : [];
  // The Resource block on the relevant Deny statement must cover both the
  // bucket ARN and the object ARN of the exempted bucket — otherwise the
  // policy can name a Deny on a *different* bucket and still pass.
  const candidates = bucketTargetCandidates(bucket);
  return list.some((raw) => {
    const stmt = asRecord(raw);
    if (stmt?.Effect !== "Deny") return false;
    const secureTransport = asRecord(asRecord(stmt.Condition)?.Bool)?.["aws:SecureTransport"];
    if (!(secureTransport === "false" || secureTransport === false)) return false;
    const resources: unknown = stmt.Resource;
    const resourceList: unknown[] = Array.isArray(resources) ? resources : [resources];
    let coversBucket = false;
    let coversObjects = false;
    for (const candidate of candidates) {
      const bucketArn = `arn:aws:s3:::${candidate}`;
      const objectArn = `${bucketArn}/*`;
      if (resourceList.some((entry) => entry === bucketArn)) coversBucket = true;
      if (resourceList.some((entry) => entry === objectArn)) coversObjects = true;
    }
    return coversBucket && coversObjects;
  });
}

// H5 — defense in depth for the H1 SecureBucket exemption.
//
// H1's exemption (isSecureBucketManagedBucketUrn) keys only on a Pulumi
// URN type token plus a child-name convention. Pulumi URNs carry no
// package provenance, so a malicious IaC author can declare their own
// ComponentResource typed `hulumi:baseline:aws:SecureBucket` and parent a
// raw, unhardened `<name>-bucket` under it to slip past H1 entirely.
// Tightening the string check cannot fix this (the attacker controls the
// names too). Instead, require every bucket that USES the exemption to be
// backed by the hardened sibling resources a genuine SecureBucket always
// emits. A forged wrapper without them is reported; a forged wrapper that
// DOES emit them is, by construction, actually hardened.
export const h5SecureBucketExemptionRequiresHardening: StackValidationPolicy = {
  name: "HULUMI-H5-securebucket-exemption-requires-hardening",
  description:
    "Every raw bucket that relies on the H1 SecureBucket exemption must be backed by the hardened sibling resources a real SecureBucket emits: an all-true BucketPublicAccessBlock, SSE-KMS, BucketOwnerEnforced ownership, enabled versioning, and a TLS-only bucket policy. The H1 exemption keys on a forgeable Pulumi URN type token (no package provenance); H5 closes that bypass by validating actual hardening at stack level instead of trusting the URN.",
  enforcementLevel: "mandatory",
  validateStack: (args, reportViolation) => {
    const suppressions = readSuppressions(
      (args.getConfig ? args.getConfig() : undefined) as Record<string, unknown> | undefined,
    );
    const exemptedBuckets = args.resources.filter((r: PolicyResource) => {
      if (!(RAW_S3_BUCKET_TYPES as readonly string[]).includes(r.type)) return false;
      return isSecureBucketManagedBucketUrn(r.urn);
    });
    for (const bucket of exemptedBuckets) {
      if (matchSuppression("HULUMI-H5", bucket.urn, suppressions).suppressed) continue;
      // Every sibling check is BOTH structural (anchored parent-component
      // type-chain match, not unanchored URN prefix) AND value-binding
      // (sibling's `bucket` prop, or for the policy its `Resource` block,
      // must reference the exempted bucket explicitly). The old
      // `urn.startsWith(bucket.urn.split("$")[0])` form was forgeable in
      // two ways: (a) a sibling parented under an unrelated component
      // could share the string prefix; (b) without value binding, any
      // siblings under the same forged wrapper that targeted a *different*
      // bucket satisfied the check while the exempted bucket stayed raw.
      const sibling = (
        types: readonly string[],
        ok: (props: Record<string, unknown>, bucketRes: PolicyResource) => boolean,
      ): boolean =>
        args.resources.some(
          (r: PolicyResource) =>
            types.includes(r.type) &&
            urnsShareParentComponent(bucket.urn, r.urn) &&
            ok((r.props ?? {}) as Record<string, unknown>, bucket),
        );

      const missing: string[] = [];
      if (
        !sibling(
          BUCKET_PAB_TYPES,
          (p, b) => bucketControlTargetsBucket(p, b) && isAllPublicAccessBlocked(p),
        )
      ) {
        missing.push("all-true BucketPublicAccessBlock");
      }
      if (!sibling(BUCKET_SSE_TYPES, (p, b) => bucketControlTargetsBucket(p, b) && isKmsSse(p))) {
        missing.push("SSE-KMS encryption");
      }
      if (
        !sibling(
          BUCKET_OWNERSHIP_TYPES,
          (p, b) => bucketControlTargetsBucket(p, b) && isOwnerEnforced(p),
        )
      ) {
        missing.push("BucketOwnerEnforced ownership controls");
      }
      if (
        !sibling(
          BUCKET_VERSIONING_TYPES,
          (p, b) => bucketControlTargetsBucket(p, b) && isVersioningEnabled(p),
        )
      ) {
        missing.push("enabled bucket versioning");
      }
      if (!sibling(BUCKET_POLICY_TYPES, isTlsOnlyPolicyForBucket)) {
        missing.push("TLS-only bucket policy bound to this bucket");
      }
      // `isTlsOnlyPolicy` is kept exported for backwards-compat in case
      // out-of-tree callers still reference it; H5 itself now uses the
      // bound variant exclusively.
      void isTlsOnlyPolicy;

      if (missing.length > 0) {
        reportViolation(
          `HULUMI-H5: ${bucket.name} (${bucket.urn}) relies on the SecureBucket H1 exemption but the stack is missing hardened sibling resources a genuine SecureBucket always emits: ${missing.join(", ")}. The exemption is URN-based and forgeable; use @hulumi/baseline.aws.SecureBucket. Docs: ${DOCS_BASE}`,
        );
      }
    }
  },
};

export const hulumiHardeningPackMetadata: PackMetadata = {
  id: "hulumi-hardening-pack",
  title: "Hulumi Hardening Pack",
  framework: "hulumi",
  frameworkVersion: "0.1.0",
  severity: "high",
  rules: [
    {
      id: "HULUMI-H1",
      title: "No raw aws.s3.Bucket / BucketV2 outside SecureBucket",
      description: h1BlocksRawBucket.description!,
      severity: "high",
      enforcement: "mandatory",
      frameworkIds: ["CCM:DSP-01", "CIS-AWS-v5.0.0:2.1.2"],
      docsUrl: DOCS_BASE,
    },
    {
      id: "HULUMI-H2",
      title: "No unencrypted / file:// state backend",
      description: h2BlocksUnencryptedStateBackend.description!,
      severity: "critical",
      enforcement: "mandatory",
      frameworkIds: ["CCM:CEK-04", "NIST-800-53-r5:SC-28"],
      docsUrl: H2_DOCS,
    },
    {
      id: "STATE-1",
      title: "Approved Pulumi secrets provider required",
      description: state1ApprovedSecretsProvider.description!,
      severity: "critical",
      enforcement: "mandatory",
      frameworkIds: ["CCM:CEK-04", "NIST-800-53-r5:SC-28"],
      docsUrl: STATE_BACKEND_DOCS,
    },
    {
      id: "HULUMI-H3",
      title: "IAM role missing hulumi:iac-role=true tag",
      description: h3AdvisoryIacRoleTag.description!,
      severity: "medium",
      enforcement: H3_ENFORCEMENT_LEVEL,
      frameworkIds: ["ATLAS:AML.T0001"],
      docsUrl: H3_DOCS,
    },
    {
      id: "PRIM-1",
      title: "GitHub OIDC role trust must not use wildcard subjects",
      description: primitive1GithubOidcNoWildcard.description!,
      severity: "high",
      enforcement: "mandatory",
      frameworkIds: ["NIST-800-218A:PO.5", "NIST-SSDF-v1.1:PW.6"],
      docsUrl: PRIMITIVES_DOCS,
    },
    {
      id: "PRIM-2",
      title: "Secrets Manager policies must not grant broad access",
      description: primitive2SecretPolicyNoBroadAccess.description!,
      severity: "high",
      enforcement: "mandatory",
      frameworkIds: ["CCM:IAM-02", "NIST-800-53-r5:AC-6"],
      docsUrl: PRIMITIVES_DOCS,
    },
    {
      id: "PRIM-3",
      title: "Launch templates require IMDSv2",
      description: primitive3LaunchTemplateImdsv2Required.description!,
      severity: "high",
      enforcement: "mandatory",
      frameworkIds: ["CIS-AWS-v5.0.0:5.6", "NIST-800-53-r5:CM-6"],
      docsUrl: PRIMITIVES_DOCS,
    },
    {
      id: "PRIM-4",
      title: "Startup-Hardened IAM roles require permission boundaries",
      description: primitive4StartupRolePermissionBoundaryRequired.description!,
      severity: "high",
      enforcement: "mandatory",
      frameworkIds: ["CCM:IAM-02", "NIST-800-53-r5:AC-6"],
      docsUrl: PRIMITIVES_DOCS,
    },
    {
      id: "DETECT-1",
      title: "Critical detection alarms require actions",
      description: detect1CriticalAlarmActionsRequired.description!,
      severity: "critical",
      enforcement: "mandatory",
      frameworkIds: ["CCM:LOG-04", "NIST-800-53-r5:IR-6"],
      docsUrl: DETECTION_DOCS,
    },
    {
      id: "DETECT-2",
      title: "Security-service disablement detection required",
      description: detect2SecurityServiceDisablementRequired.description!,
      severity: "critical",
      enforcement: "mandatory",
      frameworkIds: ["CCM:LOG-04", "NIST-800-53-r5:AU-6"],
      docsUrl: DETECTION_DOCS,
    },
    {
      id: "DETECT-3",
      title: "Detection EventBridge rules must not be catch-all",
      description: detect3NoCatchAllDetectionRules.description!,
      severity: "high",
      enforcement: "mandatory",
      frameworkIds: ["CCM:LOG-04", "NIST-800-53-r5:SI-4"],
      docsUrl: DETECTION_DOCS,
    },
    {
      id: "HULUMI-H4",
      title: "Startup-Hardened SecureBucket without logging sibling",
      description: h4StartupHardenedRequiresLogging.description!,
      severity: "high",
      enforcement: "mandatory",
      frameworkIds: ["CCM:LOG-01", "NIST-800-53-r5:AU-2"],
      docsUrl: H4_DOCS,
    },
    {
      id: "HULUMI-H5",
      title: "SecureBucket H1 exemption must be backed by real hardening",
      description: h5SecureBucketExemptionRequiresHardening.description!,
      severity: "high",
      enforcement: "mandatory",
      frameworkIds: ["CCM:DSP-01", "CIS-AWS-v5.0.0:2.1.2"],
      docsUrl: DOCS_BASE,
    },
  ],
};

// NOTE: The PolicyPack instance is intentionally NOT constructed in this
// file. It lives in src/aws/packs/hulumi-hardening.ts. Users who want the
// pack import it from `@hulumi/policies/packs/hulumi-hardening`; users who
// want to test rule handlers import from this file.
