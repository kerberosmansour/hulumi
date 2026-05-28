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
export {
  LIVE_FORMATS,
  LIVE_PROVIDERS,
  LIVE_SEVERITIES,
  LIVE_STATUSES,
  LIVE_VALIDATOR_CONFIG_SCHEMA,
  LIVE_VALIDATOR_REPORT_SCHEMA,
  renderLiveValidationJson,
  renderLiveValidationMarkdown,
  renderLiveValidationSarif,
  evaluateGitHubRunnerGovernance,
  runLiveValidation,
  runLiveValidatorCli,
  type GitHubRunnerGovernanceArgs,
  type GitHubRunnerGovernanceEnvironment,
  type GitHubRunnerGovernanceWorkflowJob,
  type LiveOutputFormat,
  type LiveProvider,
  type LiveProviderAdapter,
  type LiveSeverity,
  type LiveStatus,
  type LiveValidationFinding,
  type LiveValidationReport,
  type LiveValidationSummary,
  type LiveValidatorCliResult,
  type LiveValidatorFileConfig,
} from "./live-validator";
export { DriftClassifier, type DriftClassifierArgs } from "./classifier";
export {
  OrphanReconciler,
  OrphanSweeper,
  RECONCILER_PLAN_SCHEMA_VERSION,
  RECONCILER_RESOURCE_STATES,
  type OrphanReconcilerArgs,
  type OrphanSweeperArgs,
  type ReconcileActionExecutor,
  type ReconcileActionResult,
  type ReconcileActionType,
  type ReconcileBlockedAction,
  type ReconcileDecision,
  type ReconcileExecuteOptions,
  type ReconcileMode,
  type ReconcilePlan,
  type ReconcilePlanAction,
  type ReconcilePlanRequest,
  type ReconcileResult,
  type ReconcileRisk,
  type ReconcileScope,
  type ReconcileTarget,
  type ReconcilerResourceState,
  type ResourceIdentity,
  type ResourceOwnershipEvidence,
} from "./reconciler";
export {
  S3SweeperExecutor,
  S3_DELETE_BATCH_SIZE,
  type S3SweeperExecutorArgs,
} from "./adapters/s3-sweeper";
export {
  CloudWatchLogGroupExecutor,
  type CloudWatchLogGroupExecutorArgs,
} from "./adapters/cloudwatch-log-group";
export {
  discoverReconcileTargets,
  isSecuritySingletonType,
  type CloudInventoryResource,
  type DiscoverReconcileTargetsRequest,
  type DiscoverReconcileTargetsResult,
  type DiscoveryDiagnostic,
  type DiscoveryScope,
  type PulumiStateExport,
  type PulumiStateResource,
} from "./discovery";
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
