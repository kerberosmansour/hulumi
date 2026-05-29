import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";

const checkStatusSchema = z.enum(["success", "failure", "skipped"]);

export const auditRecordSchema = z
  .object({
    version: z.literal(1),
    findingKey: z.string().min(1),
    advisoryId: z.string().min(1),
    packageName: z.string().min(1),
    fromVersion: z.string().min(1),
    toVersion: z.string().min(1),
    reviewer: z.string().min(1),
    merger: z.string().min(1),
    checks: z.record(z.string(), checkStatusSchema),
    createdAt: z.string().datetime(),
    path: z.string().min(1),
    signature: z.string().min(1),
  })
  .strict();

export type AuditRecord = z.infer<typeof auditRecordSchema>;

export function buildAuditRecord(args: {
  findingKey: string;
  advisoryId: string;
  packageName: string;
  fromVersion: string;
  toVersion: string;
  reviewer: string;
  merger: string;
  checks: Record<string, "success" | "failure" | "skipped">;
  createdAt: string;
}): AuditRecord {
  const path = `audit/${args.createdAt.slice(0, 10)}-${safePathPart(args.advisoryId)}.json`;
  const unsigned = {
    version: 1 as const,
    ...args,
    path,
  };
  return auditRecordSchema.parse({
    ...unsigned,
    signature: signRecord(unsigned),
  });
}

export async function writeAuditRecord(record: AuditRecord, options: { auditDir?: string } = {}) {
  const parsed = auditRecordSchema.parse(record);
  const outputPath = options.auditDir
    ? join(options.auditDir, parsed.path.replace(/^audit\//, ""))
    : parsed.path;
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(parsed, null, 2)}\n`);
  return parsed;
}

function signRecord(record: Omit<AuditRecord, "signature">) {
  return createHash("sha256").update(JSON.stringify(record)).digest("hex");
}

function safePathPart(value: string) {
  return value.replace(/[^A-Za-z0-9_.-]/g, "_");
}
