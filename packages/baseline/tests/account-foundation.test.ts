// AccountFoundation BDD scenarios — mocked. Each describe block maps to a
// row of M3's BDD Acceptance Scenarios table. Real-AWS integration lives
// in tests/integration/account-foundation.integration.test.ts (skipped on
// PRs; weekly schedule).

import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { AccountFoundation } from "../src/aws/account-foundation";
import { GUARDDUTY_HARDENED_FEATURES } from "../src/aws/guardduty";
import { registrations, resetRegistrations, valueOf, settlePulumi } from "./setup";

const IAC_ROLE_ARN = "arn:aws:iam::111122223333:role/hulumi-sandbox-iac-role";

const SANDBOX_TYPES = [
  "aws:kms/key:Key",
  "aws:kms/alias:Alias",
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

describe("AccountFoundation — no sleep / setTimeout in component-composition source", () => {
  it("packages/baseline/src/aws/ has zero setTimeout / sleep / await new Promise occurrences outside probes/", () => {
    const root = resolve(__dirname, "../src/aws");
    const banned = [/setTimeout/, /\bsleep\b/, /await new Promise/];
    const offenders: string[] = [];

    function walk(dir: string): void {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
          // Probes/ is the sanctioned escape hatch for AWS eventual-consistency
          // — every use of setTimeout in @hulumi/baseline lives there. Walking
          // skips that subtree.
          if (entry === "probes") continue;
          walk(full);
        } else if (entry.endsWith(".ts")) {
          const text = readFileSync(full, "utf8");
          for (const pat of banned) {
            if (pat.test(text)) {
              offenders.push(`${full} matched ${pat}`);
            }
          }
        }
      }
    }

    walk(root);
    expect(offenders).toEqual([]);
  });
});

describe("AccountFoundation — invalid iacRoleArn throws", () => {
  it("constructor throws on empty string", () => {
    expect(() => new AccountFoundation("af-bad", { tier: "sandbox", iacRoleArn: "" })).toThrowError(
      /iacRoleArn must be a non-empty string ARN/,
    );
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
      // Separator is `+` (not `,`) — S3 tag values disallow `,`. See #36.
      const controls = tags?.["hulumi:controls"]?.split("+") ?? [];
      expect(controls.length).toBeGreaterThanOrEqual(5);
    }
  });
});
