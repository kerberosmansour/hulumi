// Forbidden-shortcut lint — packages/drift/src/ contains no
// `child_process` usage and no setTimeout / sleep / await new
// Promise outside the documented `runProbe` wrapper (which uses
// p-timeout's AbortSignal — no inline waits).

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const SRC = resolve(__dirname, "../src");

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walk(full);
    } else if (entry.endsWith(".ts")) {
      yield full;
    }
  }
}

describe("forbidden shortcuts — packages/drift/src/", () => {
  it("no child_process / exec / spawn — code paths only (comments mentioning child_process for documentation are allowed)", () => {
    const offenders: string[] = [];
    const importPatterns = [/from\s+['"]child_process['"]/, /require\(['"]child_process['"]\)/];
    const callPatterns = [/(?:^|[^/])\bexec\(/, /(?:^|[^/])\bspawn\(/, /(?:^|[^/])\bexecSync\(/];
    for (const file of walk(SRC)) {
      const text = readFileSync(file, "utf8");
      // Strip comments before scanning for call expressions, so prose
      // mentioning these names doesn't false-positive.
      const stripped = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
      if (importPatterns.some((p) => p.test(stripped)))
        offenders.push(`${file} (child_process import)`);
      if (callPatterns.some((p) => p.test(stripped))) offenders.push(`${file} (exec/spawn call)`);
    }
    expect(offenders).toEqual([]);
  });

  it("no setTimeout / sleep / await new Promise outside src/probe.ts", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (file.endsWith("probe.ts")) continue;
      const text = readFileSync(file, "utf8");
      if (/setTimeout\b|\bsleep\b|await new Promise\b/.test(text)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
