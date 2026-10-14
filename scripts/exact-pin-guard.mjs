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

const SCRIPT_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = join(SCRIPT_FILE, "..", "..");
const LOCKFILE = join(REPO_ROOT, "pnpm-lock.yaml");

/** @type {Array<{ name: string, version: string, integrity: string }>} */
const ALLOWED = [
  {
    name: "@pulumi/pulumi",
    version: "3.268.0",
    integrity:
      "sha512-VtTIr44eC78BX4cAeh2MEqJqVFu5/UfrmsxjLdH73YIPr5igPEo9JB4g5yqncTHcXNxbkxJXndMOEm1CkpJA5Q==",
  },
  {
    name: "@pulumi/aws",
    version: "7.50.0",
    integrity:
      "sha512-YqnrUfFd5c3mFE8cZeGq5dFM8puX6c+IPBjxUD7ByZUJ1De7z6n4rL3moevkqU8IA4Tn89cEa2H+jUcZ2DzH0w==",
  },
  {
    name: "@pulumi/policy",
    version: "1.21.0",
    integrity:
      "sha512-tLczMS7S2UUpc1qO9xvGY54GumUShTNxm/BY/T1fb0Hp/ILScxXzrmLpkbt4KUGZAcX/EdGLVuMGHyhreqbfvg==",
  },
  // Added in Hulumi v1.1.0 M1 (Hulumi-for-GitHub runbook, 2026-04-26).
  // Mandatory baseline for SecureRepository (M1) + OrgFoundation (M2) + the
  // GitHub-side surface generally. Bumps must run through the cooling-off
  // gate the same way @pulumi/aws bumps do.
  {
    name: "@pulumi/github",
    version: "6.15.0",
    integrity:
      "sha512-U8ZxPQQcOrcTn8y8EZsWmXzMtbw0JnwWCVGmqxBZ/i2SpUlEGMYT9B+EFC/qTALZXkDf7cMiq6fZ3Gy1G23nyQ==",
  },
  // Added in Hulumi edge-platform M1. Mandatory baseline for
  // @hulumi/cloudflare-baseline ZoneFoundation and PublicHostname resources.
  {
    name: "@pulumi/cloudflare",
    version: "6.22.0",
    integrity:
      "sha512-ljJpS3vhIaTNzTvoNURkUfXnzDlBS0gx2nxvg84JmH6kuYoCmsLiQ1afOdhXly4+G/JIgYqjdxo2QNliVUWYDw==",
  },
  // Added in Hulumi v1.2.0 M1 (Hulumi-for-K8s runbook). Mandatory baseline for
  // HardenedHelmRelease (M1) + IstioFoundation (M2) + every K8s-side component.
  // Bumps subject to the same cooling-off gate as the rest.
  {
    name: "@pulumi/kubernetes",
    version: "4.34.2",
    integrity:
      "sha512-OcIe8OUwivkEngmjinrmke54INbJ0L6u/CWm8mLh6F7pmIDXyHGTM8PzcZsg5QbSm24HnNUHLl2tEUoOBxDo3w==",
  },
  // Added in Hulumi v1.2.0 M4 (Hulumi-for-K8s runbook). Runtime dep of
  // KubernetesSecretFromAwsSecretsManager + RdsCredentialSecret. Treated as a
  // pinned dep even though it's an @aws-sdk/* (not @pulumi/*) because its
  // integrity hash is part of the supply-chain story for the K8s package.
  {
    name: "@aws-sdk/client-secrets-manager",
    version: "3.1149.0",
    integrity:
      "sha512-HzMpERTdEuAoKn042iwbkSs4hqW4u3ryLd5LLU/QDcgKZl4hIfZk2hQRrrcQ/P4isWfMDAi+LV/W2JZidiyB5w==",
  },
  // Added in runbook hulumi-pre-public-launch M4 (issue #27). Runtime deps of
  // @hulumi/drift — published to npm alongside @pulumi/* + @hulumi/k8s-baseline,
  // so they get the same exact-pin + integrity-hash defense-in-depth. A
  // republish of any of these packages under the same version string with
  // tampered bytes will fail this guard at CI.
  {
    name: "@aws-sdk/client-cloudtrail",
    version: "3.1149.0",
    integrity:
      "sha512-loUAEGtLNxIBFnEGrITM5QrUsEPf54mQ3BSfxl0XUcqg/vtBU7Je3dgL70b6e/Pb+IPQrBATYeptXIDLxdQctA==",
  },
  {
    name: "@aws-sdk/client-cloudwatch-logs",
    version: "3.1149.0",
    integrity:
      "sha512-14jbCV0VgGisTQWr7jgtYrJRMTm8i/MiNF90yTuva+LHRbpUcKrlcDESxeLdMqW+4+fHjZXnnqmR40/+02vXbA==",
  },
  {
    name: "@aws-sdk/client-sts",
    version: "3.1149.0",
    integrity:
      "sha512-0In5ROb7LuUKsixQIe5YeKrHTScOxpmDhSUBRgZY+wgsd2OotS6IwJfPHhT8IqeNoZtW/qPpX13xUX7YfoUJDA==",
  },
  {
    name: "@aws-sdk/credential-providers",
    version: "3.1149.0",
    integrity:
      "sha512-OiABL+ZjZJ9yBjyCG07wKzN81axkVokZOpS+VZeDZx8AiYPgqu1MNDbmtX0c4z+SYxcSOtrxH6rU+Lwqz2Sjaw==",
  },
  {
    name: "p-timeout",
    version: "7.0.2",
    integrity:
      "sha512-prbX4Z3YszrFNgH+MW5Zoeq3baXrMtP/MQnFeET90UB/GtGcGDQ5Usg9OCy6ETjTTntOw1SL2z9fMPUppN3Guw==",
  },
  {
    name: "simple-git",
    version: "4.0.2",
    integrity:
      "sha512-l0sIsv9VrPwovKELFDBOj/lhmIcbMvxBk2B+hRhsMM4/VL3gKtuZvYnBNixVo+N/0HnqQx2cBdLvxnAbygHpqA==",
  },
];

function resolveFromLockfile(lock, name, version) {
  // pnpm-lock.yaml uses two distinct shapes: scoped packages are quoted
  // (`'@scope/pkg@ver':`); unscoped packages are bare (`pkg@ver:`).
  // Try the quoted form first, fall back to the bare form. Bare form
  // is anchored to a 2-space indent so we don't accidentally match
  // dependency lines deeper in the lockfile.
  const quotedHeader = `'${name}@${version}':`;
  const bareHeader = `\n  ${name}@${version}:\n`;
  let idx = lock.indexOf(quotedHeader);
  if (idx === -1) {
    idx = lock.indexOf(bareHeader);
    if (idx === -1) {
      return { present: false, integrity: null };
    }
  }
  // The block begins at idx and continues until the next top-level package
  // entry. We only need the `resolution:` line within this block.
  const block = lock.slice(idx, idx + 4000);
  const match = block.match(/resolution: \{integrity: ([^}]+)\}/);
  return { present: true, integrity: match ? match[1].trim() : null };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    const pattern = new RegExp(
      `(\\{\\s*\\n\\s*name:\\s*"${escapeRegExp(dep.name)}",\\s*\\n\\s*version:\\s*")([^"]+)(",\\s*\\n\\s*integrity:\\s*\\n\\s*")([^"]+)("\\s*,\\s*\\n\\s*\\})`,
      "m",
    );
    if (!pattern.test(next)) {
      throw new Error(`Could not find ALLOWED block for ${dep.name}`);
    }
    next = next.replace(pattern, `$1${dep.version}$3${dep.integrity}$5`);
  }
  return next;
}

function writeRefreshedAllowedTable(lock) {
  const source = readFileSync(SCRIPT_FILE, "utf8");
  const next = refreshAllowedTable(source, refreshedAllowedFromManifests(lock));
  if (next !== source) {
    writeFileSync(SCRIPT_FILE, next);
    console.log("exact-pin-guard: refreshed ALLOWED from package manifests + pnpm-lock.yaml");
  } else {
    console.log("exact-pin-guard: ALLOWED already matches package manifests + pnpm-lock.yaml");
  }
}

function main() {
  const lock = readFileSync(LOCKFILE, "utf8");
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
