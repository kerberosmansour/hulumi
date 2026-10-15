#!/usr/bin/env node
// Diff two pnpm lockfiles for reviewed @pulumi/* version bumps and enforce
// the release cooling-off threshold. YAML is parsed structurally and failures
// are fatal so comments, quoting, duplicate keys and aliases cannot hide bumps.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  PULUMI_PACKAGE_NAMES as REVIEWED_PULUMI_PACKAGE_NAMES,
  isPlainRecord,
  parseStrictYaml,
} from "./protected-dependencies.mjs";

export const PULUMI_PACKAGE_NAMES = REVIEWED_PULUMI_PACKAGE_NAMES;

const COOLING_OFF_MS = {
  major: 72 * 60 * 60 * 1000,
  minor: 72 * 60 * 60 * 1000,
  patch: 24 * 60 * 60 * 1000,
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractVersions(lockYaml) {
  const lockfile = parseStrictYaml(lockYaml, "pnpm lockfile");
  if (!isPlainRecord(lockfile) || !isPlainRecord(lockfile.packages)) {
    throw new Error("pnpm lockfile must contain a top-level packages mapping");
  }

  const out = {};
  const packageKeys = Object.keys(lockfile.packages);
  for (const name of PULUMI_PACKAGE_NAMES) {
    const pattern = new RegExp(
      `^${escapeRegExp(name)}@(\\d+\\.\\d+\\.\\d+(?:[-+][0-9A-Za-z.-]+)?)$`,
    );
    const matches = packageKeys.map((key) => pattern.exec(key)).filter((match) => match !== null);
    if (matches.length > 1) {
      throw new Error(`pnpm lockfile has ambiguous entries for ${name}`);
    }
    if (matches.length === 1) out[name] = matches[0][1];
  }
  return out;
}

function classifyBump(oldV, newV) {
  const [oM, on, oP] = oldV.split(".").map((value) => Number.parseInt(value, 10));
  const [nM, nN, nP] = newV.split(".").map((value) => Number.parseInt(value, 10));
  if (nM > oM) return "major";
  if (nN > on) return "minor";
  if (nP > oP) return "patch";
  return "noop";
}

async function fetchPublishTime(pkg, version) {
  const response = await fetch(`https://registry.npmjs.org/${pkg}`);
  if (!response.ok) {
    throw new Error(`npm registry returned ${response.status} for ${pkg}`);
  }
  const data = await response.json();
  const publishedAt = data?.time?.[version];
  if (!publishedAt) {
    throw new Error(`no publish time for ${pkg}@${version} in registry`);
  }
  return new Date(publishedAt).getTime();
}

async function main() {
  const [, , baseFile, headFile] = process.argv;
  if (!baseFile || !headFile) {
    console.error("Usage: cooling-off-diff.mjs <base-lockfile> <head-lockfile>");
    process.exit(2);
  }

  const baseVersions = extractVersions(readFileSync(baseFile, "utf8"));
  const headVersions = extractVersions(readFileSync(headFile, "utf8"));
  const bumps = [];
  for (const pkg of PULUMI_PACKAGE_NAMES) {
    if (baseVersions[pkg] && headVersions[pkg] && baseVersions[pkg] !== headVersions[pkg]) {
      bumps.push({ pkg, oldV: baseVersions[pkg], newV: headVersions[pkg] });
    }
  }

  if (bumps.length === 0) {
    console.log("cooling-off: no @pulumi/* bumps in this PR.");
    return;
  }

  let failed = false;
  const now = Date.now();
  for (const bump of bumps) {
    const kind = classifyBump(bump.oldV, bump.newV);
    if (kind === "noop") continue;
    const threshold = COOLING_OFF_MS[kind];
    let publishTime;
    try {
      publishTime = await fetchPublishTime(bump.pkg, bump.newV);
    } catch (error) {
      console.error(
        `cooling-off: registry lookup failed for ${bump.pkg}@${bump.newV}: ${error instanceof Error ? error.message : String(error)}`,
      );
      console.error("Treating as fail-closed.");
      process.exit(2);
    }
    const ageMs = now - publishTime;
    const remainingHours = Math.ceil((threshold - ageMs) / 3_600_000);
    const ageHours = Math.floor(ageMs / 3_600_000);
    if (ageMs < threshold) {
      console.error(
        `cooling-off: FAIL — ${bump.pkg}@${bump.newV} was published ${ageHours}h ago; ${kind} bumps require ${threshold / 3_600_000}h. Wait ${remainingHours}h.`,
      );
      failed = true;
    } else {
      console.log(
        `cooling-off: OK — ${bump.pkg}@${bump.newV} (${kind} bump) published ${ageHours}h ago; threshold ${threshold / 3_600_000}h.`,
      );
    }
  }
  if (failed) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      `cooling-off: internal error: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(2);
  });
}
