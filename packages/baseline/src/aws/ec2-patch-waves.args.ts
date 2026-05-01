import type { Tier } from "./tier";
import type { Ec2PatchBaselineArgs } from "./ec2-patch-baseline.args";

/** Per-wave args. The wave's `patchGroup` is fixed by position. */
export type Ec2PatchWaveArgs = Omit<Ec2PatchBaselineArgs, "patchGroup" | "tier">;

export interface Ec2PatchWavesArgs {
  tier: Tier;
  /** Dev wave config. Always required. */
  dev: Ec2PatchWaveArgs;
  /** Staging wave config. Optional at sandbox tier; required at startup-hardened. */
  staging?: Ec2PatchWaveArgs;
  /** Production wave config. Optional at sandbox tier; required at startup-hardened. */
  production?: Ec2PatchWaveArgs;
}
