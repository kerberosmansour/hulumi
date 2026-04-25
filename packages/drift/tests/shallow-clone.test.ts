// E5 — shallow-clone guard. GitLogAdapter.available() returns false
// when the working tree is a shallow clone (`--depth=1` etc).

import { describe, it, expect, vi } from "vitest";
import { GitLogAdapter } from "../src/adapters/git-log";

describe("shallow-clone guard — E5", () => {
  it("available()=false when revparse('--is-shallow-repository') === 'true'", async () => {
    const fake = {
      checkIsRepo: vi.fn().mockResolvedValue(true),
      revparse: vi.fn().mockResolvedValue("true\n"),
      log: vi.fn().mockResolvedValue({ total: 0, latest: null, all: [] }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adapter = new GitLogAdapter({ git: fake as any, paths: ["**/*.ts"] });
    expect(await adapter.available()).toBe(false);
  });

  it("signal() degrades to ok=false with remediation when available()=false", async () => {
    const fake = {
      checkIsRepo: vi.fn().mockResolvedValue(true),
      revparse: vi.fn().mockResolvedValue("true\n"),
      log: vi.fn().mockResolvedValue({ total: 0, latest: null, all: [] }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adapter = new GitLogAdapter({ git: fake as any, paths: ["**/*.ts"] });
    const r = await adapter.signal("stack", "urn:pulumi:dev::p::aws::r");
    expect(r.ok).toBe(false);
    expect((r.data as Record<string, unknown>).remediation).toBe("git fetch --unshallow");
    expect(fake.log).not.toHaveBeenCalled();
  });

  it("available()=true on a normal repo (revparse returns 'false')", async () => {
    const fake = {
      checkIsRepo: vi.fn().mockResolvedValue(true),
      revparse: vi.fn().mockResolvedValue("false\n"),
      log: vi.fn().mockResolvedValue({ total: 0, latest: null, all: [] }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adapter = new GitLogAdapter({ git: fake as any, paths: ["**/*.ts"] });
    expect(await adapter.available()).toBe(true);
  });
});
