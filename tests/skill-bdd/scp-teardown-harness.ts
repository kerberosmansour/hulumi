// SCP teardown phase machine — pure-function harness derived from the
// manual procedure documented in `docs/deployment/scp-guide.md` ("Revert"
// section). The harness imports no AWS SDK code; tests inject a typed
// `AwsOrganizationsResponder` so the control-flow invariants are
// executable without requiring `requires-aws-org-write` permissions.
//
// The five-state phase machine:
//
//   Idle ──▶ AttachedDetectable ──▶ DetachInFlight ──▶ Detached
//     │                                                 ▲
//     └─────────────────────────────────────────────────┘   (no-op path)
//
//   Failed is reachable from any of {AttachedDetectable, DetachInFlight}
//   when the responder reports an error or the poll budget is exhausted.

export type Phase = "Idle" | "AttachedDetectable" | "DetachInFlight" | "Detached" | "Failed";

export interface ListPoliciesForTargetResponse {
  policies: Array<{ id: string; name: string }>;
}

export interface DetachPolicyOk {
  ok: true;
}

export interface DetachPolicyError {
  ok: false;
  error: string;
}

export type DetachPolicyResponse = DetachPolicyOk | DetachPolicyError;

export interface AwsOrganizationsResponder {
  listPoliciesForTarget(
    targetId: string,
    type: "SERVICE_CONTROL_POLICY",
  ): Promise<ListPoliciesForTargetResponse>;
  detachPolicy(policyId: string, targetId: string): Promise<DetachPolicyResponse>;
}

export interface TeardownInput {
  policyId: string;
  policyName: string;
  targetId: string;
  /** Maximum number of `listPoliciesForTarget` polls before giving up. Hard cap 12. */
  maxPolls?: number;
  /** Optional hook for tests to observe phase transitions. */
  onPhase?: (phase: Phase, context: Record<string, unknown>) => void;
}

export interface TeardownResult {
  finalPhase: Phase;
  pollsTaken: number;
  transitions: Phase[];
  error?: string;
}

const ALLOWED_TRANSITIONS: Record<Phase, Phase[]> = {
  Idle: ["AttachedDetectable", "Detached"],
  AttachedDetectable: ["DetachInFlight", "Failed"],
  DetachInFlight: ["Detached", "Failed"],
  Detached: [],
  Failed: [],
};

const HARD_CAP_POLLS = 12;
const DEFAULT_MAX_POLLS = 10;

class IllegalTransitionError extends Error {
  constructor(from: Phase, to: Phase) {
    super(
      `SCP teardown phase machine refuses transition: ${from} -> ${to} (allowed: ${ALLOWED_TRANSITIONS[from].join(", ") || "none"})`,
    );
    this.name = "IllegalTransitionError";
  }
}

/**
 * Validates a single phase transition. Throws if illegal — the manual
 * procedure cannot skip phases (e.g. you can't go directly from Idle to
 * Detached without first observing the SCP attached or absent).
 */
export function advance(from: Phase, to: Phase): Phase {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new IllegalTransitionError(from, to);
  }
  return to;
}

/**
 * Runs the SCP teardown procedure: list → detach → poll-until-gone.
 *
 * Returns a `TeardownResult` describing the final phase, the number of
 * polls taken, and the full transition log. Never throws on responder
 * errors — those land as `finalPhase: "Failed"` with the error message.
 * Throws only on illegal phase transitions (programming errors) or when
 * `maxPolls` exceeds the hard cap.
 */
export async function teardownScp(
  input: TeardownInput,
  responder: AwsOrganizationsResponder,
): Promise<TeardownResult> {
  const transitions: Phase[] = [];
  let phase: Phase = "Idle";
  const maxPolls = input.maxPolls ?? DEFAULT_MAX_POLLS;
  if (maxPolls > HARD_CAP_POLLS) {
    throw new Error(
      `maxPolls=${maxPolls} exceeds hard cap of ${HARD_CAP_POLLS} (SCP teardown poll budget cannot be raised at runtime)`,
    );
  }

  const transition = (next: Phase, context: Record<string, unknown> = {}): void => {
    phase = advance(phase, next);
    transitions.push(phase);
    input.onPhase?.(phase, context);
  };

  // Phase 1: detect — is the SCP currently attached to the target?
  const attached = await responder.listPoliciesForTarget(input.targetId, "SERVICE_CONTROL_POLICY");
  const isAttached = attached.policies.some((p) => p.id === input.policyId);
  if (!isAttached) {
    transition("Detached", { reason: "no-op — policy was not attached" });
    return { finalPhase: phase, pollsTaken: 0, transitions };
  }
  transition("AttachedDetectable", { policyName: input.policyName });

  // Phase 2: detach
  const detachResult = await responder.detachPolicy(input.policyId, input.targetId);
  if (!detachResult.ok) {
    transition("Failed", { stage: "detach", error: detachResult.error });
    return {
      finalPhase: phase,
      pollsTaken: 0,
      transitions,
      error: `detach-policy failed: ${detachResult.error}`,
    };
  }
  transition("DetachInFlight", {});

  // Phase 3: poll until gone (bounded — hard cap 12)
  for (let i = 1; i <= maxPolls; i++) {
    const stillAttached = await responder.listPoliciesForTarget(
      input.targetId,
      "SERVICE_CONTROL_POLICY",
    );
    if (!stillAttached.policies.some((p) => p.id === input.policyId)) {
      transition("Detached", { pollsTaken: i });
      return { finalPhase: phase, pollsTaken: i, transitions };
    }
  }

  transition("Failed", {
    stage: "poll-exhausted",
    error: `policy ${input.policyId} still attached after ${maxPolls} polls`,
  });
  return {
    finalPhase: phase,
    pollsTaken: maxPolls,
    transitions,
    error: `poll-exhausted after ${maxPolls} polls`,
  };
}

export { IllegalTransitionError, HARD_CAP_POLLS };
