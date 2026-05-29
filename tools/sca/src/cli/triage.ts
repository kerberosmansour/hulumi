#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { defaultRouteConfig, routeEvidence, type RouteConfig, type Track } from "../classify/route";
import {
  buildFindingKey,
  enrichmentToEvidenceInput,
  normalizeEvidence,
  scanFileSchema,
  type NormalizedEvidence,
  type RawScanFinding,
  type SourceEnrichment,
} from "../evidence/normalize";
import {
  buildRecord,
  claimFinding,
  createEmptyState,
  readStateFile,
  writeFindingState,
  writeStateFile,
  type FindingRecord,
  type StateStoreData,
} from "../state/store";

const defaultEnrichments: Record<string, SourceEnrichment> = {
  "GHSA-35jh-r3h4-6jhm": {
    fixedVersion: "4.17.21",
    severityClass: "critical",
    cvss: 7.2,
    epssScore: 0.01,
    present: true,
  },
  "PYSEC-2010-12": {
    fixedVersion: "1.2.7",
    severityClass: "critical",
    cvss: 9.8,
    epssScore: 0.8,
    present: true,
  },
  "GHSA-5crp-9r3c-p9vr": {
    fixedVersion: "13.0.1",
    severityClass: "critical",
    cvss: 9.8,
    epssScore: 0.2,
    present: true,
  },
};

export interface TriageResult {
  workItems: Array<{
    findingKey: string;
    track: Track;
    state: FindingRecord["state"];
    reason?: string;
  }>;
  events: Array<{ name: string; findingKey: string; track?: Track }>;
  evidence: NormalizedEvidence[];
  state: StateStoreData;
  dedupeRate: number;
}

interface TriageOptions {
  state?: StateStoreData;
  enrichments?: Record<string, SourceEnrichment>;
  expectedRevision?: number;
  forceEmergencyForTest?: boolean;
  config?: RouteConfig;
  now?: string;
}

interface TriageCliOptions extends TriageOptions {
  findingsPath: string;
  statePath: string;
  workItemsPath: string;
  eventsPath?: string;
}

interface TriageFunction {
  (findings: RawScanFinding[], options?: TriageOptions): Promise<TriageResult>;
  fromFile(path: string, options?: TriageOptions): Promise<TriageResult>;
  cli(options: TriageCliOptions): Promise<TriageResult>;
}

const triage: TriageFunction = async (findings: RawScanFinding[], options: TriageOptions = {}) => {
  const config = options.config ?? defaultRouteConfig;
  const now = options.now ?? new Date().toISOString();
  const enrichments = { ...defaultEnrichments, ...(options.enrichments ?? {}) };
  let state = options.state ?? createEmptyState();
  const workItems: TriageResult["workItems"] = [];
  const events: TriageResult["events"] = [];
  const evidenceRecords: NormalizedEvidence[] = [];
  let dedupedCount = 0;

  for (const finding of findings.map((candidate) =>
    scanFileSchema.shape.findings.element.parse(candidate),
  )) {
    const findingKey = buildFindingKey(finding);
    const enrichment = enrichments[findingKey] ?? enrichments[finding.advisoryId] ?? {};
    const evidence = normalizeEvidence(enrichmentToEvidenceInput(finding, enrichment));
    evidenceRecords.push(evidence);
    const decision = routeEvidence(evidence, config, {
      forceEmergencyForTest: options.forceEmergencyForTest,
    });
    const record = buildRecord({
      findingKey,
      advisoryId: finding.advisoryId,
      ecosystem: finding.ecosystem,
      package: finding.package,
      affectedVersion: finding.version,
      findingClass: evidence.osv.class,
      track: decision.track,
      fixedVersion: evidence.osv.fixedVersion,
      state: stateForTrack(decision.track),
      manifestPaths: evidence.manifestPaths,
      now,
      reason: decision.reason,
    });

    if (decision.track === "emergency") {
      const claim = claimFinding(state, record, {
        expectedRevision: options.expectedRevision,
      });
      state = claim.state;
      events.push({ ...claim.event, track: decision.track });
      if (claim.claimed) {
        workItems.push({
          findingKey,
          track: "emergency",
          state: "in_progress",
        });
      } else {
        dedupedCount += 1;
      }
      continue;
    }

    if (state.findings[findingKey]) {
      events.push({
        name: "sca.finding.deduped",
        findingKey,
        track: decision.track,
      });
      dedupedCount += 1;
      continue;
    }

    state = writeFindingState(state, record, {
      actor: "triage",
      reason: decision.reason,
    });
    events.push({
      name: "sca.finding.routed",
      findingKey,
      track: decision.track,
    });
    workItems.push({
      findingKey,
      track: decision.track,
      state: record.state,
      reason: decision.reason,
    });
  }

  return {
    workItems,
    events,
    evidence: evidenceRecords,
    state,
    dedupeRate: findings.length === 0 ? 0 : dedupedCount / findings.length,
  };
};

triage.fromFile = async (path: string, options: TriageOptions = {}) => {
  const parsed = scanFileSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
  if (!parsed.success) {
    throw new Error(`OSV findings JSON failed schema validation: ${parsed.error.message}`);
  }
  return triage(parsed.data.findings, options);
};

triage.cli = async (options: TriageCliOptions) => {
  const state = await readStateFile(options.statePath);
  const result = await triage.fromFile(options.findingsPath, {
    ...options,
    state,
  });
  await writeStateFile(options.statePath, result.state);
  await writeJson(options.workItemsPath, {
    version: 1,
    workItems: result.workItems,
    evidence: result.evidence,
  });
  if (options.eventsPath) {
    await writeJson(options.eventsPath, {
      version: 1,
      events: result.events,
      metrics: { dedupeRate: result.dedupeRate },
    });
  }
  return result;
};

export const triageFindings = triage;

export async function main(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);
  const command = parsed.command === "triage" ? "triage" : parsed.command;
  if (command !== "triage") {
    throw new Error(`unknown command: ${parsed.command}`);
  }

  const result = await triage.cli({
    findingsPath: parsed.options.get("findings") ?? "findings.osv.json",
    statePath: parsed.options.get("state") ?? ".cache/sca-state/findings.json",
    workItemsPath: parsed.options.get("work-items") ?? ".cache/sca-work-items.json",
    eventsPath: parsed.options.get("events") ?? ".cache/sca-events.json",
  });
  process.stdout.write(
    `sca triage completed: ${result.workItems.length} work item(s), dedupeRate=${result.dedupeRate.toFixed(2)}\n`,
  );
}

function stateForTrack(track: Track): FindingRecord["state"] {
  if (track === "emergency") {
    return "in_progress";
  }
  if (track === "dropped") {
    return "dropped";
  }
  return "detected";
}

function parseArgs(argv: string[]) {
  const command = argv[0] && !argv[0].startsWith("--") ? argv[0] : "triage";
  const rest = command === "triage" ? argv.slice(1) : argv;
  const options = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token.startsWith("--")) {
      const [key, inlineValue] = token.slice(2).split("=", 2);
      const value = inlineValue ?? rest[index + 1];
      if (inlineValue === undefined) {
        index += 1;
      }
      options.set(key, value);
    }
  }
  return { command, options };
}

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

if (process.argv[1]?.endsWith("triage.ts")) {
  main().catch((error) => {
    const message =
      error instanceof z.ZodError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
