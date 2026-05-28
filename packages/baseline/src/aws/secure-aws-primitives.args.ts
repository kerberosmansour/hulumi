import type * as pulumi from "@pulumi/pulumi";
import type * as aws from "@pulumi/aws";

import type { Tier } from "./tier";

export type SecureIamOidcSubjectMode =
  | { readonly kind: "environment"; readonly environment: string }
  | { readonly kind: "ref"; readonly ref: string };

export interface SecureIamInlinePolicy {
  readonly name: string;
  readonly policy: pulumi.Input<string | Record<string, unknown>>;
}

interface SecureIamRoleBaseArgs {
  readonly tier: Tier;
  readonly roleName: pulumi.Input<string>;
  readonly permissionBoundaryArn?: pulumi.Input<string>;
  readonly policyArns?: readonly pulumi.Input<string>[];
  readonly inlinePolicies?: readonly SecureIamInlinePolicy[];
  readonly path?: pulumi.Input<string>;
  readonly tags?: Record<string, string>;
}

export interface SecureIamDeploymentRoleArgs extends SecureIamRoleBaseArgs {
  readonly owner: string;
  readonly repository: string;
  readonly oidcProviderArn: pulumi.Input<string>;
  readonly audience: string;
  readonly subjectMode: SecureIamOidcSubjectMode;
  readonly reusableWorkflowRef?: string;
}

export interface SecureWorkloadRoleArgs extends SecureIamRoleBaseArgs {
  readonly servicePrincipals: readonly string[];
}

export interface SecureSecretRotationArgs {
  readonly enabled: boolean;
  readonly rotationLambdaArn?: pulumi.Input<string>;
  readonly automaticallyAfterDays?: pulumi.Input<number>;
}

export type SecureSecretRotationPosture = "enabled" | "advisory-missing";

export interface SecureSecretArgs {
  readonly tier: Tier;
  readonly secretName: pulumi.Input<string>;
  readonly kmsKeyId: pulumi.Input<string>;
  readonly description?: pulumi.Input<string>;
  readonly rotation?: SecureSecretRotationArgs;
  readonly resourcePolicy?: string | Record<string, unknown>;
  readonly tags?: Record<string, string>;
}

export interface SecureLaunchTemplateArgs {
  readonly tier: Tier;
  readonly namePrefix: pulumi.Input<string>;
  readonly imageId: pulumi.Input<string>;
  readonly instanceType: pulumi.Input<string>;
  readonly metadataOptions?: Partial<aws.types.input.ec2.LaunchTemplateMetadataOptions>;
  readonly userData?: pulumi.Input<string>;
  readonly tags?: Record<string, string>;
}
