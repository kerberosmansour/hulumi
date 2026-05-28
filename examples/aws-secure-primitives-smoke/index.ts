import { SecureIamDeploymentRole, SecureLaunchTemplate, SecureSecret } from "@hulumi/baseline/aws";

const permissionBoundaryArn =
  process.env.HULUMI_PERMISSION_BOUNDARY_ARN ??
  "arn:aws:iam::111122223333:policy/hulumi-permission-boundary";

export const deployRole = new SecureIamDeploymentRole("primitive-deploy", {
  tier: "startup-hardened",
  owner: "kerberosmansour",
  repository: "hulumi",
  roleName: "hulumi-primitive-deploy",
  oidcProviderArn: "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com",
  audience: "sts.amazonaws.com",
  subjectMode: { kind: "ref", ref: "refs/heads/main" },
  permissionBoundaryArn,
});

export const appSecret = new SecureSecret("primitive-secret", {
  tier: "sandbox",
  secretName: "hulumi/primitive/smoke",
  kmsKeyId: "arn:aws:kms:us-east-1:111122223333:key/1234abcd",
});

export const launchTemplate = new SecureLaunchTemplate("primitive-lt", {
  tier: "startup-hardened",
  namePrefix: "hulumi-primitive-",
  imageId: "ami-1234567890abcdef0",
  instanceType: "t3.micro",
});

export const deployRoleArn = deployRole.roleArn;
export const secretArn = appSecret.secretArn;
export const launchTemplateId = launchTemplate.launchTemplateId;
