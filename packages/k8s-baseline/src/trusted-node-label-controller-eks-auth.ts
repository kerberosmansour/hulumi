import { fromHttp } from "@aws-sdk/credential-provider-http";
import { SignatureV4 } from "@smithy/signature-v4";
import { createHash, createHmac, type Hash, type Hmac } from "node:crypto";

const POD_IDENTITY_CREDENTIALS_URI = "http://169.254.170.23/v1/credentials";
const POD_IDENTITY_TOKEN_PATH =
  "/var/run/secrets/pods.eks.amazonaws.com/serviceaccount/eks-pod-identity-token";
const CLUSTER_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/u;
const AWS_REGION = /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/u;
const ACCESS_KEY_ID = /^[A-Z0-9]{16,128}$/u;
const MAX_CREDENTIAL_TEXT = 4096;
const MAX_TOKEN_LENGTH = 4096;
const PRESIGN_SECONDS = 60;

export interface EksIamCredentialIdentity {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken: string;
  readonly expiration?: Date;
}

export interface EksHttpCredentialProviderOptions {
  readonly awsContainerCredentialsFullUri: string;
  readonly awsContainerCredentialsRelativeUri: string;
  readonly awsContainerAuthorizationTokenFile: string;
  readonly awsContainerAuthorizationToken: string;
  readonly timeout: number;
  readonly maxRetries: number;
}

export type EksHttpCredentialProviderFactory = (
  options: EksHttpCredentialProviderOptions,
) => () => Promise<EksIamCredentialIdentity>;

type ProcessEnvironment = Readonly<Record<string, string | undefined>>;

export class EksIamAuthenticatorError extends Error {
  readonly code = "kubernetes_iam_auth_unavailable" as const;

  constructor() {
    super("kubernetes_iam_auth_unavailable");
    this.name = "EksIamAuthenticatorError";
  }
}

export interface EksIamAuthenticatorTokenInput {
  readonly clusterName: string;
  readonly region: string;
  readonly credentials: EksIamCredentialIdentity;
  readonly signingDate?: Date;
}

export interface EksPodIdentityPatchTokenProviderDependencies {
  readonly environment?: ProcessEnvironment;
  readonly httpCredentialProviderFactory?: EksHttpCredentialProviderFactory;
  readonly now?: () => Date;
}

type CryptoInput = string | ArrayBuffer | ArrayBufferView;

function toBuffer(value: CryptoInput): Buffer {
  if (typeof value === "string") return Buffer.from(value, "utf8");
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}

class NodeSha256 {
  readonly #digest: Hash | Hmac;

  constructor(secret?: CryptoInput) {
    this.#digest =
      secret === undefined ? createHash("sha256") : createHmac("sha256", toBuffer(secret));
  }

  update(value: CryptoInput): void {
    this.#digest.update(toBuffer(value));
  }

  async digest(): Promise<Uint8Array> {
    return new Uint8Array(this.#digest.digest());
  }
}

function fail(): never {
  throw new EksIamAuthenticatorError();
}

function isBoundedCredentialText(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_CREDENTIAL_TEXT) {
    return false;
  }

  return [...value].every((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && codePoint > 0x1f && codePoint !== 0x7f;
  });
}

function validateCredentials(
  credentials: EksIamCredentialIdentity,
  signingDate: Date,
): EksIamCredentialIdentity {
  if (
    !ACCESS_KEY_ID.test(credentials.accessKeyId) ||
    !isBoundedCredentialText(credentials.secretAccessKey) ||
    !isBoundedCredentialText(credentials.sessionToken) ||
    !(credentials.expiration instanceof Date) ||
    !Number.isFinite(credentials.expiration.getTime()) ||
    credentials.expiration.getTime() < signingDate.getTime() + PRESIGN_SECONDS * 1_000 ||
    credentials.expiration.getTime() > signingDate.getTime() + 12 * 60 * 60 * 1_000
  ) {
    fail();
  }
  return credentials;
}

function encodeQueryComponent(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/gu,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function serializeSignedUrl(
  hostname: string,
  path: string,
  query: Readonly<Record<string, string | readonly string[] | undefined>>,
): string {
  const entries: Array<readonly [string, string]> = [];
  for (const [key, rawValue] of Object.entries(query)) {
    if (rawValue === undefined) continue;
    for (const value of Array.isArray(rawValue) ? rawValue : [rawValue]) {
      entries.push([key, value]);
    }
  }
  entries.sort(([leftKey, leftValue], [rightKey, rightValue]) => {
    if (leftKey === "X-Amz-Signature") return 1;
    if (rightKey === "X-Amz-Signature") return -1;
    const keyOrder = leftKey.localeCompare(rightKey, "en");
    return keyOrder === 0 ? leftValue.localeCompare(rightValue, "en") : keyOrder;
  });
  return `https://${hostname}${path}?${entries
    .map(([key, value]) => `${encodeQueryComponent(key)}=${encodeQueryComponent(value)}`)
    .join("&")}`;
}

export async function createEksIamAuthenticatorToken(
  input: EksIamAuthenticatorTokenInput,
): Promise<string> {
  try {
    if (!CLUSTER_NAME.test(input.clusterName) || !AWS_REGION.test(input.region)) fail();
    const signingDate = input.signingDate ?? new Date();
    if (!Number.isFinite(signingDate.getTime())) fail();
    const credentials = validateCredentials(input.credentials, signingDate);
    const hostname = `sts.${input.region}.${input.region.startsWith("cn-") ? "amazonaws.com.cn" : "amazonaws.com"}`;
    const signer = new SignatureV4({
      credentials,
      region: input.region,
      service: "sts",
      sha256: NodeSha256,
      applyChecksum: false,
      uriEscapePath: true,
    });
    const signed = await signer.presign(
      {
        protocol: "https:",
        hostname,
        method: "GET",
        path: "/",
        headers: { host: hostname, "x-k8s-aws-id": input.clusterName },
        query: { Action: "GetCallerIdentity", Version: "2011-06-15" },
      },
      {
        expiresIn: PRESIGN_SECONDS,
        signingDate,
        unhoistableHeaders: new Set(["x-k8s-aws-id"]),
      },
    );
    const query = signed.query as Record<string, string | readonly string[] | undefined>;
    const expectedKeys = [
      "Action",
      "Version",
      "X-Amz-Algorithm",
      "X-Amz-Credential",
      "X-Amz-Date",
      "X-Amz-Expires",
      "X-Amz-Security-Token",
      "X-Amz-Signature",
      "X-Amz-SignedHeaders",
    ];
    if (
      signed.protocol !== "https:" ||
      signed.hostname !== hostname ||
      signed.path !== "/" ||
      Object.keys(query).sort().join("\0") !== expectedKeys.sort().join("\0") ||
      query.Action !== "GetCallerIdentity" ||
      query.Version !== "2011-06-15" ||
      query["X-Amz-Algorithm"] !== "AWS4-HMAC-SHA256" ||
      query["X-Amz-Expires"] !== String(PRESIGN_SECONDS) ||
      query["X-Amz-Security-Token"] !== credentials.sessionToken ||
      query["X-Amz-SignedHeaders"] !== "host;x-k8s-aws-id" ||
      typeof query["X-Amz-Signature"] !== "string" ||
      !/^[a-f0-9]{64}$/u.test(query["X-Amz-Signature"])
    ) {
      fail();
    }
    const url = serializeSignedUrl(hostname, signed.path, query);
    const token = `k8s-aws-v1.${Buffer.from(url, "utf8").toString("base64url")}`;
    if (token.length > MAX_TOKEN_LENGTH || !/^k8s-aws-v1\.[A-Za-z0-9_-]+$/u.test(token)) fail();
    return token;
  } catch (error) {
    if (error instanceof EksIamAuthenticatorError) throw error;
    throw new EksIamAuthenticatorError();
  }
}

export function createEksPodIdentityPatchTokenProvider(
  config: Readonly<{ clusterName: string; region: string }>,
  dependencies: EksPodIdentityPatchTokenProviderDependencies = {},
): () => Promise<string> {
  const environment = dependencies.environment ?? process.env;
  const factory: EksHttpCredentialProviderFactory =
    dependencies.httpCredentialProviderFactory ??
    ((options) => {
      const provider = fromHttp(options);
      return async () => {
        const credentials = await provider();
        return {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          sessionToken: credentials.sessionToken ?? "",
          ...(credentials.expiration === undefined ? {} : { expiration: credentials.expiration }),
        };
      };
    });
  let credentialProvider: (() => Promise<EksIamCredentialIdentity>) | undefined;
  return async () => {
    try {
      if (
        environment.AWS_CONTAINER_CREDENTIALS_FULL_URI !== POD_IDENTITY_CREDENTIALS_URI ||
        environment.AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE !== POD_IDENTITY_TOKEN_PATH ||
        (environment.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI?.trim().length ?? 0) > 0 ||
        (environment.AWS_CONTAINER_AUTHORIZATION_TOKEN?.trim().length ?? 0) > 0
      ) {
        fail();
      }
      credentialProvider ??= factory({
        awsContainerCredentialsFullUri: POD_IDENTITY_CREDENTIALS_URI,
        awsContainerCredentialsRelativeUri: "",
        awsContainerAuthorizationTokenFile: POD_IDENTITY_TOKEN_PATH,
        awsContainerAuthorizationToken: "",
        timeout: 1000,
        maxRetries: 0,
      });
      const credentials = await credentialProvider();
      return await createEksIamAuthenticatorToken({
        clusterName: config.clusterName,
        region: config.region,
        credentials,
        signingDate: dependencies.now?.() ?? new Date(),
      });
    } catch (error) {
      if (error instanceof EksIamAuthenticatorError) throw error;
      throw new EksIamAuthenticatorError();
    }
  };
}
