// CisV5Pack rules — bucket-only stub for M2. Rule handlers + metadata
// live here; the PolicyPack instance is in src/aws/packs/cis-v5.ts per
// the same "one-PolicyPack-per-process" constraint that applies to
// HulumiHardeningPack.

import type { ResourceValidationPolicy } from "@pulumi/policy";
import type { PackMetadata } from "../metadata";
import { RAW_S3_BUCKET_TYPES } from "./hulumi-hardening-pack";

const CIS_DOCS = "https://www.cisecurity.org/benchmark/amazon_web_services";

export const cisAwsV5_2_1_1_ssePresent: ResourceValidationPolicy = {
  name: "CIS-AWS-v5.0.0-2.1.1-bucket-sse",
  description:
    "CIS AWS Foundations v5.0.0 §2.1.1 — S3 buckets must have default server-side encryption configured. Bucket-scope rule only in M2; full pack sections 1–3 in M3.",
  enforcementLevel: "advisory",
  validateResource: (args, reportViolation) => {
    if (!(RAW_S3_BUCKET_TYPES as readonly string[]).includes(args.type)) return;
    // Bucket resources in @pulumi/aws do not carry the SSE config inline —
    // the sibling BucketServerSideEncryptionConfiguration resource owns it.
    // This rule fires as a stack-level companion; the per-resource hook here
    // emits a light advisory when a bucket carries no parent SecureBucket
    // (SecureBucket guarantees SSE; raw buckets may or may not).
    if (!args.urn.includes("hulumi:baseline:aws:SecureBucket$")) {
      reportViolation(
        `CIS-AWS-v5.0.0:2.1.1 advisory: raw bucket ${args.name} may lack default SSE. Switch to @hulumi/baseline.aws.SecureBucket for guaranteed SSE-KMS. Docs: ${CIS_DOCS}`,
      );
    }
  },
};

export const cisV5PackMetadata: PackMetadata = {
  id: "cis-v5-pack",
  title: "CIS AWS Foundations v5.0.0 (M2 bucket stub)",
  framework: "CIS-AWS",
  frameworkVersion: "5.0.0",
  severity: "medium",
  rules: [
    {
      id: "CIS-AWS-v5.0.0:2.1.1",
      title: "S3 bucket default SSE",
      description: cisAwsV5_2_1_1_ssePresent.description!,
      severity: "medium",
      enforcement: "advisory",
      frameworkIds: ["CIS-AWS-v5.0.0:2.1.1"],
      docsUrl: CIS_DOCS,
    },
  ],
};

// NOTE: The CisV5Pack PolicyPack instance is intentionally NOT constructed
// in this file. See src/aws/packs/cis-v5.ts.
