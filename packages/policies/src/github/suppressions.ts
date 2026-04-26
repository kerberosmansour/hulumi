// Re-export the AWS-side `Suppression` API for the GitHub policy packs.
// The shape is identical (`ruleId`, `reason`, `urnScope`, `expiresAt`) and
// the matching logic is shared. M3 adds a runtime check on top of this:
// suppressions for `G_OIDC_1` MUST include a non-empty `reason` string —
// this is enforced in `g-oidc-1.ts` at the point where the suppression
// is consulted, not in the Suppression API itself (since the AWS-side
// API doesn't enforce justification per rule, only as a convention).

export {
  matchSuppression,
  type Suppression,
  type SuppressionMatch,
} from "../aws/suppressions";
