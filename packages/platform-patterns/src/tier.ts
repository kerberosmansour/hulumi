export type Tier = "sandbox" | "startup-hardened";

export const TIERS: readonly Tier[] = ["sandbox", "startup-hardened"] as const;

export function assertValidTier(value: unknown): asserts value is Tier {
  if (typeof value !== "string" || !(TIERS as readonly string[]).includes(value)) {
    throw new Error(`Invalid Hulumi tier "${String(value)}"; expected one of: ${TIERS.join(", ")}`);
  }
}
