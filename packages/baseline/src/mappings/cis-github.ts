// CIS GitHub Benchmark v1.2.0 IDs addressed by Hulumi-for-GitHub components.
// IDs ONLY — no verbatim CIS Benchmark text.
//
// Section numbers are gated behind CIS WorkBench member access (see
// docs/slo/research/hulumi-github/dossier.md open question #2 + the v1.1
// deferral D4 entry). Until WorkBench access is secured, this table
// ships with `:PENDING-WORKBENCH` placeholders so license-boundary-lint
// and the citation-ID validation meta-test can both reason about the
// surface without fabricated section numbers.
//
// The license-boundary-lint extension treats `:PENDING-WORKBENCH` as a
// non-release-blocking marker on `main`, but rejects it on any
// `release-*` git tag — a v1.1.x release published with placeholders is
// a contract violation, while a v1.1.0 release that DOES carry the
// placeholders is the intentional staged state.

export const cisGithub = {
  secureRepository: ["CIS-GitHub-v1.2.0:PENDING-WORKBENCH"],
  orgFoundation: ["CIS-GitHub-v1.2.0:PENDING-WORKBENCH"],
  orgRulesets: ["CIS-GitHub-v1.2.0:PENDING-WORKBENCH"],
  orgActions: ["CIS-GitHub-v1.2.0:PENDING-WORKBENCH"],
  orgOidcTemplate: ["CIS-GitHub-v1.2.0:PENDING-WORKBENCH"],
  orgSecurityDefaults: ["CIS-GitHub-v1.2.0:PENDING-WORKBENCH"],
} as const;

export type CisGithubId = (typeof cisGithub.secureRepository)[number];
