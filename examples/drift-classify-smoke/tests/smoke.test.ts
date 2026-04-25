import { describe, it, expect } from "vitest";
import { runSmoke } from "../index";

describe("examples/drift-classify-smoke", () => {
  it("console event surfaces ConsoleBreakGlass/high; provider delta surfaces ProviderApiChurn/medium", async () => {
    const result = await runSmoke();
    expect(result.consoleVerdict.source).toBe("ConsoleBreakGlass");
    expect(result.consoleVerdict.confidence).toBe("high");
    expect(result.providerVerdict.source).toBe("ProviderApiChurn");
    expect(result.providerVerdict.confidence).toBe("medium");
  });
});
