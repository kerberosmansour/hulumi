// BDD scenarios for HulumiK8sHardeningPack rule handlers (Runbook
// hulumi-operations-k8s-security M3). Mirrors the BDD Acceptance Scenarios
// table in §17 Milestone 3.

import { beforeEach, describe, expect, it } from "vitest";
import type { ResourceValidationArgs } from "@pulumi/policy";

import {
  k8sWl1NoPrivilegedContainer,
  k8sWl2NoHostNamespace,
  k8sWl3NoLatestImage,
  k8sWl4ResourcesRequired,
  k8sSvc1PublicLoadBalancerNeedsJustification,
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

describe("Scenario: Privileged pod rejected (HULUMI-K8S-WL-1)", () => {
  it("reports a mandatory violation for a Pod with securityContext.privileged: true", () => {
    const args = makeArgs({
      type: "kubernetes:core/v1:Pod",
      urn: "urn:pulumi:s::p::kubernetes:core/v1:Pod::evil-pod",
      name: "evil-pod",
      props: {
        spec: {
          containers: [{ name: "evil", image: "x:1.0", securityContext: { privileged: true } }],
        },
      },
    });
    (
      k8sWl1NoPrivilegedContainer.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/HULUMI-K8S-WL-1/);
  });

  it("does not fire when securityContext.privileged is absent or false", () => {
    const args = makeArgs({
      type: "kubernetes:apps/v1:Deployment",
      urn: "urn:pulumi:s::p::kubernetes:apps/v1:Deployment::api",
      name: "api",
      props: {
        spec: {
          template: {
            spec: { containers: [{ name: "api", image: "api:1.0" }] },
          },
        },
      },
    });
    (
      k8sWl1NoPrivilegedContainer.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(0);
  });

  it("reports for Deployment.spec.template.spec.containers", () => {
    const args = makeArgs({
      type: "kubernetes:apps/v1:Deployment",
      urn: "urn:pulumi:s::p::kubernetes:apps/v1:Deployment::evil-dep",
      name: "evil-dep",
      props: {
        spec: {
          template: {
            spec: {
              containers: [{ name: "evil", image: "x:1.0", securityContext: { privileged: true } }],
            },
          },
        },
      },
    });
    (
      k8sWl1NoPrivilegedContainer.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
  });
});

describe("Scenario: Host namespace rejected (HULUMI-K8S-WL-2)", () => {
  it("rejects hostNetwork: true", () => {
    const args = makeArgs({
      type: "kubernetes:core/v1:Pod",
      urn: "urn:pulumi:s::p::kubernetes:core/v1:Pod::host-net",
      name: "host-net",
      props: {
        spec: { hostNetwork: true, containers: [{ name: "x", image: "x:1.0" }] },
      },
    });
    (
      k8sWl2NoHostNamespace.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/hostNetwork: true/);
  });

  it("rejects hostPID: true", () => {
    const args = makeArgs({
      type: "kubernetes:core/v1:Pod",
      urn: "urn:p::p::kubernetes:core/v1:Pod::host-pid",
      name: "host-pid",
      props: { spec: { hostPID: true, containers: [{ name: "x", image: "x:1.0" }] } },
    });
    (
      k8sWl2NoHostNamespace.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/hostPID/);
  });

  it("suppression with reason silences the rule", () => {
    const args = makeArgs({
      type: "kubernetes:core/v1:Pod",
      urn: "urn:pulumi:s::p::kubernetes:core/v1:Pod::node-agent",
      name: "node-agent",
      props: { spec: { hostNetwork: true, containers: [{ name: "x", image: "x:1.0" }] } },
      getConfig: (() => ({
        suppressions: [
          {
            ruleId: "HULUMI-K8S-WL-2",
            urnScope: "urn:pulumi:s::p::kubernetes:core/v1:Pod::node-agent",
            reason: "Node-level metrics agent — needs host network for /proc scraping.",
          },
        ],
      })) as ResourceValidationArgs["getConfig"],
    });
    (
      k8sWl2NoHostNamespace.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(0);
  });

  it("Scenario: Suppression requires reason — empty/missing reason is ignored", () => {
    const args = makeArgs({
      type: "kubernetes:core/v1:Pod",
      urn: "urn:p::p::kubernetes:core/v1:Pod::no-reason",
      name: "no-reason",
      props: { spec: { hostNetwork: true, containers: [{ name: "x", image: "x:1.0" }] } },
      getConfig: (() => ({
        suppressions: [
          {
            ruleId: "HULUMI-K8S-WL-2",
            urnScope: "urn:p::p::kubernetes:core/v1:Pod::no-reason",
            reason: "   ", // whitespace-only
          },
        ],
      })) as ResourceValidationArgs["getConfig"],
    });
    (
      k8sWl2NoHostNamespace.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
  });
});

describe("Scenario: Latest image rejected (HULUMI-K8S-WL-3)", () => {
  it.each([
    ["nginx:latest", true],
    ["nginx", true],
    ["nginx:edge", true],
    ["registry.example.com:5000/nginx", true], // colon is host:port, no tag
    ["nginx:1.27.0", false],
    ["nginx@sha256:abcdefabcdef", false],
    ["registry.example.com:5000/nginx:1.27.0", false],
  ])("image %s mutable? %s", (image, expectViolation) => {
    const args = makeArgs({
      type: "kubernetes:apps/v1:Deployment",
      urn: `urn:p::p::kubernetes:apps/v1:Deployment::test-${image.replace(/[^a-z0-9]/gi, "-")}`,
      name: "test",
      props: {
        spec: { template: { spec: { containers: [{ name: "x", image }] } } },
      },
    });
    (
      k8sWl3NoLatestImage.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations.length > 0).toBe(expectViolation);
  });
});

describe("Scenario: Missing resources warned (HULUMI-K8S-WL-4)", () => {
  it("reports BOTH `requests` and `limits` missing as advisory violations", () => {
    const args = makeArgs({
      type: "kubernetes:apps/v1:Deployment",
      urn: "urn:p::p::kubernetes:apps/v1:Deployment::no-resources",
      name: "no-resources",
      props: {
        spec: { template: { spec: { containers: [{ name: "api", image: "api:1.0" }] } } },
      },
    });
    (
      k8sWl4ResourcesRequired.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(2);
  });

  it("does not fire when requests + limits are both present", () => {
    const args = makeArgs({
      type: "kubernetes:core/v1:Pod",
      urn: "urn:p::p::kubernetes:core/v1:Pod::well-shaped",
      name: "well-shaped",
      props: {
        spec: {
          containers: [
            {
              name: "api",
              image: "api:1.0",
              resources: {
                requests: { cpu: "100m", memory: "128Mi" },
                limits: { cpu: "500m", memory: "256Mi" },
              },
            },
          ],
        },
      },
    });
    (
      k8sWl4ResourcesRequired.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(0);
  });

  it("enforcement level on the rule is advisory (not mandatory)", () => {
    expect(k8sWl4ResourcesRequired.enforcementLevel).toBe("advisory");
  });
});

describe("Scenario: Public LoadBalancer rejected (HULUMI-K8S-SVC-1)", () => {
  it("rejects type: LoadBalancer with no public-justification annotation", () => {
    const args = makeArgs({
      type: "kubernetes:core/v1:Service",
      urn: "urn:p::p::kubernetes:core/v1:Service::api",
      name: "api",
      props: {
        spec: { type: "LoadBalancer" },
        metadata: { annotations: {} },
      },
    });
    (
      k8sSvc1PublicLoadBalancerNeedsJustification.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/hulumi.dev\/public-justification/);
  });

  it("allows type: LoadBalancer with the public-justification annotation set", () => {
    const args = makeArgs({
      type: "kubernetes:core/v1:Service",
      urn: "urn:p::p::kubernetes:core/v1:Service::public-api",
      name: "public-api",
      props: {
        spec: { type: "LoadBalancer" },
        metadata: {
          annotations: {
            "hulumi.dev/public-justification": "Public marketing site; HTTPS-only.",
          },
        },
      },
    });
    (
      k8sSvc1PublicLoadBalancerNeedsJustification.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(0);
  });

  it("does not fire on ClusterIP / NodePort Services", () => {
    const args = makeArgs({
      type: "kubernetes:core/v1:Service",
      urn: "urn:p::p::kubernetes:core/v1:Service::internal",
      name: "internal",
      props: { spec: { type: "ClusterIP" } },
    });
    (
      k8sSvc1PublicLoadBalancerNeedsJustification.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(0);
  });
});
