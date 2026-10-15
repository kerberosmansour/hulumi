// BDD scenarios for G_OIDC_2 / HULUMI-H4 — cluster-scoped EKS admin or
// AWS AdministratorAccess bound to a GitHub-OIDC-trusted IAM role.

import { describe, it, expect, beforeEach } from "vitest";
import type { PolicyResource, StackValidationArgs } from "@pulumi/policy";

import {
  G_OIDC_2,
  h4NoClusterAdminViaGithubOidc,
  hulumiHardeningPackGithubMetadata,
} from "../../src/github";
import { containsAdministratorAccessArn } from "../../src/aws/iam-policy";

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

const FULL_ADMIN_POLICY = JSON.stringify({
  Version: "2012-10-17",
  Statement: { Effect: "Allow", Action: "*", Resource: "*" },
});

const NONCOMMERCIAL_AWS_PARTITIONS = ["aws-us-gov", "aws-cn"] as const;

function administratorAccessArn(partition: string): string {
  return `arn:${partition}:iam::aws:policy/AdministratorAccess`;
}

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

  it("recognizes the exact AWS managed AdministratorAccess ARN in every documented partition", () => {
    for (const partition of ["aws", ...NONCOMMERCIAL_AWS_PARTITIONS]) {
      expect(containsAdministratorAccessArn(administratorAccessArn(partition))).toBe(true);
      expect(
        containsAdministratorAccessArn([
          "arn:aws:iam::aws:policy/ReadOnlyAccess",
          administratorAccessArn(partition),
        ]),
      ).toBe(true);
    }
  });

  it("does not broaden exact AdministratorAccess ARN matching", () => {
    for (const value of [
      "arn:aws-iso:iam::aws:policy/AdministratorAccess",
      "arn:aws:iam::111122223333:policy/AdministratorAccess",
      "arn:aws:iam::aws:policy/AdministratorAccessExtra",
      "prefix:arn:aws:iam::aws:policy/AdministratorAccess",
      " arn:aws:iam::aws:policy/AdministratorAccess",
      "arn:aws:iam::aws:policy/administratoraccess",
      "arn:aws:iam::aws:policy/ReadOnlyAccess",
      42,
      null,
    ]) {
      expect(containsAdministratorAccessArn(value)).toBe(false);
    }
    expect(containsAdministratorAccessArn([42, null, "not-an-arn"])).toBe(false);
  });

  it.each(NONCOMMERCIAL_AWS_PARTITIONS)(
    "flags %s AdministratorAccess through every supported managed-policy attachment shape",
    (partition) => {
      const policyArn = administratorAccessArn(partition);
      const directRole = res({
        ...ghRole,
        props: { ...ghRole.props, managedPolicyArns: [policyArn] },
      });
      const roleAttachment = res({
        type: "aws:iam/rolePolicyAttachment:RolePolicyAttachment",
        urn: `urn:pulumi:s::p::aws:iam/rolePolicyAttachment:RolePolicyAttachment::${partition}`,
        props: { policyArn },
        propertyDependencies: { role: [ghRole] },
      });
      const exclusive = res({
        type: "aws:iam/rolePolicyAttachmentsExclusive:RolePolicyAttachmentsExclusive",
        urn: `urn:pulumi:s::p::aws:iam/rolePolicyAttachmentsExclusive:RolePolicyAttachmentsExclusive::${partition}`,
        props: { roleName: "gh-deploy", policyArns: [policyArn] },
      });
      const generic = res({
        type: "aws:iam/policyAttachment:PolicyAttachment",
        urn: `urn:pulumi:s::p::aws:iam/policyAttachment:PolicyAttachment::${partition}`,
        props: { roles: ["gh-deploy"], policyArn },
      });

      expect(run(makeStackArgs([directRole]))).toHaveLength(1);
      for (const attachment of [roleAttachment, exclusive, generic]) {
        expect(run(makeStackArgs([ghRole, attachment]))).toHaveLength(1);
      }
    },
  );

  it("classifies a GitHub OIDC role whose trust policy has a singleton Statement", () => {
    const singletonRole = res({
      ...ghRole,
      urn: "urn:pulumi:s::p::aws:iam/role:Role::singleton-gh-deploy",
      name: "singleton-gh-deploy",
      props: {
        ...ghRole.props,
        name: "singleton-gh-deploy",
        arn: "arn:aws:iam::1:role/singleton-gh-deploy",
        assumeRolePolicy: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: {
              Federated: "arn:aws:iam::1:oidc-provider/token.actions.githubusercontent.com",
            },
            Action: "sts:AssumeRoleWithWebIdentity",
          },
        }),
      },
    });
    const attach = res({
      type: "aws:iam/rolePolicyAttachment:RolePolicyAttachment",
      urn: "urn:pulumi:s::p::aws:iam/rolePolicyAttachment:RolePolicyAttachment::singleton-admin",
      props: { policyArn: "arn:aws:iam::aws:policy/AdministratorAccess" },
      propertyDependencies: { role: [singletonRole] },
    });
    expect(run(makeStackArgs([singletonRole, attach]))).toHaveLength(1);
  });

  it("flags AdministratorAccess in a GitHub OIDC role managedPolicyArns property", () => {
    const role = res({
      ...ghRole,
      props: {
        ...ghRole.props,
        managedPolicyArns: ["arn:aws:iam::aws:policy/AdministratorAccess"],
      },
    });
    expect(run(makeStackArgs([role]))).toHaveLength(1);
  });

  it("flags a full-admin GitHub OIDC role inlinePolicies document", () => {
    const role = res({
      ...ghRole,
      props: { ...ghRole.props, inlinePolicies: [{ name: "admin", policy: FULL_ADMIN_POLICY }] },
    });
    expect(run(makeStackArgs([role]))).toHaveLength(1);
  });

  it("flags a full-admin RolePolicy linked to a GitHub OIDC role", () => {
    const inline = res({
      type: "aws:iam/rolePolicy:RolePolicy",
      urn: "urn:pulumi:s::p::aws:iam/rolePolicy:RolePolicy::admin-inline",
      props: { policy: FULL_ADMIN_POLICY },
      propertyDependencies: { role: [ghRole] },
    });
    expect(run(makeStackArgs([ghRole, inline]))).toHaveLength(1);
  });

  it("flags AdministratorAccess through RolePolicyAttachmentsExclusive", () => {
    const exclusive = res({
      type: "aws:iam/rolePolicyAttachmentsExclusive:RolePolicyAttachmentsExclusive",
      urn: "urn:pulumi:s::p::aws:iam/rolePolicyAttachmentsExclusive:RolePolicyAttachmentsExclusive::admin",
      props: {
        roleName: "gh-deploy",
        policyArns: ["arn:aws:iam::aws:policy/AdministratorAccess"],
      },
    });
    expect(run(makeStackArgs([ghRole, exclusive]))).toHaveLength(1);
  });

  it("flags AdministratorAccess through generic PolicyAttachment roles", () => {
    const generic = res({
      type: "aws:iam/policyAttachment:PolicyAttachment",
      urn: "urn:pulumi:s::p::aws:iam/policyAttachment:PolicyAttachment::admin",
      props: {
        roles: ["gh-deploy"],
        policyArn: "arn:aws:iam::aws:policy/AdministratorAccess",
      },
    });
    expect(run(makeStackArgs([ghRole, generic]))).toHaveLength(1);
  });

  it("flags an attached customer-managed exact full-admin equivalent", () => {
    const policy = res({
      type: "aws:iam/policy:Policy",
      urn: "urn:pulumi:s::p::aws:iam/policy:Policy::customer-admin",
      name: "customer-admin",
      props: {
        arn: "arn:aws:iam::1:policy/customer-admin",
        policy: FULL_ADMIN_POLICY,
      },
    });
    const attach = res({
      type: "aws:iam/rolePolicyAttachment:RolePolicyAttachment",
      urn: "urn:pulumi:s::p::aws:iam/rolePolicyAttachment:RolePolicyAttachment::customer-admin",
      props: { policyArn: "arn:aws:iam::1:policy/customer-admin" },
      propertyDependencies: { role: [ghRole], policyArn: [policy] },
    });
    expect(run(makeStackArgs([ghRole, policy, attach]))).toHaveLength(1);
  });

  it("flags a customer-managed full-admin policy in role managedPolicyArns dependencies", () => {
    const policy = res({
      type: "aws:iam/policy:Policy",
      urn: "urn:pulumi:s::p::aws:iam/policy:Policy::direct-customer-admin",
      props: { arn: "arn:aws:iam::1:policy/direct-customer-admin", policy: FULL_ADMIN_POLICY },
    });
    const role = res({
      ...ghRole,
      props: {
        ...ghRole.props,
        managedPolicyArns: ["arn:aws:iam::1:policy/direct-customer-admin"],
      },
      propertyDependencies: { managedPolicyArns: [policy] },
    });
    expect(run(makeStackArgs([policy, role]))).toHaveLength(1);
  });

  it("rejects Allow + NotAction in a GitHub OIDC role inline policy", () => {
    const role = res({
      ...ghRole,
      props: {
        ...ghRole.props,
        inlinePolicies: [
          {
            name: "near-admin",
            policy: JSON.stringify({
              Statement: { Effect: "Allow", NotAction: "iam:DeleteRole", Resource: "*" },
            }),
          },
        ],
      },
    });

    const result = run(makeStackArgs([role]));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatch(/effective administrator|complement/i);
  });

  it("rejects Allow + NotResource in a linked RolePolicy", () => {
    const inline = res({
      type: "aws:iam/rolePolicy:RolePolicy",
      urn: "urn:pulumi:s::p::aws:iam/rolePolicy:RolePolicy::not-resource",
      props: {
        policy: JSON.stringify({
          Statement: {
            Effect: "Allow",
            Action: "*",
            NotResource: "arn:aws:s3:::break-glass-evidence/*",
          },
        }),
      },
      propertyDependencies: { role: [ghRole] },
    });

    expect(run(makeStackArgs([ghRole, inline]))).toEqual([
      expect.stringMatching(/effective administrator|complement/i),
    ]);
  });

  it("rejects a customer-managed complement policy through every supported attachment path", () => {
    const policyArn = "arn:aws:iam::1:policy/near-admin";
    const policy = res({
      type: "aws:iam/policy:Policy",
      urn: "urn:pulumi:s::p::aws:iam/policy:Policy::near-admin",
      props: {
        arn: policyArn,
        policy: JSON.stringify({
          Statement: { Effect: "Allow", NotAction: ["iam:DeleteRole"], Resource: "*" },
        }),
      },
    });
    const directRole = res({
      ...ghRole,
      props: { ...ghRole.props, managedPolicyArns: [policyArn] },
      propertyDependencies: { managedPolicyArns: [policy] },
    });
    const attachments = [
      res({
        type: "aws:iam/rolePolicyAttachment:RolePolicyAttachment",
        urn: "urn:pulumi:s::p::aws:iam/rolePolicyAttachment:RolePolicyAttachment::near-admin",
        props: { policyArn },
        propertyDependencies: { role: [ghRole], policyArn: [policy] },
      }),
      res({
        type: "aws:iam/rolePolicyAttachmentsExclusive:RolePolicyAttachmentsExclusive",
        urn: "urn:pulumi:s::p::aws:iam/rolePolicyAttachmentsExclusive:RolePolicyAttachmentsExclusive::near-admin",
        props: { roleName: "gh-deploy", policyArns: [policyArn] },
        propertyDependencies: { policyArns: [policy] },
      }),
      res({
        type: "aws:iam/policyAttachment:PolicyAttachment",
        urn: "urn:pulumi:s::p::aws:iam/policyAttachment:PolicyAttachment::near-admin",
        props: { roles: ["gh-deploy"], policyArn },
        propertyDependencies: { policyArn: [policy] },
      }),
    ];

    expect(run(makeStackArgs([policy, directRole]))).toHaveLength(1);
    for (const attachment of attachments) {
      expect(run(makeStackArgs([ghRole, policy, attachment]))).toHaveLength(1);
    }
  });

  it.each([
    { NotAction: [] },
    { Action: "*", NotResource: null },
    { NotAction: ["iam:DeleteRole"], NotResource: ["arn:aws:s3:::exception/*"] },
  ])("fails closed on allow-side complement presence: %j", (complement) => {
    const statement =
      "NotResource" in complement
        ? { Effect: "Allow", ...complement }
        : { Effect: "Allow", ...complement, Resource: "*" };
    const role = res({
      ...ghRole,
      props: {
        ...ghRole.props,
        inlinePolicies: [
          {
            name: "ambiguous-complement",
            policy: JSON.stringify({
              Statement: statement,
            }),
          },
        ],
      },
    });

    expect(run(makeStackArgs([role]))).toHaveLength(1);
  });

  it("does not treat deny-side complement operators as a permission grant", () => {
    const role = res({
      ...ghRole,
      props: {
        ...ghRole.props,
        inlinePolicies: [
          {
            name: "deny-guardrail",
            policy: JSON.stringify({
              Statement: [
                { Effect: "Deny", NotAction: "s3:GetObject", Resource: "*" },
                { Effect: "Deny", Action: "*", NotResource: "arn:aws:s3:::approved/*" },
              ],
            }),
          },
        ],
      },
    });

    expect(run(makeStackArgs([role]))).toHaveLength(0);
  });

  it("does NOT flag a scoped customer-managed policy attached to a GitHub OIDC role", () => {
    const policy = res({
      type: "aws:iam/policy:Policy",
      urn: "urn:pulumi:s::p::aws:iam/policy:Policy::scoped",
      props: {
        arn: "arn:aws:iam::1:policy/scoped",
        policy: JSON.stringify({
          Statement: { Effect: "Allow", Action: "s3:GetObject", Resource: "arn:aws:s3:::bucket/*" },
        }),
      },
    });
    const attach = res({
      type: "aws:iam/rolePolicyAttachment:RolePolicyAttachment",
      urn: "urn:pulumi:s::p::aws:iam/rolePolicyAttachment:RolePolicyAttachment::scoped",
      props: { policyArn: "arn:aws:iam::1:policy/scoped" },
      propertyDependencies: { role: [ghRole], policyArn: [policy] },
    });
    expect(run(makeStackArgs([ghRole, policy, attach]))).toHaveLength(0);
  });

  it("flags AdministratorAccess on a role whose Principal.Federated is an array (GitHub + another) (#170)", () => {
    const arrayFedTrust = JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: {
            Federated: [
              "arn:aws:iam::1:oidc-provider/accounts.google.com",
              "arn:aws:iam::1:oidc-provider/token.actions.githubusercontent.com",
            ],
          },
          Action: "sts:AssumeRoleWithWebIdentity",
        },
      ],
    });
    const arrayFedRole = res({
      type: "aws:iam/role:Role",
      urn: "urn:pulumi:s::p::aws:iam/role:Role::array-fed",
      name: "array-fed",
      props: { assumeRolePolicy: arrayFedTrust, arn: "arn:aws:iam::1:role/array-fed" },
    });
    const attach = res({
      type: "aws:iam/rolePolicyAttachment:RolePolicyAttachment",
      urn: "urn:pulumi:s::p::aws:iam/rolePolicyAttachment:RolePolicyAttachment::admin",
      name: "admin",
      props: { policyArn: "arn:aws:iam::aws:policy/AdministratorAccess" },
      propertyDependencies: { role: [arrayFedRole] },
    });
    violations = run(makeStackArgs([arrayFedRole, attach]));
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
      suppressions: [
        {
          ruleId: "HULUMI-H4",
          reason: "documented break-glass",
          urnScope: "stack",
          expiresAt: "2999-01-01T00:00:00Z",
        },
      ],
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
