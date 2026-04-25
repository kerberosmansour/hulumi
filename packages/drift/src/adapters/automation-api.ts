// AutomationApiAdapter — wraps Pulumi Automation API
// `refresh --preview-only` and harvests `ChangeSummary` + `detailedDiff`
// to populate the `mutated` snapshot field.
//
// In real deployments this calls `pulumi.automation.LocalWorkspace`.
// The constructor accepts an injectable "preview function" so tests can
// supply a fake without touching disk or Pulumi binaries.

import type { AdapterSignal, DriftAdapter } from "../types";

export interface AutomationApiPreviewResult {
  /** ChangeSummary keyed by op kind: "same" | "create" | "update" | "delete" | "replace". */
  changeSummary: Record<string, number>;
  /** Map of resource URN -> detailedDiff entries. Empty when nothing drifted. */
  detailedDiff: Record<string, Record<string, unknown>>;
}

export interface AutomationApiAdapterArgs {
  /** Async function that runs `pulumi preview --refresh-only` and returns the diff. */
  preview: (stack: string) => Promise<AutomationApiPreviewResult>;
}

export class AutomationApiAdapter implements DriftAdapter {
  constructor(private readonly args: AutomationApiAdapterArgs) {}

  name(): string {
    return "AutomationApi";
  }

  async available(): Promise<boolean> {
    return true;
  }

  async signal(stack: string, resource: string): Promise<AdapterSignal> {
    try {
      const result = await this.args.preview(stack);
      const diff = result.detailedDiff[resource] ?? {};
      const detected =
        Object.keys(diff).length > 0 ||
        (result.changeSummary["update"] ?? 0) > 0 ||
        (result.changeSummary["replace"] ?? 0) > 0;
      return {
        detected,
        ok: true,
        data: { detailedDiff: diff, changeSummary: result.changeSummary },
      };
    } catch (err) {
      return {
        detected: false,
        ok: false,
        data: { error: err instanceof Error ? err.message : String(err) },
      };
    }
  }
}
