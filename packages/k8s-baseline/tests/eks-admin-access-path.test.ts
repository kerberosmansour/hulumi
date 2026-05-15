import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { EksAdminAccessPath, EKS_ADMIN_ACCESS_PATH_COMPONENT_TYPE } from "../src";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

beforeEach(() => {
  resetRegistrations();
});
afterEach(() => {
  vi.restoreAllMocks();
});

function securityGroupRules() {
  return registrations.filter((r) => r.type === "aws:ec2/securityGroupRule:SecurityGroupRule");
}

describe("EksAdminAccessPath — happy paths", () => {
  test("Scenario: private endpoint emits operator SG ingress and auditable endpoint config", async () => {
    const c = new EksAdminAccessPath("admin-path", {
      clusterName: "prod-eks",
      endpointMode: "private",
      clusterSecurityGroupId: "sg-cluster",
      operatorAccess: {
        cidrBlocks: ["10.40.0.0/16"],
        sourceSecurityGroupIds: ["sg-vpn"],
      },
    });

    await settlePulumi();

    expect(registrations.some((r) => r.type === EKS_ADMIN_ACCESS_PATH_COMPONENT_TYPE)).toBe(true);
    expect(securityGroupRules()).toHaveLength(2);
    expect(await valueOf(c.endpointAccessConfig)).toEqual({
      endpointPrivateAccess: true,
      endpointPublicAccess: false,
      publicAccessCidrs: [],
    });
    expect(await valueOf(c.securityGroupRuleIds)).toHaveLength(2);
  });

  test("Scenario: restricted public endpoint records explicit CIDRs without SG rules", async () => {
    const c = new EksAdminAccessPath("admin-path", {
      clusterName: "prod-eks",
      endpointMode: "restricted-public",
      publicAccessCidrs: ["203.0.113.10/32"],
    });

    await settlePulumi();

    expect(securityGroupRules()).toHaveLength(0);
    expect(await valueOf(c.endpointAccessConfig)).toEqual({
      endpointPrivateAccess: true,
      endpointPublicAccess: true,
      publicAccessCidrs: ["203.0.113.10/32"],
    });
  });

  test("Scenario: temporary public endpoint requires explicit expiry and exposes policy note", async () => {
    const c = new EksAdminAccessPath("admin-path", {
      clusterName: "prod-eks",
      endpointMode: "public-temporary",
      publicAccessCidrs: ["0.0.0.0/0"],
      temporaryBroadPublicAccess: {
        reason: "bootstrap operator VPN",
        expiresOn: "2026-06-30",
        ticketUrl: "https://example.invalid/issues/1",
      },
    });

    await settlePulumi();

    expect(await valueOf(c.endpointPublicAccess)).toBe(true);
    expect(await valueOf(c.publicAccessCidrs)).toEqual(["0.0.0.0/0"]);
    expect(await valueOf(c.policyExceptionReason)).toMatch(/bootstrap operator VPN/);
  });

  test("Scenario: SG rule creation can be disabled for externally managed network paths", async () => {
    const c = new EksAdminAccessPath("admin-path", {
      clusterName: "prod-eks",
      endpointMode: "private",
      createSecurityGroupRules: false,
      operatorAccess: {
        sourceSecurityGroupIds: ["sg-client-vpn"],
      },
    });

    await settlePulumi();

    expect(securityGroupRules()).toHaveLength(0);
    expect(await valueOf(c.securityGroupRuleIds)).toEqual([]);
  });
});

describe("EksAdminAccessPath — invalid input refusals", () => {
  test("Scenario: restricted public endpoint rejects 0.0.0.0/0", () => {
    expect(
      () =>
        new EksAdminAccessPath("admin-path", {
          clusterName: "prod-eks",
          endpointMode: "restricted-public",
          publicAccessCidrs: ["0.0.0.0/0"],
        }),
    ).toThrow(/publicAccessCidrs.*0\.0\.0\.0\/0.*public-temporary/);
  });

  test("Scenario: temporary broad public access requires reason and expiry", () => {
    expect(
      () =>
        new EksAdminAccessPath("admin-path", {
          clusterName: "prod-eks",
          endpointMode: "public-temporary",
          publicAccessCidrs: ["0.0.0.0/0"],
        }),
    ).toThrow(/temporaryBroadPublicAccess/);
  });

  test("Scenario: operator CIDRs reject broad ingress", () => {
    expect(
      () =>
        new EksAdminAccessPath("admin-path", {
          clusterName: "prod-eks",
          endpointMode: "private",
          clusterSecurityGroupId: "sg-cluster",
          operatorAccess: {
            cidrBlocks: ["0.0.0.0/0"],
          },
        }),
    ).toThrow(/operatorAccess\.cidrBlocks.*0\.0\.0\.0\/0/);
  });

  test("private endpoint requires an operator access source", () => {
    expect(
      () =>
        new EksAdminAccessPath("admin-path", {
          clusterName: "prod-eks",
          endpointMode: "private",
          clusterSecurityGroupId: "sg-cluster",
        }),
    ).toThrow(/private endpoint requires operatorAccess/);
  });

  test("SG rule creation requires clusterSecurityGroupId", () => {
    expect(
      () =>
        new EksAdminAccessPath("admin-path", {
          clusterName: "prod-eks",
          endpointMode: "private",
          operatorAccess: {
            sourceSecurityGroupIds: ["sg-client-vpn"],
          },
        }),
    ).toThrow(/clusterSecurityGroupId is required/);
  });
});
