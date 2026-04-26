import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  RDS_CREDENTIAL_SECRET_COMPONENT_TYPE,
  RdsCredentialSecret,
  __setSecretsManagerFetcher,
} from "../src/kubernetes-secret-from-asm";
import { RDS_DEFAULT_KEY_MAPPING } from "../src/kubernetes-secret-from-asm.args";
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

function unwrapStringData(raw: unknown): Record<string, string> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw === "object" && "value" in (raw as object)) {
    return (raw as { value: Record<string, string> }).value;
  }
  return raw as Record<string, string>;
}

describe("RdsCredentialSecret", () => {
  test("default mapping covers the 6 RDS-managed JSON keys", async () => {
    __setSecretsManagerFetcher(async () =>
      JSON.stringify({
        username: "admin",
        password: "secret123",
        host: "db.cluster.local",
        port: 5432,
        engine: "postgres",
        dbClusterIdentifier: "prod-cluster",
      }),
    );
    const c = new RdsCredentialSecret("rds", {
      rdsManagedMasterCredentialArn: "arn:aws:sm:us-east-1:111:secret:rds-foo",
      namespace: "prod",
      secretName: "rds-creds",
    });
    await settlePulumi();
    expect(registrations.some((r) => r.type === RDS_CREDENTIAL_SECRET_COMPONENT_TYPE)).toBe(true);
    expect(secrets()).toHaveLength(1);
    const data = unwrapStringData(secrets()[0].inputs.stringData);
    expect(Object.keys(data).sort()).toEqual(
      ["dbClusterIdentifier", "engine", "host", "password", "port", "username"].sort(),
    );
    expect(data.password).toBe("secret123");
    expect(data.port).toBe("5432");
    expect(await valueOf(c.dataKeysWritten)).toContain("password");
  });

  test("opt-in keyMapping override (e.g., DB_PASSWORD)", async () => {
    __setSecretsManagerFetcher(async () =>
      JSON.stringify({
        username: "admin",
        password: "p",
        host: "h",
        port: 5432,
        engine: "postgres",
        dbClusterIdentifier: "c",
      }),
    );
    new RdsCredentialSecret("rds", {
      rdsManagedMasterCredentialArn: "arn",
      namespace: "prod",
      secretName: "rds-creds",
      keyMapping: { password: "DB_PASSWORD", username: "DB_USER" },
    });
    await settlePulumi();
    const data = unwrapStringData(secrets()[0].inputs.stringData);
    expect(data.DB_PASSWORD).toBe("p");
    expect(data.DB_USER).toBe("admin");
    expect(data.password).toBeUndefined();
  });

  test("default key mapping is regression-locked at 6 keys", () => {
    const keys = Object.keys(RDS_DEFAULT_KEY_MAPPING).sort();
    expect(keys).toEqual(
      ["dbClusterIdentifier", "engine", "host", "password", "port", "username"].sort(),
    );
  });
});
