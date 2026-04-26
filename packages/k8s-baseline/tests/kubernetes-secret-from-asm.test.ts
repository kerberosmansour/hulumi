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

describe("KubernetesSecretFromAwsSecretsManager — missing-key warns", () => {
  test("missing source key emits warn but proceeds with the present keys", async () => {
    const warnSpy = vi.spyOn(pulumi.log, "warn").mockResolvedValue();
    __setSecretsManagerFetcher(async () => JSON.stringify({ username: "u" }));
    new KubernetesSecretFromAwsSecretsManager("c", {
      secretsManagerArn: "arn",
      keyMapping: { username: "user", password: "pass" },
      namespace: "prod",
      secretName: "x",
    });
    await settlePulumi();
    const messages = warnSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(messages).toMatch(/missing requested key "password"/);
    const stringData = unwrapStringData(secrets()[0].inputs.stringData);
    expect(stringData.user).toBe("u");
    expect(stringData.pass).toBeUndefined();
  });
});

describe("KubernetesSecretFromAwsSecretsManager — abuse cases", () => {
  test("JSON-bomb cap honored", async () => {
    // Build a 100-level nested object (deeper than the 64 cap)
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
    // The deep-nesting check runs inside an apply, so the error shows up in
    // pulumi.log.error rather than a thrown synchronous Error.
    const errs = errSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(errs).toMatch(/exceeds max nesting depth|JSON/i);
  });

  test("error path does not leak prior secret bytes (token-shape redaction)", async () => {
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

  test("non-object SM JSON refused", async () => {
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
  });
});
