import { beforeEach, describe, expect, it } from "vitest";
import type { PolicyResource, ResourceValidationArgs, StackValidationArgs } from "@pulumi/policy";

import {
  org1DelegatedAdminsRequired,
  org2RoleSeparationRequired,
  org3ApprovedScpSetRequired,
  org4AccountPublicAccessBlockRequired,
  org5AccountPublicAccessBlockPresent,
  org6SandboxScpAdvisory,
} from "../src";

function makeResourceArgs(partial: Partial<ResourceValidationArgs>): ResourceValidationArgs {
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

function makePolicyResource(partial: Partial<PolicyResource>): PolicyResource {
  return {
    type: "",
    props: {},
    urn: "",
    name: "",
    opts: {} as PolicyResource["opts"],
    dependencies: [],
    propertyDependencies: {},
    isType: (() => false) as PolicyResource["isType"],
    asType: ((): undefined => undefined) as PolicyResource["asType"],
    ...partial,
  } as PolicyResource;
}

function makeStackArgs(resources: PolicyResource[]): StackValidationArgs {
  return {
    resources,
    stackTags: new Map(),
    getConfig: (() => ({})) as StackValidationArgs["getConfig"],
    notApplicable: ((reason?: string) => {
      throw new Error(reason ?? "not applicable");
    }) as StackValidationArgs["notApplicable"],
  };
}

let violations: string[];
const report = (msg: string): void => {
  violations.push(msg);
};

const FOUNDATION_TYPE = "hulumi:baseline:aws:AwsOrganizationSecurityFoundation";
const DELEGATED_ADMIN_TYPE = "aws:organizations/delegatedAdministrator:DelegatedAdministrator";
const REQUIRED_DELEGATED_ADMIN_SERVICES = [
  "guardduty.amazonaws.com",
  "securityhub.amazonaws.com",
  "config.amazonaws.com",
  "access-analyzer.amazonaws.com",
] as const;

function foundation(name: string, securityAccountId: unknown): PolicyResource {
  return makePolicyResource({
    type: FOUNDATION_TYPE,
    urn: `urn:p::p::${FOUNDATION_TYPE}::${name}`,
    name,
    props: { tier: "startup-hardened", securityAccountId },
  });
}

function delegatedAdmin(
  servicePrincipal: string,
  accountId: unknown,
  name = servicePrincipal,
): PolicyResource {
  return makePolicyResource({
    type: DELEGATED_ADMIN_TYPE,
    urn: `urn:p::p::${DELEGATED_ADMIN_TYPE}::${name}`,
    name,
    props: { servicePrincipal, accountId },
  });
}

function validateOrg1(resources: PolicyResource[]): void {
  (
    org1DelegatedAdminsRequired.validateStack as (
      a: StackValidationArgs,
      r: (m: string) => void,
    ) => void
  )(makeStackArgs(resources), report);
}

beforeEach(() => {
  violations = [];
});

describe("Hulumi AWS organization hardening pack", () => {
  it("Scenario: missing delegated admin resources report ORG-1", () => {
    validateOrg1([foundation("org", "222233334444")]);

    expect(violations.some((m) => /HULUMI-ORG-1/.test(m))).toBe(true);
    expect(violations.join("\n")).toContain("guardduty.amazonaws.com");
  });

  it("Scenario: delegated administrators in another account do not satisfy ORG-1", () => {
    validateOrg1([
      foundation("org", "222233334444"),
      ...REQUIRED_DELEGATED_ADMIN_SERVICES.map((service) =>
        delegatedAdmin(service, "999900001111"),
      ),
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/HULUMI-ORG-1/);
    expect(violations[0]).toContain("222233334444");
    for (const service of REQUIRED_DELEGATED_ADMIN_SERVICES) {
      expect(violations[0]).toContain(service);
    }
  });

  it.each([
    ["missing", undefined],
    ["non-string", { output: true }],
    ["malformed", "security-account"],
  ])("Scenario: %s foundation security account identity fails closed", (name, accountId) => {
    validateOrg1([foundation(name, accountId)]);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/HULUMI-ORG-1/);
    expect(violations[0]).toContain(`::${name}`);
    expect(violations[0]).toMatch(/12-digit securityAccountId/);
  });

  it("Scenario: malformed delegated-admin account identity does not count", () => {
    validateOrg1([
      foundation("org", "222233334444"),
      delegatedAdmin("guardduty.amazonaws.com", undefined),
      delegatedAdmin("securityhub.amazonaws.com", { output: true }),
      delegatedAdmin("config.amazonaws.com", "wrong-account"),
      delegatedAdmin("access-analyzer.amazonaws.com", "222233334444"),
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("guardduty.amazonaws.com");
    expect(violations[0]).toContain("securityhub.amazonaws.com");
    expect(violations[0]).toContain("config.amazonaws.com");
    expect(violations[0]).not.toContain("access-analyzer.amazonaws.com");
  });

  it("Scenario: a correct delegate wins over a wrong-account decoy for the same service", () => {
    validateOrg1([
      foundation("org", "222233334444"),
      delegatedAdmin("guardduty.amazonaws.com", "999900001111", "guardduty-decoy"),
      ...REQUIRED_DELEGATED_ADMIN_SERVICES.map((service) =>
        delegatedAdmin(service, "222233334444", `correct-${service}`),
      ),
    ]);

    expect(violations).toEqual([]);
  });

  it("Scenario: each startup-hardened foundation is evaluated independently", () => {
    validateOrg1([
      foundation("org-a", "222233334444"),
      foundation("org-b", "555566667777"),
      ...REQUIRED_DELEGATED_ADMIN_SERVICES.map((service) =>
        delegatedAdmin(service, "222233334444", `org-a-${service}`),
      ),
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("::org-b");
    expect(violations[0]).toContain("555566667777");
  });

  it("Scenario: exact security-account delegates satisfy ORG-1", () => {
    validateOrg1([
      foundation("org", "222233334444"),
      ...REQUIRED_DELEGATED_ADMIN_SERVICES.map((service) =>
        delegatedAdmin(service, "222233334444"),
      ),
    ]);

    expect(violations).toEqual([]);
  });

  it("Scenario: ORG-1 does not apply without a startup-hardened foundation", () => {
    validateOrg1([
      makePolicyResource({
        type: FOUNDATION_TYPE,
        urn: `urn:p::p::${FOUNDATION_TYPE}::sandbox`,
        props: { tier: "sandbox", securityAccountId: "222233334444" },
      }),
    ]);

    expect(violations).toEqual([]);
  });

  it("Scenario: one role for bootstrap and steady-state reports ORG-2", () => {
    (
      org2RoleSeparationRequired.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(
      makeStackArgs([
        makePolicyResource({
          type: "hulumi:baseline:aws:AwsOrganizationSecurityFoundation",
          urn: "urn:p::p::hulumi:baseline:aws:AwsOrganizationSecurityFoundation::org",
          props: {
            tier: "startup-hardened",
            bootstrapRoleArn: "arn:aws:iam::111122223333:role/hulumi-admin",
            steadyStateRoleArn: "arn:aws:iam::111122223333:role/hulumi-admin",
          },
        }),
      ]),
      report,
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/HULUMI-ORG-2/);
  });

  it("Scenario: startup-hardened org stack without required SCPs reports ORG-3", () => {
    (
      org3ApprovedScpSetRequired.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(
      makeStackArgs([
        makePolicyResource({
          type: "hulumi:baseline:aws:AwsOrganizationSecurityFoundation",
          urn: "urn:p::p::hulumi:baseline:aws:AwsOrganizationSecurityFoundation::org",
          props: { tier: "startup-hardened" },
        }),
      ]),
      report,
    );

    expect(violations.some((m) => /HULUMI-ORG-3/.test(m))).toBe(true);
    expect(violations.join("\n")).toMatch(/deny-disable-security-services/);
  });

  it("Scenario: sandbox without SCP attachments has no mandatory ORG-3 violation", () => {
    (
      org3ApprovedScpSetRequired.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(
      makeStackArgs([
        makePolicyResource({
          type: "hulumi:baseline:aws:AwsOrganizationSecurityFoundation",
          urn: "urn:p::p::hulumi:baseline:aws:AwsOrganizationSecurityFoundation::org",
          props: { tier: "sandbox" },
        }),
      ]),
      report,
    );

    expect(violations).toHaveLength(0);
  });

  it("Scenario: sandbox without SCP attachments emits an advisory ORG-6 finding", () => {
    (
      org6SandboxScpAdvisory.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(
      makeStackArgs([
        makePolicyResource({
          type: "hulumi:baseline:aws:AwsOrganizationSecurityFoundation",
          urn: "urn:p::p::hulumi:baseline:aws:AwsOrganizationSecurityFoundation::org",
          props: { tier: "sandbox", scps: [] },
        }),
      ]),
      report,
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/HULUMI-ORG-6/);
    expect(violations[0]).toMatch(/sandbox tier/);
  });

  it("Scenario: account-level S3 Public Access Block must set all four switches", () => {
    const args = makeResourceArgs({
      type: "aws:s3/accountPublicAccessBlock:AccountPublicAccessBlock",
      urn: "urn:p::p::aws:s3/accountPublicAccessBlock:AccountPublicAccessBlock::bad",
      name: "bad",
      props: {
        blockPublicAcls: true,
        blockPublicPolicy: true,
        ignorePublicAcls: false,
        restrictPublicBuckets: true,
      },
    });

    (
      org4AccountPublicAccessBlockRequired.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/HULUMI-ORG-4/);
    expect(violations[0]).toMatch(/ignorePublicAcls/);
  });

  it("Scenario: startup-hardened org stack without account-level S3 BPA reports ORG-5", () => {
    (
      org5AccountPublicAccessBlockPresent.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(
      makeStackArgs([
        makePolicyResource({
          type: "hulumi:baseline:aws:AwsOrganizationSecurityFoundation",
          urn: "urn:p::p::hulumi:baseline:aws:AwsOrganizationSecurityFoundation::org",
          props: { tier: "startup-hardened" },
        }),
      ]),
      report,
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/HULUMI-ORG-5/);
  });
});
