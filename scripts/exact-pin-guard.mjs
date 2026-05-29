#!/usr/bin/env node
// exact-pin-guard — reject protected dependency drift in pnpm-lock.yaml.
//
// M5's cooling-off policy forbids bumping @pulumi/aws within 72h of upstream
// release; M2 seeds that discipline by hard-pinning exact versions in manifests
// and integrity hashes in pnpm-lock.yaml for the protected dependency set below.
// The ALLOWED table is the protected-name set. Default mode derives the current
// expected version from exact package manifests and the current integrity from
// pnpm-lock.yaml, so Dependabot Track B can update routine pins without a
// second CI-triggering commit. `--write` refreshes the table for human-readable
// audit diffs, but CI does not require it.
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
    version: "3.232.0",
    integrity:
      "sha512-5Pl48cCwOOZEvG7b6w6sErrD1D/QiEwiPqEtHCIzF/alU0yzFjo95uxNteKFlt0LsnzWsZ58DJHgBe9gurjIFg==",
  },
  {
    name: "@pulumi/aws",
    version: "7.27.0",
    integrity:
      "sha512-I3zArWb8F8QVfcWhBBW8h4dB1Omb823G3H2Ej66t0PFyfUHC7t79MDlG0UvoaZqrmXkDG7nFVFB4xdQTZ62R6w==",
  },
  {
    name: "@pulumi/policy",
    version: "1.20.0",
    integrity:
      "sha512-XglLDdJg1CfxuZ0Lvxzm9mo5YInwwwkVWE6z6tjWCCj1c96eNzaQRoVF4+P9ToQ3fSTk+G00iZdgXY9hpg9Qgw==",
  },
  // Added in Hulumi v1.1.0 M1 (Hulumi-for-GitHub runbook, 2026-04-26).
  // Mandatory baseline for SecureRepository (M1) + OrgFoundation (M2) + the
  // GitHub-side surface generally. Bumps must run through the cooling-off
  // gate the same way @pulumi/aws bumps do.
  {
    name: "@pulumi/github",
    version: "6.13.1",
    integrity:
      "sha512-dvQtwXvhIqx7HHTe0+PzLooyboiNapDHOnxEbGd0jY6boFFuFJpT5LKapK25cjsc6s4qKduvLo2HZdo9UtH05g==",
  },
  // Added in Hulumi edge-platform M1. Mandatory baseline for
  // @hulumi/cloudflare-baseline ZoneFoundation and PublicHostname resources.
  {
    name: "@pulumi/cloudflare",
    version: "6.15.0",
    integrity:
      "sha512-I2C1UA//YbkuGUV5O9skIMUu94StNSE4hiAU57GFtyL7WEqAMJLvV8Vpcu1192rI1/ZwFIJeR4MbAZfiYlPFqA==",
  },
  // Added in Hulumi v1.2.0 M1 (Hulumi-for-K8s runbook). Mandatory baseline for
  // HardenedHelmRelease (M1) + IstioFoundation (M2) + every K8s-side component.
  // Bumps subject to the same cooling-off gate as the rest.
  {
    name: "@pulumi/kubernetes",
    version: "4.30.0",
    integrity:
      "sha512-ZCS4HwBvcxfdPDw44L1/SCqoIttCVugx/FZzqRFRq+leKRIfigAYt4sILXlqulNtX6XjlWVzZO8zva3Ygk7hGA==",
  },
  // Added in Hulumi v1.2.0 M4 (Hulumi-for-K8s runbook). Runtime dep of
  // KubernetesSecretFromAwsSecretsManager + RdsCredentialSecret. Treated as a
  // pinned dep even though it's an @aws-sdk/* (not @pulumi/*) because its
  // integrity hash is part of the supply-chain story for the K8s package.
  {
    name: "@aws-sdk/client-secrets-manager",
    version: "3.1047.0",
    integrity:
      "sha512-jKwVKPssSxB8DbMfZ4lUW5Q6fyeJnjvz76GBsb1fUTWcRxGukzkXd5Di5oTUQnYv+BUen97+ZjTz/Azi6hUmzQ==",
  },
  // Added in runbook hulumi-pre-public-launch M4 (issue #27). Runtime deps of
  // @hulumi/drift — published to npm alongside @pulumi/* + @hulumi/k8s-baseline,
  // so they get the same exact-pin + integrity-hash defense-in-depth. A
  // republish of any of these packages under the same version string with
  // tampered bytes will fail this guard at CI.
  {
    name: "@aws-sdk/client-cloudtrail",
    version: "3.1045.0",
    integrity:
      "sha512-FERHosVdC9SD/J9UTNtItGyhnXdMNHrvqkWxCuvHteWLSPWz9GrHNiuVnZ+dBD3yaM49isk6/TNIZlTSdZqJ1w==",
  },
  {
    name: "@aws-sdk/client-cloudwatch-logs",
    version: "3.1047.0",
    integrity:
      "sha512-e64h4CDfpwvm/vDX7v87Rvo805cO3MDx+icTiwX0R6riXcYAUuj5JKIYOf35O4qFUhYiE+hEuUEWbFFHfJ5OVw==",
  },
  {
    name: "@aws-sdk/client-sts",
    version: "3.1045.0",
    integrity:
      "sha512-oDJJ7rM1osvfBdfZuhQ5DM6lHD9iuypL9m2LsEiA/lB8xuE5uPYsftNDcS0J9VRXFSvYTqC14K7Y5vMMKMg0vw==",
  },
  {
    name: "@aws-sdk/credential-providers",
    version: "3.1045.0",
    integrity:
      "sha512-J+it58HUGyMIAquB6pWtvmO4m0E/gQ/Tz9Xcoogk3Rety13likU5U8HioeIgE+aN1DDOAB//MARoIdLZS1Mpfw==",
  },
  {
    name: "p-timeout",
    version: "7.0.1",
    integrity:
      "sha512-AxTM2wDGORHGEkPCt8yqxOTMgpfbEHqF51f/5fJCmwFC3C/zNcGT63SymH2ttOAaiIws2zVg4+izQCjrakcwHg==",
  },
  {
    name: "simple-git",
    version: "3.36.0",
    integrity:
      "sha512-cGQjLjK8bxJw4QuYT7gxHw3/IouVESbhahSsHrX97MzCL1gu2u7oy38W6L2ZIGECEfIBG4BabsWDPjBxJENv9Q==",
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
