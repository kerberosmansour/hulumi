import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import { Ec2PatchBaseline } from "./ec2-patch-baseline";
import type { Ec2PatchWaveArgs, Ec2PatchWavesArgs } from "./ec2-patch-waves.args";
import type { Ec2PatchWavesOutputs } from "./ec2-patch-waves.outputs";
import { assertValidTier } from "./tier";

export const EC2_PATCH_WAVES_COMPONENT_TYPE = "hulumi:baseline:aws:Ec2PatchWaves";

export class Ec2PatchWaves extends pulumi.ComponentResource implements Ec2PatchWavesOutputs {
  public readonly waveNames: pulumi.Output<string[]>;
  public readonly healthGateAlarmArn: pulumi.Output<string | undefined>;

  constructor(name: string, args: Ec2PatchWavesArgs, opts?: pulumi.ComponentResourceOptions) {
    super(EC2_PATCH_WAVES_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    assertValidTier(args.tier);

    if (args.dev === undefined) {
      throw new Error(`Ec2PatchWaves: dev wave is required (component "${name}")`);
    }
    if (args.tier === "startup-hardened") {
      if (args.staging === undefined || args.production === undefined) {
        throw new Error(
          `Ec2PatchWaves: tier "startup-hardened" requires all three waves (dev, staging, production) — sandbox-only single-wave degradation is forbidden at this tier (component "${name}")`,
        );
      }
    }

    const parent = { parent: this } as const;
    const waves: Array<{ tag: "dev" | "staging" | "production"; baseline: Ec2PatchBaseline }> = [];

    function buildWave(
      tag: "dev" | "staging" | "production",
      waveArgs: Ec2PatchWaveArgs,
    ): Ec2PatchBaseline {
      const b = new Ec2PatchBaseline(
        `${name}-${tag}`,
        { ...waveArgs, tier: args.tier, patchGroup: tag },
        parent,
      );
      waves.push({ tag, baseline: b });
      return b;
    }

    buildWave("dev", args.dev);
    if (args.staging !== undefined) buildWave("staging", args.staging);
    if (args.production !== undefined) buildWave("production", args.production);

    let healthGateArn: pulumi.Output<string | undefined>;
    if (waves.length > 1) {
      // Composite alarm built from the per-wave compliance alarms.
      const arns = waves.map((w) => w.baseline.complianceAlarmArn);
      const compositeAlarm = new aws.cloudwatch.CompositeAlarm(
        `${name}-wave-gate`,
        {
          alarmName: `${name}-wave-gate`,
          alarmRule: pulumi
            .all(arns)
            .apply((aArns) =>
              aArns.map((a) => `ALARM("${a.split(":alarm:")[1] ?? a}")`).join(" OR "),
            ),
          alarmDescription:
            "Hulumi Ec2PatchWaves wave-to-wave health gate: OK transitions to next wave; ALARM blocks progression.",
        },
        parent,
      );
      healthGateArn = compositeAlarm.arn.apply((a) => a as string | undefined);
    } else {
      healthGateArn = pulumi.output(undefined);
    }

    this.waveNames = pulumi.output(waves.map((w) => `${name}-${w.tag}`));
    this.healthGateAlarmArn = healthGateArn;
    this.registerOutputs({
      waveNames: this.waveNames,
      healthGateAlarmArn: this.healthGateAlarmArn,
    });
  }
}
