import { z } from "zod";

export const agentRequestSchema = z
  .object({
    findingKey: z.string().min(1),
    packageName: z.string().min(1),
    fromVersion: z.string().min(1),
    toVersion: z.string().min(1),
    allowedPaths: z.array(z.string().min(1)).min(1),
    dependencyClosure: z.array(z.string().min(1)).min(1),
    untrustedContext: z
      .object({
        advisoryText: z.string().optional(),
        changelogText: z.string().optional(),
      })
      .strict(),
  })
  .strict();

export type AgentRequest = z.infer<typeof agentRequestSchema>;

export const agentResponseSchema = z
  .object({
    decision: z.enum(["approve", "reject", "escalate"]),
    rationale: z.string().min(1),
    malwareRecheck: z.enum(["clean", "malicious", "unknown"]),
    checkedDependencyClosure: z.array(z.string().min(1)),
  })
  .strict();

export type AgentResponse = z.infer<typeof agentResponseSchema>;

export interface AgentBackend {
  name: string;
  hasMergeTool: boolean;
  hasSecretTool: boolean;
  allowedTools?: string[];
  run(request: AgentRequest): Promise<unknown>;
}

export function createStubAgentBackend(
  response: unknown | ((request: AgentRequest) => unknown | Promise<unknown>),
): AgentBackend {
  return {
    name: "stub",
    hasMergeTool: false,
    hasSecretTool: false,
    allowedTools: ["read_diff", "submit_structured_verdict"],
    run: async (request) => (typeof response === "function" ? response(request) : response),
  };
}

export function parseAgentResponse(
  response: unknown,
  expectedDependencyClosure?: string[],
): AgentResponse {
  const parsed = agentResponseSchema.safeParse(response);
  if (!parsed.success) {
    throw new Error(`verdict schema validation failed: ${parsed.error.message}`);
  }
  const verdict = parsed.data;

  if (verdict.decision === "approve") {
    if (verdict.malwareRecheck !== "clean") {
      throw new Error("approve verdict requires a clean malware recheck");
    }
    if (verdict.checkedDependencyClosure.length === 0) {
      throw new Error("approve verdict requires a full dependency closure recheck");
    }
    const missing = (expectedDependencyClosure ?? []).filter(
      (dependency) => !verdict.checkedDependencyClosure.includes(dependency),
    );
    if (missing.length > 0) {
      throw new Error(
        `approve verdict did not check the full dependency closure: ${missing.join(", ")}`,
      );
    }
  }

  return verdict;
}

export async function runAgentReview(
  backend: AgentBackend,
  request: AgentRequest,
): Promise<AgentResponse> {
  if (backend.hasMergeTool) {
    throw new Error("agent backend must not expose a merge tool");
  }
  if (backend.hasSecretTool) {
    throw new Error("agent backend must not expose a secret-read tool");
  }
  const parsedRequest = agentRequestSchema.parse(request);
  return parseAgentResponse(await backend.run(parsedRequest), parsedRequest.dependencyClosure);
}
