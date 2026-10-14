import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "..", "..");

function read(path: string): string {
  return readFileSync(join(repoRoot, path), "utf8");
}

describe("Feature: Track A emergency SCA automation is vendored into Hulumi", () => {
  it("ships the SCA brain locally instead of calling a private cross-repo workflow", () => {
    expect(existsSync(join(repoRoot, "tools", "sca", "package.json"))).toBe(true);
    expect(existsSync(join(repoRoot, "tools", "sca", "package-lock.json"))).toBe(true);
    expect(existsSync(join(repoRoot, "tools", "sca", "src", "cli", "scan.ts"))).toBe(true);

    const workflows = [
      ".github/workflows/sca-scope-drift.yml",
      ".github/workflows/dependency-review.yml",
      ".github/workflows/sca-emergency.yml",
      ".github/workflows/sca-review-loop-drill.yml",
    ].map(read);

    for (const workflow of workflows) {
      expect(workflow).not.toContain("AutomoatedSCA/.github/workflows");
      expect(workflow).toContain("tools/sca");
      expect(workflow).toMatch(/permissions:\n(?: {2}[a-z-]+: (?:read|write)\n)+/);
    }
  });

  it("keeps scheduled scans read-only and routes patches through reviewed PR CI", () => {
    const emergency = read(".github/workflows/sca-emergency.yml");
    expect(emergency).not.toContain("private-key:");
    expect(emergency).not.toContain("contents: write");
    expect(emergency).not.toContain("id-token: write");
    expect(emergency).not.toContain("gh pr checkout");
    expect(emergency).not.toContain("gh pr merge");
    expect(emergency).toContain("persist-credentials: false");
    expect(emergency).toContain('cron: "23 5 * * *"');
    expect(emergency).toContain("Upload findings for maintainer review");
  });
});
