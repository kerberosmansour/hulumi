// IAM baseline — account password policy (CIS §1.6/1.8/1.9) and, on
// Startup-Hardened, an account-level IAM Access Analyzer (CIS §1.19).

import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import type { Tier } from "./tier";

export interface IamBaselineArgs {
  tier: Tier;
  parent: pulumi.Resource;
  namePrefix: string;
  tags: Record<string, string>;
}

export interface IamBaselineResult {
  passwordPolicy: aws.iam.AccountPasswordPolicy;
  accessAnalyzer?: aws.accessanalyzer.Analyzer;
}

export function createIamBaseline(args: IamBaselineArgs): IamBaselineResult {
  const parent = { parent: args.parent } as const;

  const passwordPolicy = new aws.iam.AccountPasswordPolicy(
    `${args.namePrefix}-iam-password-policy`,
    {
      minimumPasswordLength: 14,
      requireLowercaseCharacters: true,
      requireUppercaseCharacters: true,
      requireNumbers: true,
      requireSymbols: true,
      passwordReusePrevention: 24,
      maxPasswordAge: 90,
      hardExpiry: false,
      allowUsersToChangePassword: true,
    },
    parent,
  );

  const result: IamBaselineResult = { passwordPolicy };

  if (args.tier === "startup-hardened") {
    result.accessAnalyzer = new aws.accessanalyzer.Analyzer(
      `${args.namePrefix}-access-analyzer`,
      {
        analyzerName: `hulumi-${args.namePrefix}-access-analyzer`,
        type: "ACCOUNT",
        tags: args.tags,
      },
      parent,
    );
  }

  return result;
}
