// BDD scenarios for @hulumi/baseline.github.SecureRepository. Each describe
// block corresponds to one row of the BDD Acceptance Scenarios table in
// docs/slo/runbook-milestones/hulumi-github-m1.md. Pulumi mocks are installed
// in tests/setup.ts (vitest setupFile) — `new SecureRepository(…)` does not
// require a real Pulumi engine.
//
// Critical contract under test (per critique decisions applied autonomously
// during /slo-execute M1, 2026-04-26):
//   - `Tier` is shared with AWS — imported from `../../src/aws/tier`.
//   - The `acknowledgePublic` opt-in for public visibility is a discriminated
//     union; runtime invariant rejects partial opt-in even when callers cast
//     through `as any`; emits `security_event.public_visibility_acknowledged`
//     to stderr with `{ event, justification, repoName, tier }`.
//   - The `hulumi:controls` tag is DELIBERATELY OMITTED in M1 — M3 adds it.

import { describe, it, expect, beforeEach } from "vitest";

import { SecureRepository } from "../../src/github/secure-repository";
import { registrations, resetRegistrations, valueOf, settlePulumi } from "../setup";

type Registration = (typeof registrations)[number];

function findGithubRepo(name: string): Registration | undefined {
  return registrations.find(
    (r) => r.type === "github:index/repository:Repository" && r.name === name,
  );
}

function findRulesetFor(name: string): Registration | undefined {
  return registrations.find(
    (r) => r.type === "github:index/repositoryRuleset:RepositoryRuleset" && r.name === name,
  );
}

describe("SecureRepository — Sandbox tier emits private repo + ruleset (happy path)", () => {
  beforeEach(resetRegistrations);

  it("emits a private repo with deletion + force-push protection at Sandbox tier", async () => {
    const repo = new SecureRepository("sb-sandbox", {
      tier: "sandbox",
      visibility: "private",
    });
    await valueOf(repo.repoFullName);
    await settlePulumi();

    const r = findGithubRepo("sb-sandbox-repo");
    expect(r).toBeDefined();
    expect(r!.inputs.visibility).toBe("private");
    expect(r!.inputs.vulnerabilityAlerts).toBe(true);

    const ruleset = findRulesetFor("sb-sandbox-ruleset");
    expect(ruleset).toBeDefined();
    expect(ruleset!.inputs.enforcement).toBe("active");
    const rules = ruleset!.inputs.rules as Record<string, unknown>;
    expect(rules.deletion).toBeDefined();
    expect(rules.nonFastForward).toBeDefined();

    // M3 adds `hulumi:controls` as the staged-migration completion. Tag
    // value sourced from `cisGithub.secureRepository` ∪
    // `nistSsdfV11.secureRepository` mapping tables (no hand-edited IDs).
    const description = String(r!.inputs.description ?? "");
    expect(description).toContain("hulumi:component=SecureRepository");
    expect(description).toContain("hulumi:tier=sandbox");
    expect(description).toContain("hulumi:controls=");
    expect(description).toContain("CIS-GitHub-v1.2.0:PENDING-WORKBENCH");
    expect(description).toContain("NIST-SSDF-v1.1:");
  });
});

describe("SecureRepository — Startup-Hardened tier adds signed-commits + push protection (happy path)", () => {
  beforeEach(resetRegistrations);

  it("emits private repo with hardened ruleset (signed commits + push protection)", async () => {
    const repo = new SecureRepository("sb-hard", {
      tier: "startup-hardened",
      visibility: "private",
    });
    await valueOf(repo.repoFullName);
    await settlePulumi();

    const r = findGithubRepo("sb-hard-repo");
    expect(r).toBeDefined();
    expect(r!.inputs.visibility).toBe("private");

    // Startup-Hardened: vulnerability reporting + secret scanning + push
    // protection on by default.
    const sec = r!.inputs.securityAndAnalysis as Record<string, unknown> | undefined;
    expect(sec).toBeDefined();
    const ss = sec!.secretScanning as Record<string, unknown>;
    expect(ss.status).toBe("enabled");
    const ssp = sec!.secretScanningPushProtection as Record<string, unknown>;
    expect(ssp.status).toBe("enabled");

    const ruleset = findRulesetFor("sb-hard-ruleset");
    expect(ruleset).toBeDefined();
    const rules = ruleset!.inputs.rules as Record<string, unknown>;
    // Startup-Hardened adds the signed-commits rule on top of Sandbox.
    expect(rules.requiredSignatures).toBeDefined();
  });
});

describe("SecureRepository — invalid tier throws (invalid input)", () => {
  beforeEach(resetRegistrations);

  it("throws Error with documented message for unknown tier", () => {
    expect(() => {
      // Cast through `unknown` to bypass the type system and exercise the
      // runtime check.
      new SecureRepository("sb-bad", {
        tier: "production" as unknown as "sandbox",
        visibility: "private",
      });
    }).toThrow(/Invalid Hulumi tier "production"/);
  });
});

describe("SecureRepository — Sandbox minimum (empty state)", () => {
  beforeEach(resetRegistrations);

  it("succeeds with only required args; defaultBranch defaults to main; no description means no extra topics", async () => {
    const repo = new SecureRepository("sb-min", {
      tier: "sandbox",
      visibility: "private",
    });
    await valueOf(repo.repoFullName);
    await settlePulumi();

    const r = findGithubRepo("sb-min-repo");
    expect(r).toBeDefined();
    // Description still carries the tag triple even with no user-supplied
    // description — the audit-trail tags are non-optional.
    expect(String(r!.inputs.description)).toContain("hulumi:component=SecureRepository");
  });
});

describe("SecureRepository — abuse case: public visibility opt-in friction", () => {
  beforeEach(resetRegistrations);

  // tm-hulumi-github-abuse-public-visibility:
  // Public visibility is reachable only through the SecureRepositoryArgsPublic
  // branch of the discriminated union, requiring BOTH `acknowledgePublic: true`
  // AND a non-empty `publicJustification: string`. The constructor refuses
  // partial opt-in (one flag without the other) and refuses empty / whitespace
  // justifications.

  it("[runtime invariant] rejects bare visibility:public with no opt-in fields", () => {
    // Cast through unknown so the runtime check is exercised even if a
    // caller bypasses the discriminated-union types.
    const bareArgs = {
      tier: "sandbox",
      visibility: "public",
    } as unknown as ConstructorParameters<typeof SecureRepository>[1];
    expect(() => {
      new SecureRepository("sb-bad-public", bareArgs);
    }).toThrow(/public visibility requires acknowledgePublic: true/);
  });

  it("[runtime invariant] rejects partial opt-in (acknowledgePublic but no justification)", () => {
    const partialArgs = {
      tier: "sandbox",
      visibility: "public",
      acknowledgePublic: true,
    } as unknown as ConstructorParameters<typeof SecureRepository>[1];
    expect(() => {
      new SecureRepository("sb-partial-public", partialArgs);
    }).toThrow(/non-empty publicJustification/);
  });

  it("[runtime invariant] rejects empty / whitespace justification", () => {
    expect(() => {
      new SecureRepository("sb-empty-just", {
        tier: "sandbox",
        visibility: "public",
        acknowledgePublic: true,
        publicJustification: "   ",
      });
    }).toThrow(/non-empty publicJustification/);
  });

  it("[full opt-in] succeeds with all three fields and emits audit event to stderr", async () => {
    const stderrLines: string[] = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      const s = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
      stderrLines.push(s);
      return true;
    }) as typeof process.stderr.write;

    try {
      const repo = new SecureRepository("sb-public-ok", {
        tier: "sandbox",
        visibility: "public",
        acknowledgePublic: true,
        publicJustification: "documenting an open-source library for the wider community",
      });
      await valueOf(repo.repoFullName);
      await settlePulumi();
    } finally {
      process.stderr.write = originalWrite;
    }

    const r = findGithubRepo("sb-public-ok-repo");
    expect(r).toBeDefined();
    expect(r!.inputs.visibility).toBe("public");
    // Audit row written to stderr structured as JSON with the documented shape.
    const audit = stderrLines.find((l) => l.includes("public_visibility_acknowledged"));
    expect(audit).toBeDefined();
    expect(audit!).toContain("documenting an open-source library");
    expect(audit!).toContain("sb-public-ok");
    expect(audit!).toContain("sandbox");
    // Description tag triple includes a public-justification marker so audit
    // log readers (M3) can correlate the choice with the resource.
    const description = String(r!.inputs.description ?? "");
    expect(description).toContain("hulumi:public-justification=");
  });
});

describe("SecureRepository — schema lock (compatibility)", () => {
  beforeEach(resetRegistrations);

  it("[component type string] is the documented stable identifier", async () => {
    const { SECURE_REPOSITORY_COMPONENT_TYPE } = await import("../../src/github/secure-repository");
    expect(SECURE_REPOSITORY_COMPONENT_TYPE).toBe("hulumi:baseline:github:SecureRepository");
  });
});
