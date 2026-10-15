import type { NormalizedEvidence } from "../evidence/normalize";

export type Track = "emergency" | "cadence" | "dropped";

export interface RouteConfig {
  emergency: {
    minCvss: number;
    epssThreshold: number;
    treatKevAsEmergency: boolean;
    /** Compatibility field; known malicious packages are always urgent. */
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

  // A missing patched release is not a reason to suppress known malicious code.
  // Keep scanner evidence and fail before triage can emit a dropped work item.
  if (
    evidence.osv.class === "malicious" &&
    (typeof evidence.osv.fixedVersion !== "string" || evidence.osv.fixedVersion.trim() === "")
  ) {
    throw new Error(
      "known malicious package has no fixed release; remove it and investigate before continuing",
    );
  }

  if (evidence.osv.fixedVersion === null && config.emergency.requireFixAvailable) {
    if (options.forceEmergencyForTest) {
      assertEmergencyInvariant(evidence);
    }
    return { track: "dropped", reason: "no fix" };
  }

  const emergency =
    options.forceEmergencyForTest ||
    evidence.osv.class === "malicious" ||
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
    evidence.osv.class === "malicious" ||
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
