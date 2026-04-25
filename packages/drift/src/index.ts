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
  cachePathFor,
  readCache,
  writeCache,
  invalidateCache,
  type CacheEnvelope,
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
