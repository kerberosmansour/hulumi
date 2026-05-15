import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface IamStatement {
  Sid?: string;
  Effect: string;
  Action: string | string[];
  Resource?: string | string[];
  Condition?: Record<string, unknown>;
}

interface IamPolicy {
  Statement: IamStatement[];
}

const repoRoot = resolve(__dirname, "..", "..");
const policyPath = resolve(repoRoot, "docs", "deployment", "weekly-integration-iam-policy.json");

function readPolicy(): IamPolicy {
  return JSON.parse(readFileSync(policyPath, "utf8")) as IamPolicy;
}

function actions(statement: IamStatement): string[] {
  return Array.isArray(statement.Action) ? statement.Action : [statement.Action];
}

function statementBySid(policy: IamPolicy, sid: string): IamStatement {
  const statement = policy.Statement.find((candidate) => candidate.Sid === sid);
  if (statement === undefined) throw new Error(`missing IAM statement ${sid}`);
  return statement;
}

describe("Feature: weekly integration IAM policy least privilege", () => {
  it("does not allow persistent role privilege-escalation lifecycle actions", () => {
    const policy = readPolicy();
    const lifecycle = statementBySid(policy, "ConfigRecorderRoleLifecycle");

    expect(actions(lifecycle)).toContain("iam:CreateRole");
    expect(actions(lifecycle)).not.toContain("iam:PutRolePolicy");
    expect(actions(lifecycle)).not.toContain("iam:DeleteRolePolicy");
    expect(actions(lifecycle)).not.toContain("iam:UpdateAssumeRolePolicy");
  });

  it("constrains managed policy attachment to AWS_ConfigRole only", () => {
    const policy = readPolicy();
    const attachment = statementBySid(policy, "ConfigRecorderManagedPolicyAttachment");

    expect(actions(attachment).sort()).toEqual(["iam:AttachRolePolicy", "iam:DetachRolePolicy"]);
    expect(attachment.Condition).toEqual({
      StringEquals: {
        "iam:PolicyARN": "arn:aws:iam::aws:policy/service-role/AWS_ConfigRole",
      },
    });
  });

  it("constrains PassRole to AWS Config", () => {
    const policy = readPolicy();
    const passRole = statementBySid(policy, "ConfigRecorderPassRole");

    expect(actions(passRole)).toEqual(["iam:PassRole"]);
    expect(passRole.Condition).toEqual({
      StringEquals: {
        "iam:PassedToService": "config.amazonaws.com",
      },
    });
  });
});
