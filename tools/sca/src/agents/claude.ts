import type { AgentBackend } from "./adapter";

export const CLAUDE_CODE_ACTION_REF = "537ffff2eff706bd7e3e1c3daf2d4b39067a9f85";
export const CLAUDE_CODE_ACTION_USES = `anthropics/claude-code-action@${CLAUDE_CODE_ACTION_REF}`;

export interface ClaudeBackendOptions {
  response?: unknown;
}

export function createClaudeBackend(options: ClaudeBackendOptions = {}): AgentBackend {
  return {
    name: "claude-code-action",
    hasMergeTool: false,
    hasSecretTool: false,
    allowedTools: ["read_diff", "submit_structured_verdict"],
    run: async (request) =>
      options.response ?? {
        decision: "approve",
        rationale:
          "reference backend emits a schema-only verdict; workflow execution owns the actual Claude Code Action call",
        malwareRecheck: "clean",
        checkedDependencyClosure: request.dependencyClosure,
      },
  };
}
