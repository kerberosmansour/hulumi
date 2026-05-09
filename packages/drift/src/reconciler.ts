import { createHash } from "node:crypto";

export const RECONCILER_PLAN_SCHEMA_VERSION = "hulumi.drift.reconcile.plan.v1";

export const RECONCILER_RESOURCE_STATES = [
  "Unknown",
  "Candidate",
  "Blocked",
  "Planned",
  "Executing",
  "Deleted",
  "Retained",
  "Failed",
] as const;

export type ReconcilerResourceState = (typeof RECONCILER_RESOURCE_STATES)[number];

export type ReconcileMode =
  | "check-only"
  | "plan"
  | "state-only"
  | "adopt-only"
  | "sweep-only"
  | "reconcile";

export type ReconcileDecision =
  | "noOp"
  | "refreshState"
  | "importToState"
  | "stateDelete"
  | "deleteCloudResource"
  | "retainExternal"
  | "codifyProduction"
  | "revertProduction"
  | "ignoreWithJustification"
  | "blocked";

export type ReconcileActionType =
  | "drainS3BucketVersions"
  | "abortS3MultipartUploads"
  | "deleteS3Bucket"
  | "deleteCloudResource"
  | "retainUnsupportedResource"
  | "retainSharedSingleton"
  | "stateDeleteAlreadyAbsentResource"
  | "importToState"
  | "refreshState";

export type ReconcileRisk = "low" | "medium" | "high" | "blocked";

export type OwnershipSignalKind = "pulumi-state" | "tag" | "name-prefix" | "cloudtrail" | "caller";

export type ResourceRelationship =
  | "state-owned"
  | "state-missing"
  | "cloud-only"
  | "shared-singleton"
  | "unknown";

export interface ResourceIdentity {
  provider: "aws" | "github" | "kubernetes" | "pulumi" | "unknown";
  type: string;
  urn?: string;
  physicalId?: string;
  region?: string;
  accountId?: string;
  tags?: Record<string, string>;
  createdAt?: string;
  singleton?: boolean;
}

export interface ResourceOwnershipEvidence {
  signal: OwnershipSignalKind;
  subject: string;
  confidence: "low" | "medium" | "high";
  at?: string;
}

export interface ReconcileTarget {
  identity: ResourceIdentity;
  inState: boolean;
  existsInCloud: boolean;
  ownership: ResourceOwnershipEvidence[];
  relationship?: ResourceRelationship;
  supportedActions?: ReconcileActionType[];
}

export interface ReconcileScope {
  stackName?: string;
  projectName?: string;
  resourcePrefix?: string;
  regions?: string[];
  accountIds?: string[];
  minAgeMinutes?: number;
  ownershipMinSignals?: number;
  allowSingletonDelete?: boolean;
  maxActions?: number;
  maxBatchSize?: number;
}

export interface ReconcilePlanRequest {
  mode?: ReconcileMode;
  scope: ReconcileScope;
  targets: ReconcileTarget[];
  now?: Date;
  nonce?: string;
}

export interface ReconcileBlockedAction {
  action: ReconcileDecision;
  reason: string;
}

export interface ReconcilePlanAction {
  id: string;
  type: ReconcileActionType;
  resource: ResourceIdentity;
  recommendedAction: ReconcileDecision;
  allowedActions: ReconcileDecision[];
  blockedActions: ReconcileBlockedAction[];
  why: string[];
  evidence: ResourceOwnershipEvidence[];
  risk: ReconcileRisk;
  requiresApproval: boolean;
  stateMutation: boolean;
  cloudMutation: boolean;
  sensitiveFieldsRedacted: true;
  dependsOn: string[];
  executable: boolean;
}

export interface ReconcilePlan {
  schemaVersion: typeof RECONCILER_PLAN_SCHEMA_VERSION;
  createdAt: string;
  mode: ReconcileMode;
  scope: ReconcileScope;
  resourceCount: number;
  actionCount: number;
  executable: boolean;
  summary: {
    cleanedUp: number;
    stateReconciled: number;
    adopted: number;
    retained: number;
    blocked: number;
  };
  actions: ReconcilePlanAction[];
  confirmToken: string;
}

export interface ReconcileExecuteOptions {
  confirmToken: string;
  allow?: ReconcileDecision[];
}

export interface ReconcileActionResult {
  actionId: string;
  status: "succeeded" | "blocked" | "failed" | "skipped";
  counts?: Record<string, number>;
  message?: string;
}

export interface ReconcileResult {
  schemaVersion: string;
  startedAt: string;
  finishedAt: string;
  summary: ReconcilePlan["summary"];
  results: ReconcileActionResult[];
}

export interface ReconcileActionExecutor {
  execute(action: ReconcilePlanAction): Promise<ReconcileActionResult>;
}

export interface OrphanReconcilerArgs {
  executors?: Partial<Record<ReconcileActionType, ReconcileActionExecutor>>;
}

export type OrphanSweeperArgs = OrphanReconcilerArgs;

const DEFAULT_MAX_ACTIONS = 50;
const DEFAULT_MAX_BATCH_SIZE = 1000;
const BROAD_PREFIXES = new Set(["", "*", ".", "/", "aws", "hulumi", "prod", "production"]);

export class OrphanReconciler {
  private static readonly activeExecutionLocks = new Set<string>();

  private readonly executors: Partial<Record<ReconcileActionType, ReconcileActionExecutor>>;
  private readonly rawActionsByToken = new Map<string, ReconcilePlanAction[]>();

  constructor(args: OrphanReconcilerArgs = {}) {
    this.executors = args.executors ?? {};
  }

  plan(request: ReconcilePlanRequest): ReconcilePlan {
    const mode = request.mode ?? "check-only";
    const now = request.now ?? new Date();
    const scope = normalizeScope(request.scope);
    const actions = request.targets
      .map((target, index) => classifyTarget(target, scope, mode, now, index))
      .sort(compareActions);

    const maxActions = scope.maxActions ?? DEFAULT_MAX_ACTIONS;
    const capped =
      actions.length > maxActions
        ? actions.map((action) => ({
            ...action,
            executable: false,
            risk: "blocked" as const,
            blockedActions: [
              ...action.blockedActions,
              {
                action: action.recommendedAction,
                reason: `action count exceeds maxActions=${maxActions}`,
              },
            ],
          }))
        : actions;
    const executable =
      mode !== "check-only" &&
      mode !== "plan" &&
      capped.length > 0 &&
      capped.every((action) => action.executable);
    const rawUnsigned: Omit<ReconcilePlan, "confirmToken"> = {
      schemaVersion: RECONCILER_PLAN_SCHEMA_VERSION,
      createdAt: now.toISOString(),
      mode,
      scope,
      resourceCount: request.targets.length,
      actionCount: capped.length,
      executable,
      summary: summarize(capped),
      actions: capped,
    };
    const confirmToken = confirmationToken(rawUnsigned, request.nonce ?? "v1");
    this.rawActionsByToken.set(confirmToken, capped);
    return {
      ...rawUnsigned,
      scope: redactScope(rawUnsigned.scope),
      actions: capped.map(redactAction),
      confirmToken,
    };
  }

  async execute(plan: ReconcilePlan, options: ReconcileExecuteOptions): Promise<ReconcileResult> {
    if (plan.schemaVersion !== RECONCILER_PLAN_SCHEMA_VERSION) {
      throw new Error("Refusing to execute an unsupported reconciler plan schema.");
    }
    if (plan.mode === "check-only" || plan.mode === "plan") {
      throw new Error(`Refusing to execute read-only mode ${plan.mode}.`);
    }
    if (options.confirmToken !== plan.confirmToken) {
      throw new Error("Refusing to execute: confirmation token does not match the plan.");
    }

    const allow = new Set(options.allow ?? []);
    const startedAt = new Date().toISOString();
    const results: ReconcileActionResult[] = [];
    const lockKey = executionLockKey(plan);
    if (OrphanReconciler.activeExecutionLocks.has(lockKey)) {
      return {
        schemaVersion: `${RECONCILER_PLAN_SCHEMA_VERSION}.result`,
        startedAt,
        finishedAt: new Date().toISOString(),
        summary: plan.summary,
        results: [
          { actionId: "plan-lock", status: "blocked", message: "target execution is locked" },
        ],
      };
    }

    OrphanReconciler.activeExecutionLocks.add(lockKey);
    try {
      const actions = this.rawActionsByToken.get(plan.confirmToken) ?? plan.actions;
      for (const action of actions) {
        if (!action.executable) {
          results.push({
            actionId: action.id,
            status: "blocked",
            message: "action is not executable",
          });
          continue;
        }
        if (allow.size > 0 && !allow.has(action.recommendedAction)) {
          results.push({
            actionId: action.id,
            status: "skipped",
            message: "action not in allow list",
          });
          continue;
        }
        const executor = this.executors[action.type];
        if (executor === undefined) {
          results.push({
            actionId: action.id,
            status: "blocked",
            message: `no executor for ${action.type}`,
          });
          continue;
        }
        try {
          results.push(await executor.execute(action));
        } catch (err) {
          results.push({
            actionId: action.id,
            status: "failed",
            message: safeErrorMessage(err),
          });
        }
      }
    } finally {
      OrphanReconciler.activeExecutionLocks.delete(lockKey);
    }

    return {
      schemaVersion: `${RECONCILER_PLAN_SCHEMA_VERSION}.result`,
      startedAt,
      finishedAt: new Date().toISOString(),
      summary: plan.summary,
      results,
    };
  }
}

export class OrphanSweeper extends OrphanReconciler {}

function normalizeScope(scope: ReconcileScope): ReconcileScope {
  const prefix = scope.resourcePrefix?.trim();
  if (prefix !== undefined) {
    if (BROAD_PREFIXES.has(prefix.toLowerCase()) || prefix.length < 6 || /[*?]/.test(prefix)) {
      throw new Error("Refusing broad or empty resourcePrefix for orphan reconciliation.");
    }
  }
  const normalized: ReconcileScope = {
    ...scope,
    ownershipMinSignals: scope.ownershipMinSignals ?? 2,
    maxBatchSize: scope.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE,
  };
  if (prefix !== undefined) normalized.resourcePrefix = prefix;
  return normalized;
}

function classifyTarget(
  target: ReconcileTarget,
  scope: ReconcileScope,
  mode: ReconcileMode,
  now: Date,
  index: number,
): ReconcilePlanAction {
  const blocked: ReconcileBlockedAction[] = [];
  const why: string[] = [];
  const signals = new Set(target.ownership.map((evidence) => evidence.signal));
  const strongSignals = signals.size;
  const isS3Bucket = /aws:s3\/bucket/i.test(target.identity.type);
  const inPrefix = matchesPrefix(target.identity, scope.resourcePrefix);
  const inRegion = matchesOne(target.identity.region, scope.regions);
  const inAccount = matchesOne(target.identity.accountId, scope.accountIds);
  const olderThanMinAge = matchesAge(target.identity.createdAt, scope.minAgeMinutes, now);
  const singleton = target.identity.singleton === true;

  if (scope.resourcePrefix === undefined && !target.inState && target.existsInCloud) {
    blocked.push({
      action: "blocked",
      reason: "resourcePrefix is required for cloud-only resources",
    });
  }
  if (!inPrefix)
    blocked.push({ action: "blocked", reason: "physical ID does not match scope prefix" });
  if (!inRegion) blocked.push({ action: "blocked", reason: "resource region is outside scope" });
  if (!inAccount) blocked.push({ action: "blocked", reason: "resource account is outside scope" });
  if (!olderThanMinAge)
    blocked.push({ action: "blocked", reason: "resource is newer than minAgeMinutes" });
  if (!target.inState && target.existsInCloud && strongSignals < (scope.ownershipMinSignals ?? 2)) {
    blocked.push({ action: "blocked", reason: "insufficient ownership evidence" });
  }
  if (singleton && !scope.allowSingletonDelete) {
    blocked.push({
      action: "deleteCloudResource",
      reason: "shared singleton deletion is disabled",
    });
  }

  let recommendedAction: ReconcileDecision = "blocked";
  let type: ReconcileActionType = "retainUnsupportedResource";
  let stateMutation = false;
  let cloudMutation = false;
  let allowedActions: ReconcileDecision[] = [];
  let risk: ReconcileRisk = "blocked";

  if (blocked.length > 0) {
    recommendedAction = singleton ? "retainExternal" : "blocked";
    type = singleton ? "retainSharedSingleton" : "retainUnsupportedResource";
    why.push("guardrails prevent mutation");
  } else if (target.inState && target.existsInCloud) {
    const stateDecision = preferredSupportedDecision(target, [
      "refreshState",
      "codifyProduction",
      "revertProduction",
      "ignoreWithJustification",
    ]);
    recommendedAction = stateDecision ?? "noOp";
    type = stateDecision === "refreshState" ? "refreshState" : "retainUnsupportedResource";
    allowedActions = [
      "refreshState",
      "codifyProduction",
      "revertProduction",
      "ignoreWithJustification",
      "noOp",
    ];
    stateMutation = stateDecision === "refreshState";
    why.push(
      stateDecision === undefined
        ? "resource is present in Pulumi state and cloud"
        : `caller requested ${stateDecision} planning for state-owned resource`,
    );
    risk = stateDecision === undefined ? "low" : "medium";
  } else if (target.inState && !target.existsInCloud) {
    recommendedAction = "stateDelete";
    type = "stateDeleteAlreadyAbsentResource";
    allowedActions = ["stateDelete"];
    stateMutation = true;
    why.push("resource is present in state but absent from cloud");
    risk = "medium";
  } else if (!target.inState && target.existsInCloud && supportsAction(target, "importToState")) {
    recommendedAction = "importToState";
    type = "importToState";
    allowedActions = ["importToState", "retainExternal", "deleteCloudResource"];
    stateMutation = true;
    why.push(
      "cloud-only resource has strong ownership evidence and caller requested adoption planning",
    );
    risk = "medium";
  } else if (!target.inState && target.existsInCloud && isS3Bucket) {
    recommendedAction = "deleteCloudResource";
    type = "drainS3BucketVersions";
    allowedActions = ["deleteCloudResource", "importToState", "retainExternal"];
    cloudMutation = true;
    why.push("S3 bucket is cloud-only with strong ownership evidence");
    risk = "high";
  } else if (!target.inState && target.existsInCloud) {
    recommendedAction = "retainExternal";
    type = "retainUnsupportedResource";
    allowedActions = ["importToState", "retainExternal"];
    why.push("resource is cloud-only but this type has no delete executor");
    risk = "medium";
  }

  const executable =
    blocked.length === 0 &&
    modeAllows(mode, recommendedAction) &&
    (stateMutation || cloudMutation) &&
    recommendedAction !== "noOp";

  return {
    id: `action-${index.toString().padStart(4, "0")}-${stableId(target.identity)}`,
    type,
    resource: target.identity,
    recommendedAction,
    allowedActions: uniqueDecisions([recommendedAction, ...allowedActions]),
    blockedActions: blocked,
    why,
    evidence: target.ownership,
    risk: executable ? risk : blocked.length > 0 ? "blocked" : risk,
    requiresApproval: stateMutation || cloudMutation,
    stateMutation,
    cloudMutation,
    sensitiveFieldsRedacted: true,
    dependsOn: [],
    executable,
  };
}

function supportsAction(target: ReconcileTarget, action: ReconcileActionType): boolean {
  return target.supportedActions?.includes(action) ?? false;
}

function preferredSupportedDecision(
  target: ReconcileTarget,
  decisions: readonly ReconcileDecision[],
): ReconcileDecision | undefined {
  for (const decision of decisions) {
    if (decisionToSupportedAction(decision) !== undefined) {
      if (supportsAction(target, decisionToSupportedAction(decision)!)) return decision;
      continue;
    }
    if (target.supportedActions?.includes(decision as ReconcileActionType) ?? false) {
      return decision;
    }
  }
  return undefined;
}

function decisionToSupportedAction(decision: ReconcileDecision): ReconcileActionType | undefined {
  switch (decision) {
    case "refreshState":
      return "refreshState";
    case "importToState":
      return "importToState";
    case "stateDelete":
      return "stateDeleteAlreadyAbsentResource";
    default:
      return undefined;
  }
}

function modeAllows(mode: ReconcileMode, decision: ReconcileDecision): boolean {
  if (mode === "check-only" || mode === "plan") return false;
  if (mode === "state-only") return decision === "stateDelete" || decision === "refreshState";
  if (mode === "adopt-only") return decision === "importToState";
  if (mode === "sweep-only") return decision === "deleteCloudResource";
  return true;
}

function matchesPrefix(identity: ResourceIdentity, prefix: string | undefined): boolean {
  if (prefix === undefined) return true;
  const physical = identity.physicalId ?? "";
  const nameTag = identity.tags?.Name ?? "";
  return physical.startsWith(prefix) || nameTag.startsWith(prefix);
}

function matchesOne(value: string | undefined, allowed: string[] | undefined): boolean {
  if (allowed === undefined || allowed.length === 0) return true;
  return value !== undefined && allowed.includes(value);
}

function matchesAge(
  createdAt: string | undefined,
  minAgeMinutes: number | undefined,
  now: Date,
): boolean {
  if (minAgeMinutes === undefined || minAgeMinutes <= 0 || createdAt === undefined) return true;
  const createdMs = Date.parse(createdAt);
  if (Number.isNaN(createdMs)) return false;
  return now.getTime() - createdMs >= minAgeMinutes * 60_000;
}

function compareActions(a: ReconcilePlanAction, b: ReconcilePlanAction): number {
  return `${a.type}:${a.resource.type}:${a.resource.urn ?? ""}:${a.resource.physicalId ?? ""}`.localeCompare(
    `${b.type}:${b.resource.type}:${b.resource.urn ?? ""}:${b.resource.physicalId ?? ""}`,
  );
}

function redactAction(action: ReconcilePlanAction): ReconcilePlanAction {
  const resource: ResourceIdentity = {
    ...action.resource,
  };
  if (action.resource.accountId !== undefined)
    resource.accountId = redact(action.resource.accountId);
  if (action.resource.physicalId !== undefined)
    resource.physicalId = redactPhysical(action.resource.physicalId);
  return {
    ...action,
    resource,
    evidence: action.evidence.map((evidence) => ({
      ...evidence,
      subject: redactPhysical(evidence.subject),
    })),
  };
}

function redactScope(scope: ReconcileScope): ReconcileScope {
  const out: ReconcileScope = { ...scope };
  if (scope.resourcePrefix !== undefined) out.resourcePrefix = redactPhysical(scope.resourcePrefix);
  if (scope.accountIds !== undefined) out.accountIds = scope.accountIds.map(redact);
  return out;
}

function stableId(identity: ResourceIdentity): string {
  return createHash("sha256")
    .update(`${identity.type}:${identity.urn ?? ""}:${identity.physicalId ?? ""}`)
    .digest("hex")
    .slice(0, 12);
}

function redact(value: string): string {
  return `<redacted:${createHash("sha256").update(value).digest("hex").slice(0, 12)}>`;
}

function redactPhysical(value: string): string {
  if (value.startsWith("arn:") || /\d{12}/.test(value) || value.includes("://"))
    return redact(value);
  return `<redacted:${createHash("sha256").update(value).digest("hex").slice(0, 12)}>`;
}

function summarize(actions: ReconcilePlanAction[]): ReconcilePlan["summary"] {
  return actions.reduce(
    (summary, action) => {
      if (action.recommendedAction === "deleteCloudResource") summary.cleanedUp += 1;
      else if (
        action.recommendedAction === "stateDelete" ||
        action.recommendedAction === "refreshState"
      )
        summary.stateReconciled += 1;
      else if (action.recommendedAction === "importToState") summary.adopted += 1;
      else if (action.recommendedAction === "retainExternal" || action.recommendedAction === "noOp")
        summary.retained += 1;
      else summary.blocked += 1;
      return summary;
    },
    { cleanedUp: 0, stateReconciled: 0, adopted: 0, retained: 0, blocked: 0 },
  );
}

function confirmationToken(
  unsignedPlan: Omit<ReconcilePlan, "confirmToken">,
  nonce: string,
): string {
  const canonical = JSON.stringify(unsignedPlan);
  return createHash("sha256").update(`${canonical}:${nonce}`).digest("hex");
}

function uniqueDecisions(values: ReconcileDecision[]): ReconcileDecision[] {
  return [...new Set(values)];
}

function executionLockKey(plan: ReconcilePlan): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        mode: plan.mode,
        stackName: plan.scope.stackName ?? "",
        projectName: plan.scope.projectName ?? "",
        resourcePrefix: plan.scope.resourcePrefix ?? "",
        regions: plan.scope.regions ?? [],
        accountIds: plan.scope.accountIds ?? [],
        actions: plan.actions.map((action) => action.id).sort(),
      }),
    )
    .digest("hex");
}

function safeErrorMessage(err: unknown): string {
  const name = err instanceof Error && err.name.length > 0 ? err.name : "Error";
  return `${name}: executor failed; see local logs for redacted details`;
}
