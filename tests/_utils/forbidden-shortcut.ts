import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, normalize, relative, sep } from "node:path";

import { expect } from "vitest";

export interface ForbiddenShortcutPattern {
  label: string;
  pattern: RegExp;
}

export interface ForbiddenShortcutScanOptions {
  dir: string;
  denyPatterns: readonly ForbiddenShortcutPattern[];
  excludePaths?: readonly string[];
  stripComments?: boolean;
}

export function stripSourceComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function* walkTypeScriptFiles(
  dir: string,
  root: string,
  excludePaths: readonly string[],
): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (isExcluded(full, root, excludePaths)) {
      continue;
    }
    if (st.isDirectory()) {
      yield* walkTypeScriptFiles(full, root, excludePaths);
    } else if (entry.endsWith(".ts")) {
      yield full;
    }
  }
}

function isExcluded(path: string, root: string, excludePaths: readonly string[]): boolean {
  const normalizedPath = normalize(path);
  const relativePath = normalize(relative(root, path));

  return excludePaths.some((excludePath) => {
    const normalizedExclude = normalize(excludePath);
    return (
      normalizedPath === normalizedExclude ||
      normalizedPath.endsWith(`${sep}${normalizedExclude}`) ||
      relativePath === normalizedExclude ||
      relativePath.endsWith(`${sep}${normalizedExclude}`)
    );
  });
}

export function findForbiddenShortcuts(options: ForbiddenShortcutScanOptions): string[] {
  const offenders: string[] = [];
  const stripComments = options.stripComments ?? true;
  const excludePaths = options.excludePaths ?? [];

  for (const file of walkTypeScriptFiles(options.dir, options.dir, excludePaths)) {
    const source = readFileSync(file, "utf8");
    const scanSource = stripComments ? stripSourceComments(source) : source;

    for (const denyPattern of options.denyPatterns) {
      denyPattern.pattern.lastIndex = 0;
      if (denyPattern.pattern.test(scanSource)) {
        offenders.push(`${file} (${denyPattern.label})`);
      }
    }
  }

  return offenders;
}

export function expectNoForbiddenShortcuts(options: ForbiddenShortcutScanOptions): void {
  expect(findForbiddenShortcuts(options)).toEqual([]);
}
