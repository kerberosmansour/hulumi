#!/usr/bin/env node
// Cleanup a failed AccountFoundation e2e stack from the private Pulumi backend.
//
// This is intentionally state-driven: Pulumi remains the source of truth for
// which resources are in scope. The only direct AWS mutation is draining
// versioned S3 objects from e2e log buckets before `pulumi destroy`, because a
// failed destroy can otherwise be blocked by CloudTrail/Config log versions.

import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { promisify } from "node:util";

const require = createRequire(import.meta.url);
const { LocalWorkspace, PulumiCommand } = require("@pulumi/pulumi/automation");
const pulumiSdk = require("@pulumi/pulumi/package.json");

const execFileAsync = promisify(execFile);

const PROJECT_NAME = "hulumi-account-foundation-e2e";
const AWS_PLUGIN_VERSION = "7.27.0";
const STACK_SUFFIX_PATTERN = /^(?:sandbox-)?([a-f0-9]{10})$/;
const DELETE_BATCH_SIZE = 1000;

function normalizeSuffix(value) {
  const raw = String(value ?? "").trim();
  const match = STACK_SUFFIX_PATTERN.exec(raw);
  if (!match) {
    throw new Error("Usage: cleanup-e2e-stack.mjs <10-hex-suffix|sandbox-10-hex-suffix>");
  }
  return match[1];
}

function envWithDefined(values) {
  const out = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") {
      out[key] = value;
    }
  }
  return out;
}

function mask(value) {
  if (process.env.GITHUB_ACTIONS === "true" && value !== undefined && value !== "") {
    console.log(`::add-mask::${value}`);
  }
}

function redactedLog(message) {
  console.log(`[e2e-cleanup] ${message}`);
}

async function awsJson(args, options = {}) {
  const { stdout } = await execFileAsync("aws", args, {
    timeout: options.timeoutMs ?? 60_000,
    maxBuffer: options.maxBuffer ?? 10 * 1024 * 1024,
  });
  const text = stdout.trim();
  return text === "" ? {} : JSON.parse(text);
}

function isNotFound(err) {
  const text =
    err instanceof Error
      ? `${err.message}\n${"stderr" in err && typeof err.stderr === "string" ? err.stderr : ""}`
      : String(err);
  return /NoSuchBucket|Not Found|not found|404/.test(text);
}

function chunk(values, size) {
  const out = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size));
  }
  return out;
}

function getDeploymentResources(deployment) {
  const resources = deployment?.deployment?.resources;
  if (!Array.isArray(resources)) {
    return [];
  }
  return resources;
}

function bucketIdsForSuffix(resources, suffix) {
  const expectedPrefix = `af-e2e-${suffix}-`;
  const ids = new Set();
  for (const resource of resources) {
    if (resource?.type !== "aws:s3/bucketV2:BucketV2") {
      continue;
    }
    const urn = String(resource.urn ?? "");
    if (!urn.includes(`af-e2e-${suffix}-`)) {
      continue;
    }
    const id = String(resource.id ?? resource.outputs?.bucket ?? "");
    if (id === "") {
      continue;
    }
    if (!id.startsWith(expectedPrefix)) {
      throw new Error(
        `Refusing to drain S3 bucket outside expected e2e prefix (${expectedPrefix}...)`,
      );
    }
    ids.add(id);
  }
  return [...ids];
}

async function drainBucket(bucket) {
  mask(bucket);
  let versionCount = 0;
  try {
    const versions = await awsJson(["s3api", "list-object-versions", "--bucket", bucket]);
    const objects = [
      ...(Array.isArray(versions.Versions) ? versions.Versions : []),
      ...(Array.isArray(versions.DeleteMarkers) ? versions.DeleteMarkers : []),
    ]
      .map((entry) => ({
        Key: typeof entry.Key === "string" ? entry.Key : undefined,
        VersionId: typeof entry.VersionId === "string" ? entry.VersionId : undefined,
      }))
      .filter((entry) => entry.Key !== undefined && entry.VersionId !== undefined);

    for (const group of chunk(objects, DELETE_BATCH_SIZE)) {
      await execFileAsync(
        "aws",
        [
          "s3api",
          "delete-objects",
          "--bucket",
          bucket,
          "--delete",
          JSON.stringify({ Objects: group, Quiet: true }),
        ],
        { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
      );
      versionCount += group.length;
    }
  } catch (err) {
    if (isNotFound(err)) {
      redactedLog("S3 log bucket already absent; continuing.");
      return { deletedVersions: 0, abortedUploads: 0 };
    }
    throw err;
  }

  let uploadCount = 0;
  try {
    const uploads = await awsJson(["s3api", "list-multipart-uploads", "--bucket", bucket]);
    const pending = Array.isArray(uploads.Uploads) ? uploads.Uploads : [];
    for (const upload of pending) {
      if (typeof upload.Key !== "string" || typeof upload.UploadId !== "string") {
        continue;
      }
      await execFileAsync(
        "aws",
        [
          "s3api",
          "abort-multipart-upload",
          "--bucket",
          bucket,
          "--key",
          upload.Key,
          "--upload-id",
          upload.UploadId,
        ],
        { timeout: 60_000, maxBuffer: 1024 * 1024 },
      );
      uploadCount += 1;
    }
  } catch (err) {
    if (!isNotFound(err)) {
      throw err;
    }
  }

  return { deletedVersions: versionCount, abortedUploads: uploadCount };
}

async function tryDriftContext() {
  try {
    require("../packages/drift/dist/index.js");
    return "available";
  } catch {
    return "not-built";
  }
}

async function main() {
  const suffix = normalizeSuffix(process.argv[2] ?? process.env.HULUMI_E2E_STACK_SUFFIX);
  const stackName = `sandbox-${suffix}`;
  const resourcePrefix = `af-e2e-${suffix}`;
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";
  const workDir = mkdtempSync(join(tmpdir(), `hulumi-e2e-cleanup-${suffix}-`));
  const pulumiHome = join(workDir, ".pulumi-home");

  mask(process.env.PULUMI_BACKEND_URL);
  mask(process.env.PULUMI_ACCESS_TOKEN);
  mask(process.env.PULUMI_CONFIG_PASSPHRASE);

  redactedLog(`selecting Pulumi stack ${stackName}`);
  redactedLog(
    `@hulumi/drift package ${await tryDriftContext()}; cleanup remains Pulumi-state driven.`,
  );

  try {
    redactedLog(`installing Pulumi CLI matching @pulumi/pulumi ${pulumiSdk.version}`);
    const pulumiCommand = await PulumiCommand.install();
    const stack = await LocalWorkspace.selectStack(
      {
        stackName,
        projectName: PROJECT_NAME,
        program: async () => ({}),
      },
      {
        workDir,
        pulumiHome,
        pulumiCommand,
        envVars: envWithDefined({
          AWS_REGION: region,
          AWS_DEFAULT_REGION: region,
          PULUMI_ACCESS_TOKEN: process.env.PULUMI_ACCESS_TOKEN,
          PULUMI_BACKEND_URL: process.env.PULUMI_BACKEND_URL,
          PULUMI_CONFIG_PASSPHRASE: process.env.PULUMI_CONFIG_PASSPHRASE ?? `hulumi-e2e-${suffix}`,
          PULUMI_SKIP_UPDATE_CHECK: "true",
        }),
      },
    );
    await stack.setConfig("aws:region", { value: region });
    await stack.workspace.installPlugin("aws", AWS_PLUGIN_VERSION);

    const deployment = await stack.exportStack();
    const resources = getDeploymentResources(deployment);
    const inScope = resources.filter((resource) =>
      String(resource?.urn ?? "").includes(resourcePrefix),
    );
    redactedLog(`state resources in scope: ${inScope.length}`);

    const buckets = bucketIdsForSuffix(resources, suffix);
    redactedLog(`versioned e2e buckets to drain: ${buckets.length}`);
    for (const bucket of buckets) {
      const result = await drainBucket(bucket);
      redactedLog(
        `drained one e2e bucket (${result.deletedVersions} object versions, ${result.abortedUploads} multipart uploads).`,
      );
    }

    redactedLog("running pulumi destroy for the selected stack");
    await stack.destroy({
      suppressOutputs: true,
      onOutput: () => undefined,
      onError: () => undefined,
    });
    redactedLog("removing empty Pulumi stack from backend");
    await stack.workspace.removeStack(stack.name);
    redactedLog("cleanup complete");
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    if (/no stack named|does not exist|not found/i.test(text)) {
      redactedLog(`stack ${stackName} is already absent; nothing to clean.`);
      return;
    }
    throw err;
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(`[e2e-cleanup] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
