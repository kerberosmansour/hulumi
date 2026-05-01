import { beforeEach, describe, expect, it } from "vitest";
import type { ResourceValidationArgs } from "@pulumi/policy";

import {
  oPatch1RestrictPatchGroupTag,
  oAudit1CloudTrailPosture,
  oAudit2CloudTrailLogGroupEncrypted,
  oInspector1FullCoverage,
} from "../src";

function makeArgs(partial: Partial<ResourceValidationArgs>): ResourceValidationArgs {
  return {
    type: "",
    props: {},
    urn: "",
    name: "",
    opts: {} as ResourceValidationArgs["opts"],
    isType: (() => false) as ResourceValidationArgs["isType"],
    asType: ((): undefined => undefined) as ResourceValidationArgs["asType"],
    getConfig: (() => ({})) as ResourceValidationArgs["getConfig"],
    ...partial,
  } as ResourceValidationArgs;
}

let violations: string[];
const report = (msg: string): void => {
  violations.push(msg);
};
beforeEach(() => {
  violations = [];
});

describe("Scenario: O_PATCH_1 — Patch:Group tag enum enforcement", () => {
  it("rejects free-form values like 'qa'", () => {
    const args = makeArgs({
      type: "aws:ssm/maintenanceWindowTarget:MaintenanceWindowTarget",
      urn: "urn:p::p::aws:ssm/maintenanceWindowTarget:MaintenanceWindowTarget::bad",
      name: "bad",
      props: { targets: [{ key: "tag:Patch:Group", values: ["qa"] }] },
    });
    (
      oPatch1RestrictPatchGroupTag.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/"qa".*not in \{dev, staging, production\}/);
  });

  it("allows the canonical three values", () => {
    for (const v of ["dev", "staging", "production"]) {
      violations = [];
      const args = makeArgs({
        type: "aws:ssm/maintenanceWindowTarget:MaintenanceWindowTarget",
        urn: `urn:p::p::aws:ssm/maintenanceWindowTarget:MaintenanceWindowTarget::ok-${v}`,
        name: `ok-${v}`,
        props: { targets: [{ key: "tag:Patch:Group", values: [v] }] },
      });
      (
        oPatch1RestrictPatchGroupTag.validateResource as (
          a: ResourceValidationArgs,
          r: (m: string) => void,
        ) => void
      )(args, report);
      expect(violations).toHaveLength(0);
    }
  });
});

describe("Scenario: O_AUDIT_1 — CloudTrail multi-region + log-file validation", () => {
  it("rejects single-region trail", () => {
    const args = makeArgs({
      type: "aws:cloudtrail/trail:Trail",
      urn: "urn:p::p::aws:cloudtrail/trail:Trail::bad-1",
      name: "bad-1",
      props: { isMultiRegionTrail: false, enableLogFileValidation: true },
    });
    (
      oAudit1CloudTrailPosture.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations.some((m) => /not multi-region/.test(m))).toBe(true);
  });

  it("rejects trail without log-file validation", () => {
    const args = makeArgs({
      type: "aws:cloudtrail/trail:Trail",
      urn: "urn:p::p::aws:cloudtrail/trail:Trail::bad-2",
      name: "bad-2",
      props: { isMultiRegionTrail: true, enableLogFileValidation: false },
    });
    (
      oAudit1CloudTrailPosture.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations.some((m) => /log-file validation/.test(m))).toBe(true);
  });

  it("allows compliant trail", () => {
    const args = makeArgs({
      type: "aws:cloudtrail/trail:Trail",
      urn: "urn:p::p::aws:cloudtrail/trail:Trail::ok",
      name: "ok",
      props: { isMultiRegionTrail: true, enableLogFileValidation: true },
    });
    (
      oAudit1CloudTrailPosture.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(0);
  });
});

describe("Scenario: O_AUDIT_2 — CT log group KMS-encrypted", () => {
  it("rejects /aws/cloudtrail/* log group without kmsKeyId", () => {
    const args = makeArgs({
      type: "aws:cloudwatch/logGroup:LogGroup",
      urn: "urn:p::p::aws:cloudwatch/logGroup:LogGroup::bad",
      name: "bad",
      props: { name: "/aws/cloudtrail/account-trail" },
    });
    (
      oAudit2CloudTrailLogGroupEncrypted.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
  });

  it("ignores non-CT log groups", () => {
    const args = makeArgs({
      type: "aws:cloudwatch/logGroup:LogGroup",
      urn: "urn:p::p::aws:cloudwatch/logGroup:LogGroup::ok",
      name: "ok",
      props: { name: "/aws/lambda/my-fn" },
    });
    (
      oAudit2CloudTrailLogGroupEncrypted.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(0);
  });
});

describe("Scenario: O_INSPECTOR_1 — Inspector v2 covers EC2 + ECR + LAMBDA", () => {
  it("rejects partial coverage", () => {
    const args = makeArgs({
      type: "aws:inspector2/enabler:Enabler",
      urn: "urn:p::p::aws:inspector2/enabler:Enabler::bad",
      name: "bad",
      props: { resourceTypes: ["EC2", "ECR"] }, // missing LAMBDA
    });
    (
      oInspector1FullCoverage.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations.some((m) => /"LAMBDA"/.test(m))).toBe(true);
  });

  it("allows full coverage", () => {
    const args = makeArgs({
      type: "aws:inspector2/enabler:Enabler",
      urn: "urn:p::p::aws:inspector2/enabler:Enabler::ok",
      name: "ok",
      props: { resourceTypes: ["EC2", "ECR", "LAMBDA"] },
    });
    (
      oInspector1FullCoverage.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(0);
  });
});

describe("Suppression with reason silences O-INSPECTOR-1", () => {
  it("respects suppression entries with non-empty reason", () => {
    const args = makeArgs({
      type: "aws:inspector2/enabler:Enabler",
      urn: "urn:p::p::aws:inspector2/enabler:Enabler::sandbox",
      name: "sandbox",
      props: { resourceTypes: ["EC2"] },
      getConfig: (() => ({
        suppressions: [
          {
            ruleId: "HULUMI-O-INSPECTOR-1",
            urnScope: "urn:p::p::aws:inspector2/enabler:Enabler::sandbox",
            reason: "Sandbox account — Lambda not in use yet.",
          },
        ],
      })) as ResourceValidationArgs["getConfig"],
    });
    (
      oInspector1FullCoverage.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(0);
  });
});
