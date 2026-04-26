import type * as pulumi from "@pulumi/pulumi";
import type * as github from "@pulumi/github";

export interface SecureRepositoryOutputs {
  repository: github.Repository;
  ruleset: github.RepositoryRuleset;
  repoFullName: pulumi.Output<string>;
  repoNodeId: pulumi.Output<string>;
  defaultBranch: pulumi.Output<string>;
  rulesetId: pulumi.Output<string>;
}
