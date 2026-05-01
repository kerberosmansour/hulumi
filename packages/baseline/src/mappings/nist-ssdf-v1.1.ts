// NIST SSDF v1.1 (SP 800-218 final, 2022-02-03) IDs addressed by
// Hulumi-for-GitHub components.
//
// IDs ONLY — no verbatim NIST text. SSDF is public domain (US Govt
// work), but the IDs-only discipline carries forward for consistency
// with the CIS / CCM / ATLAS mapping shapes.
//
// SSDF v1.2 IPD comment period closed 2026-01-30 with no second draft
// published as of 2026-04-26. v1.1 is the safe binding target. When
// v1.2 publishes, this file is the migration target — annotate v1.2
// awareness on each practice that materially shifts.
//
// The IaC-side subset of SSDF practices per GitHub's Well-Architected
// SSDF mapping: PO.2, PO.3, PO.4, PO.5, PS.1, PW.4, PW.5, PW.6, PW.7,
// RV.1.

export const nistSsdfV11 = {
  secureRepository: ["NIST-SSDF-v1.1:PO.3", "NIST-SSDF-v1.1:PW.5", "NIST-SSDF-v1.1:RV.1"],
  orgFoundation: [
    "NIST-SSDF-v1.1:PO.3",
    "NIST-SSDF-v1.1:PO.4",
    "NIST-SSDF-v1.1:PO.5",
    "NIST-SSDF-v1.1:PS.1",
    "NIST-SSDF-v1.1:PW.7",
  ],
  orgRulesets: ["NIST-SSDF-v1.1:PW.6", "NIST-SSDF-v1.1:PW.7"],
  orgActions: ["NIST-SSDF-v1.1:PO.3", "NIST-SSDF-v1.1:PW.5"],
  orgOidcTemplate: ["NIST-SSDF-v1.1:PO.5"],
  orgSecurityDefaults: ["NIST-SSDF-v1.1:PO.4", "NIST-SSDF-v1.1:RV.1"],
} as const;

export type NistSsdfV11Id = (typeof nistSsdfV11.secureRepository)[number];
