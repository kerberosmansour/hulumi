import { beforeEach, describe, expect, it } from "vitest";

import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

describe("AwsOrganizationSecurityFoundation", () => {
  beforeEach(() => {
    resetRegistrations();
  });

  it("Scenario: startup-hardened organization foundation registers delegated admins, central config, S3 BPA, and SCP attachments", async () => {
    const { AwsOrganizationSecurityFoundation } = await import("../src/aws");

    const foundation = new AwsOrganizationSecurityFoundation("org", {
      tier: "startup-hardened",
      managementAccountId: "111122223333",
      securityAccountId: "222233334444",
      logArchiveAccountId: "333344445555",
      homeRegion: "us-east-1",
      enabledRegions: ["us-east-1", "us-west-2"],
      configAggregatorRoleArn: "arn:aws:iam::222233334444:role/hulumi-config-aggregator",
      bootstrapRoleArn: "arn:aws:iam::111122223333:role/hulumi-bootstrap",
      steadyStateRoleArn: "arn:aws:iam::111122223333:role/hulumi-steady-state",
      scpTargetIds: ["r-root", "ou-prod"],
      scps: [
        "deny-leave-organization",
        "deny-disable-security-services",
        "deny-public-s3-policy-changes",
      ],
    });

    await settlePulumi();

    expect(
      registrations.some((r) => r.type === "hulumi:baseline:aws:AwsOrganizationSecurityFoundation"),
    ).toBe(true);
    expect(
      registrations.filter(
        (r) => r.type === "aws:organizations/delegatedAdministrator:DelegatedAdministrator",
      ),
    ).toHaveLength(4);
    expect(
      registrations.some(
        (r) => r.type === "aws:cfg/configurationAggregator:ConfigurationAggregator",
      ),
    ).toBe(true);
    expect(
      registrations.some(
        (r) => r.type === "aws:securityhub/organizationAdminAccount:OrganizationAdminAccount",
      ),
    ).toBe(true);
    expect(
      registrations.some(
        (r) => r.type === "aws:securityhub/organizationConfiguration:OrganizationConfiguration",
      ),
    ).toBe(true);
    expect(
      registrations.some(
        (r) => r.type === "aws:s3/accountPublicAccessBlock:AccountPublicAccessBlock",
      ),
    ).toBe(true);
    expect(registrations.filter((r) => r.type === "aws:organizations/policy:Policy")).toHaveLength(
      3,
    );
    expect(
      registrations.filter((r) => r.type === "aws:organizations/policyAttachment:PolicyAttachment"),
    ).toHaveLength(6);
    for (const policy of registrations.filter(
      (r) => r.type === "aws:organizations/policy:Policy",
    )) {
      const rendered = JSON.parse(String(policy.inputs.content)) as {
        Version: string;
        Statement: Array<{ Action: string[] }>;
      };
      expect(rendered.Version).toBe("2012-10-17");
      expect(rendered.Statement).toHaveLength(1);
      expect(rendered.Statement[0].Action).not.toContain("*");
      expect((policy.inputs.tags as Record<string, string>)["hulumi:org-guardrail-id"]).toMatch(
        /^deny-/,
      );
    }

    const guardrailIds = await valueOf(foundation.guardrailIds);
    expect(guardrailIds).toEqual([
      "deny-leave-organization",
      "deny-disable-security-services",
      "deny-public-s3-policy-changes",
    ]);
  });

  it("Scenario: empty security account ID is rejected before resource registration", async () => {
    const { AwsOrganizationSecurityFoundation } = await import("../src/aws");

    expect(
      () =>
        new AwsOrganizationSecurityFoundation("org", {
          tier: "startup-hardened",
          managementAccountId: "111122223333",
          securityAccountId: "",
          logArchiveAccountId: "333344445555",
          homeRegion: "us-east-1",
          enabledRegions: ["us-east-1"],
          configAggregatorRoleArn: "arn:aws:iam::222233334444:role/hulumi-config-aggregator",
          scpTargetIds: ["r-root"],
        }),
    ).toThrow(/securityAccountId/);
    expect(registrations).toHaveLength(0);
  });

  it("Scenario: bootstrap and steady-state roles must be separated", async () => {
    const { AwsOrganizationSecurityFoundation } = await import("../src/aws");

    expect(
      () =>
        new AwsOrganizationSecurityFoundation("org", {
          tier: "startup-hardened",
          managementAccountId: "111122223333",
          securityAccountId: "222233334444",
          logArchiveAccountId: "333344445555",
          homeRegion: "us-east-1",
          enabledRegions: ["us-east-1"],
          configAggregatorRoleArn: "arn:aws:iam::222233334444:role/hulumi-config-aggregator",
          bootstrapRoleArn: "arn:aws:iam::111122223333:role/hulumi-admin",
          steadyStateRoleArn: "arn:aws:iam::111122223333:role/hulumi-admin",
          scpTargetIds: ["r-root"],
        }),
    ).toThrow(/bootstrapRoleArn and steadyStateRoleArn must be different/);
  });

  it("Scenario: unknown SCP rule IDs are rejected", async () => {
    const { AwsOrganizationSecurityFoundation } = await import("../src/aws");

    expect(
      () =>
        new AwsOrganizationSecurityFoundation("org", {
          tier: "startup-hardened",
          managementAccountId: "111122223333",
          securityAccountId: "222233334444",
          logArchiveAccountId: "333344445555",
          homeRegion: "us-east-1",
          enabledRegions: ["us-east-1"],
          configAggregatorRoleArn: "arn:aws:iam::222233334444:role/hulumi-config-aggregator",
          scpTargetIds: ["r-root"],
          scps: ["deny-everything-forever" as never],
        }),
    ).toThrow(/Unknown AWS organization guardrail/);
  });

  it("Scenario: home region must be part of enabled regions", async () => {
    const { AwsOrganizationSecurityFoundation } = await import("../src/aws");

    expect(
      () =>
        new AwsOrganizationSecurityFoundation("org", {
          tier: "startup-hardened",
          managementAccountId: "111122223333",
          securityAccountId: "222233334444",
          logArchiveAccountId: "333344445555",
          homeRegion: "us-east-1",
          enabledRegions: ["us-west-2"],
          configAggregatorRoleArn: "arn:aws:iam::222233334444:role/hulumi-config-aggregator",
          scpTargetIds: ["r-root"],
        }),
    ).toThrow(/homeRegion must be included in enabledRegions/);
  });

  it("Scenario: sandbox can be modeled without SCP attachments", async () => {
    const { AwsOrganizationSecurityFoundation } = await import("../src/aws");

    new AwsOrganizationSecurityFoundation("sandbox-org", {
      tier: "sandbox",
      managementAccountId: "111122223333",
      securityAccountId: "222233334444",
      logArchiveAccountId: "333344445555",
      homeRegion: "us-east-1",
      enabledRegions: ["us-east-1"],
      configAggregatorRoleArn: "arn:aws:iam::222233334444:role/hulumi-config-aggregator",
      scpTargetIds: [],
      scps: [],
    });

    await settlePulumi();
    expect(
      registrations.some((r) => r.type === "aws:organizations/policyAttachment:PolicyAttachment"),
    ).toBe(false);
  });
});
