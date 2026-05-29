import { z } from "zod";

export const ecosystemSchema = z.enum(["npm", "PyPI", "NuGet"]);

export const rawScanFindingSchema = z
  .object({
    ecosystem: ecosystemSchema,
    package: z.string().min(1),
    version: z.string().min(1),
    advisoryId: z.string().min(1),
    manifestPath: z.string().min(1),
  })
  .strict();

export const scanFileSchema = z
  .object({
    generatedAt: z.string().optional(),
    scanner: z.unknown().optional(),
    findings: z.array(rawScanFindingSchema),
  })
  .strict();

export type RawScanFinding = z.infer<typeof rawScanFindingSchema>;

export type FindingClass = "malicious" | "critical";
export type Provenance = "ok" | "unavailable";

export interface SourceEnrichment {
  fixedVersion?: string | null;
  severityClass?: FindingClass;
  present?: boolean;
  cvss?: number;
  cvssUnavailable?: boolean;
  ghsaId?: string;
  kevListed?: boolean;
  kevUnavailable?: boolean;
  epssScore?: number;
  epssUnavailable?: boolean;
  publishedAt?: string;
}

export interface EvidenceInput {
  finding: RawScanFinding;
  osv?: { fixedVersion?: string | null; severityClass?: FindingClass };
  dependencyReview?: { present: boolean; vulnerableTransitives: string[] };
  ghsa?: { id?: string; cvss?: number };
  kev?: { listed?: boolean; unavailable?: boolean };
  epss?: { score?: number; available?: boolean; unavailable?: boolean };
  registry?: { publishedAt?: string; unavailable?: boolean };
}

export interface NormalizedEvidence {
  findingKey: string;
  osv: {
    advisoryId: string;
    class: FindingClass;
    fixedVersion: string | null;
  };
  dependencyReview: {
    present: boolean;
    vulnerableTransitives: string[];
  };
  ghsa: {
    id: string | null;
    cvss: number | null;
  };
  kev: {
    listed: boolean | null;
  };
  epss: {
    score: number | null;
    available: boolean;
  };
  registry: {
    publishedAt: string | null;
  };
  provenance: {
    osv: Provenance;
    dependencyReview: Provenance;
    ghsa: Provenance;
    kev: Provenance;
    epss: Provenance;
    registry: Provenance;
  };
  manifestPaths: string[];
  raw: RawScanFinding;
}

export function buildFindingKey(finding: RawScanFinding) {
  return `${finding.ecosystem}:${finding.package}@${finding.version}:${finding.advisoryId}`;
}

export function normalizeEvidence(input: EvidenceInput): NormalizedEvidence {
  const finding = rawScanFindingSchema.parse(input.finding);
  const severityClass = input.osv?.severityClass ?? inferClass(finding.advisoryId);
  const dependencyReview = input.dependencyReview ?? {
    present: true,
    vulnerableTransitives: [],
  };
  const kevUnavailable = input.kev?.unavailable === true;
  const epssUnavailable = input.epss?.unavailable === true || input.epss?.available === false;
  const registryUnavailable = input.registry?.unavailable === true;

  return {
    findingKey: buildFindingKey(finding),
    osv: {
      advisoryId: finding.advisoryId,
      class: severityClass,
      fixedVersion: input.osv?.fixedVersion ?? null,
    },
    dependencyReview,
    ghsa: {
      id: input.ghsa?.id ?? null,
      cvss: input.ghsa?.cvss ?? null,
    },
    kev: {
      listed: kevUnavailable ? null : (input.kev?.listed ?? false),
    },
    epss: {
      score: epssUnavailable ? null : (input.epss?.score ?? null),
      available: !epssUnavailable,
    },
    registry: {
      publishedAt: registryUnavailable ? null : (input.registry?.publishedAt ?? null),
    },
    provenance: {
      osv: "ok",
      dependencyReview: "ok",
      ghsa: input.ghsa?.cvss === undefined && input.ghsa?.id === undefined ? "unavailable" : "ok",
      kev: kevUnavailable ? "unavailable" : "ok",
      epss: epssUnavailable ? "unavailable" : "ok",
      registry: registryUnavailable ? "unavailable" : "ok",
    },
    manifestPaths: [finding.manifestPath],
    raw: finding,
  };
}

export function enrichmentToEvidenceInput(
  finding: RawScanFinding,
  enrichment: SourceEnrichment = {},
): EvidenceInput {
  return {
    finding,
    osv: {
      fixedVersion: enrichment.fixedVersion ?? null,
      severityClass: enrichment.severityClass ?? inferClass(finding.advisoryId),
    },
    dependencyReview: {
      present: enrichment.present ?? true,
      vulnerableTransitives: [],
    },
    ghsa:
      enrichment.cvssUnavailable === true
        ? undefined
        : {
            id:
              enrichment.ghsaId ??
              (finding.advisoryId.startsWith("GHSA-") ? finding.advisoryId : undefined),
            cvss: enrichment.cvss,
          },
    kev: {
      listed: enrichment.kevListed ?? false,
      unavailable: enrichment.kevUnavailable,
    },
    epss: {
      score: enrichment.epssScore,
      available: enrichment.epssUnavailable === true ? false : enrichment.epssScore !== undefined,
      unavailable: enrichment.epssUnavailable,
    },
    registry: {
      publishedAt: enrichment.publishedAt,
    },
  };
}

function inferClass(advisoryId: string): FindingClass {
  return advisoryId.startsWith("MAL-") ? "malicious" : "critical";
}
