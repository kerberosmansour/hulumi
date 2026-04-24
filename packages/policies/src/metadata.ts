// PackMetadata — cdk-nag-style descriptor for every Hulumi policy pack. Used
// by the Claude Code skill to surface which rules exist, why they exist,
// and what framework IDs they map to. Frozen at v1.0 per interfaces.md §2.

export type Severity = "low" | "medium" | "high" | "critical";
export type EnforcementLevel = "mandatory" | "advisory" | "disabled";

export interface RuleMetadata {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  enforcement: EnforcementLevel;
  frameworkIds: string[];
  docsUrl?: string;
}

export interface PackMetadata {
  id: string;
  title: string;
  framework: string;
  frameworkVersion: string;
  severity: Severity;
  rules: RuleMetadata[];
}
