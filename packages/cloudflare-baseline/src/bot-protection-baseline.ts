import * as pulumi from "@pulumi/pulumi";
import * as cloudflare from "@pulumi/cloudflare";

import type {
  BotProtectionBaselineArgs,
  BotProtectionIntent,
} from "./bot-protection-baseline.args";
import type { BotProtectionBaselineOutputs } from "./bot-protection-baseline.outputs";
import type { CloudflarePlan } from "./edge-waf-baseline.args";
import { assertValidTier } from "./tier";

export const BOT_PROTECTION_BASELINE_COMPONENT_TYPE = "hulumi:cloudflare:BotProtectionBaseline";

const CLOUDFLARE_PLANS: readonly CloudflarePlan[] = ["free", "pro", "business", "enterprise"];
const BOT_INTENTS: readonly BotProtectionIntent[] = ["simple", "balanced", "granular"];

function assertPlan(plan: CloudflarePlan): void {
  if (!CLOUDFLARE_PLANS.includes(plan)) {
    throw new Error(`BotProtectionBaseline: plan must be one of ${CLOUDFLARE_PLANS.join(", ")}`);
  }
}

function assertIntent(intent: BotProtectionIntent): void {
  if (!BOT_INTENTS.includes(intent)) {
    throw new Error(`BotProtectionBaseline: intent must be one of ${BOT_INTENTS.join(", ")}`);
  }
}

function assertZoneId(zoneId: pulumi.Input<string>): void {
  if (typeof zoneId === "string" && zoneId.trim().length === 0) {
    throw new Error("BotProtectionBaseline: zoneId must be a non-empty Cloudflare zone identifier");
  }
}

function supportsSuperBotFightMode(plan: CloudflarePlan): boolean {
  return plan === "pro" || plan === "business" || plan === "enterprise";
}

export class BotProtectionBaseline
  extends pulumi.ComponentResource
  implements BotProtectionBaselineOutputs
{
  public readonly botManagementId: pulumi.Output<string | undefined>;
  public readonly appliedControls: pulumi.Output<string[]>;
  public readonly unsupportedControls: pulumi.Output<string[]>;
  public readonly degradedControls: pulumi.Output<string[]>;

  constructor(
    name: string,
    args: BotProtectionBaselineArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super(BOT_PROTECTION_BASELINE_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    assertValidTier(args.tier);
    assertPlan(args.plan);
    assertIntent(args.intent);
    assertZoneId(args.zoneId);

    const appliedControls: string[] = [];
    const unsupportedControls: string[] = [];
    const degradedControls: string[] = [];
    const botArgs: cloudflare.BotManagementArgs = { zoneId: args.zoneId };

    if (args.intent === "simple") {
      botArgs.fightMode = true;
      appliedControls.push("bot_fight_mode");
    } else if (args.intent === "balanced" && supportsSuperBotFightMode(args.plan)) {
      botArgs.sbfmDefinitelyAutomated = "managedChallenge";
      botArgs.sbfmLikelyAutomated = "managedChallenge";
      botArgs.sbfmStaticResourceProtection = true;
      botArgs.sbfmVerifiedBots = "allow";
      appliedControls.push("super_bot_fight_mode");
    } else if (args.intent === "balanced") {
      botArgs.fightMode = true;
      appliedControls.push("bot_fight_mode");
      degradedControls.push("super_bot_fight_mode");
      unsupportedControls.push("super_bot_fight_mode");
    } else if (args.plan === "enterprise") {
      botArgs.enableJs = true;
      botArgs.autoUpdateModel = true;
      botArgs.bmCookieEnabled = true;
      botArgs.suppressSessionScore = false;
      botArgs.aiBotsProtection = "block";
      botArgs.contentBotsProtection = "block";
      botArgs.crawlerProtection = "enabled";
      botArgs.sbfmDefinitelyAutomated = "managedChallenge";
      botArgs.sbfmLikelyAutomated = "managedChallenge";
      botArgs.sbfmStaticResourceProtection = true;
      botArgs.sbfmVerifiedBots = "allow";
      appliedControls.push(
        "bot_management",
        "per_request_bot_score",
        "javascript_detections",
        "ai_bot_protection",
      );
    } else {
      botArgs.fightMode = true;
      appliedControls.push("bot_fight_mode");
      degradedControls.push("bot_management_granular");
      unsupportedControls.push("bot_management", "per_request_bot_score");
    }

    const botManagement = new cloudflare.BotManagement(`${name}-bot-management`, botArgs, {
      parent: this,
    });

    this.botManagementId = botManagement.id;
    this.appliedControls = pulumi.output(appliedControls);
    this.unsupportedControls = pulumi.output(unsupportedControls);
    this.degradedControls = pulumi.output(degradedControls);

    this.registerOutputs({
      botManagementId: this.botManagementId,
      appliedControls: this.appliedControls,
      unsupportedControls: this.unsupportedControls,
      degradedControls: this.degradedControls,
    });
  }
}
