import { describe, expect, test, vi } from "vitest";
import * as pulumi from "@pulumi/pulumi";

import { TESTED_VERSIONS, assertVersionTested } from "../src/compatibility";

describe("compatibility — TESTED_VERSIONS table parses", () => {
  test("TESTED_VERSIONS is an object", () => {
    expect(typeof TESTED_VERSIONS).toBe("object");
    expect(TESTED_VERSIONS).not.toBeNull();
  });
});

describe("compatibility — assertVersionTested warns, never throws", () => {
  test("unknown chart emits warn and returns", async () => {
    const warnSpy = vi.spyOn(pulumi.log, "warn").mockResolvedValue();
    expect(() => assertVersionTested("totally-new-chart", "9.9.9")).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][0]).toMatch(/totally-new-chart/);
    expect(warnSpy.mock.calls[0][0]).toMatch(/COMPATIBILITY\.md/);
    warnSpy.mockRestore();
  });
});
