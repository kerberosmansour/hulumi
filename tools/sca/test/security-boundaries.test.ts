import assert from "node:assert/strict";
import { test } from "node:test";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanProject } from "../src/cli/scan.ts";
import {
  classifyManifest,
  conventionsSchema,
  DEFAULT_CONVENTIONS,
  diffScope,
  globToRegExp,
  proposeScope,
  scopeFileSchema,
} from "../src/scope/policy.ts";

const manifest = (path: string) => ({ path, ecosystem: "npm" as const, parser: "package-lock" });

test("new acting manifests receive cadence, never emergency authority", () => {
  const result = classifyManifest(manifest("packages/app/package-lock.json"));
  assert.equal(result.track, "cadence");
  assert.equal(result.needsHuman, false);
});

test("vulnerable fixture exclusion takes precedence over an acting path", () => {
  const result = classifyManifest(manifest("packages/app/fixtures/vulnerable/package-lock.json"));
  assert.equal(result.track, "report-only");
  assert.equal(result.needsHuman, false);
});

test("unknown paths are still scanned and require classification", () => {
  const result = classifyManifest(manifest("new-runtime/package-lock.json"));
  assert.equal(result.track, "report-only");
  assert.equal(result.needsHuman, true);
});

for (const field of ["actingTrack", "excludedTrack", "unclassifiedTrack"]) {
  test(`untrusted conventions cannot set ${field} to emergency`, () => {
    assert.equal(
      conventionsSchema.safeParse({ ...DEFAULT_CONVENTIONS, [field]: "emergency" }).success,
      false,
    );
  });
}

test("literal regex syntax in a path cannot widen scope", () => {
  const pattern = globToRegExp("packages/app.(trusted)/**");
  assert.equal(pattern.test("packages/app.(trusted)/package-lock.json"), true);
  assert.equal(pattern.test("packages/appXtrusted/package-lock.json"), false);
});

test("drift proposal preserves the explicitly assigned human track", () => {
  const existing = { ...manifest("packages/app/package-lock.json"), track: "report-only" };
  const scope = scopeFileSchema.parse({
    version: 1,
    conventions: DEFAULT_CONVENTIONS,
    manifests: [existing],
  });
  const report = diffScope(
    [manifest(existing.path), manifest("packages/new/package-lock.json")],
    scope,
  );
  const proposed = proposeScope(report);
  assert.equal(proposed.manifests.find((m) => m.path === existing.path)?.track, "report-only");
  assert.equal(proposed.manifests.find((m) => m.path.includes("/new/"))?.track, "cadence");
  assert.equal(
    proposed.manifests.some((m) => m.track === "emergency"),
    false,
  );
});

test("malformed dependency input fails with its original cause and no clean report", async () => {
  const root = await mkdtemp(join(tmpdir(), "hulumi-sca-malformed-"));
  try {
    await writeFile(join(root, "package-lock.json"), "{not-json");
    await writeFile(
      join(root, "sca-scope.json"),
      JSON.stringify({
        version: 1,
        conventions: DEFAULT_CONVENTIONS,
        manifests: [
          { ...manifest("package-lock.json"), parser: "package-lock.json", track: "report-only" },
        ],
      }),
    );
    await assert.rejects(
      scanProject({ rootDir: root, useScope: true, scannerMode: "fixture" }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /^malformed lockfile: package-lock.json:/);
        assert.ok(error.cause instanceof SyntaxError);
        return true;
      },
    );
    await assert.rejects(access(join(root, "findings.osv.json")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
