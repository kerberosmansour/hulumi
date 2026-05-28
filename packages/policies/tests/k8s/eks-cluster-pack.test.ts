import { beforeEach, describe, expect, it } from "vitest";
import type { ResourceValidationArgs } from "@pulumi/policy";

import {
  eksCl1NoBroadPublicEndpoint,
  eksCl2AuditLoggingRequired,
  eksFnd1AuditLoggingRequired,
  eksFnd2LaunchTemplateImdsV2Required,
} from "../../src";

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

describe("Scenario: EKS public endpoint broad CIDR rejected (HULUMI-EKS-CL-1)", () => {
  it("rejects public endpoint with publicAccessCidrs containing 0.0.0.0/0", () => {
    const args = makeArgs({
      type: "aws:eks/cluster:Cluster",
      urn: "urn:p::p::aws:eks/cluster:Cluster::open-cluster",
      name: "open-cluster",
      props: {
        vpcConfig: {
          endpointPublicAccess: true,
          publicAccessCidrs: ["0.0.0.0/0"],
        },
        enabledClusterLogTypes: ["audit"],
      },
    });
    (
      eksCl1NoBroadPublicEndpoint.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/0\.0\.0\.0\/0/);
  });

  it("rejects public endpoint with unset publicAccessCidrs (default = 0.0.0.0/0)", () => {
    const args = makeArgs({
      type: "aws:eks/cluster:Cluster",
      urn: "urn:p::p::aws:eks/cluster:Cluster::default-public",
      name: "default-public",
      props: {
        vpcConfig: { endpointPublicAccess: true },
        enabledClusterLogTypes: ["audit"],
      },
    });
    (
      eksCl1NoBroadPublicEndpoint.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
  });

  it("allows public endpoint with restricted CIDRs", () => {
    const args = makeArgs({
      type: "aws:eks/cluster:Cluster",
      urn: "urn:p::p::aws:eks/cluster:Cluster::restricted",
      name: "restricted",
      props: {
        vpcConfig: {
          endpointPublicAccess: true,
          publicAccessCidrs: ["198.51.100.0/24"],
        },
        enabledClusterLogTypes: ["audit"],
      },
    });
    (
      eksCl1NoBroadPublicEndpoint.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(0);
  });

  it("rejects public endpoint with split-range CIDRs covering all of IPv4", () => {
    const args = makeArgs({
      type: "aws:eks/cluster:Cluster",
      urn: "urn:p::p::aws:eks/cluster:Cluster::split-range",
      name: "split-range",
      props: {
        vpcConfig: {
          endpointPublicAccess: true,
          publicAccessCidrs: ["0.0.0.0/1", "128.0.0.0/1"],
        },
        enabledClusterLogTypes: ["audit"],
      },
    });
    (
      eksCl1NoBroadPublicEndpoint.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/HULUMI-EKS-CL-1/);
  });

  it("rejects public endpoint with malformed publicAccessCidrs", () => {
    const args = makeArgs({
      type: "aws:eks/cluster:Cluster",
      urn: "urn:p::p::aws:eks/cluster:Cluster::malformed",
      name: "malformed",
      props: {
        vpcConfig: {
          endpointPublicAccess: true,
          publicAccessCidrs: ["not-a-cidr"],
        },
        enabledClusterLogTypes: ["audit"],
      },
    });
    (
      eksCl1NoBroadPublicEndpoint.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
  });

  it("allows private-only endpoint regardless of CIDRs", () => {
    const args = makeArgs({
      type: "aws:eks/cluster:Cluster",
      urn: "urn:p::p::aws:eks/cluster:Cluster::private",
      name: "private",
      props: {
        vpcConfig: { endpointPublicAccess: false, endpointPrivateAccess: true },
        enabledClusterLogTypes: ["audit"],
      },
    });
    (
      eksCl1NoBroadPublicEndpoint.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(0);
  });
});

describe("Scenario: EKS audit logging required (HULUMI-EKS-CL-2)", () => {
  it("rejects cluster with no enabledClusterLogTypes", () => {
    const args = makeArgs({
      type: "aws:eks/cluster:Cluster",
      urn: "urn:p::p::aws:eks/cluster:Cluster::no-logs",
      name: "no-logs",
      props: { vpcConfig: { endpointPublicAccess: false } },
    });
    (
      eksCl2AuditLoggingRequired.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/audit/);
  });

  it("rejects cluster with logs enabled but missing 'audit' type", () => {
    const args = makeArgs({
      type: "aws:eks/cluster:Cluster",
      urn: "urn:p::p::aws:eks/cluster:Cluster::partial-logs",
      name: "partial-logs",
      props: {
        vpcConfig: { endpointPublicAccess: false },
        enabledClusterLogTypes: ["api", "controllerManager"],
      },
    });
    (
      eksCl2AuditLoggingRequired.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
  });

  it("allows cluster with audit log enabled", () => {
    const args = makeArgs({
      type: "aws:eks/cluster:Cluster",
      urn: "urn:p::p::aws:eks/cluster:Cluster::ok",
      name: "ok",
      props: {
        vpcConfig: { endpointPublicAccess: false },
        enabledClusterLogTypes: ["api", "audit", "authenticator"],
      },
    });
    (
      eksCl2AuditLoggingRequired.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(0);
  });
});

describe("Scenario: EKS foundation audit logging required (HULUMI-EKS-FND-1)", () => {
  it("rejects a foundation-tagged EKS cluster missing audit logs", () => {
    const args = makeArgs({
      type: "aws:eks/cluster:Cluster",
      urn: "urn:p::p::aws:eks/cluster:Cluster::foundation-no-audit",
      name: "foundation-no-audit",
      props: {
        tags: { "hulumi:component": "EksClusterFoundation" },
        vpcConfig: { endpointPublicAccess: false, endpointPrivateAccess: true },
        enabledClusterLogTypes: ["api"],
      },
    });
    (
      eksFnd1AuditLoggingRequired.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/HULUMI-EKS-FND-1/);
  });
});

describe("Scenario: EKS foundation node IMDSv2 required (HULUMI-EKS-FND-2)", () => {
  it("rejects a foundation launch template that allows IMDSv1", () => {
    const args = makeArgs({
      type: "aws:ec2/launchTemplate:LaunchTemplate",
      urn: "urn:p::p::aws:ec2/launchTemplate:LaunchTemplate::node-lt",
      name: "node-lt",
      props: {
        tags: { "hulumi:component": "EksClusterFoundation" },
        metadataOptions: { httpTokens: "optional" },
      },
    });
    (
      eksFnd2LaunchTemplateImdsV2Required.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/HULUMI-EKS-FND-2/);
  });

  it("allows a foundation launch template with IMDSv2 required", () => {
    const args = makeArgs({
      type: "aws:ec2/launchTemplate:LaunchTemplate",
      urn: "urn:p::p::aws:ec2/launchTemplate:LaunchTemplate::node-lt",
      name: "node-lt",
      props: {
        tags: { "hulumi:component": "EksClusterFoundation" },
        metadataOptions: { httpTokens: "required" },
      },
    });
    (
      eksFnd2LaunchTemplateImdsV2Required.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(0);
  });
});
