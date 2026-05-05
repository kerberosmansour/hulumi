// SCP teardown fixture-replay BDD (Runbook hulumi-pre-public-launch M3).
//
// Exercises the phase machine in `scp-teardown-harness.ts` against
// recorded AWS Organizations responses. No real AWS calls — the harness
// takes a typed `AwsOrganizationsResponder` interface so we inject
// fixtures here.

import { describe, expect, it } from "vitest";
import {
  advance,
  HARD_CAP_POLLS,
  IllegalTransitionError,
  teardownScp,
  type AwsOrganizationsResponder,
  type DetachPolicyResponse,
  type ListPoliciesForTargetResponse,
  type Phase,
} from "./scp-teardown-harness.js";

const TARGET_OU = "ou-xxxx-fixturetarget";
const SCP_ID = "p-fixturepolicyid";
const SCP_NAME = "hulumi-iac-role-tag-protection";

interface FixtureResponderOpts {
  /** Sequence of `listPoliciesForTarget` responses, returned in order. */
  listResponses: ListPoliciesForTargetResponse[];
  /** Single `detachPolicy` response. */
  detachResponse: DetachPolicyResponse;
}

function fixtureResponder(opts: FixtureResponderOpts): AwsOrganizationsResponder {
  let listIdx = 0;
  return {
    async listPoliciesForTarget() {
      if (listIdx >= opts.listResponses.length) {
        throw new Error(
          `fixtureResponder: ran out of listResponses at idx ${listIdx} — fixture under-specified`,
        );
      }
      return opts.listResponses[listIdx++];
    },
    async detachPolicy() {
      return opts.detachResponse;
    },
  };
}

const ATTACHED_RESPONSE: ListPoliciesForTargetResponse = {
  policies: [{ id: SCP_ID, name: SCP_NAME }],
};
const NOT_ATTACHED_RESPONSE: ListPoliciesForTargetResponse = { policies: [] };

describe("Feature: SCP teardown phase machine (Runbook hulumi-pre-public-launch M3)", () => {
  describe("Scenario: happy path — attached → detach → polled-gone", () => {
    it("teardown completes after 2 polls; transitions cover the documented sequence", async () => {
      const phasesLogged: Phase[] = [];
      const result = await teardownScp(
        {
          policyId: SCP_ID,
          policyName: SCP_NAME,
          targetId: TARGET_OU,
          onPhase: (p) => phasesLogged.push(p),
        },
        fixtureResponder({
          listResponses: [
            ATTACHED_RESPONSE, // detection
            ATTACHED_RESPONSE, // poll 1 — still attached (eventual consistency)
            NOT_ATTACHED_RESPONSE, // poll 2 — gone
          ],
          detachResponse: { ok: true },
        }),
      );

      expect(result.finalPhase).toBe("Detached");
      expect(result.pollsTaken).toBe(2);
      expect(result.transitions).toEqual(["AttachedDetectable", "DetachInFlight", "Detached"]);
      expect(phasesLogged).toEqual(result.transitions);
    });
  });

  describe("Scenario: no-op path — policy was not attached", () => {
    it("teardown short-circuits to Detached without calling detachPolicy", async () => {
      let detachCalled = 0;
      const responder: AwsOrganizationsResponder = {
        async listPoliciesForTarget() {
          return NOT_ATTACHED_RESPONSE;
        },
        async detachPolicy() {
          detachCalled++;
          return { ok: true };
        },
      };

      const result = await teardownScp(
        { policyId: SCP_ID, policyName: SCP_NAME, targetId: TARGET_OU },
        responder,
      );

      expect(result.finalPhase).toBe("Detached");
      expect(result.transitions).toEqual(["Detached"]);
      expect(result.pollsTaken).toBe(0);
      expect(detachCalled).toBe(0);
    });
  });

  describe("Scenario: detach-policy error — fail-closed", () => {
    it("captures the error in the result without throwing", async () => {
      const result = await teardownScp(
        { policyId: SCP_ID, policyName: SCP_NAME, targetId: TARGET_OU },
        fixtureResponder({
          listResponses: [ATTACHED_RESPONSE],
          detachResponse: { ok: false, error: "AccessDeniedException: not org admin" },
        }),
      );

      expect(result.finalPhase).toBe("Failed");
      expect(result.error).toMatch(/AccessDeniedException/);
      expect(result.transitions).toEqual(["AttachedDetectable", "Failed"]);
    });
  });

  describe("Scenario: poll exhaustion — bounded resource invariant", () => {
    it("falls into Failed with diagnostic when policy is still attached after maxPolls", async () => {
      const result = await teardownScp(
        {
          policyId: SCP_ID,
          policyName: SCP_NAME,
          targetId: TARGET_OU,
          maxPolls: 3,
        },
        fixtureResponder({
          listResponses: [
            ATTACHED_RESPONSE, // detection
            ATTACHED_RESPONSE, // poll 1
            ATTACHED_RESPONSE, // poll 2
            ATTACHED_RESPONSE, // poll 3 — still there
          ],
          detachResponse: { ok: true },
        }),
      );

      expect(result.finalPhase).toBe("Failed");
      expect(result.error).toMatch(/poll-exhausted after 3 polls/);
      expect(result.pollsTaken).toBe(3);
    });

    it("rejects maxPolls > HARD_CAP_POLLS (programming-time invariant)", async () => {
      await expect(
        teardownScp(
          {
            policyId: SCP_ID,
            policyName: SCP_NAME,
            targetId: TARGET_OU,
            maxPolls: HARD_CAP_POLLS + 1,
          },
          fixtureResponder({ listResponses: [], detachResponse: { ok: true } }),
        ),
      ).rejects.toThrow(/exceeds hard cap of 12/);
    });
  });

  describe("Scenario: illegal phase transition (assertion violation)", () => {
    it("advance(Idle, Detached) is allowed (no-op path)", () => {
      expect(advance("Idle", "Detached")).toBe("Detached");
    });

    it("advance(Idle, DetachInFlight) throws — must observe attachment first", () => {
      expect(() => advance("Idle", "DetachInFlight")).toThrow(IllegalTransitionError);
    });

    it("advance(Detached, anything) throws — terminal state", () => {
      expect(() => advance("Detached", "Idle")).toThrow(IllegalTransitionError);
      expect(() => advance("Detached", "AttachedDetectable")).toThrow(IllegalTransitionError);
    });

    it("advance(AttachedDetectable, Detached) throws — must go through DetachInFlight", () => {
      expect(() => advance("AttachedDetectable", "Detached")).toThrow(IllegalTransitionError);
    });
  });
});
