#!/usr/bin/env node
// exact-pin-guard — reject @pulumi/* version drift in pnpm-lock.yaml.
//
// M5's cooling-off policy forbids bumping @pulumi/aws within 72h of upstream
// release; M2 seeds that discipline by hard-pinning exact versions AND
// integrity hashes for @pulumi/pulumi, @pulumi/aws, and @pulumi/policy.
// Any change to either must also update this guard's ALLOWED table — which
// is deliberately noisy, so a blind `pnpm update` fails CI and forces a
// conscious review.
//
// Scope: runs on the committed pnpm-lock.yaml. Exit 0 if every allow-listed
// dep's resolution integrity matches; exit 1 on any mismatch.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const LOCKFILE = join(REPO_ROOT, "pnpm-lock.yaml");

/** @type {Array<{ name: string, version: string, integrity: string }>} */
const ALLOWED = [
  {
    name: "@pulumi/pulumi",
    version: "3.239.0",
    integrity:
      "sha512-3OqN4x1OYgan3LvkiYCQYapm9phYnZzcu3usvovAXcQA3x5N5izHi9lmx0N/NLRsQQswE021ZvTTC2HZrYcqTg==",
  },
  {
    name: "@pulumi/aws",
    version: "7.30.0",
    integrity:
      "sha512-R1CnPcGD/ECRj/JZw2N+MLKwhKkm0C8aF+S5arBXf1j85qb+67lg+E2skgR2GtAIj6PJ1Qy8usEx+4ZlVeit7Q==",
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
    version: "4.31.0",
    integrity:
      "sha512-Lc0W0IQ/03o5KgV3j8KjWVSkZqo/qzyYy8/AInft54yFoTcu++xhoBVDU3l1NBf+Q0BsONYPKsn4Z00a7Y9alQ==",
  },
  // Added in Hulumi v1.2.0 M4 (Hulumi-for-K8s runbook). Runtime dep of
  // KubernetesSecretFromAwsSecretsManager + RdsCredentialSecret. Treated as a
  // pinned dep even though it's an @aws-sdk/* (not @pulumi/*) because its
  // integrity hash is part of the supply-chain story for the K8s package.
  {
    name: "@aws-sdk/client-secrets-manager",
    version: "3.1048.0",
    integrity:
      "sha512-GELp/vb1Kzk/xBUOx21OGti12OiuMwSYBoFAq5RhIcJGC7eBzSUa40zZZlsQsGXDW0OQb9Er+Ll3htr9doGFeg==",
  },
  // Added in runbook hulumi-pre-public-launch M4 (issue #27). Runtime deps of
  // @hulumi/drift — published to npm alongside @pulumi/* + @hulumi/k8s-baseline,
  // so they get the same exact-pin + integrity-hash defense-in-depth. A
  // republish of any of these packages under the same version string with
  // tampered bytes will fail this guard at CI.
  {
    name: "@aws-sdk/client-cloudtrail",
    version: "3.1048.0",
    integrity:
      "sha512-46cFOxN4RDIbKq36LGs3dbamHOSVhjkPmoTJyg+qH0Lkr0XWbteXPiYuilpzJMtJDDu6Y3uO0yzIeQN4xIUvuA==",
  },
  {
    name: "@aws-sdk/client-cloudwatch-logs",
    version: "3.1048.0",
    integrity:
      "sha512-0ck+MgIMIfM+VY2LJTo3Nwwxe2skjmmCoFmuR6k6ZeLCi3xp6oKKJtJbl3UJN/vrWmEmZp8JhtBR9w09TV5O5g==",
  },
  {
    name: "@aws-sdk/client-sts",
    version: "3.1048.0",
    integrity:
      "sha512-CE/RhHaIoLmmlKva/rmNB0A0/WWta+GozzTGl5kNc8fAnlR5iA0ygz8zw6VQRwFWz2b8T56qA8lapKcslztHfA==",
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

function main() {
  const lock = readFileSync(LOCKFILE, "utf8");
  const failures = [];
  for (const dep of ALLOWED) {
    const found = resolveFromLockfile(lock, dep.name, dep.version);
    if (!found.present) {
      failures.push(
        `${dep.name}@${dep.version}: not found in pnpm-lock.yaml. Pin drift or lockfile regeneration — update scripts/exact-pin-guard.mjs ALLOWED with a rationale.`,
      );
      continue;
    }
    if (found.integrity !== dep.integrity) {
      failures.push(
        `${dep.name}@${dep.version}: integrity mismatch. expected=${dep.integrity} actual=${found.integrity}`,
      );
    }
  }
  if (failures.length > 0) {
    console.error("exact-pin-guard: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    console.error("");
    console.error(
      "Update scripts/exact-pin-guard.mjs ALLOWED and record the rationale in the PR description.",
    );
    process.exit(1);
  }
  console.log(
    "exact-pin-guard: OK (" + ALLOWED.length + " pinned deps match expected integrity hashes)",
  );
}

main();
