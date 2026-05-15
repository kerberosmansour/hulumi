import { afterEach, describe, expect, it } from "vitest";

import { BotProtectionBaseline } from "../src";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

function botManagementInputs(): Record<string, unknown> | undefined {
  return registrations.find((r) => r.type === "cloudflare:index/botManagement:BotManagement")
    ?.inputs;
}

describe("BotProtectionBaseline", () => {
  afterEach(() => {
    resetRegistrations();
  });

  it("records granular bot intent as degraded on non-Enterprise plans without claiming Bot Management", async () => {
    const bot = new BotProtectionBaseline("bot-pro", {
      tier: "startup-hardened",
      zoneId: "zone_123",
      plan: "pro",
      intent: "granular",
    });

    await settlePulumi();

    expect(botManagementInputs()).toMatchObject({
      zoneId: "zone_123",
      fightMode: true,
    });
    await expect(valueOf(bot.appliedControls)).resolves.not.toContain("bot_management");
    await expect(valueOf(bot.degradedControls)).resolves.toEqual(
      expect.arrayContaining(["bot_management_granular"]),
    );
    await expect(valueOf(bot.unsupportedControls)).resolves.toEqual(
      expect.arrayContaining(["per_request_bot_score"]),
    );
  });

  it("applies granular Bot Management only on Enterprise plans", async () => {
    const bot = new BotProtectionBaseline("bot-enterprise", {
      tier: "startup-hardened",
      zoneId: "zone_123",
      plan: "enterprise",
      intent: "granular",
    });

    await settlePulumi();

    expect(botManagementInputs()).toMatchObject({
      zoneId: "zone_123",
      enableJs: true,
      suppressSessionScore: false,
    });
    await expect(valueOf(bot.appliedControls)).resolves.toEqual(
      expect.arrayContaining(["bot_management", "per_request_bot_score"]),
    );
    await expect(valueOf(bot.degradedControls)).resolves.toEqual([]);
  });
});
