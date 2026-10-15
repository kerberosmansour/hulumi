import { URL } from "node:url";

import { describe, expect, test, vi } from "vitest";

import {
  createEksIamAuthenticatorToken,
  createEksPodIdentityPatchTokenProvider,
  type EksHttpCredentialProviderFactory,
  type EksIamCredentialIdentity,
} from "../src/trusted-node-label-controller-eks-auth";

const NOW = new Date("2026-10-16T00:00:00.000Z");
const CREDENTIALS: EksIamCredentialIdentity = {
  accessKeyId: "ASIAEXAMPLEACCESS",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  sessionToken: "session-token",
  expiration: new Date("2026-10-16T01:00:00.000Z"),
};
const EXPECTED_URL =
  "https://sts.eu-west-2.amazonaws.com/?Action=GetCallerIdentity&Version=2011-06-15&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=ASIAEXAMPLEACCESS%2F20261016%2Feu-west-2%2Fsts%2Faws4_request&X-Amz-Date=20261016T000000Z&X-Amz-Expires=60&X-Amz-Security-Token=session-token&X-Amz-SignedHeaders=host%3Bx-k8s-aws-id&X-Amz-Signature=7418eed05d006e239cb2f2f270f83854c46dbad13287d8addff0a77b361e1b7b";

function validEnvironment(): Record<string, string | undefined> {
  return {
    AWS_CONTAINER_CREDENTIALS_FULL_URI: "http://169.254.170.23/v1/credentials",
    AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE:
      "/var/run/secrets/pods.eks.amazonaws.com/serviceaccount/eks-pod-identity-token",
  };
}

describe("EKS IAM authenticator token", () => {
  test("BDD-M4b-5: fixed credentials, cluster, region and time produce the independent SigV4 vector", async () => {
    const token = await createEksIamAuthenticatorToken({
      clusterName: "prod-eks",
      region: "eu-west-2",
      credentials: CREDENTIALS,
      signingDate: NOW,
    });

    expect(token.startsWith("k8s-aws-v1.")).toBe(true);
    expect(token).not.toContain("=");
    expect(token.length).toBeLessThanOrEqual(4096);
    const decoded = Buffer.from(token.slice("k8s-aws-v1.".length), "base64url").toString("utf8");
    expect(decoded).toBe(EXPECTED_URL);
    const url = new URL(decoded);
    expect(url.hostname).toBe("sts.eu-west-2.amazonaws.com");
    expect(url.searchParams.get("Action")).toBe("GetCallerIdentity");
    expect(url.searchParams.get("Version")).toBe("2011-06-15");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("60");
    expect(url.searchParams.get("X-Amz-Security-Token")).toBe("session-token");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host;x-k8s-aws-id");
  });

  test("BDD-M4b-6: the exact Pod Identity endpoint and token file disable ambient HTTP fallbacks", async () => {
    const credentialProvider = vi.fn(async () => CREDENTIALS);
    const factory: EksHttpCredentialProviderFactory = vi.fn(() => credentialProvider);
    const provider = createEksPodIdentityPatchTokenProvider(
      { clusterName: "prod-eks", region: "eu-west-2" },
      { environment: validEnvironment(), httpCredentialProviderFactory: factory, now: () => NOW },
    );

    await expect(provider()).resolves.toMatch(/^k8s-aws-v1\.[A-Za-z0-9_-]+$/u);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith({
      awsContainerCredentialsFullUri: "http://169.254.170.23/v1/credentials",
      awsContainerCredentialsRelativeUri: "",
      awsContainerAuthorizationTokenFile:
        "/var/run/secrets/pods.eks.amazonaws.com/serviceaccount/eks-pod-identity-token",
      awsContainerAuthorizationToken: "",
      timeout: 1000,
      maxRetries: 0,
    });
    expect(credentialProvider).toHaveBeenCalledTimes(1);
  });

  test("BDD-M4b-6: missing or altered Pod Identity injection fails before credential retrieval", async () => {
    const cases: Array<Record<string, string | undefined>> = [
      {},
      { ...validEnvironment(), AWS_CONTAINER_CREDENTIALS_FULL_URI: undefined },
      { ...validEnvironment(), AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE: undefined },
      {
        ...validEnvironment(),
        AWS_CONTAINER_CREDENTIALS_FULL_URI: "http://169.254.170.2/v2/credentials",
      },
      {
        ...validEnvironment(),
        AWS_CONTAINER_CREDENTIALS_FULL_URI: "https://credentials.example.invalid/role",
      },
      {
        ...validEnvironment(),
        AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE: "/tmp/pod-identity-token",
      },
      {
        ...validEnvironment(),
        AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: "/ambient",
      },
      {
        ...validEnvironment(),
        AWS_CONTAINER_AUTHORIZATION_TOKEN: "ambient-token",
      },
    ];

    for (const environment of cases) {
      const credentialProvider = vi.fn(async () => CREDENTIALS);
      const factory: EksHttpCredentialProviderFactory = vi.fn(() => credentialProvider);
      const provider = createEksPodIdentityPatchTokenProvider(
        { clusterName: "prod-eks", region: "eu-west-2" },
        { environment, httpCredentialProviderFactory: factory, now: () => NOW },
      );
      await expect(provider()).rejects.toMatchObject({
        code: "kubernetes_iam_auth_unavailable",
        message: "kubernetes_iam_auth_unavailable",
      });
      expect(factory).not.toHaveBeenCalled();
      expect(credentialProvider).not.toHaveBeenCalled();
    }
  });

  test("BDD-M4b-6: provider and credential validation failures are stable and redacted", async () => {
    const leaked = "SECRET-SESSION-TOKEN";
    const failingFactory: EksHttpCredentialProviderFactory = () => async () => {
      throw new Error(`provider failed with ${leaked}`);
    };
    const provider = createEksPodIdentityPatchTokenProvider(
      { clusterName: "prod-eks", region: "eu-west-2" },
      {
        environment: validEnvironment(),
        httpCredentialProviderFactory: failingFactory,
        now: () => NOW,
      },
    );

    let observed = "";
    try {
      await provider();
    } catch (error) {
      observed = String(error);
      expect(error).toMatchObject({ code: "kubernetes_iam_auth_unavailable" });
    }
    expect(observed).toBe("EksIamAuthenticatorError: kubernetes_iam_auth_unavailable");
    expect(observed).not.toContain(leaked);

    await expect(
      createEksIamAuthenticatorToken({
        clusterName: "prod-eks\nother",
        region: "eu-west-2",
        credentials: CREDENTIALS,
        signingDate: NOW,
      }),
    ).rejects.toMatchObject({ code: "kubernetes_iam_auth_unavailable" });
    await expect(
      createEksIamAuthenticatorToken({
        clusterName: "prod-eks",
        region: "eu-west-2",
        credentials: { ...CREDENTIALS, sessionToken: "x".repeat(4097) },
        signingDate: NOW,
      }),
    ).rejects.toMatchObject({ code: "kubernetes_iam_auth_unavailable" });
  });
});
