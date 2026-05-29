import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import type { Track } from "../classify/route";

export const findingStateSchema = z.enum([
  "detected",
  "in_progress",
  "remediated",
  "escalated",
  "dropped",
]);
export type FindingState = z.infer<typeof findingStateSchema>;

export const findingRecordSchema = z
  .object({
    findingKey: z.string().min(1),
    advisoryId: z.string().min(1),
    ecosystem: z.enum(["npm", "PyPI", "NuGet"]),
    package: z.string().min(1),
    affectedVersion: z.string().min(1),
    class: z.enum(["malicious", "critical"]),
    track: z.enum(["emergency", "cadence", "dropped"]),
    fixedVersion: z.string().nullable(),
    state: findingStateSchema,
    manifestPaths: z.array(z.string().min(1)),
    firstSeen: z.string().datetime(),
    lastSeen: z.string().datetime(),
    remediationRef: z.string().optional(),
    auditRecordPath: z.string().optional(),
    reason: z.string().optional(),
  })
  .strict();

export type FindingRecord = z.infer<typeof findingRecordSchema>;

export const stateStoreSchema = z
  .object({
    version: z.literal(1),
    revision: z.number().int().min(0),
    findings: z.record(z.string(), findingRecordSchema),
  })
  .strict();

export type StateStoreData = z.infer<typeof stateStoreSchema>;

export interface ClaimOptions {
  expectedRevision?: number;
}

export interface ClaimResult {
  claimed: boolean;
  sideEffectsAllowed: boolean;
  state: StateStoreData;
  event: { name: string; findingKey: string };
}

export function createEmptyState(): StateStoreData {
  return { version: 1, revision: 0, findings: {} };
}

export function claimFinding(
  state: StateStoreData,
  record: FindingRecord,
  options: ClaimOptions = {},
): ClaimResult {
  const parsedState = stateStoreSchema.parse(state);
  const parsedRecord = findingRecordSchema.parse(record);

  if (parsedState.findings[parsedRecord.findingKey] !== undefined) {
    return deduped(parsedState, parsedRecord.findingKey);
  }

  if (options.expectedRevision !== undefined && options.expectedRevision !== parsedState.revision) {
    return deduped(parsedState, parsedRecord.findingKey);
  }

  if (parsedRecord.track !== "emergency" || parsedRecord.state !== "in_progress") {
    throw new Error("claimFinding only claims emergency records into in_progress");
  }

  const nextState = {
    ...parsedState,
    revision: parsedState.revision + 1,
    findings: {
      ...parsedState.findings,
      [parsedRecord.findingKey]: parsedRecord,
    },
  };

  return {
    claimed: true,
    sideEffectsAllowed: true,
    state: nextState,
    event: { name: "sca.finding.routed", findingKey: parsedRecord.findingKey },
  };
}

export function writeFindingState(
  state: StateStoreData,
  record: FindingRecord,
  options: { actor?: "triage"; reason?: string } = {},
) {
  const parsedState = stateStoreSchema.parse(state);
  const parsedRecord = findingRecordSchema.parse(record);
  if (options.actor !== "triage") {
    throw new Error("trusted deterministic writer required for finding-state updates");
  }
  if (parsedRecord.track === "dropped" && !options.reason && !parsedRecord.reason) {
    throw new Error("dropped findings require a recorded reason");
  }

  return {
    ...parsedState,
    revision: parsedState.revision + 1,
    findings: {
      ...parsedState.findings,
      [parsedRecord.findingKey]: parsedRecord,
    },
  };
}

export async function readStateFile(path: string): Promise<StateStoreData> {
  try {
    return stateStoreSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return createEmptyState();
    }
    throw error;
  }
}

export async function writeStateFile(path: string, state: StateStoreData) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(stateStoreSchema.parse(state), null, 2)}\n`);
}

export function buildRecord(args: {
  findingKey: string;
  advisoryId: string;
  ecosystem: "npm" | "PyPI" | "NuGet";
  package: string;
  affectedVersion: string;
  findingClass: "malicious" | "critical";
  track: Track;
  fixedVersion: string | null;
  state: FindingState;
  manifestPaths: string[];
  now: string;
  reason?: string;
}): FindingRecord {
  return findingRecordSchema.parse({
    findingKey: args.findingKey,
    advisoryId: args.advisoryId,
    ecosystem: args.ecosystem,
    package: args.package,
    affectedVersion: args.affectedVersion,
    class: args.findingClass,
    track: args.track,
    fixedVersion: args.fixedVersion,
    state: args.state,
    manifestPaths: args.manifestPaths,
    firstSeen: args.now,
    lastSeen: args.now,
    reason: args.reason,
  });
}

function deduped(state: StateStoreData, findingKey: string): ClaimResult {
  return {
    claimed: false,
    sideEffectsAllowed: false,
    state,
    event: { name: "sca.finding.deduped", findingKey },
  };
}
