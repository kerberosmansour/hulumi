export { DRIFT_SOURCES } from "./types";
export type {
  DriftSource,
  Confidence,
  Evidence,
  DriftVerdict,
  AdapterSignal,
  DriftAdapter,
  ClassifyOptions,
  RemediationHint,
  VerdictSnapshot,
} from "./types";
export { hardenedVerdict, type VerdictResult } from "./verdict";
export { checkMonotonicity, type MonotonicityResult } from "./monotonicity";
export {
  CACHE_SCHEMA_VERSION,
  CACHE_SCHEMA_V1_LEGACY,
  cachePathFor,
  readCache,
  writeCache,
  invalidateCache,
  migrateV1ToV2,
  type CacheEnvelope,
  type CacheEnvelopeV1,
  type CacheReadResult,
} from "./cache";
export { runProbe, type ProbeFn, type ProbeResult } from "./probe";
export { validateUrn, isSafeUrn, UnsafeUrnError } from "./urn-sanitize";
export { DriftClassifier, type DriftClassifierArgs } from "./classifier";
export {
  AutomationApiAdapter,
  type AutomationApiAdapterArgs,
  type AutomationApiPreviewResult,
} from "./adapters/automation-api";
export {
  CloudTrailAdapter,
  type CloudTrailAdapterArgs,
  type CloudTrailEvent,
  type CloudTrailLookupArgs,
  type CloudTrailLookupFn,
  shouldFilterPrincipal,
} from "./adapters/cloudtrail";
export {
  ProviderVersionAdapter,
  type ProviderVersionAdapterArgs,
  type ProviderVersionFetcher,
  compareSemver,
} from "./adapters/provider-version";
export { GitLogAdapter, type GitLogAdapterArgs } from "./adapters/git-log";
// GitHub-side webhook fallback adapter — added in v1.1.0 M4.
export {
  GithubWebhookFallbackAdapter,
  type GithubWebhookFallbackAdapterArgs,
  type IngestedEvent,
  type WebhookEventType,
  WEBHOOK_EVENT_TYPES,
  MAX_PAYLOAD_BYTES,
  MAX_NESTING_DEPTH,
  ROTATION_FAILURE_THRESHOLD,
  IDEMPOTENCY_TTL_MS,
  hashCacheKey,
  exceedsNestingDepth,
  verifyWebhookSignature,
} from "./adapters/github-webhook-fallback";
