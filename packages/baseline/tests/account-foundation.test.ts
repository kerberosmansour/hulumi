// AccountFoundation BDD scenarios — mocked. Each describe block maps to a
// row of M3's BDD Acceptance Scenarios table. Real-AWS integration lives
// in tests/integration/account-foundation.integration.test.ts (skipped on
// PRs; weekly schedule).

import { describe, it, expect, beforeEach } from "vitest";
import { resolve } from "node:path";
import * as pulumi from "@pulumi/pulumi";

import { AccountFoundation } from "../src/aws/account-foundation";
import { GUARDDUTY_HARDENED_FEATURES } from "../src/aws/guardduty";
import { AWS_TAG_VALUE_MAX_LENGTH } from "../src/aws/tags";
import { registrations, resetRegistrations, valueOf, settlePulumi } from "./setup";
import { expectNoForbiddenShortcuts } from "../../../tests/_utils/forbidden-shortcut";

/**
 * Install a healthy-posture stub for the `aws:guardduty/getDetector`
 * invoke. The reused-detector posture assertion in guardduty.ts (see
 * M-DETECTIVEREUSE) calls `getDetectorOutput({id})` and throws unless
 * `status === "ENABLED"` and `findingPublishingFrequency ===
 * "FIFTEEN_MINUTES"`. The shared `setup.ts` mock returns `args.inputs`
 * for unknown invoke tokens (no `status` field), so reuse-path tests
 * here must layer in a tuned mock that returns a baseline-compliant
 * detector. Dedicated negative-path tests for non-ENABLED /
 * non-FIFTEEN_MINUTES live in tests/guardduty-reuse-posture.test.ts
 * (their own per-file mock isolation).
 */
function installHealthyGuardDutyDetectorMock(): void {
  pulumi.runtime.setMocks({
    newResource: (args: pulumi.runtime.MockResourceArgs) => {
      const existingId = args.id !== undefined && args.id.length > 0 ? args.id : undefined;
      registrations.push({
        type: args.type,
        name: args.name,
        inputs: { ...(args.inputs as Record<string, unknown>) },
        ...(existingId !== undefined ? { id: existingId } : {}),
        ...(args.provider !== undefined ? { provider: args.provider } : {}),
      });
      const baseState: Record<string, unknown> = { ...(args.inputs as Record<string, unknown>) };
      if (args.type.startsWith("aws:s3/bucketV2") || args.type.startsWith("aws:s3/bucket")) {
        baseState.arn = baseState.arn ?? `arn:aws:s3:::${args.name}-mock`;
        baseState.bucketDomainName =
          baseState.bucketDomainName ?? `${args.name}-mock.s3.amazonaws.com`;
      } else if (args.type === "aws:cloudwatch/logGroup:LogGroup") {
        baseState.name = baseState.name ?? args.name;
      } else {
        baseState.arn = baseState.arn ?? `arn:aws:mock:${args.type}:${args.name}`;
      }
      return { id: existingId ?? `${args.name}_id`, state: baseState };
    },
    call: (args: pulumi.runtime.MockCallArgs) => {
      if (args.token === "aws:index/getCallerIdentity:getCallerIdentity") {
        return {
          accountId: "111122223333",
          arn: "arn:aws:iam::111122223333:user/mock",
          userId: "MOCKID",
        };
      }
      if (args.token === "aws:index/getRegion:getRegion") {
        return {
          name: "us-east-1",
          description: "US East (N. Virginia)",
          endpoint: "ec2.us-east-1.amazonaws.com",
        };
      }
      if (args.token === "aws:guardduty/getDetector:getDetector") {
        return {
          id: (args.inputs as { id?: string }).id ?? "mock-detector",
          arn: "arn:aws:guardduty:us-east-1:111122223333:detector/mock",
          region: "us-east-1",
          serviceRoleArn: "arn:aws:iam::111122223333:role/aws-service-role/guardduty",
          tags: {},
          features: [],
          status: "ENABLED",
          findingPublishingFrequency: "FIFTEEN_MINUTES",
        };
      }
      return args.inputs;
    },
  });
}

const IAC_ROLE_ARN = "arn:aws:iam::111122223333:role/hulumi-sandbox-iac-role";

const SANDBOX_TYPES = [
  "aws:kms/key:Key",
  "aws:kms/alias:Alias",
  "aws:iam/role:Role",
  "aws:iam/rolePolicy:RolePolicy",
  "aws:iam/rolePolicyAttachment:RolePolicyAttachment",
  "aws:iam/accountPasswordPolicy:AccountPasswordPolicy",
  "aws:cloudtrail/trail:Trail",
  "aws:cfg/recorder:Recorder",
  "aws:cfg/deliveryChannel:DeliveryChannel",
  "aws:guardduty/detector:Detector",
  "aws:securityhub/account:Account",
  "aws:securityhub/standardsSubscription:StandardsSubscription",
] as const;

const HARDENED_EXTRA_TYPES = [
  "aws:accessanalyzer/analyzer:Analyzer",
  "aws:guardduty/detectorFeature:DetectorFeature",
  "aws:cfg/configurationAggregator:ConfigurationAggregator",
] as const;

function typesOf(): string[] {
  return registrations.map((r) => r.type);
}

function controlsFromTags(tags: Record<string, string> | undefined): string[] {
  if (tags === undefined) return [];
  return Object.entries(tags)
    .filter(([key]) => key === "hulumi:controls" || key.startsWith("hulumi:controls:"))
    .sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))
    .flatMap(([, value]) => value.split("+").filter((control) => control.length > 0));
}

function parsePolicy(input: unknown): { Statement: Array<Record<string, unknown>> } {
  expect(typeof input).toBe("string");
  return JSON.parse(input as string) as { Statement: Array<Record<string, unknown>> };
}

function kmsKeyPolicies(): Array<{
  name: string;
  policy: { Statement: Array<Record<string, unknown>> };
}> {
  const keys = registrations.filter((r) => r.type === "aws:kms/key:Key");
  expect(keys.length).toBe(4);
  return keys.map((key) => ({
    name: key.name,
    policy: parsePolicy(key.inputs.policy),
  }));
}

function denyWithoutTagStatement(policy: {
  Statement: Array<Record<string, unknown>>;
}): Record<string, unknown> | undefined {
  return policy.Statement.find((statement) => {
    return statement.Sid === "DenyKmsActionsWithoutHulumiIacRoleTag";
  });
}

describe("AccountFoundation — Sandbox tier emits 6 sub-resource groups (happy path)", () => {
  beforeEach(resetRegistrations);

  it("registers KMS ring + CloudTrail + Config + GuardDuty + SecurityHub + IAM baseline; no startup-hardened extras", async () => {
    const af = new AccountFoundation("af-sandbox", {
      tier: "sandbox",
      iacRoleArn: IAC_ROLE_ARN,
    });
    await valueOf(af.guardDutyDetectorId);
    await settlePulumi();
    const types = new Set(typesOf());
    for (const t of SANDBOX_TYPES) {
      expect(types).toContain(t);
    }
    expect(types).not.toContain("aws:accessanalyzer/analyzer:Analyzer");
    expect(types).not.toContain("aws:guardduty/detectorFeature:DetectorFeature");
    expect(types).not.toContain("aws:cfg/configurationAggregator:ConfigurationAggregator");
  });
});

describe("AccountFoundation — Startup-Hardened adds ≥4 concrete deltas", () => {
  beforeEach(resetRegistrations);

  it("emits all sandbox sub-resources PLUS Access Analyzer + 5 GuardDuty features + Config aggregator + NIST 800-53 r5 standard", async () => {
    const af = new AccountFoundation("af-hardened", {
      tier: "startup-hardened",
      iacRoleArn: IAC_ROLE_ARN,
      orgAccountIds: ["111111111111", "222222222222"],
    });
    await valueOf(af.guardDutyDetectorId);
    await settlePulumi();
    const types = new Set(typesOf());

    for (const t of [...SANDBOX_TYPES, ...HARDENED_EXTRA_TYPES]) {
      expect(types).toContain(t);
    }

    // GuardDuty hardened features — 5 distinct DetectorFeature resources.
    const features = registrations.filter(
      (r) => r.type === "aws:guardduty/detectorFeature:DetectorFeature",
    );
    expect(features.length).toBe(GUARDDUTY_HARDENED_FEATURES.length);

    // Security Hub: 2 standards subscriptions on hardened (CIS + NIST), 1 on sandbox (CIS).
    const subs = registrations.filter(
      (r) => r.type === "aws:securityhub/standardsSubscription:StandardsSubscription",
    );
    expect(subs.length).toBe(2);
  });
});

describe("AccountFoundation — tier delta AST check ≥ 4", () => {
  it("Startup-Hardened registered-types minus Sandbox registered-types has ≥4 distinct entries", async () => {
    resetRegistrations();
    const sandbox = new AccountFoundation("af-delta-sandbox", {
      tier: "sandbox",
      iacRoleArn: IAC_ROLE_ARN,
    });
    await valueOf(sandbox.guardDutyDetectorId);
    await settlePulumi();
    const sandboxTypes = new Set(typesOf());

    resetRegistrations();
    const hardened = new AccountFoundation("af-delta-hardened", {
      tier: "startup-hardened",
      iacRoleArn: IAC_ROLE_ARN,
      orgAccountIds: ["111111111111"],
    });
    await valueOf(hardened.guardDutyDetectorId);
    await settlePulumi();
    const hardenedTypes = new Set(typesOf());

    const delta = Array.from(hardenedTypes).filter((t) => !sandboxTypes.has(t));
    expect(delta.length).toBeGreaterThanOrEqual(4);
  });
});

describe("AccountFoundation — Security Hub depends on GuardDuty Detector (eventual-consistency contract)", () => {
  beforeEach(resetRegistrations);

  it("Security Hub Account + Subscriptions register AFTER GuardDuty Detector in the resource graph", async () => {
    const af = new AccountFoundation("af-ready", {
      tier: "sandbox",
      iacRoleArn: IAC_ROLE_ARN,
    });
    await valueOf(af.securityHubHubArn);
    await settlePulumi();

    const detectorIdx = registrations.findIndex(
      (r) => r.type === "aws:guardduty/detector:Detector",
    );
    const hubIdx = registrations.findIndex((r) => r.type === "aws:securityhub/account:Account");
    const subIdx = registrations.findIndex(
      (r) => r.type === "aws:securityhub/standardsSubscription:StandardsSubscription",
    );
    expect(detectorIdx).toBeGreaterThanOrEqual(0);
    expect(hubIdx).toBeGreaterThan(detectorIdx);
    expect(subIdx).toBeGreaterThan(hubIdx);
  });
});

describe("AccountFoundation — real provider input compatibility", () => {
  beforeEach(resetRegistrations);

  it("emits KMS key policies accepted by the AWS KMS policy grammar", async () => {
    const af = new AccountFoundation("af-kms-policy", {
      tier: "sandbox",
      iacRoleArn: IAC_ROLE_ARN,
    });
    await valueOf(af.kmsKeyArns);
    await settlePulumi();

    const keys = registrations.filter((r) => r.type === "aws:kms/key:Key");
    expect(keys.length).toBe(4);
    for (const key of keys) {
      const policy = JSON.parse(key.inputs.policy as string) as Record<string, unknown>;
      expect(policy.Version).toBe("2012-10-17");
      expect(policy.Id).toEqual(expect.stringMatching(/^hulumi-kms-/));
      expect(policy.Statement).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            Sid: "EnableRootPermissions",
            Effect: "Allow",
            Action: "kms:*",
            Resource: "*",
          }),
        ]),
      );
      expect(policy).not.toHaveProperty("PolicyTag");
    }

    const logsKey = keys.find((key) => key.name.endsWith("-kms-logs"));
    expect(logsKey).toBeDefined();
    const logsKeyPolicy = JSON.parse(logsKey!.inputs.policy as string) as {
      Statement: Array<Record<string, unknown>>;
    };
    expect(logsKeyPolicy.Statement).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          Sid: "AllowCloudTrailEncryptLogs",
          Principal: { Service: "cloudtrail.amazonaws.com" },
          Action: "kms:GenerateDataKey*",
        }),
        expect.objectContaining({
          Sid: "AllowCloudTrailDescribeKey",
          Principal: { Service: "cloudtrail.amazonaws.com" },
          Action: "kms:DescribeKey",
        }),
        expect.objectContaining({
          Sid: "AllowConfigLogDeliveryKms",
          Principal: { Service: "config.amazonaws.com" },
          Action: ["kms:Decrypt", "kms:GenerateDataKey"],
        }),
        // Regression: Startup-Hardened CloudTrail delivers to a
        // KMS-encrypted CloudWatch Logs group; without this grant
        // CreateLogGroup fails with AccessDeniedException. Scoped by the
        // aws:logs:arn encryption context to this stack's CloudTrail
        // log group only.
        expect.objectContaining({
          Sid: "AllowCloudWatchLogsEncryptLogGroup",
          Effect: "Allow",
          Principal: { Service: "logs.us-east-1.amazonaws.com" },
          Action: [
            "kms:Encrypt*",
            "kms:Decrypt*",
            "kms:ReEncrypt*",
            "kms:GenerateDataKey*",
            "kms:DescribeKey",
          ],
          Resource: "*",
          Condition: {
            ArnLike: {
              "kms:EncryptionContext:aws:logs:arn":
                "arn:aws:logs:us-east-1:111122223333:log-group:af-kms-policy-cloudtrail-logs*",
            },
          },
        }),
      ]),
    );
  });

  it("uses current Security Hub StandardsArn namespaces for CIS v5", async () => {
    const af = new AccountFoundation("af-securityhub-arn", {
      tier: "sandbox",
      iacRoleArn: IAC_ROLE_ARN,
    });
    await valueOf(af.securityHubHubArn);
    await settlePulumi();

    const subscriptions = registrations.filter(
      (r) => r.type === "aws:securityhub/standardsSubscription:StandardsSubscription",
    );
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0].inputs.standardsArn).toBe(
      "arn:aws:securityhub:us-east-1::standards/cis-aws-foundations-benchmark/v/5.0.0",
    );
  });

  it("uses a dedicated AWS Config recorder role and log bucket delivery policy", async () => {
    const af = new AccountFoundation("af-config-delivery", {
      tier: "sandbox",
      iacRoleArn: IAC_ROLE_ARN,
    });
    await valueOf(af.configRecorderArn);
    await settlePulumi();

    const role = registrations.find((r) => r.type === "aws:iam/role:Role");
    expect(role).toBeDefined();
    const trust = parsePolicy(role!.inputs.assumeRolePolicy);
    expect(trust.Statement).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          Principal: { Service: "config.amazonaws.com" },
          Action: "sts:AssumeRole",
          Condition: {
            StringEquals: { "AWS:SourceAccount": "111122223333" },
            ArnLike: { "AWS:SourceArn": "arn:aws:config:us-east-1:111122223333:*" },
          },
        }),
      ]),
    );

    const attachment = registrations.find(
      (r) => r.type === "aws:iam/rolePolicyAttachment:RolePolicyAttachment",
    );
    expect(attachment?.inputs.policyArn).toBe(
      "arn:aws:iam::aws:policy/service-role/AWS_ConfigRole",
    );

    const deliveryPolicy = registrations.find((r) => r.type === "aws:iam/rolePolicy:RolePolicy");
    expect(deliveryPolicy).toBeDefined();
    const inline = parsePolicy(deliveryPolicy!.inputs.policy);
    expect(inline.Statement).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          Sid: "ConfigBucketAclAndLocation",
          Action: ["s3:GetBucketAcl", "s3:ListBucket"],
          Resource: "arn:aws:s3:::af-config-delivery-logs-bucket-mock",
        }),
        // Regression: BucketOwnerEnforced ⇒ no ACLs. The recorder role
        // (tried before the service principal) must not require
        // s3:x-amz-acl or claim s3:PutObjectAcl, or PutDeliveryChannel
        // fails with InsufficientDeliveryPolicyException.
        expect.objectContaining({
          Sid: "ConfigBucketDelivery",
          Action: "s3:PutObject",
          Resource:
            "arn:aws:s3:::af-config-delivery-logs-bucket-mock/AWSLogs/111122223333/Config/*",
        }),
        expect.objectContaining({
          Sid: "ConfigLogBucketKms",
          Action: ["kms:Decrypt", "kms:GenerateDataKey"],
        }),
      ]),
    );

    const configDelivery = inline.Statement.find((s) => s.Sid === "ConfigBucketDelivery");
    expect(JSON.stringify(configDelivery)).not.toContain("x-amz-acl");
    expect(JSON.stringify(configDelivery)).not.toContain("PutObjectAcl");

    const recorder = registrations.find((r) => r.type === "aws:cfg/recorder:Recorder");
    expect(recorder?.inputs.roleArn).not.toBe(IAC_ROLE_ARN);

    const bucketPolicy = registrations.find((r) => r.type === "aws:s3/bucketPolicy:BucketPolicy");
    expect(bucketPolicy).toBeDefined();
    const bucketPolicyDoc = parsePolicy(bucketPolicy!.inputs.policy);
    expect(bucketPolicyDoc.Statement).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ Sid: "AWSCloudTrailWrite" }),
        expect.objectContaining({ Sid: "AWSConfigBucketDelivery" }),
      ]),
    );
  });

  it("keeps log bucket retention conservative unless ephemeral force-destroy is explicit", async () => {
    const retained = new AccountFoundation("af-retained-logs", {
      tier: "sandbox",
      iacRoleArn: IAC_ROLE_ARN,
    });
    await valueOf(retained.cloudTrailArn);
    await settlePulumi();
    const retainedBucket = registrations.find((r) => r.type === "aws:s3/bucket:Bucket");
    expect(retainedBucket?.inputs.forceDestroy).toBeUndefined();

    resetRegistrations();
    const ephemeral = new AccountFoundation("af-ephemeral-logs", {
      tier: "sandbox",
      iacRoleArn: IAC_ROLE_ARN,
      logBucketForceDestroy: true,
    });
    await valueOf(ephemeral.cloudTrailArn);
    await settlePulumi();
    const ephemeralBucket = registrations.find((r) => r.type === "aws:s3/bucket:Bucket");
    expect(ephemeralBucket?.inputs.forceDestroy).toBe(true);
  });

  // M-DETECTIVEREUSE: the reuse path now also asserts posture
  // (status === ENABLED && findingPublishingFrequency === FIFTEEN_MINUTES)
  // via `aws.guardduty.getDetectorOutput`. We install a baseline-compliant
  // detector mock so the *structural* invariants this test was originally
  // written for — no new Detector resource is created with `enable`/tags
  // — still hold under the strengthened reuse contract. Negative-path
  // posture tests (SUSPENDED / SIX_HOURS) live in
  // tests/guardduty-reuse-posture.test.ts which uses per-file mock
  // isolation to drive the failure branches.
  it("references an existing GuardDuty detector without creating a new one (posture-validated)", async () => {
    installHealthyGuardDutyDetectorMock();
    const existingDetectorId = "existing-detector-123";
    const af = new AccountFoundation("af-existing-guardduty", {
      tier: "sandbox",
      iacRoleArn: IAC_ROLE_ARN,
      existingGuardDutyDetectorId: existingDetectorId,
    });
    await expect(valueOf(af.guardDutyDetectorId)).resolves.toBe(existingDetectorId);
    await settlePulumi();

    const detector = registrations.find((r) => r.type === "aws:guardduty/detector:Detector");
    expect(detector?.id).toBe(existingDetectorId);
    expect(detector?.inputs.enable).toBeUndefined();
    expect(detector?.inputs.tags).toBeUndefined();
  });

  it("references an existing Security Hub account without enabling or disabling it", async () => {
    const af = new AccountFoundation("af-existing-securityhub", {
      tier: "sandbox",
      iacRoleArn: IAC_ROLE_ARN,
      useExistingSecurityHubAccount: true,
    });
    await valueOf(af.securityHubHubArn);
    await settlePulumi();

    const hub = registrations.find((r) => r.type === "aws:securityhub/account:Account");
    expect(hub?.id).toBe("111122223333");
    expect(hub?.inputs.enableDefaultStandards).toBeUndefined();
  });
});

describe("AccountFoundation — kmsDenyWithoutTag modes", () => {
  beforeEach(resetRegistrations);

  it("auto mode preserves org-account deny-without-tag behavior", async () => {
    const af = new AccountFoundation("af-kms-auto-org", {
      tier: "startup-hardened",
      iacRoleArn: IAC_ROLE_ARN,
      orgAccountIds: ["111111111111", "222222222222"],
    });
    await valueOf(af.kmsKeyArns);
    await settlePulumi();

    for (const { policy } of kmsKeyPolicies()) {
      const deny = denyWithoutTagStatement(policy);
      expect(deny).toBeDefined();
      expect(deny?.Condition).toEqual({
        StringNotEquals: {
          "aws:PrincipalTag/hulumi:iac-role": "true",
        },
        StringEquals: {
          "aws:PrincipalAccount": ["111111111111", "222222222222"],
        },
      });
    }
  });

  it("auto mode omits deny-without-tag for single-account startup-hardened stacks", async () => {
    const af = new AccountFoundation("af-kms-auto-single", {
      tier: "startup-hardened",
      iacRoleArn: IAC_ROLE_ARN,
    });
    await valueOf(af.kmsKeyArns);
    await settlePulumi();

    for (const { policy } of kmsKeyPolicies()) {
      expect(denyWithoutTagStatement(policy)).toBeUndefined();
    }
  });

  it("force mode applies deny-without-tag in a single-account startup-hardened stack", async () => {
    const af = new AccountFoundation("af-kms-force-single", {
      tier: "startup-hardened",
      iacRoleArn: IAC_ROLE_ARN,
      kmsDenyWithoutTag: "force",
    });
    await valueOf(af.kmsKeyArns);
    await settlePulumi();

    for (const { policy } of kmsKeyPolicies()) {
      const deny = denyWithoutTagStatement(policy);
      expect(deny).toBeDefined();
      expect(deny?.Condition).toEqual({
        StringNotEquals: {
          "aws:PrincipalTag/hulumi:iac-role": "true",
        },
        StringEquals: {
          "aws:PrincipalAccount": ["111122223333"],
        },
      });
    }
  });

  it("off mode suppresses deny-without-tag even when orgAccountIds are supplied", async () => {
    const af = new AccountFoundation("af-kms-off-org", {
      tier: "startup-hardened",
      iacRoleArn: IAC_ROLE_ARN,
      orgAccountIds: ["111111111111"],
      kmsDenyWithoutTag: "off",
    });
    await valueOf(af.kmsKeyArns);
    await settlePulumi();

    for (const { policy } of kmsKeyPolicies()) {
      expect(denyWithoutTagStatement(policy)).toBeUndefined();
    }
  });

  it("invalid kmsDenyWithoutTag mode fails closed", () => {
    expect(
      () =>
        new AccountFoundation("af-kms-bad-mode", {
          tier: "startup-hardened",
          iacRoleArn: IAC_ROLE_ARN,
          kmsDenyWithoutTag: "later" as never,
        }),
    ).toThrowError(/kmsDenyWithoutTag/);
  });
});

describe("AccountFoundation — real-AWS deploy-blocking regression guards", () => {
  beforeEach(resetRegistrations);

  // Regression: bare bucket ARNs in CloudTrail S3 data-event selectors
  // are rejected by AWS with InvalidEventSelectorsException. The value
  // must be an object-level ARN (trailing slash = all objects).
  it("startup-hardened CloudTrail S3 data-event selector uses an object-level ARN (trailing slash)", async () => {
    const af = new AccountFoundation("af-evsel", {
      tier: "startup-hardened",
      iacRoleArn: IAC_ROLE_ARN,
      orgAccountIds: ["111111111111"],
    });
    await valueOf(af.cloudTrailArn);
    await settlePulumi();

    const trail = registrations.find((r) => r.type === "aws:cloudtrail/trail:Trail");
    expect(trail).toBeDefined();
    const selectors = trail!.inputs.eventSelectors as Array<{
      dataResources?: Array<{ type: string; values: string[] }>;
    }>;
    const values = selectors.flatMap((s) => s.dataResources ?? []).flatMap((d) => d.values);
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) {
      expect(typeof v).toBe("string");
      expect(v.endsWith("/")).toBe(true);
    }
  });

  // Regression: the log bucket has SSE-KMS default encryption, so the
  // AWS Config DeliveryChannel must carry the CMK or PutDeliveryChannel
  // fails with InsufficientDeliveryPolicyException.
  it("Config DeliveryChannel sets s3KmsKeyArn for the KMS-encrypted log bucket (both tiers)", async () => {
    for (const tier of ["sandbox", "startup-hardened"] as const) {
      resetRegistrations();
      const af = new AccountFoundation(`af-dc-${tier}`, {
        tier,
        iacRoleArn: IAC_ROLE_ARN,
        ...(tier === "startup-hardened" ? { orgAccountIds: ["111111111111"] } : {}),
      });
      await valueOf(af.configRecorderArn);
      await settlePulumi();

      const dc = registrations.find((r) => r.type === "aws:cfg/deliveryChannel:DeliveryChannel");
      expect(dc, `DeliveryChannel missing for tier=${tier}`).toBeDefined();
      expect(dc!.inputs.s3KmsKeyArn, `s3KmsKeyArn missing for tier=${tier}`).toBeDefined();
    }
  });
});

describe("AccountFoundation — CloudTrail log group output for downstream alarms", () => {
  beforeEach(resetRegistrations);

  it("exposes the startup-hardened CloudTrail log group name for IdentityAlarms wiring", async () => {
    const af = new AccountFoundation("af-log-output", {
      tier: "startup-hardened",
      iacRoleArn: IAC_ROLE_ARN,
      orgAccountIds: ["111111111111"],
    });

    await expect(valueOf(af.cloudTrailLogGroupName)).resolves.toBe("af-log-output-cloudtrail-logs");
    await settlePulumi();

    const logGroup = registrations.find((r) => r.type === "aws:cloudwatch/logGroup:LogGroup");
    expect(logGroup?.name).toBe("af-log-output-cloudtrail-logs");

    // Regression (Codex finding 205dfa88): the log group is worthless as
    // an IdentityAlarms signal unless CloudTrail actually delivers to it.
    // The trail must carry the CWL group + role, backed by an assumable
    // role with logs:CreateLogStream/PutLogEvents.
    const trail = registrations.find((r) => r.type === "aws:cloudtrail/trail:Trail");
    expect(trail?.inputs.cloudWatchLogsGroupArn).toBeDefined();
    expect(trail?.inputs.cloudWatchLogsRoleArn).toBeDefined();

    const cwlRole = registrations.find(
      (r) => r.type === "aws:iam/role:Role" && r.name === "af-log-output-cloudtrail-cwlogs-role",
    );
    expect(cwlRole).toBeDefined();
    expect(parsePolicy(cwlRole!.inputs.assumeRolePolicy).Statement).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          Effect: "Allow",
          Principal: { Service: "cloudtrail.amazonaws.com" },
          Action: "sts:AssumeRole",
        }),
      ]),
    );

    const cwlPolicy = registrations.find(
      (r) =>
        r.type === "aws:iam/rolePolicy:RolePolicy" &&
        r.name === "af-log-output-cloudtrail-cwlogs-policy",
    );
    expect(cwlPolicy).toBeDefined();
    expect(parsePolicy(cwlPolicy!.inputs.policy).Statement).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          Effect: "Allow",
          Action: ["logs:CreateLogStream", "logs:PutLogEvents"],
        }),
      ]),
    );
  });

  it("resolves the sandbox CloudTrail log group output to undefined", async () => {
    const af = new AccountFoundation("af-sandbox-no-log-output", {
      tier: "sandbox",
      iacRoleArn: IAC_ROLE_ARN,
    });

    await expect(valueOf(af.cloudTrailLogGroupName)).resolves.toBeUndefined();
    await settlePulumi();

    expect(registrations.some((r) => r.type === "aws:cloudwatch/logGroup:LogGroup")).toBe(false);
  });
});

describe("AccountFoundation — audit-delivery bucket tamper-resistance invariant (HIGH)", () => {
  beforeEach(resetRegistrations);

  it("sandbox internal log bucket still emits the CloudTrail-Lake EventDataStore (immutable audit capture)", async () => {
    const af = new AccountFoundation("af-sandbox-eds", {
      tier: "sandbox",
      iacRoleArn: IAC_ROLE_ARN,
    });
    await valueOf(af.cloudTrailArn);
    await settlePulumi();

    const eds = registrations.find(
      (r) => r.type === "aws:cloudtrail/eventDataStore:EventDataStore",
    );
    expect(eds).toBeDefined();
    expect(eds!.inputs.retentionPeriod).toBe(7);
  });

  it("startup-hardened internal log bucket carries the deny-audit-tampering invariant, sparing the Config writability-check key", async () => {
    const af = new AccountFoundation("af-hardened-deny", {
      tier: "startup-hardened",
      iacRoleArn: IAC_ROLE_ARN,
      orgAccountIds: ["111111111111"],
    });
    await valueOf(af.cloudTrailArn);
    await settlePulumi();

    const bucketPolicy = registrations.find((r) => r.type === "aws:s3/bucketPolicy:BucketPolicy");
    expect(bucketPolicy).toBeDefined();
    const doc = parsePolicy(bucketPolicy!.inputs.policy);
    const deny = doc.Statement.find((s) => s.Sid === "DenyAuditLogTampering");
    expect(deny).toBeDefined();
    expect(deny!.Effect).toBe("Deny");
    expect(deny!.Action).toEqual([
      "s3:DeleteObject",
      "s3:DeleteObjectVersion",
      "s3:PutBucketVersioning",
    ]);
    const resources = deny!.Resource as string[];
    expect(resources.some((r) => r.includes("/AWSLogs/111122223333/CloudTrail/*"))).toBe(true);
    expect(resources.some((r) => r.includes("/AWSLogs/111122223333/Config/ConfigHistory/*"))).toBe(
      true,
    );
    expect(JSON.stringify(deny)).not.toContain("ConfigWritabilityCheckFile");
  });

  it("startup-hardened AccountFoundation rejects logBucketForceDestroy=true on the audit bucket", () => {
    expect(
      () =>
        new AccountFoundation("af-hardened-fd", {
          tier: "startup-hardened",
          iacRoleArn: IAC_ROLE_ARN,
          orgAccountIds: ["111111111111"],
          logBucketForceDestroy: true,
        }),
    ).toThrowError(/audit.*forceDestroy.*docs\/tiers\.md/i);
  });

  it("sandbox AccountFoundation still honors logBucketForceDestroy=true (ephemeral e2e cleanup)", async () => {
    const af = new AccountFoundation("af-sandbox-fd", {
      tier: "sandbox",
      iacRoleArn: IAC_ROLE_ARN,
      logBucketForceDestroy: true,
    });
    await valueOf(af.cloudTrailArn);
    await settlePulumi();
    const bucket = registrations.find((r) => r.type === "aws:s3/bucket:Bucket");
    expect(bucket?.inputs.forceDestroy).toBe(true);
  });
});

describe("AccountFoundation — no sleep / setTimeout in component-composition source", () => {
  it("packages/baseline/src/aws/ has zero setTimeout / sleep / await new Promise occurrences outside probes/", () => {
    expectNoForbiddenShortcuts({
      dir: resolve(__dirname, "../src/aws"),
      denyPatterns: [
        {
          label: "setTimeout/sleep/await new Promise",
          pattern: /setTimeout|\bsleep\b|await new Promise/,
        },
      ],
      excludePaths: ["probes"],
    });
  });
});

describe("AccountFoundation — invalid iacRoleArn throws", () => {
  it("constructor throws on empty string", () => {
    expect(() => new AccountFoundation("af-bad", { tier: "sandbox", iacRoleArn: "" })).toThrowError(
      /iacRoleArn must be a non-empty string ARN/,
    );
  });

  it("constructor throws on empty existingGuardDutyDetectorId", () => {
    expect(
      () =>
        new AccountFoundation("af-bad-guardduty", {
          tier: "sandbox",
          iacRoleArn: IAC_ROLE_ARN,
          existingGuardDutyDetectorId: "",
        }),
    ).toThrowError(/existingGuardDutyDetectorId must be non-empty/);
  });
});

describe("AccountFoundation — cisVersion v7.0.0 accepted with warning", () => {
  beforeEach(resetRegistrations);

  it("typechecks AND constructs without throwing when cisVersion is v7.0.0", async () => {
    expect(() => {
      const af = new AccountFoundation("af-v7", {
        tier: "sandbox",
        iacRoleArn: IAC_ROLE_ARN,
        cisVersion: "v7.0.0",
      });
      // Use af to avoid noUnusedLocals
      void af.cloudTrailArn;
    }).not.toThrow();
    // Drain the async-registration queue before the next test to keep the
    // shared `registrations` array hygienic.
    await settlePulumi();
  });
});

describe("AccountFoundation — tags emitted on every taggable sub-resource", () => {
  beforeEach(resetRegistrations);

  it("every taggable sub-resource carries hulumi:component=AccountFoundation, hulumi:tier, and hulumi:controls", async () => {
    const af = new AccountFoundation("af-tags", {
      tier: "startup-hardened",
      iacRoleArn: IAC_ROLE_ARN,
      orgAccountIds: ["111111111111"],
    });
    await valueOf(af.cloudTrailArn);
    await settlePulumi();

    // Resources with `tags` input are: Trail, Detector, KMS Key, IAM
    // AccessAnalyzer, ConfigAggregator. We assert the AccountFoundation
    // tag triple appears on each.
    const taggableTypes = new Set([
      "aws:cloudtrail/trail:Trail",
      "aws:guardduty/detector:Detector",
      "aws:kms/key:Key",
      "aws:accessanalyzer/analyzer:Analyzer",
      "aws:cfg/configurationAggregator:ConfigurationAggregator",
    ]);
    const tagged = registrations.filter((r) => taggableTypes.has(r.type));
    expect(tagged.length).toBeGreaterThan(0);
    for (const r of tagged) {
      const tags = r.inputs.tags as Record<string, string> | undefined;
      expect(tags?.["hulumi:component"]).toBe("AccountFoundation");
      expect(tags?.["hulumi:tier"]).toBe("startup-hardened");
      for (const [key, value] of Object.entries(tags ?? {})) {
        if (key === "hulumi:controls" || key.startsWith("hulumi:controls:")) {
          // Separator is `+` (not `,`) — S3 tag values disallow `,`. See #36.
          expect(value).not.toContain(",");
          expect(value.length).toBeLessThanOrEqual(AWS_TAG_VALUE_MAX_LENGTH);
        }
      }
      const controls = controlsFromTags(tags);
      expect(controls.length).toBeGreaterThanOrEqual(5);
    }
  });
});
