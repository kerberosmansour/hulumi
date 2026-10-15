#!/usr/bin/env node
// exact-pin-guard — reject protected dependency drift in pnpm-lock.yaml.
//
// M5's cooling-off policy forbids bumping @pulumi/aws within 72h of upstream
// release; M2 seeds that discipline by hard-pinning exact versions in manifests
// and integrity hashes in pnpm-lock.yaml for the protected dependency set below.
// The ALLOWED table is the independently reviewed version/integrity baseline.
// CI compares manifests and lockfile bytes to this committed table. Dependency
// updates must refresh it explicitly with --write after registry verification;
// deriving the expected hash from the candidate lockfile is not a trust check.
//
// Scope: runs on the committed pnpm-lock.yaml. Exit 0 if every allow-listed
// dep's resolution integrity matches; exit 1 on any mismatch.

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PROTECTED_DEPENDENCIES,
  isPlainRecord,
  parseStrictYaml,
} from "./protected-dependencies.mjs";

const SCRIPT_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = join(SCRIPT_FILE, "..", "..");
const LOCKFILE = join(REPO_ROOT, "pnpm-lock.yaml");
const INVENTORY_FILE = join(REPO_ROOT, "scripts", "protected-dependencies.mjs");

const ALLOWED = PROTECTED_DEPENDENCIES;

function parseLockfile(source) {
  const lockfile = parseStrictYaml(source, "pnpm-lock.yaml");
  if (!isPlainRecord(lockfile) || !isPlainRecord(lockfile.packages)) {
    throw new Error("pnpm-lock.yaml must contain a top-level packages mapping");
  }
  return lockfile;
}

function resolveFromLockfile(lockfile, name, version) {
  const key = `${name}@${version}`;
  if (!Object.hasOwn(lockfile.packages, key)) {
    return { present: false, integrity: null };
  }
  const entry = lockfile.packages[key];
  if (!isPlainRecord(entry) || !isPlainRecord(entry.resolution)) {
    throw new Error(`${key} must have a structural resolution mapping`);
  }
  const resolutionKeys = Object.keys(entry.resolution);
  if (
    resolutionKeys.length !== 1 ||
    resolutionKeys[0] !== "integrity" ||
    typeof entry.resolution.integrity !== "string"
  ) {
    throw new Error(
      `${key} resolution must contain only the reviewed registry integrity; tarball and custom authority fields are forbidden`,
    );
  }
  if (!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(entry.resolution.integrity)) {
    throw new Error(`${key} has an invalid sha512 integrity value`);
  }
  return { present: true, integrity: entry.resolution.integrity };
}

function isExactVersion(spec) {
  return /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/.test(spec);
}

function packageJsonPaths(dir = REPO_ROOT) {
  const skipped = new Set([".git", ".cache", ".release-artifacts", "dist", "node_modules"]);
  const found = [];
  for (const entry of readdirSync(dir)) {
    if (skipped.has(entry)) continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      found.push(...packageJsonPaths(path));
      continue;
    }
    if (entry === "package.json") found.push(path);
  }
  return found;
}

function exactManifestVersion(name) {
  const specs = [];
  for (const path of packageJsonPaths()) {
    const pkg = JSON.parse(readFileSync(path, "utf8"));
    for (const section of ["dependencies", "devDependencies", "optionalDependencies"]) {
      const spec = pkg[section]?.[name];
      if (spec === undefined) continue;
      if (!isExactVersion(spec)) {
        throw new Error(`${name} in ${path} uses non-exact ${section} spec ${spec}`);
      }
      specs.push(spec);
    }
  }
  const unique = [...new Set(specs)];
  if (unique.length === 0) {
    throw new Error(`${name} is in ALLOWED but has no exact dependency/devDependency spec`);
  }
  if (unique.length > 1) {
    throw new Error(`${name} has multiple exact specs: ${unique.join(", ")}`);
  }
  return unique[0];
}

function refreshedAllowedFromManifests(lock) {
  return ALLOWED.map((dep) => {
    const version = exactManifestVersion(dep.name);
    const found = resolveFromLockfile(lock, dep.name, version);
    if (!found.present) {
      throw new Error(
        `${dep.name}@${version} is exact-pinned in manifests but missing from pnpm-lock.yaml`,
      );
    }
    if (!found.integrity) {
      throw new Error(`${dep.name}@${version} is missing a lockfile integrity hash`);
    }
    return { ...dep, version, integrity: found.integrity };
  });
}

function refreshAllowedTable(source, refreshed) {
  let next = source;
  for (const dep of refreshed) {
    const reviewed = ALLOWED.find((entry) => entry.name === dep.name);
    const nameMarker = `    name: "${dep.name}",`;
    const blockStart = next.indexOf(nameMarker);
    if (blockStart === -1 || next.indexOf(nameMarker, blockStart + nameMarker.length) !== -1) {
      throw new Error(`Could not find one protected dependency block for ${dep.name}`);
    }
    const blockEnd = next.indexOf("\n  },", blockStart);
    if (blockEnd === -1) {
      throw new Error(`Unterminated protected dependency block for ${dep.name}`);
    }
    const block = next.slice(blockStart, blockEnd);
    const oldVersion = `version: "${reviewed.version}"`;
    const oldIntegrity = `"${reviewed.integrity}"`;
    if (!block.includes(oldVersion) || !block.includes(oldIntegrity)) {
      throw new Error(`Protected dependency block drifted for ${dep.name}`);
    }
    const refreshedBlock = block
      .replace(oldVersion, `version: "${dep.version}"`)
      .replace(oldIntegrity, `"${dep.integrity}"`);
    next = next.slice(0, blockStart) + refreshedBlock + next.slice(blockEnd);
  }
  return next;
}

function writeRefreshedAllowedTable(lock) {
  const source = readFileSync(INVENTORY_FILE, "utf8");
  const next = refreshAllowedTable(source, refreshedAllowedFromManifests(lock));
  if (next !== source) {
    writeFileSync(INVENTORY_FILE, next);
    console.log(
      "exact-pin-guard: refreshed protected dependency inventory from package manifests + pnpm-lock.yaml",
    );
  } else {
    console.log(
      "exact-pin-guard: protected dependency inventory already matches package manifests + pnpm-lock.yaml",
    );
  }
}

function main() {
  const lock = parseLockfile(readFileSync(LOCKFILE, "utf8"));
  if (process.argv.includes("--write")) {
    writeRefreshedAllowedTable(lock);
    return;
  }
  const failures = [];
  let refreshed = [];
  try {
    refreshed = refreshedAllowedFromManifests(lock);
    for (const actual of refreshed) {
      const expected = ALLOWED.find((entry) => entry.name === actual.name);
      if (actual.version !== expected.version || actual.integrity !== expected.integrity) {
        failures.push(
          `${actual.name}: candidate version/integrity differs from reviewed pin; verify the upstream release before explicitly refreshing ALLOWED`,
        );
      }
    }
  } catch (err) {
    failures.push(err instanceof Error ? err.message : String(err));
  }
  if (failures.length > 0) {
    console.error("exact-pin-guard: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    console.error("");
    console.error(
      "Protected deps must be exact-pinned in package manifests and present in pnpm-lock.yaml with integrity hashes.",
    );
    process.exit(1);
  }
  console.log(
    "exact-pin-guard: OK (" +
      refreshed.length +
      " pinned deps have exact manifest specs + lockfile integrity hashes)",
  );
}

main();
