import type { NormalizedEvidence } from "../evidence/normalize";

export type Track = "emergency" | "cadence" | "dropped";

export interface RouteConfig {
  emergency: {
    minCvss: number;
    epssThreshold: number;
    treatKevAsEmergency: boolean;
    treatMalAsEmergency: boolean;
    requireFixAvailable: boolean;
    requireLockfilePresence: boolean;
  };
}

export interface RouteDecision {
  track: Track;
  reason?: string;
}

export const defaultRouteConfig: RouteConfig = {
  emergency: {
    minCvss: 9,
    epssThreshold: 0.5,
    treatKevAsEmergency: true,
    treatMalAsEmergency: true,
    requireFixAvailable: true,
    requireLockfilePresence: true,
  },
};

export function routeEvidence(
  evidence: NormalizedEvidence,
  config: RouteConfig = defaultRouteConfig,
  options: { forceEmergencyForTest?: boolean } = {},
): RouteDecision {
  if (!evidence.dependencyReview.present && config.emergency.requireLockfilePresence) {
    return { track: "dropped", reason: "not present in lockfile" };
  }

  if (evidence.osv.fixedVersion === null && config.emergency.requireFixAvailable) {
    if (options.forceEmergencyForTest) {
      assertEmergencyInvariant(evidence);
    }
    return { track: "dropped", reason: "no fix" };
  }

  const emergency =
    options.forceEmergencyForTest ||
    (config.emergency.treatMalAsEmergency && evidence.osv.class === "malicious") ||
    (config.emergency.treatKevAsEmergency && evidence.kev.listed === true) ||
    (evidence.epss.score !== null && evidence.epss.score >= config.emergency.epssThreshold) ||
    (evidence.ghsa.cvss !== null && evidence.ghsa.cvss >= config.emergency.minCvss) ||
    missingSeverityData(evidence);

  if (emergency) {
    assertEmergencyInvariant(evidence, config);
    return { track: "emergency" };
  }

  return { track: "cadence" };
}

function missingSeverityData(evidence: NormalizedEvidence) {
  return (
    evidence.osv.class === "critical" &&
    (evidence.ghsa.cvss === null ||
      evidence.provenance.kev === "unavailable" ||
      evidence.provenance.epss === "unavailable")
  );
}

export function assertEmergencyInvariant(
  evidence: NormalizedEvidence,
  config: RouteConfig = defaultRouteConfig,
) {
  const hasEmergencyReason =
    (config.emergency.treatMalAsEmergency && evidence.osv.class === "malicious") ||
    (config.emergency.treatKevAsEmergency && evidence.kev.listed === true) ||
    (evidence.epss.score !== null && evidence.epss.score >= config.emergency.epssThreshold) ||
    (evidence.ghsa.cvss !== null && evidence.ghsa.cvss >= config.emergency.minCvss) ||
    missingSeverityData(evidence);

  if (
    evidence.osv.fixedVersion === null ||
    !evidence.dependencyReview.present ||
    !hasEmergencyReason
  ) {
    throw new Error(
      "emergency route invariant failed: fixedVersion, lockfile presence, and emergency class/source threshold are required",
    );
  }
}
