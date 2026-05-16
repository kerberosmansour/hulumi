// Forbidden-shortcut lint — packages/drift/src/ contains no
// `child_process` usage and no setTimeout / sleep / await new
// Promise outside the documented `runProbe` wrapper (which uses
// p-timeout's AbortSignal — no inline waits).

import { describe, it, expect } from "vitest";
import { resolve } from "node:path";

import {
  findForbiddenShortcuts,
  expectNoForbiddenShortcuts,
  stripSourceComments,
} from "../../../tests/_utils/forbidden-shortcut";

const SRC = resolve(__dirname, "../src");

describe("forbidden shortcuts — packages/drift/src/", () => {
  it("strips comments before scanning for forbidden shortcut prose", () => {
    const stripped = stripSourceComments(`
      // child_process import, exec(), spawn(), and setTimeout are forbidden in source.
      /*
       * await new Promise and sleep are also forbidden outside sanctioned wrappers.
       */
      export const safe = true;
    `);

    expect(stripped).not.toMatch(
      /child_process|exec\(|spawn\(|setTimeout|await new Promise|\bsleep\b/,
    );
    expect(stripped).toContain("export const safe = true");
  });

  it("no child_process / exec / spawn — code paths only (comments mentioning child_process for documentation are allowed)", () => {
    const offenders = findForbiddenShortcuts({
      dir: SRC,
      denyPatterns: [
        { label: "child_process import", pattern: /from\s+['"]child_process['"]/ },
        { label: "child_process require", pattern: /require\(['"]child_process['"]\)/ },
        { label: "exec/spawn call", pattern: /(?:^|[^/])\bexec\(/ },
        { label: "exec/spawn call", pattern: /(?:^|[^/])\bspawn\(/ },
        { label: "exec/spawn call", pattern: /(?:^|[^/])\bexecSync\(/ },
      ],
    });

    expect(offenders).toEqual([]);
  });

  it("no setTimeout / sleep / await new Promise outside src/probe.ts", () => {
    expectNoForbiddenShortcuts({
      dir: SRC,
      denyPatterns: [
        {
          label: "setTimeout/sleep/await new Promise",
          pattern: /setTimeout\b|\bsleep\b|await new Promise\b/,
        },
      ],
      excludePaths: ["probe.ts"],
    });
  });
});
