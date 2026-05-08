import { describe, it, expect, afterEach } from "vitest";

import { resolveProbeTimeoutMs } from "../src/classifier";

const ORIGINAL_AWS_REGION = process.env.AWS_REGION;
const ORIGINAL_AWS_DEFAULT_REGION = process.env.AWS_DEFAULT_REGION;

describe("probe timeout defaults — region-aware CloudTrail delivery", () => {
  afterEach(() => {
    restoreEnv("AWS_REGION", ORIGINAL_AWS_REGION);
    restoreEnv("AWS_DEFAULT_REGION", ORIGINAL_AWS_DEFAULT_REGION);
  });

  it("uses explicit probeTimeoutMs before any region default", () => {
    process.env.AWS_REGION = "ap-southeast-3";
    expect(resolveProbeTimeoutMs({ probeTimeoutMs: 12_345 })).toBe(12_345);
  });

  it("uses per-call awsRegion before constructor or environment regions", () => {
    process.env.AWS_REGION = "us-east-1";
    expect(
      resolveProbeTimeoutMs({
        optionRegion: "ap-southeast-3",
        classifierRegion: "us-west-2",
      }),
    ).toBe(120_000);
  });

  it("uses classifier awsRegion when per-call region is absent", () => {
    expect(resolveProbeTimeoutMs({ classifierRegion: "ap-southeast-3" })).toBe(120_000);
  });

  it("uses AWS_REGION then AWS_DEFAULT_REGION as environment fallback", () => {
    process.env.AWS_REGION = "ap-southeast-3";
    process.env.AWS_DEFAULT_REGION = "us-east-1";
    expect(resolveProbeTimeoutMs({})).toBe(120_000);

    delete process.env.AWS_REGION;
    expect(resolveProbeTimeoutMs({})).toBe(60_000);
  });

  it("falls back to 60s for blank or unknown regions", () => {
    expect(resolveProbeTimeoutMs({ optionRegion: "" })).toBe(60_000);
    expect(resolveProbeTimeoutMs({ optionRegion: "antarctica-south-1" })).toBe(60_000);
  });
});

function restoreEnv(name: "AWS_REGION" | "AWS_DEFAULT_REGION", value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
