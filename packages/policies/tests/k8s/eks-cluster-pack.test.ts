import { beforeEach, describe, expect, it } from "vitest";
import type { ResourceValidationArgs } from "@pulumi/policy";

import { eksCl1NoBroadPublicEndpoint, eksCl2AuditLoggingRequired } from "../../src";

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
