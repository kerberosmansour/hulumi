import { beforeEach, describe, expect, it } from "vitest";

import {
  MAX_SECURE_IAM_INLINE_POLICIES,
  SecureIamDeploymentRole,
  SecureLaunchTemplate,
  SecureSecret,
} from "../src/aws";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

const OIDC_PROVIDER_ARN =
  "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com";
const PERMISSION_BOUNDARY_ARN = "arn:aws:iam::111122223333:policy/hulumi-permission-boundary";
const KMS_KEY_ARN = "arn:aws:kms:us-east-1:111122223333:key/1234abcd";

function findRegistration(type: string) {
  return registrations.find((registration) => registration.type === type);
}

function parseJson(input: unknown): Record<string, unknown> {
  expect(typeof input).toBe("string");
  return JSON.parse(input as string) as Record<string, unknown>;
}

describe("SecureIamDeploymentRole", () => {
  beforeEach(resetRegistrations);

  it("creates an exact GitHub OIDC trust with no wildcard subject", async () => {
    const role = new SecureIamDeploymentRole("deploy", {
      tier: "startup-hardened",
      owner: "kerberosmansour",
      repository: "hulumi",
      roleName: "hulumi-deploy",
      oidcProviderArn: OIDC_PROVIDER_ARN,
      audience: "sts.amazonaws.com",
      subjectMode: { kind: "environment", environment: "prod" },
      reusableWorkflowRef: "kerberosmansour/hulumi/.github/workflows/deploy.yml@refs/heads/main",
      permissionBoundaryArn: PERMISSION_BOUNDARY_ARN,
    });

    await valueOf(role.roleArn);
    await settlePulumi();

    const roleResource = findRegistration("aws:iam/role:Role");
    expect(roleResource).toBeDefined();
    expect(roleResource?.inputs.permissionsBoundary).toBe(PERMISSION_BOUNDARY_ARN);
    const trust = parseJson(roleResource?.inputs.assumeRolePolicy);
    const statement = (trust.Statement as Array<Record<string, unknown>>)[0];
    const condition = statement.Condition as Record<string, Record<string, string>>;
    expect(condition.StringEquals["token.actions.githubusercontent.com:sub"]).toBe(
      "repo:kerberosmansour/hulumi:environment:prod",
    );
    expect(JSON.stringify(trust)).not.toContain("*");
  });

  it("rejects wildcard OIDC subject axes", () => {
    expect(
      () =>
        new SecureIamDeploymentRole("deploy-bad", {
          tier: "sandbox",
          owner: "kerberosmansour",
          repository: "hulumi",
          roleName: "hulumi-deploy",
          oidcProviderArn: OIDC_PROVIDER_ARN,
          audience: "sts.amazonaws.com",
          subjectMode: { kind: "ref", ref: "refs/heads/*" },
        }),
    ).toThrow(/wildcard/i);
  });

  it("requires a permission boundary at startup-hardened tier", () => {
    expect(
      () =>
        new SecureIamDeploymentRole("deploy-no-boundary", {
          tier: "startup-hardened",
          owner: "kerberosmansour",
          repository: "hulumi",
          roleName: "hulumi-deploy",
          oidcProviderArn: OIDC_PROVIDER_ARN,
          audience: "sts.amazonaws.com",
          subjectMode: { kind: "ref", ref: "refs/heads/main" },
        }),
    ).toThrow(/permission boundary/i);
  });

  it("bounds inline policy count", () => {
    expect(
      () =>
        new SecureIamDeploymentRole("deploy-too-many", {
          tier: "sandbox",
          owner: "kerberosmansour",
          repository: "hulumi",
          roleName: "hulumi-deploy",
          oidcProviderArn: OIDC_PROVIDER_ARN,
          audience: "sts.amazonaws.com",
          subjectMode: { kind: "ref", ref: "refs/heads/main" },
          inlinePolicies: Array.from(
            { length: MAX_SECURE_IAM_INLINE_POLICIES + 1 },
            (_, index) => ({
              name: `policy-${index}`,
              policy: {
                Version: "2012-10-17",
                Statement: [
                  { Effect: "Allow", Action: "s3:GetObject", Resource: "arn:aws:s3:::x" },
                ],
              },
            }),
          ),
        }),
    ).toThrow(/inline policies/i);
  });
});

describe("SecureSecret", () => {
  beforeEach(resetRegistrations);

  it("creates a secret without exposing a value and marks missing rotation advisory", async () => {
    const secret = new SecureSecret("app-secret", {
      tier: "sandbox",
      secretName: "app/prod",
      kmsKeyId: KMS_KEY_ARN,
    });

    expect(await valueOf(secret.rotationPosture)).toBe("advisory-missing");
    await settlePulumi();

    const secretResource = findRegistration("aws:secretsmanager/secret:Secret");
    expect(secretResource).toBeDefined();
    expect(secretResource?.inputs.kmsKeyId).toBe(KMS_KEY_ARN);
    expect(registrations.map((registration) => registration.type)).not.toContain(
      "aws:secretsmanager/secretVersion:SecretVersion",
    );
  });

  it("rejects broad secret resource policies", () => {
    expect(
      () =>
        new SecureSecret("broad-secret", {
          tier: "startup-hardened",
          secretName: "app/prod",
          kmsKeyId: KMS_KEY_ARN,
          rotation: { enabled: true },
          resourcePolicy: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: "*",
                Action: "secretsmanager:GetSecretValue",
                Resource: "*",
              },
            ],
          },
        }),
    ).toThrow(/broad secret/i);
  });
});

describe("SecureLaunchTemplate", () => {
  beforeEach(resetRegistrations);

  it("defaults launch templates to IMDSv2-required posture", async () => {
    const template = new SecureLaunchTemplate("lt", {
      tier: "startup-hardened",
      namePrefix: "hulumi-app",
      imageId: "ami-1234567890abcdef0",
      instanceType: "t3.micro",
    });

    await valueOf(template.launchTemplateId);
    await settlePulumi();

    const lt = findRegistration("aws:ec2/launchTemplate:LaunchTemplate");
    expect(lt).toBeDefined();
    expect(lt?.inputs.metadataOptions).toEqual(expect.objectContaining({ httpTokens: "required" }));
  });
});
