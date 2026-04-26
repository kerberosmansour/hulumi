// M5 smoke test: instantiate both SecureRepository tiers under Pulumi
// mocks and assert the expected tier-appropriate sub-resources +
// hulumi:component / hulumi:tier / hulumi:controls description tag triple.

import { describe, it, expect } from "vitest";
import * as pulumi from "@pulumi/pulumi";

interface Registration {
  type: string;
  name: string;
  inputs: Record<string, unknown>;
}

const registrations: Registration[] = [];

pulumi.runtime.setMocks({
  newResource: (args: pulumi.runtime.MockResourceArgs) => {
    registrations.push({
      type: args.type,
      name: args.name,
      inputs: { ...(args.inputs as Record<string, unknown>) },
    });
    const baseState: Record<string, unknown> = {
      ...(args.inputs as Record<string, unknown>),
    };
    if (args.type === "github:index/repository:Repository") {
      const repoName = (args.inputs as { name?: string }).name ?? args.name;
      baseState.fullName = baseState.fullName ?? `mock-org/${repoName}`;
      baseState.nodeId = baseState.nodeId ?? `mock-${args.name}`;
      baseState.defaultBranch = baseState.defaultBranch ?? "main";
    }
    return { id: `${args.name}_id`, state: baseState };
  },
  call: (args: pulumi.runtime.MockCallArgs) => args.inputs,
});

async function settle(): Promise<void> {
  for (let i = 0; i < 40; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe("examples/secure-repository-smoke — preview emits expected tier diff", () => {
  it("creates sandbox + startup-hardened SecureRepositories with tier-appropriate ruleset rules and the hulumi:* tag triple", async () => {
    registrations.length = 0;

    await import("../index");
    await settle();

    const sandboxRepo = registrations.find(
      (r) => r.type === "github:index/repository:Repository" && r.name === "smoke-sandbox-repo",
    );
    const hardenedRepo = registrations.find(
      (r) => r.type === "github:index/repository:Repository" && r.name === "smoke-hardened-repo",
    );
    expect(sandboxRepo).toBeDefined();
    expect(hardenedRepo).toBeDefined();

    // Both carry the hulumi: tag triple in the description (M3 staged-migration).
    const sandboxDesc = String(sandboxRepo!.inputs.description ?? "");
    const hardenedDesc = String(hardenedRepo!.inputs.description ?? "");
    for (const desc of [sandboxDesc, hardenedDesc]) {
      expect(desc).toContain("hulumi:component=SecureRepository");
      expect(desc).toContain("hulumi:tier=");
      expect(desc).toContain("hulumi:controls=");
    }
    expect(sandboxDesc).toContain("hulumi:tier=sandbox");
    expect(hardenedDesc).toContain("hulumi:tier=startup-hardened");

    // Tier delta on rulesets: startup-hardened has requiredSignatures: true.
    const sandboxRuleset = registrations.find(
      (r) =>
        r.type === "github:index/repositoryRuleset:RepositoryRuleset" &&
        r.name === "smoke-sandbox-ruleset",
    );
    const hardenedRuleset = registrations.find(
      (r) =>
        r.type === "github:index/repositoryRuleset:RepositoryRuleset" &&
        r.name === "smoke-hardened-ruleset",
    );
    expect(sandboxRuleset).toBeDefined();
    expect(hardenedRuleset).toBeDefined();
    const sandboxRules = sandboxRuleset!.inputs.rules as Record<string, unknown>;
    const hardenedRules = hardenedRuleset!.inputs.rules as Record<string, unknown>;
    expect(sandboxRules.deletion).toBe(true);
    expect(sandboxRules.nonFastForward).toBe(true);
    expect(sandboxRules.requiredSignatures).toBeUndefined();
    expect(hardenedRules.requiredSignatures).toBe(true);
  });
});
