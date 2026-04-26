import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as pulumi from "@pulumi/pulumi";

import { EKS_SUBNET_TAGGER_COMPONENT_TYPE, EksSubnetTagger } from "../src/eks-subnet-tagger";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

beforeEach(() => {
  resetRegistrations();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EksSubnetTagger — happy paths", () => {
  test("with both lists writes 2 tags per subnet (role + cluster)", async () => {
    new EksSubnetTagger("alb-discovery", {
      clusterName: "test-cluster",
      ownership: "shared",
      publicSubnetIds: ["subnet-aaa", "subnet-bbb"],
      privateSubnetIds: ["subnet-ccc"],
    });
    await settlePulumi();
    const tags = registrations.filter((r) => r.type === "aws:ec2/tag:Tag");
    expect(tags).toHaveLength(6); // 2 public * 2 + 1 private * 2
    const elbTags = tags.filter((t) => t.inputs.key === "kubernetes.io/role/elb");
    const internalElbTags = tags.filter((t) => t.inputs.key === "kubernetes.io/role/internal-elb");
    const clusterTags = tags.filter((t) => t.inputs.key === "kubernetes.io/cluster/test-cluster");
    expect(elbTags).toHaveLength(2);
    expect(internalElbTags).toHaveLength(1);
    expect(clusterTags).toHaveLength(3);
    for (const t of clusterTags) {
      expect(t.inputs.value).toBe("shared");
    }
    for (const t of [...elbTags, ...internalElbTags]) {
      expect(t.inputs.value).toBe("1");
    }
  });

  test("private-only writes only internal-elb tags", async () => {
    new EksSubnetTagger("priv-only", {
      clusterName: "c",
      ownership: "shared",
      privateSubnetIds: ["s-1", "s-2"],
    });
    await settlePulumi();
    const tags = registrations.filter((r) => r.type === "aws:ec2/tag:Tag");
    expect(tags).toHaveLength(4); // 2 subnets * 2 tags each
    expect(tags.some((t) => t.inputs.key === "kubernetes.io/role/elb")).toBe(false);
    expect(
      tags.filter((t) => t.inputs.key === "kubernetes.io/role/internal-elb"),
    ).toHaveLength(2);
  });

  test("public-only writes only elb tags", async () => {
    new EksSubnetTagger("pub-only", {
      clusterName: "c",
      ownership: "owned",
      publicSubnetIds: ["s-1"],
    });
    await settlePulumi();
    const tags = registrations.filter((r) => r.type === "aws:ec2/tag:Tag");
    expect(tags).toHaveLength(2);
    expect(tags.some((t) => t.inputs.key === "kubernetes.io/role/internal-elb")).toBe(false);
    expect(tags.some((t) => t.inputs.key === "kubernetes.io/role/elb")).toBe(true);
  });

  test('ownership:"owned" writes "=owned" cluster tag value', async () => {
    new EksSubnetTagger("owned", {
      clusterName: "single-tenant",
      ownership: "owned",
      publicSubnetIds: ["s-1"],
    });
    await settlePulumi();
    const clusterTags = registrations
      .filter((r) => r.type === "aws:ec2/tag:Tag")
      .filter((t) => t.inputs.key === "kubernetes.io/cluster/single-tenant");
    expect(clusterTags).toHaveLength(1);
    expect(clusterTags[0].inputs.value).toBe("owned");
  });

  test("tagsApplied output enumerates every tag", async () => {
    const t = new EksSubnetTagger("out-test", {
      clusterName: "c",
      ownership: "shared",
      publicSubnetIds: ["s-1"],
      privateSubnetIds: ["s-2"],
    });
    await settlePulumi();
    const applied = await valueOf(t.tagsApplied);
    expect(applied).toHaveLength(4); // 1 public * 2 + 1 private * 2
    const keys = applied.map((a) => a.key).sort();
    expect(keys).toEqual([
      "kubernetes.io/cluster/c",
      "kubernetes.io/cluster/c",
      "kubernetes.io/role/elb",
      "kubernetes.io/role/internal-elb",
    ]);
  });

  test("component is registered with the documented type", async () => {
    new EksSubnetTagger("type-test", {
      clusterName: "c",
      ownership: "shared",
      publicSubnetIds: ["s-1"],
    });
    await settlePulumi();
    expect(registrations.some((r) => r.type === EKS_SUBNET_TAGGER_COMPONENT_TYPE)).toBe(true);
  });
});

describe("EksSubnetTagger — invalid input refusals", () => {
  test("missing clusterName is refused", () => {
    expect(
      () =>
        new EksSubnetTagger("x", {
          ownership: "shared",
          publicSubnetIds: ["s-1"],
        } as unknown as ConstructorParameters<typeof EksSubnetTagger>[1]),
    ).toThrow(/clusterName is required/);
  });

  test("invalid ownership is refused", () => {
    expect(
      () =>
        new EksSubnetTagger("x", {
          clusterName: "c",
          ownership: "private" as unknown as "shared",
          publicSubnetIds: ["s-1"],
        }),
    ).toThrow(/ownership must be one of/);
  });

  test("both subnet lists absent is refused (the silent-zero-tags failure mode)", () => {
    expect(
      () =>
        new EksSubnetTagger("x", {
          clusterName: "c",
          ownership: "shared",
        }),
    ).toThrow(/at least one of publicSubnetIds or privateSubnetIds/);
  });
});

describe("EksSubnetTagger — empty arrays at apply time emit warn", () => {
  test("both lists supplied as empty arrays warn but do not throw", async () => {
    const warnSpy = vi.spyOn(pulumi.log, "warn").mockResolvedValue();
    new EksSubnetTagger("warn-test", {
      clusterName: "c",
      ownership: "shared",
      publicSubnetIds: [],
      privateSubnetIds: [],
    });
    await settlePulumi();
    const tags = registrations.filter((r) => r.type === "aws:ec2/tag:Tag");
    expect(tags).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
    const message = warnSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(message).toMatch(/no tags written/);
  });
});
