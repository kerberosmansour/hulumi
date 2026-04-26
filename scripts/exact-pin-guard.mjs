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
    version: "6.13.0",
    integrity:
      "sha512-VoQEHG7oAm7IWGwNCOKZl0FELTch9gtOBbyMLRHZgPIwyF+xxXwXomnEyAkell/PzfjuHl9HYZeOQPMS9doUaw==",
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
    version: "3.1037.0",
    integrity:
      "sha512-SBXVNgXdzFeiuUod1AZXJexTDndPcpSTGOrVDe5Ny81Xq7d3r18th7ZTzvnc7BsD9MQa8SckNgOYscvi/fYZhw==",
  },
];

function resolveFromLockfile(lock, name, version) {
  const header = `'${name}@${version}':`;
  const idx = lock.indexOf(header);
  if (idx === -1) {
    return { present: false, integrity: null };
  }
  // The block begins at idx and continues until the next top-level package
  // entry (unindented `'pkgname@ver':` or end-of-file). We only need the
  // `resolution:` line within this block.
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
  console.log("exact-pin-guard: OK (" + ALLOWED.length + " @pulumi/* deps match pinned hashes)");
}

main();
