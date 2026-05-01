// EksUpgradePlanner — bounded, side-effect-free upgrade-planning library.
// Takes a single cluster's current/target state plus add-on inventory and
// produces a structured report (`safe` | `unsafe` | `degraded`) with reasons.
// Does NOT perform upgrades. Does NOT mutate state. Does NOT make network
// calls. Consumers wire in real `aws eks describe-*` data via `inventory`.
//
// Bound: one cluster per `planUpgrade()` call. Multiple clusters require
// multiple calls.

/** EKS support status discriminated union (M6 Carmack-rule-4.5). */
export type EksSupportStatus = "standard" | "extended" | "unsupported" | "unknown";

export interface EksAddonInventory {
  name: string;
  /** Currently-deployed version on the cluster. */
  currentVersion: string;
  /** Target version after upgrade. */
  targetVersion: string;
  /** Whether the target version is documented as compatible with `targetK8sVersion`. */
  targetCompatibleWithK8sTarget: boolean;
}

export interface EksUpgradeInventory {
  clusterName: string;
  currentK8sVersion: string;
  targetK8sVersion: string;
  /** Which AWS support tier the **current** cluster version is in. */
  currentSupportStatus: EksSupportStatus;
  /** Which AWS support tier the **target** cluster version is in. */
  targetSupportStatus: EksSupportStatus;
  /** Add-on inventory. Bounded at 32. */
  addons: EksAddonInventory[];
  /** Whether a recent (≤ 24h) AWS Backup recovery point exists for the cluster's stateful workloads. */
  backupEvidence: { recent: boolean; mostRecentISO?: string };
}

export type UpgradeVerdict = "safe" | "degraded" | "unsafe";

export interface UpgradeReport {
  verdict: UpgradeVerdict;
  reasons: string[];
  warnings: string[];
  addonNotes: Array<{ name: string; status: "ok" | "incompatible" | "unknown"; note: string }>;
  /** Generated 1:1 from the input — provenance trail. */
  inventory: EksUpgradeInventory;
}

/** Bound on add-on inventory per call (matches EksAddonFoundation cap). */
export const MAX_UPGRADE_PLANNER_ADDONS = 32;

const SEMVER_RE = /^v?(\d+)\.(\d+)(?:\.(\d+))?(?:-.+)?$/;

function parseMinor(version: string): { major: number; minor: number } | undefined {
  const m = SEMVER_RE.exec(version);
  if (m === null) return undefined;
  return { major: parseInt(m[1], 10), minor: parseInt(m[2], 10) };
}

export function planUpgrade(inv: EksUpgradeInventory): UpgradeReport {
  if (inv.addons.length > MAX_UPGRADE_PLANNER_ADDONS) {
    throw new Error(
      `EksUpgradePlanner: addons has ${inv.addons.length} entries; max ${MAX_UPGRADE_PLANNER_ADDONS} per call (one cluster per planner call)`,
    );
  }

  const reasons: string[] = [];
  const warnings: string[] = [];
  const addonNotes: UpgradeReport["addonNotes"] = [];
  let verdict: UpgradeVerdict = "safe";

  // Support-status gates.
  if (inv.targetSupportStatus === "unsupported") {
    reasons.push(
      `Target Kubernetes version ${inv.targetK8sVersion} is unsupported by AWS — refuse safe verdict.`,
    );
    verdict = "unsafe";
  }
  if (inv.targetSupportStatus === "unknown") {
    warnings.push(
      `Target Kubernetes version ${inv.targetK8sVersion} support status is unknown — verify before proceeding.`,
    );
    if (verdict === "safe") verdict = "degraded";
  }
  if (inv.currentSupportStatus === "extended") {
    warnings.push(
      `Current Kubernetes version ${inv.currentK8sVersion} is in AWS Extended Support — upgrade priority is elevated.`,
    );
  }
  if (inv.currentSupportStatus === "unsupported") {
    reasons.push(
      `Current Kubernetes version ${inv.currentK8sVersion} is unsupported — upgrade is mandatory but the cluster may already be in a degraded state.`,
    );
    verdict = "unsafe";
  }

  // Version-skew gate (EKS supports +1 minor at a time).
  const cur = parseMinor(inv.currentK8sVersion);
  const tgt = parseMinor(inv.targetK8sVersion);
  if (cur === undefined || tgt === undefined) {
    warnings.push(
      `Could not parse current/target K8s versions ("${inv.currentK8sVersion}" → "${inv.targetK8sVersion}").`,
    );
    if (verdict === "safe") verdict = "degraded";
  } else if (tgt.major !== cur.major || tgt.minor - cur.minor > 1) {
    reasons.push(
      `Skipping minor versions is not allowed (${inv.currentK8sVersion} → ${inv.targetK8sVersion}). EKS supports +1 minor per upgrade.`,
    );
    verdict = "unsafe";
  } else if (tgt.minor - cur.minor < 0) {
    reasons.push(
      `Downgrades are not supported (${inv.currentK8sVersion} → ${inv.targetK8sVersion}).`,
    );
    verdict = "unsafe";
  }

  // Backup preflight gate.
  if (!inv.backupEvidence.recent) {
    reasons.push(
      `Backup preflight failed — no recent (≤ 24h) recovery point. Take a fresh backup before proceeding.`,
    );
    verdict = verdict === "unsafe" ? "unsafe" : "unsafe";
  }

  // Add-on compatibility.
  for (const a of inv.addons) {
    if (!a.targetCompatibleWithK8sTarget) {
      addonNotes.push({
        name: a.name,
        status: "incompatible",
        note: `Add-on "${a.name}" target version ${a.targetVersion} is NOT documented as compatible with K8s ${inv.targetK8sVersion}.`,
      });
      reasons.push(
        `Add-on "${a.name}" target ${a.targetVersion} is incompatible with K8s ${inv.targetK8sVersion}.`,
      );
      verdict = "unsafe";
    } else {
      addonNotes.push({
        name: a.name,
        status: "ok",
        note: `OK — ${a.currentVersion} → ${a.targetVersion}`,
      });
    }
  }

  return { verdict, reasons, warnings, addonNotes, inventory: inv };
}

export function reportToMarkdown(report: UpgradeReport): string {
  const lines: string[] = [];
  lines.push(`# EKS Upgrade Report — ${report.inventory.clusterName}`);
  lines.push("");
  lines.push(`**Verdict**: \`${report.verdict}\``);
  lines.push("");
  lines.push(
    `Current → Target: \`${report.inventory.currentK8sVersion}\` (\`${report.inventory.currentSupportStatus}\`) → \`${report.inventory.targetK8sVersion}\` (\`${report.inventory.targetSupportStatus}\`)`,
  );
  lines.push("");
  if (report.reasons.length > 0) {
    lines.push("## Reasons (block safe verdict)");
    for (const r of report.reasons) lines.push(`- ${r}`);
    lines.push("");
  }
  if (report.warnings.length > 0) {
    lines.push("## Warnings");
    for (const w of report.warnings) lines.push(`- ${w}`);
    lines.push("");
  }
  lines.push("## Add-on inventory");
  for (const a of report.addonNotes) {
    lines.push(`- \`${a.name}\` — ${a.status} — ${a.note}`);
  }
  return lines.join("\n");
}
