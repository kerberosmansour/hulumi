import type * as pulumi from "@pulumi/pulumi";

export interface KubernetesSecretFromAwsSecretsManagerOutputs {
  secretName: pulumi.Output<string>;
  namespace: pulumi.Output<string>;
  /** K8s-side keys actually present in the rendered Secret. */
  dataKeysWritten: pulumi.Output<string[]>;
}

export type RdsCredentialSecretOutputs = KubernetesSecretFromAwsSecretsManagerOutputs;
