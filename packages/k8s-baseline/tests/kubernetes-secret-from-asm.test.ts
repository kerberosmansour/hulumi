import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as pulumi from "@pulumi/pulumi";

import {
  KUBERNETES_SECRET_FROM_ASM_COMPONENT_TYPE,
  KubernetesSecretFromAwsSecretsManager,
  __setSecretsManagerFetcher,
} from "../src/kubernetes-secret-from-asm";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

// The M2 fail-closed impl throws `FailClosedError` inside a Pulumi apply
// chain. Pulumi's `cmd/run` path installs an unhandled-rejection handler in
// production, but the mock runtime in tests does not. Attach a per-file
// listener that suppresses ONLY FailClosedError rejections so the BDD test
// output stays clean while still surfacing any unexpected rejection.
let unhandledRejectionListener: ((reason: unknown) => void) | undefined;

beforeEach(() => {
  resetRegistrations();
  unhandledRejectionListener = (reason: unknown) => {
    if (reason instanceof Error && reason.name === "FailClosedError") {
      return; // expected for fail-closed BDD scenarios
    }
    throw reason instanceof Error ? reason : new Error(String(reason));
  };
  process.on("unhandledRejection", unhandledRejectionListener);
});

afterEach(() => {
  vi.restoreAllMocks();
  __setSecretsManagerFetcher(undefined);
  if (unhandledRejectionListener !== undefined) {
    process.off("unhandledRejection", unhandledRejectionListener);
    unhandledRejectionListener = undefined;
  }
});

function secrets() {
  return registrations.filter((r) => r.type === "kubernetes:core/v1:Secret");
}

/**
 * Pulumi auto-wraps K8s Secret `stringData` in its secret envelope:
 * `{ "4dabf...": "1b47...", "value": <actual> }`. Unwrap for assertions.
 */
function unwrapStringData(raw: unknown): Record<string, string> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw === "object" && "value" in (raw as object)) {
    return (raw as { value: Record<string, string> }).value;
  }
  return raw as Record<string, string>;
}

describe("KubernetesSecretFromAwsSecretsManager — happy paths", () => {
  test("happy path: extracts and applies key mapping", async () => {
    __setSecretsManagerFetcher(async () =>
      JSON.stringify({ username: "u", password: "p", extra: "e" }),
    );
    const c = new KubernetesSecretFromAwsSecretsManager("creds", {
      secretsManagerArn: "arn:aws:secretsmanager:us-east-1:111:secret:foo",
      keyMapping: { username: "user", password: "pass" },
      namespace: "prod",
      secretName: "app-creds",
    });
    await settlePulumi();
    expect(registrations.some((r) => r.type === KUBERNETES_SECRET_FROM_ASM_COMPONENT_TYPE)).toBe(
      true,
    );
    expect(secrets()).toHaveLength(1);
    const sec = secrets()[0];
    const stringData = unwrapStringData(sec.inputs.stringData);
    expect(stringData.user).toBe("u");
    expect(stringData.pass).toBe("p");
    expect(stringData.extra).toBeUndefined();
    expect(await valueOf(c.dataKeysWritten)).toEqual(["user", "pass"]);
    const meta = sec.inputs.metadata as { name: string; namespace: string };
    expect(meta.name).toBe("app-creds");
    expect(meta.namespace).toBe("prod");
  });

  test("non-string JSON values are JSON-stringified", async () => {
    __setSecretsManagerFetcher(async () => JSON.stringify({ port: 5432, host: "db.example.com" }));
    new KubernetesSecretFromAwsSecretsManager("c", {
      secretsManagerArn: "arn:aws:sm:us-east-1:111:secret:foo",
      keyMapping: { port: "PORT", host: "HOST" },
      namespace: "prod",
      secretName: "db-cfg",
    });
    await settlePulumi();
    const stringData = unwrapStringData(secrets()[0].inputs.stringData);
    expect(stringData.PORT).toBe("5432");
    expect(stringData.HOST).toBe("db.example.com");
  });
});

describe("KubernetesSecretFromAwsSecretsManager — invalid input refusals", () => {
  test("empty keyMapping refused", () => {
    expect(
      () =>
        new KubernetesSecretFromAwsSecretsManager("c", {
          secretsManagerArn: "arn",
          keyMapping: {},
          namespace: "prod",
          secretName: "x",
        }),
    ).toThrow(/keyMapping must be non-empty/);
  });

  test("empty secretName refused", () => {
    expect(
      () =>
        new KubernetesSecretFromAwsSecretsManager("c", {
          secretsManagerArn: "arn",
          keyMapping: { a: "b" },
          namespace: "prod",
          secretName: "",
        }),
    ).toThrow(/secretName is required/);
  });

  test('secretName with "/" refused', () => {
    expect(
      () =>
        new KubernetesSecretFromAwsSecretsManager("c", {
          secretsManagerArn: "arn",
          keyMapping: { a: "b" },
          namespace: "prod",
          secretName: "ns/x",
        }),
    ).toThrow(/must not contain/);
  });

  test('secretName with ".." refused', () => {
    expect(
      () =>
        new KubernetesSecretFromAwsSecretsManager("c", {
          secretsManagerArn: "arn",
          keyMapping: { a: "b" },
          namespace: "prod",
          secretName: "../etc",
        }),
    ).toThrow(/must not contain/);
  });
});

// NOTE: M2 changes the default behavior here. The old "missing key warns
// and proceeds" semantics now require `missingKeyMode: "warn"` opt-in;
// the same scenario lives in the M2 fail-closed-defaults block above.

describe("KubernetesSecretFromAwsSecretsManager — M2 fail-closed defaults", () => {
  test("Scenario: Secret fetch failure fails closed (default logs error + aborts deploy)", async () => {
    const errSpy = vi.spyOn(pulumi.log, "error").mockResolvedValue();
    __setSecretsManagerFetcher(async () => {
      throw new Error("AWS API: AccessDeniedException");
    });
    new KubernetesSecretFromAwsSecretsManager("c", {
      secretsManagerArn: "arn:aws:sm:us-east-1:111:secret:foo",
      keyMapping: { username: "user" },
      namespace: "prod",
      secretName: "x",
    });
    await settlePulumi();
    // failureMode default is "fail" — the impl logs to pulumi.log.error AND
    // throws inside the apply (Pulumi engine treats that as deploy-blocking).
    const errs = errSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(errs).toMatch(/AccessDeniedException/);
    expect(errs).toMatch(/failureMode "fail" — fail-closed/);
  });

  test('Scenario: Warn-empty is explicit (failureMode: "warn-empty" preserves degraded behavior)', async () => {
    const warnSpy = vi.spyOn(pulumi.log, "warn").mockResolvedValue();
    __setSecretsManagerFetcher(async () => {
      throw new Error("AWS API: AccessDeniedException");
    });
    new KubernetesSecretFromAwsSecretsManager("c", {
      secretsManagerArn: "arn",
      keyMapping: { username: "user" },
      namespace: "prod",
      secretName: "x",
      failureMode: "warn-empty",
    });
    await settlePulumi();
    const data = unwrapStringData(secrets()[0].inputs.stringData);
    expect(data).toEqual({});
    const messages = warnSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(messages).toMatch(/warn-empty.*fail-closed bypass|degraded mode/i);
  });

  test('Scenario: Missing required key fails by default (missingKeyMode default is "fail")', async () => {
    const errSpy = vi.spyOn(pulumi.log, "error").mockResolvedValue();
    __setSecretsManagerFetcher(async () => JSON.stringify({ username: "u" }));
    new KubernetesSecretFromAwsSecretsManager("c", {
      secretsManagerArn: "arn",
      keyMapping: { username: "user", password: "pass" },
      namespace: "prod",
      secretName: "x",
    });
    await settlePulumi();
    const errs = errSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(errs).toMatch(/missing requested key "password"/);
    expect(errs).toMatch(/missingKeyMode "fail" — fail-closed/);
  });

  test('Scenario: missingKeyMode: "warn" preserves the historical missing-key warn behavior', async () => {
    const warnSpy = vi.spyOn(pulumi.log, "warn").mockResolvedValue();
    __setSecretsManagerFetcher(async () => JSON.stringify({ username: "u" }));
    new KubernetesSecretFromAwsSecretsManager("c", {
      secretsManagerArn: "arn",
      keyMapping: { username: "user", password: "pass" },
      namespace: "prod",
      secretName: "x",
      missingKeyMode: "warn",
    });
    await settlePulumi();
    const messages = warnSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(messages).toMatch(/missing requested key "password"/);
    const data = unwrapStringData(secrets()[0].inputs.stringData);
    expect(data.user).toBe("u");
    expect(data.pass).toBeUndefined();
  });

  test("Scenario: keyMapping bound enforced (65 keys → constructor rejects)", () => {
    const bigMapping: Record<string, string> = {};
    for (let i = 0; i < 65; i++) bigMapping[`k${i}`] = `key${i}`;
    expect(
      () =>
        new KubernetesSecretFromAwsSecretsManager("c", {
          secretsManagerArn: "arn",
          keyMapping: bigMapping,
          namespace: "prod",
          secretName: "x",
        }),
    ).toThrow(/keyMapping has 65 entries.*max 64|exceeds max keyMapping bound/i);
  });

  test("Scenario: keyMapping at the bound (64 keys) still constructs", () => {
    const okMapping: Record<string, string> = {};
    for (let i = 0; i < 64; i++) okMapping[`k${i}`] = `key${i}`;
    expect(
      () =>
        new KubernetesSecretFromAwsSecretsManager("c", {
          secretsManagerArn: "arn",
          keyMapping: okMapping,
          namespace: "prod",
          secretName: "x",
        }),
    ).not.toThrow();
  });
});

describe("KubernetesSecretFromAwsSecretsManager — abuse cases (fail-closed by default)", () => {
  test("JSON-bomb cap fails closed by default", async () => {
    let nested: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < 100; i++) nested = { child: nested };
    const evil = { username: "u", deep: nested };
    __setSecretsManagerFetcher(async () => JSON.stringify(evil));
    const errSpy = vi.spyOn(pulumi.log, "error").mockResolvedValue();
    new KubernetesSecretFromAwsSecretsManager("c", {
      secretsManagerArn: "arn",
      keyMapping: { username: "u" },
      namespace: "prod",
      secretName: "x",
    });
    await settlePulumi();
    const errs = errSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(errs).toMatch(/exceeds max nesting depth/i);
    expect(errs).toMatch(/failureMode "fail" — fail-closed/);
  });

  test("error path does not leak prior secret bytes — redacted token-shape in error log", async () => {
    __setSecretsManagerFetcher(async () => {
      throw new Error("API denied: Bearer ghs_supersecretvalueABC123 was rejected");
    });
    const errSpy = vi.spyOn(pulumi.log, "error").mockResolvedValue();
    new KubernetesSecretFromAwsSecretsManager("c", {
      secretsManagerArn: "arn:aws:secretsmanager:us-east-1:111:secret:foo",
      keyMapping: { username: "user" },
      namespace: "prod",
      secretName: "x",
    });
    await settlePulumi();
    const errs = errSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(errs).toMatch(/<redacted>/);
    expect(errs).not.toMatch(/ghs_supersecretvalueABC123/);
  });

  test("non-object SM JSON refused (fail-closed)", async () => {
    __setSecretsManagerFetcher(async () => '"just a string"');
    const errSpy = vi.spyOn(pulumi.log, "error").mockResolvedValue();
    new KubernetesSecretFromAwsSecretsManager("c", {
      secretsManagerArn: "arn",
      keyMapping: { a: "b" },
      namespace: "prod",
      secretName: "x",
    });
    await settlePulumi();
    const errs = errSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(errs).toMatch(/must be a JSON object/);
    expect(errs).toMatch(/failureMode "fail" — fail-closed/);
  });
});
