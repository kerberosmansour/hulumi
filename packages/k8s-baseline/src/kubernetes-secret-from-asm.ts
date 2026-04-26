import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

import type {
  KubernetesSecretFromAwsSecretsManagerArgs,
  RdsCredentialSecretArgs,
} from "./kubernetes-secret-from-asm.args";
import { RDS_DEFAULT_KEY_MAPPING } from "./kubernetes-secret-from-asm.args";
import type {
  KubernetesSecretFromAwsSecretsManagerOutputs,
  RdsCredentialSecretOutputs,
} from "./kubernetes-secret-from-asm.outputs";

export const KUBERNETES_SECRET_FROM_ASM_COMPONENT_TYPE =
  "hulumi:k8s:KubernetesSecretFromAwsSecretsManager";
export const RDS_CREDENTIAL_SECRET_COMPONENT_TYPE = "hulumi:k8s:RdsCredentialSecret";

const MAX_NESTING_DEPTH = 64;
const TOKEN_REDACT_RE = /(ghs_|ghp_|github_pat_|gho_|ghu_|Bearer\s+)\S+/g;

/**
 * Test seam: a fetcher that, given an SM ARN + optional region, returns the
 * raw secret string. Defaults to the SDK; tests can inject a stub.
 */
export type SecretsManagerFetcher = (arn: string, region?: string) => Promise<string>;

let activeFetcher: SecretsManagerFetcher | undefined = undefined;

/**
 * Inject a mock fetcher for tests. Pass `undefined` to reset to the SDK
 * default. Calling code must clean up after each test.
 */
export function __setSecretsManagerFetcher(fetcher: SecretsManagerFetcher | undefined): void {
  activeFetcher = fetcher;
}

async function defaultFetcher(arn: string, region?: string): Promise<string> {
  const client = new SecretsManagerClient(region !== undefined ? { region } : {});
  const out = await client.send(new GetSecretValueCommand({ SecretId: arn }));
  if (out.SecretString === undefined) {
    throw new Error(
      `KubernetesSecretFromAwsSecretsManager: SM secret value at ${arn} is binary; only string secrets are supported`,
    );
  }
  return out.SecretString;
}

function jsonNestingDepth(value: unknown, depth = 0): number {
  if (depth > MAX_NESTING_DEPTH) return depth;
  if (Array.isArray(value)) {
    return value.reduce<number>(
      (m, v) => Math.max(m, jsonNestingDepth(v, depth + 1)),
      depth,
    );
  }
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).reduce<number>(
      (m, v) => Math.max(m, jsonNestingDepth(v, depth + 1)),
      depth,
    );
  }
  return depth;
}

function redact(message: string): string {
  return message.replace(TOKEN_REDACT_RE, "$1<redacted>");
}

function validateName(name: string, secretName: string): void {
  if (secretName === undefined || typeof secretName !== "string" || secretName.trim() === "") {
    throw new Error(
      `KubernetesSecretFromAwsSecretsManager: secretName is required and must be non-empty (component "${name}")`,
    );
  }
  if (secretName.includes("/") || secretName.includes("..")) {
    throw new Error(
      `KubernetesSecretFromAwsSecretsManager: secretName "${secretName}" must not contain "/" or ".." (path-traversal-like names rejected)`,
    );
  }
}

function validateKeyMapping(name: string, keyMapping: Record<string, string>): void {
  if (keyMapping === undefined || keyMapping === null) {
    throw new Error(
      `KubernetesSecretFromAwsSecretsManager: keyMapping is required (component "${name}")`,
    );
  }
  if (Object.keys(keyMapping).length === 0) {
    throw new Error(
      `KubernetesSecretFromAwsSecretsManager: keyMapping must be non-empty (silent zero-key extraction is the failure mode this component refuses) (component "${name}")`,
    );
  }
}

/**
 * Apply key mapping to a parsed SM JSON value. Emits warn for any requested
 * SM key that's missing in the source.
 */
function mapKeys(
  componentName: string,
  parsed: Record<string, unknown>,
  keyMapping: Record<string, string>,
): { stringData: Record<string, string>; written: string[] } {
  const stringData: Record<string, string> = {};
  const written: string[] = [];
  for (const [smKey, k8sKey] of Object.entries(keyMapping)) {
    const value = parsed[smKey];
    if (value === undefined) {
      pulumi.log.warn(
        `KubernetesSecretFromAwsSecretsManager "${componentName}": SM JSON missing requested key "${smKey}" (mapped to K8s key "${k8sKey}"); the rendered K8s Secret will not include "${k8sKey}". Consumer apps that read this env var will fail loud at startup.`,
      );
      continue;
    }
    stringData[k8sKey] = typeof value === "string" ? value : JSON.stringify(value);
    written.push(k8sKey);
  }
  return { stringData, written };
}

export class KubernetesSecretFromAwsSecretsManager
  extends pulumi.ComponentResource
  implements KubernetesSecretFromAwsSecretsManagerOutputs
{
  public readonly secretName: pulumi.Output<string>;
  public readonly namespace: pulumi.Output<string>;
  public readonly dataKeysWritten: pulumi.Output<string[]>;

  constructor(
    name: string,
    args: KubernetesSecretFromAwsSecretsManagerArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super(KUBERNETES_SECRET_FROM_ASM_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    validateName(name, args.secretName);
    validateKeyMapping(name, args.keyMapping);

    const parent = { parent: this } as const;

    const inputs = pulumi.all([
      pulumi.output(args.secretsManagerArn),
      pulumi.output(args.region ?? ""),
    ]);

    const empty = { stringData: {}, written: [] as string[] };
    const extracted = inputs.apply(async ([arn, region]: [string, string]) => {
      const fetch = activeFetcher ?? defaultFetcher;
      let raw: string;
      try {
        raw = await fetch(arn, region === "" ? undefined : region);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        pulumi.log.error(
          `KubernetesSecretFromAwsSecretsManager "${name}": failed to fetch SM secret at ${arn}: ${redact(errMsg)}`,
        );
        return empty;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        pulumi.log.error(
          `KubernetesSecretFromAwsSecretsManager "${name}": SM secret at ${arn} is not valid JSON: ${redact(errMsg)}`,
        );
        return empty;
      }
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        pulumi.log.error(
          `KubernetesSecretFromAwsSecretsManager "${name}": SM secret at ${arn} must be a JSON object (got ${typeof parsed === "object" && Array.isArray(parsed) ? "array" : typeof parsed})`,
        );
        return empty;
      }
      const depth = jsonNestingDepth(parsed);
      if (depth > MAX_NESTING_DEPTH) {
        pulumi.log.error(
          `KubernetesSecretFromAwsSecretsManager "${name}": SM secret JSON exceeds max nesting depth (${MAX_NESTING_DEPTH})`,
        );
        return empty;
      }
      return mapKeys(name, parsed as Record<string, unknown>, args.keyMapping);
    });

    const stringData = extracted.apply((e) => e.stringData);
    const written = extracted.apply((e) => e.written);

    const metadata: { name: string; namespace: pulumi.Input<string>; labels?: Record<string, string>; annotations?: Record<string, string> } = {
      name: args.secretName,
      namespace: args.namespace,
    };
    if (args.labels !== undefined) metadata.labels = args.labels;
    if (args.annotations !== undefined) metadata.annotations = args.annotations;

    new k8s.core.v1.Secret(
      `${name}-secret`,
      {
        metadata,
        type: args.secretType ?? "Opaque",
        stringData: stringData as pulumi.Input<Record<string, pulumi.Input<string>>>,
      },
      parent,
    );

    this.secretName = pulumi.output(args.secretName);
    this.namespace = pulumi.output(args.namespace) as pulumi.Output<string>;
    this.dataKeysWritten = written;

    this.registerOutputs({
      secretName: this.secretName,
      namespace: this.namespace,
      dataKeysWritten: this.dataKeysWritten,
    });
  }
}

export class RdsCredentialSecret
  extends pulumi.ComponentResource
  implements RdsCredentialSecretOutputs
{
  public readonly secretName: pulumi.Output<string>;
  public readonly namespace: pulumi.Output<string>;
  public readonly dataKeysWritten: pulumi.Output<string[]>;

  constructor(name: string, args: RdsCredentialSecretArgs, opts?: pulumi.ComponentResourceOptions) {
    super(RDS_CREDENTIAL_SECRET_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    const keyMapping: Record<string, string> = { ...RDS_DEFAULT_KEY_MAPPING, ...(args.keyMapping ?? {}) };
    const innerArgs: KubernetesSecretFromAwsSecretsManagerArgs = {
      secretsManagerArn: args.rdsManagedMasterCredentialArn,
      namespace: args.namespace,
      secretName: args.secretName,
      keyMapping,
    };
    if (args.region !== undefined) innerArgs.region = args.region;
    const inner = new KubernetesSecretFromAwsSecretsManager(`${name}-foundation`, innerArgs, {
      parent: this,
    });
    this.secretName = inner.secretName;
    this.namespace = inner.namespace;
    this.dataKeysWritten = inner.dataKeysWritten;
    this.registerOutputs({
      secretName: this.secretName,
      namespace: this.namespace,
      dataKeysWritten: this.dataKeysWritten,
    });
  }
}
