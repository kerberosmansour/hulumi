import type { Tier } from "./tier";

export interface BuildProvenanceFoundationArgs {
  readonly tier: Tier;
  readonly artifactName: string;
  readonly privateRepository?: boolean;
}
