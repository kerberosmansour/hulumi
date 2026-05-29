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

  it("keeps Track A identities separated and merge-gated for a solo-maintainer repo", () => {
    const emergency = read(".github/workflows/sca-emergency.yml");

    expect(emergency).toContain("actions/create-github-app-token@");
    expect(emergency).toContain("SCA_REMEDIATOR_APP_ID");
    expect(emergency).toContain("SCA_MERGER_APP_ID");
    expect(emergency).toContain("anthropics/claude-code-action@");
    expect(emergency).toContain("ANTHROPIC_FEDERATION_RULE_ID");
    expect(emergency).toContain("Signed-off-by: sca-remediator[bot]");
    expect(emergency).toContain("gh pr merge");
    expect(emergency).toContain("--squash");
    expect(emergency).toContain("required reviewer approval is missing");
    expect(emergency).not.toContain("github_token: ${{ github.token }}");
    expect(emergency).not.toContain("gh pr merge --auto");
  });
});
