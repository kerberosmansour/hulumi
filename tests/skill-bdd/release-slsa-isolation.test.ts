import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "..", "..");

function readRepoFile(relPath: string): string {
  return readFileSync(resolve(repoRoot, relPath), "utf8");
}

function workflowJobBlock(yml: string, jobId: string): string {
  const lines = yml.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `  ${jobId}:`);
  expect(start, `workflow job "${jobId}" not found`).toBeGreaterThanOrEqual(0);

  const end = lines.findIndex((line, index) => {
    if (index <= start) return false;
    return /^ {2}[A-Za-z0-9_-]+:\s*$/.test(line);
  });
  return lines.slice(start, end === -1 ? undefined : end).join("\n");
}

describe("Feature: Release SLSA Build L3 isolation (Issue #71)", () => {
  describe("Scenario: build steps do not hold the OIDC signing lane", () => {
    it("release.yml builds artifacts without id-token:write and delegates signing/publish to a reusable workflow", () => {
      const yml = readRepoFile(".github/workflows/release.yml");

      expect(yml).not.toMatch(/^ {2}attest-and-publish:/m);

      const build = workflowJobBlock(yml, "build-release-artifacts");
      expect(build).toMatch(/permissions:\n\s+contents:\s+read/);
      expect(build).not.toMatch(/id-token:\s*write/);
      expect(build).toMatch(/pnpm -r build/);
      expect(build).toMatch(/tarballs-sha256\.txt/);
      expect(build).toMatch(/actions\/upload-artifact@[0-9a-f]{40}\s+#\s+v\d+/);

      const sign = workflowJobBlock(yml, "sign-and-publish");
      expect(sign).toContain("uses: ./.github/workflows/sign-and-publish.yml");
      expect(sign).toMatch(/id-token:\s*write/);
      expect(sign).toMatch(/attestations:\s*write/);
      expect(sign).toMatch(/contents:\s*write/);
      expect(sign).not.toMatch(/pnpm\s+(install|-r build|pack)/);
      expect(sign).not.toMatch(/@cyclonedx\/cdxgen/);
      expect(sign).not.toMatch(/actions\/attest-build-provenance/);
    });
  });

  describe("Scenario: reusable signing workflow owns attestation and publish only", () => {
    it("sign-and-publish.yml downloads prebuilt artifacts, verifies digests, attests, and publishes", () => {
      const relPath = ".github/workflows/sign-and-publish.yml";
      const fullPath = resolve(repoRoot, relPath);
      expect(existsSync(fullPath), `${relPath} must exist`).toBe(true);

      const yml = readRepoFile(relPath);
      expect(yml).toMatch(/workflow_call:/);
      expect(yml).toMatch(/actions\/download-artifact@[0-9a-f]{40}\s+#\s+v\d+/);
      expect(yml).toMatch(/sha256sum --check \.release-artifacts\/tarballs-sha256\.txt/);
      expect(yml).toMatch(/actions\/attest-build-provenance@[0-9a-f]{40}\s+#\s+v\d+/);
      expect(yml).toContain('subject-path: ".release-artifacts/*.tgz"');
      expect(yml).toContain('npm publish "$tarball" --provenance --access public');
      expect(yml).toMatch(/softprops\/action-gh-release@[0-9a-f]{40}\s+#\s+v\d+/);

      expect(yml).not.toMatch(/actions\/checkout@/);
      expect(yml).not.toMatch(/pnpm\s+(install|-r build|pack)/);
      expect(yml).not.toMatch(/npx\s+--yes\s+@cyclonedx\/cdxgen/);
    });
  });

  describe("Scenario: public provenance docs describe the current signing lane", () => {
    it("current public docs avoid obsolete direct-attestation implementation details", () => {
      const docs = [
        "SECURITY.md",
        ".github/attestations/README.md",
        "docs/development.md",
        "docs/cookbooks/verify-provenance.md",
        "docs/launch/pulumi-blog-pitch.md",
        "packages/baseline/README.md",
        "packages/policies/README.md",
        "packages/k8s-baseline/README.md",
        "packages/cloudflare-baseline/README.md",
        "packages/platform-patterns/README.md",
      ];

      for (const doc of docs) {
        const content = readRepoFile(doc);
        expect(content, `${doc} still describes the old v2/direct release lane`).not.toMatch(
          /attest-build-provenance` v2|attest-build-provenance@v2|slsa-framework\/slsa-github-generator|setup-node@v4/,
        );
      }

      const securityDocs = ["SECURITY.md", ".github/attestations/README.md"];
      for (const doc of securityDocs) {
        expect(readRepoFile(doc), `${doc} must mention the isolated signing workflow`).toContain(
          ".github/workflows/sign-and-publish.yml",
        );
      }
    });
  });
});
