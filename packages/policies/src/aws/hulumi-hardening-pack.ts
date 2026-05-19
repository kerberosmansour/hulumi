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

export const HULUMI_SECURE_BUCKET_TYPE = "hulumi:baseline:aws:SecureBucket";
export const RAW_S3_BUCKET_TYPES = ["aws:s3/bucket:Bucket", "aws:s3/bucketV2:BucketV2"] as const;
export const IAM_ROLE_TYPE = "aws:iam/role:Role";

// M5 enforcement phase: H3 is now "mandatory" — paired with the SCP
// template at docs/deployment/scp.json. The SCP makes the
// `hulumi:iac-role=true` tag tamper-evident at AWS Organizations level;
// H3 enforces it at preview time. Documented as a v1.0.0 breaking
// change in CHANGELOG.md with migration steps (add tag OR apply SCP).
export const H3_ENFORCEMENT_LEVEL: EnforcementLevel = "mandatory";

const DOCS_BASE =
  "https://github.com/kerberosmansour/hulumi/blob/main/docs/components/secure-bucket.md";
const H2_DOCS = "https://github.com/kerberosmansour/hulumi/blob/main/docs/tiers.md#state-backend";
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
      const parentPrefix = bucket.urn.split("$")[0];
      const loggingSibling = args.resources.find(
        (r: PolicyResource) =>
          (BUCKET_LOGGING_TYPES as readonly string[]).includes(r.type) &&
          r.urn.startsWith(parentPrefix),
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

function bucketTargetCandidates(bucket: PolicyResource): Set<string> {
  const out = new Set<string>();
  if (typeof bucket.name === "string" && bucket.name !== "") out.add(bucket.name);
  const bucketProps = (bucket.props ?? {}) as Record<string, unknown>;
  const named = bucketProps.bucket;
  const id = bucketProps.id;
  if (typeof named === "string" && named !== "") out.add(named);
  if (typeof id === "string" && id !== "") out.add(id);
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

function isTlsOnlyPolicyForBucket(props: Record<string, unknown>, bucket: PolicyResource): boolean {
  let doc: unknown = props.policy;
  if (typeof doc === "string") {
    try {
      doc = JSON.parse(doc);
    } catch {
      return false;
    }
  }
  const bucketName = typeof props.bucket === "string" ? (props.bucket as string) : undefined;
  if (!bucketName || !bucketTargetCandidates(bucket).has(bucketName)) return false;
  const bucketArn = `arn:aws:s3:::${bucketName}`;
  const objectArn = `${bucketArn}/*`;

  const statements = asRecord(doc)?.Statement;
  const list = Array.isArray(statements) ? statements : [];
  return list.some((raw) => {
    const stmt = asRecord(raw);
    if (stmt?.Effect !== "Deny") return false;
    const secureTransport = asRecord(asRecord(stmt.Condition)?.Bool)?.["aws:SecureTransport"];
    if (!(secureTransport === "false" || secureTransport === false)) return false;

    const action = stmt.Action;
    const actions = Array.isArray(action) ? action : [action];
    const hasS3All = actions.some((a) => typeof a === "string" && a === "s3:*");
    if (!hasS3All) return false;

    const resource = stmt.Resource;
    const resources = Array.isArray(resource) ? resource : [resource];
    const hasBucketArn = resources.some((r) => typeof r === "string" && r === bucketArn);
    const hasObjectArn = resources.some((r) => typeof r === "string" && r === objectArn);
    return hasBucketArn && hasObjectArn;
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
      const parentPrefix = bucket.urn.split("$")[0];
      const sibling = (
        types: readonly string[],
        ok: (resource: PolicyResource) => boolean,
      ): boolean =>
        args.resources.some(
          (r: PolicyResource) => types.includes(r.type) && r.urn.startsWith(parentPrefix) && ok(r),
        );

      const missing: string[] = [];
      if (
        !sibling(
          BUCKET_PAB_TYPES,
          (r) =>
            bucketControlTargetsBucket((r.props ?? {}) as Record<string, unknown>, bucket) &&
            isAllPublicAccessBlocked((r.props ?? {}) as Record<string, unknown>),
        )
      ) {
        missing.push("all-true BucketPublicAccessBlock");
      }
      if (
        !sibling(
          BUCKET_SSE_TYPES,
          (r) =>
            bucketControlTargetsBucket((r.props ?? {}) as Record<string, unknown>, bucket) &&
            isKmsSse((r.props ?? {}) as Record<string, unknown>),
        )
      )
        missing.push("SSE-KMS encryption");
      if (
        !sibling(
          BUCKET_OWNERSHIP_TYPES,
          (r) =>
            bucketControlTargetsBucket((r.props ?? {}) as Record<string, unknown>, bucket) &&
            isOwnerEnforced((r.props ?? {}) as Record<string, unknown>),
        )
      ) {
        missing.push("BucketOwnerEnforced ownership controls");
      }
      if (
        !sibling(
          BUCKET_VERSIONING_TYPES,
          (r) =>
            bucketControlTargetsBucket((r.props ?? {}) as Record<string, unknown>, bucket) &&
            isVersioningEnabled((r.props ?? {}) as Record<string, unknown>),
        )
      ) {
        missing.push("enabled bucket versioning");
      }
      if (
        !sibling(BUCKET_POLICY_TYPES, (r) =>
          isTlsOnlyPolicyForBucket((r.props ?? {}) as Record<string, unknown>, bucket),
        )
      )
        missing.push("TLS-only bucket policy");

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
      id: "HULUMI-H3",
      title: "IAM role missing hulumi:iac-role=true tag",
      description: h3AdvisoryIacRoleTag.description!,
      severity: "medium",
      enforcement: H3_ENFORCEMENT_LEVEL,
      frameworkIds: ["ATLAS:AML.T0001"],
      docsUrl: H3_DOCS,
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
