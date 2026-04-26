#!/usr/bin/env node
// cooling-off-diff — diffs two pnpm-lock.yaml files for @pulumi/*
// version bumps and runs the cooling-off threshold check on each.
//
// Usage: cooling-off-diff.mjs <base-lockfile> <head-lockfile>
//
// Exit codes:
//   0 = no @pulumi/* bumps OR all bumps satisfy cooling-off
//   1 = at least one bump violates cooling-off
//   2 = unexpected error (network failure on npm registry, malformed
//       lockfile, etc.) — treated as fail-closed.

import { readFileSync } from "node:fs";

// @pulumi/github added in Hulumi v1.1.0 M1 (Hulumi-for-GitHub, 2026-04-26).
// @pulumi/kubernetes added in Hulumi v1.2.0 M1 (Hulumi-for-K8s).
// Bumps go through the same 72h/24h cooling-off gate as the other @pulumi/*
// deps so a blind `pnpm update` still requires a deliberate review.
const PULUMI_PACKAGES = [
  "@pulumi/pulumi",
  "@pulumi/aws",
  "@pulumi/policy",
  "@pulumi/github",
  "@pulumi/kubernetes",
];
const COOLING_OFF_MS = {
  major: 72 * 60 * 60 * 1000,
  minor: 72 * 60 * 60 * 1000,
  patch: 24 * 60 * 60 * 1000,
};

function extractVersions(lockYaml) {
  const out = {};
  for (const pkg of PULUMI_PACKAGES) {
    const re = new RegExp(`^  '${pkg}@(\\d+\\.\\d+\\.\\d+)':$`, "m");
    const m = lockYaml.match(re);
    if (m) out[pkg] = m[1];
  }
  return out;
}

function classifyBump(oldV, newV) {
  const [oM, on, oP] = oldV.split(".").map((s) => parseInt(s, 10));
  const [nM, nN, nP] = newV.split(".").map((s) => parseInt(s, 10));
  if (nM > oM) return "major";
  if (nN > on) return "minor";
  if (nP > oP) return "patch";
  return "noop";
}

async function fetchPublishTime(pkg, version) {
  const res = await fetch(`https://registry.npmjs.org/${pkg}`);
  if (!res.ok) {
    throw new Error(`npm registry returned ${res.status} for ${pkg}`);
  }
  const data = await res.json();
  const t = data?.time?.[version];
  if (!t) {
    throw new Error(`no publish time for ${pkg}@${version} in registry`);
  }
  return new Date(t).getTime();
}

async function main() {
  const [, , baseFile, headFile] = process.argv;
  if (!baseFile || !headFile) {
    console.error("Usage: cooling-off-diff.mjs <base-lockfile> <head-lockfile>");
    process.exit(2);
  }
  const base = readFileSync(baseFile, "utf8");
  const head = readFileSync(headFile, "utf8");
  const baseV = extractVersions(base);
  const headV = extractVersions(head);

  const bumps = [];
  for (const pkg of PULUMI_PACKAGES) {
    if (baseV[pkg] && headV[pkg] && baseV[pkg] !== headV[pkg]) {
      bumps.push({ pkg, oldV: baseV[pkg], newV: headV[pkg] });
    }
  }

  if (bumps.length === 0) {
    console.log("cooling-off: no @pulumi/* bumps in this PR.");
    process.exit(0);
  }

  let failed = false;
  const now = Date.now();
  for (const b of bumps) {
    const kind = classifyBump(b.oldV, b.newV);
    if (kind === "noop") continue;
    const threshold = COOLING_OFF_MS[kind];
    let publishTime;
    try {
      publishTime = await fetchPublishTime(b.pkg, b.newV);
    } catch (err) {
      console.error(`cooling-off: registry lookup failed for ${b.pkg}@${b.newV}: ${err.message}`);
      console.error("Treating as fail-closed.");
      process.exit(2);
    }
    const ageMs = now - publishTime;
    const remainingHours = Math.ceil((threshold - ageMs) / 3600000);
    const ageHours = Math.floor(ageMs / 3600000);
    if (ageMs < threshold) {
      console.error(
        `cooling-off: FAIL — ${b.pkg}@${b.newV} was published ${ageHours}h ago; ${kind} bumps require ${threshold / 3600000}h. Wait ${remainingHours}h.`,
      );
      failed = true;
    } else {
      console.log(
        `cooling-off: OK — ${b.pkg}@${b.newV} (${kind} bump) published ${ageHours}h ago; threshold ${threshold / 3600000}h.`,
      );
    }
  }
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`cooling-off: internal error: ${err.message}`);
  process.exit(2);
});
