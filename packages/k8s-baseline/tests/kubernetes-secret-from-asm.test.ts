import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as pulumi from "@pulumi/pulumi";

import {
  KUBERNETES_SECRET_FROM_ASM_COMPONENT_TYPE,
  KubernetesSecretFromAwsSecretsManager,
  __setSecretsManagerFetcher,
} from "../src/kubernetes-secret-from-asm";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

beforeEach(() => {
  resetRegistrations();
});

afterEach(() => {
  vi.restoreAllMocks();
  __setSecretsManagerFetcher(undefined);
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
    __setSecretsManagerFetcher(async () =>
      JSON.stringify({ port: 5432, host: "db.example.com" }),
    );
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

  test('empty secretName refused', () => {
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
  test("Scenario: Secret fetch failure fails closed (default raises visible error)", async () => {
    __setSecretsManagerFetcher(async () => {
      throw new Error("AWS API: AccessDeniedException");
    });
    const c = new KubernetesSecretFromAwsSecretsManager("c", {
      secretsManagerArn: "arn:aws:sm:us-east-1:111:secret:foo",
      keyMapping: { username: "user" },
      namespace: "prod",
      secretName: "x",
    });
    await settlePulumi();
    // The default failureMode is "fail" — the Pulumi Output's apply() rejects,
    // which surfaces as a rejected output the engine refuses to deploy.
    await expect(valueOf(c.dataKeysWritten)).rejects.toThrow(/fail-closed|fetch|AccessDenied/i);
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
    expect(messages).toMatch(/warn-empty|degraded|fail-closed bypass/i);
  });

  test('Scenario: Missing required key fails by default (missingKeyMode default is "fail")', async () => {
    __setSecretsManagerFetcher(async () => JSON.stringify({ username: "u" }));
    const c = new KubernetesSecretFromAwsSecretsManager("c", {
      secretsManagerArn: "arn",
      keyMapping: { username: "user", password: "pass" },
      namespace: "prod",
      secretName: "x",
    });
    await settlePulumi();
    await expect(valueOf(c.dataKeysWritten)).rejects.toThrow(/missing requested key "password"/);
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
    // Build a 100-level nested object (deeper than the 64 cap)
    let nested: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < 100; i++) nested = { child: nested };
    const evil = { username: "u", deep: nested };
    __setSecretsManagerFetcher(async () => JSON.stringify(evil));
    const c = new KubernetesSecretFromAwsSecretsManager("c", {
      secretsManagerArn: "arn",
      keyMapping: { username: "u" },
      namespace: "prod",
      secretName: "x",
    });
    await settlePulumi();
    await expect(valueOf(c.dataKeysWritten)).rejects.toThrow(/exceeds max nesting depth/i);
  });

  test("error path does not leak prior secret bytes — redacted token-shape in rejection", async () => {
    __setSecretsManagerFetcher(async () => {
      throw new Error("API denied: Bearer ghs_supersecretvalueABC123 was rejected");
    });
    const c = new KubernetesSecretFromAwsSecretsManager("c", {
      secretsManagerArn: "arn:aws:secretsmanager:us-east-1:111:secret:foo",
      keyMapping: { username: "user" },
      namespace: "prod",
      secretName: "x",
    });
    await settlePulumi();
    let captured = "";
    try {
      await valueOf(c.dataKeysWritten);
    } catch (err) {
      captured = err instanceof Error ? err.message : String(err);
    }
    expect(captured).toMatch(/<redacted>/);
    expect(captured).not.toMatch(/ghs_supersecretvalueABC123/);
  });

  test("non-object SM JSON refused (fail-closed)", async () => {
    __setSecretsManagerFetcher(async () => '"just a string"');
    const c = new KubernetesSecretFromAwsSecretsManager("c", {
      secretsManagerArn: "arn",
      keyMapping: { a: "b" },
      namespace: "prod",
      secretName: "x",
    });
    await settlePulumi();
    await expect(valueOf(c.dataKeysWritten)).rejects.toThrow(/must be a JSON object/);
  });
});
