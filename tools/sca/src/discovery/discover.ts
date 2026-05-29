#!/usr/bin/env node

// Exhaustive, multi-ecosystem manifest discovery.
//
// Detection must never silently miss a package manifest, so this walks the
// repository tree and reports every manifest/lockfile it recognizes. It does
// NOT decide what is in the auto-merge acting scope; that is the convention
// policy's job (see ../scope/policy.ts). Discovery is exhaustive; action is
// deliberate.
//
// Bounded by design: recursion depth is capped (MAX_DISCOVERY_DEPTH) and
// symlinked directories are never traversed, so a symlink loop or an
// adversarially deep tree cannot hang or escape the repository root.

import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

export type Ecosystem = "npm" | "PyPI" | "NuGet" | "Go" | "crates.io" | "RubyGems" | "Packagist";

export interface DiscoveredManifest {
  /** Repository-relative, posix-style path. */
  path: string;
  ecosystem: Ecosystem;
  parser: string;
}

export interface DiscoverOptions {
  /** Maximum directory recursion depth (root = depth 0). Bounded by design. */
  maxDepth?: number;
  /** Called once per non-fatal issue (e.g. an unreadable subdirectory). */
  onWarning?: (message: string) => void;
}

interface ManifestKind {
  ecosystem: Ecosystem;
  parser: string;
}

// Default recursion bound. Deep enough for real monorepos, shallow enough that
// an adversarial tree cannot exhaust the stack.
export const MAX_DISCOVERY_DEPTH = 25;

// Exact-filename manifests OSV-Scanner can parse. Keyed by basename.
const MANIFEST_REGISTRY: Readonly<Record<string, ManifestKind>> = {
  "package-lock.json": { ecosystem: "npm", parser: "package-lock.json" },
  "pnpm-lock.yaml": { ecosystem: "npm", parser: "pnpm-lock.yaml" },
  "yarn.lock": { ecosystem: "npm", parser: "yarn.lock" },
  "poetry.lock": { ecosystem: "PyPI", parser: "poetry.lock" },
  "Pipfile.lock": { ecosystem: "PyPI", parser: "Pipfile.lock" },
  "packages.lock.json": { ecosystem: "NuGet", parser: "packages.lock.json" },
  "go.mod": { ecosystem: "Go", parser: "go.mod" },
  "Cargo.lock": { ecosystem: "crates.io", parser: "Cargo.lock" },
  "Gemfile.lock": { ecosystem: "RubyGems", parser: "Gemfile.lock" },
  "composer.lock": { ecosystem: "Packagist", parser: "composer.lock" },
};

// Build artifacts / VCS metadata that are never source manifests. Never
// traversed, so installed dependencies are never mistaken for declarations.
const SKIP_DIRS: ReadonlySet<string> = new Set([
  ".git",
  "node_modules",
  ".cache",
  "dist",
  "build",
  "out",
  ".next",
  "coverage",
  ".venv",
  "venv",
  "obj",
  "bin",
  "target",
]);

export function classifyFile(name: string): ManifestKind | undefined {
  const exact = MANIFEST_REGISTRY[name];
  if (exact) {
    return exact;
  }
  // requirements.txt, requirements-dev.txt, requirements.prod.txt, ...
  if (/^requirements.*\.txt$/i.test(name)) {
    return { ecosystem: "PyPI", parser: "requirements.txt" };
  }
  return undefined;
}

export async function discoverManifests(
  rootDir: string,
  options: DiscoverOptions = {},
): Promise<DiscoveredManifest[]> {
  const maxDepth = options.maxDepth ?? MAX_DISCOVERY_DEPTH;
  const found: DiscoveredManifest[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) {
      options.onWarning?.(
        `discovery depth bound (${maxDepth}) reached; not descending into ${toPosix(relative(rootDir, dir))}`,
      );
      return;
    }

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      // Non-fatal: an unreadable subdirectory must not abort the whole scan,
      // but it must be surfaced (no silent miss).
      options.onWarning?.(
        `cannot read directory ${toPosix(relative(rootDir, dir))}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return;
    }

    for (const entry of entries) {
      const absolute = join(dir, entry.name);
      // entry.isDirectory() is false for a symlink-to-directory (the dirent
      // describes the link, not its target), so symlinks are never followed.
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          await walk(absolute, depth + 1);
        }
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const kind = classifyFile(entry.name);
      if (kind) {
        found.push({
          path: toPosix(relative(rootDir, absolute)),
          ecosystem: kind.ecosystem,
          parser: kind.parser,
        });
      }
    }
  }

  await walk(rootDir, 0);
  found.sort((a, b) => a.path.localeCompare(b.path));
  return found;
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
}
