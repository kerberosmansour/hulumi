// BDD scenarios for G_OIDC_2 / HULUMI-H4 — cluster-scoped EKS admin or
// AWS AdministratorAccess bound to a GitHub-OIDC-trusted IAM role.

import { describe, it, expect, beforeEach } from "vitest";
import type { PolicyResource, StackValidationArgs } from "@pulumi/policy";

import {
  G_OIDC_2,
  h4NoClusterAdminViaGithubOidc,
  hulumiHardeningPackGithubMetadata,
} from "../../src/github";

const GH_OIDC_TRUST = JSON.stringify({
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: {
        Federated: "arn:aws:iam::1:oidc-provider/token.actions.githubusercontent.com",
      },
      Action: "sts:AssumeRoleWithWebIdentity",
      Condition: {
        StringEquals: {
          "token.actions.githubusercontent.com:sub": "repo:o/r:ref:refs/heads/main",
        },
      },
    },
  ],
});

const NON_OIDC_TRUST = JSON.stringify({
  Version: "2012-10-17",
  Statement: [
    { Effect: "Allow", Principal: { Service: "ec2.amazonaws.com" }, Action: "sts:AssumeRole" },
  ],
});

function res(partial: Partial<PolicyResource>): PolicyResource {
  return {
    type: "",
    urn: "",
    name: "",
    props: {},
    dependencies: [],
    propertyDependencies: {},
    ...partial,
  } as PolicyResource;
}

function makeStackArgs(
  resources: PolicyResource[],
  config: Record<string, unknown> = {},
): StackValidationArgs {
  return {
    resources,
    getConfig: (() => config) as StackValidationArgs["getConfig"],
  } as StackValidationArgs;
}

function run(args: StackValidationArgs): string[] {
  const violations: string[] = [];
  (G_OIDC_2.validateStack as (a: StackValidationArgs, r: (m: string) => void) => void)(args, (m) =>
    violations.push(m),
  );
  return violations;
}

const ghRole = res({
  type: "aws:iam/role:Role",
  urn: "urn:pulumi:s::p::aws:iam/role:Role::gh-deploy",
  name: "gh-deploy",
  props: { assumeRolePolicy: GH_OIDC_TRUST, arn: "arn:aws:iam::1:role/gh-deploy" },
});

describe("G_OIDC_2 — cluster-admin / AdministratorAccess via GitHub OIDC", () => {
  let violations: string[];
  beforeEach(() => {
    violations = [];
  });

  it("flags cluster-admin AccessPolicyAssociation linked to a GH-OIDC role (propertyDependencies)", () => {
    const assoc = res({
      type: "aws:eks/accessPolicyAssociation:AccessPolicyAssociation",
      urn: "urn:pulumi:s::p::aws:eks/accessPolicyAssociation:AccessPolicyAssociation::admin",
      name: "admin",
      props: {
        policyArn: "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy",
        accessScope: { type: "cluster" },
      },
      propertyDependencies: { principalArn: [ghRole] },
    });
    violations = run(makeStackArgs([ghRole, assoc]));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/G_OIDC_2/);
    expect(violations[0]).toMatch(/AmazonEKSClusterAdminPolicy/);
  });

  it("flags cluster-admin linked by principalArn value when no dependency edge is present", () => {
    const assoc = res({
      type: "aws:eks/accessPolicyAssociation:AccessPolicyAssociation",
      urn: "urn:pulumi:s::p::aws:eks/accessPolicyAssociation:AccessPolicyAssociation::admin",
      name: "admin",
      props: {
        policyArn: "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy",
        accessScope: { type: "cluster" },
        principalArn: "arn:aws:iam::1:role/gh-deploy",
      },
    });
    violations = run(makeStackArgs([ghRole, assoc]));
    expect(violations).toHaveLength(1);
  });

  it("flags AdministratorAccess RolePolicyAttachment on a GH-OIDC role", () => {
    const attach = res({
      type: "aws:iam/rolePolicyAttachment:RolePolicyAttachment",
      urn: "urn:pulumi:s::p::aws:iam/rolePolicyAttachment:RolePolicyAttachment::admin",
      name: "admin",
      props: { policyArn: "arn:aws:iam::aws:policy/AdministratorAccess" },
      propertyDependencies: { role: [ghRole] },
    });
    violations = run(makeStackArgs([ghRole, attach]));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/AdministratorAccess/);
  });

  it("does NOT flag a namespace-scoped AmazonEKSEditPolicy association", () => {
    const assoc = res({
      type: "aws:eks/accessPolicyAssociation:AccessPolicyAssociation",
      urn: "urn:pulumi:s::p::aws:eks/accessPolicyAssociation:AccessPolicyAssociation::edit",
      name: "edit",
      props: {
        policyArn: "arn:aws:eks::aws:cluster-access-policy/AmazonEKSEditPolicy",
        accessScope: { type: "namespace", namespaces: ["sunlit"] },
      },
      propertyDependencies: { principalArn: [ghRole] },
    });
    expect(run(makeStackArgs([ghRole, assoc]))).toHaveLength(0);
  });

  it("does NOT flag cluster-admin bound to a non-OIDC role (out of scope)", () => {
    const ec2Role = res({
      type: "aws:iam/role:Role",
      urn: "urn:pulumi:s::p::aws:iam/role:Role::ec2",
      name: "ec2",
      props: { assumeRolePolicy: NON_OIDC_TRUST, arn: "arn:aws:iam::1:role/ec2" },
    });
    const assoc = res({
      type: "aws:eks/accessPolicyAssociation:AccessPolicyAssociation",
      urn: "urn:pulumi:s::p::aws:eks/accessPolicyAssociation:AccessPolicyAssociation::admin",
      name: "admin",
      props: {
        policyArn: "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy",
        accessScope: { type: "cluster" },
      },
      propertyDependencies: { principalArn: [ec2Role] },
    });
    expect(run(makeStackArgs([ec2Role, assoc]))).toHaveLength(0);
  });

  it("does NOT treat a crafted look-alike OIDC-provider host as GitHub (anchored match)", () => {
    for (const federated of [
      "arn:aws:iam::1:oidc-provider/token.actions.githubusercontent.com.evil.com",
      "arn:aws:iam::1:oidc-provider/evil.com/token.actions.githubusercontent.com",
    ]) {
      const lookalike = res({
        type: "aws:iam/role:Role",
        urn: "urn:pulumi:s::p::aws:iam/role:Role::lookalike",
        name: "lookalike",
        props: {
          assumeRolePolicy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { Federated: federated },
                Action: "sts:AssumeRoleWithWebIdentity",
              },
            ],
          }),
          arn: "arn:aws:iam::1:role/lookalike",
        },
      });
      const assoc = res({
        type: "aws:eks/accessPolicyAssociation:AccessPolicyAssociation",
        urn: "urn:pulumi:s::p::aws:eks/accessPolicyAssociation:AccessPolicyAssociation::admin",
        name: "admin",
        props: {
          policyArn: "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy",
          accessScope: { type: "cluster" },
        },
        propertyDependencies: { principalArn: [lookalike] },
      });
      expect(run(makeStackArgs([lookalike, assoc]))).toHaveLength(0);
    }
  });

  it("does NOT flag when the cluster-admin association targets no role in the stack", () => {
    const assoc = res({
      type: "aws:eks/accessPolicyAssociation:AccessPolicyAssociation",
      urn: "urn:pulumi:s::p::aws:eks/accessPolicyAssociation:AccessPolicyAssociation::admin",
      name: "admin",
      props: {
        policyArn: "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy",
        accessScope: { type: "cluster" },
        principalArn: "arn:aws:iam::1:role/some-other-unrelated-role",
      },
    });
    expect(run(makeStackArgs([ghRole, assoc]))).toHaveLength(0);
  });

  it("honours a HULUMI-H4 suppression", () => {
    const assoc = res({
      type: "aws:eks/accessPolicyAssociation:AccessPolicyAssociation",
      urn: "urn:pulumi:s::p::aws:eks/accessPolicyAssociation:AccessPolicyAssociation::admin",
      name: "admin",
      props: {
        policyArn: "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy",
        accessScope: { type: "cluster" },
      },
      propertyDependencies: { principalArn: [ghRole] },
    });
    const config = {
      suppressions: [{ ruleId: "HULUMI-H4", reason: "documented break-glass" }],
    };
    expect(run(makeStackArgs([ghRole, assoc], config))).toHaveLength(0);
  });

  it("is registered in the pack metadata and exposed as an H4 alias", () => {
    expect(hulumiHardeningPackGithubMetadata.rules).toContain(
      "HULUMI-H4-no-cluster-admin-via-github-oidc",
    );
    expect(h4NoClusterAdminViaGithubOidc.name).toBe("HULUMI-H4-no-cluster-admin-via-github-oidc");
    expect(
      typeof (h4NoClusterAdminViaGithubOidc as { validateStack?: unknown }).validateStack,
    ).toBe("function");
  });
});
