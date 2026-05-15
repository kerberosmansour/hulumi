import * as pulumi from "@pulumi/pulumi";
import * as github from "@pulumi/github";
import { github as hulumiGithub } from "@hulumi/baseline";

import type {
  DeploymentEnvironmentConfig,
  DeploymentRepositoryFoundationArgs,
} from "./deployment-repository-foundation.args";
import type { DeploymentRepositoryFoundationOutputs } from "./deployment-repository-foundation.outputs";
import { assertValidTier } from "./tier";

export const DEPLOYMENT_REPOSITORY_FOUNDATION_COMPONENT_TYPE =
  "hulumi:platform:DeploymentRepositoryFoundation";

function hasReviewers(env: DeploymentEnvironmentConfig): boolean {
  return (
    (env.requiredReviewerUserIds ?? []).length > 0 || (env.requiredReviewerTeamIds ?? []).length > 0
  );
}

function validateEnvironment(env: DeploymentEnvironmentConfig): void {
  if (env.name === "prod") {
    if (!hasReviewers(env)) {
      throw new Error("DeploymentRepositoryFoundation: prod environment requires reviewers");
    }
    if (!env.protectedBranches && !env.customBranchPolicies) {
      throw new Error("DeploymentRepositoryFoundation: prod environment requires branch policy");
    }
  }
}

function reviewers(
  env: DeploymentEnvironmentConfig,
): github.types.input.RepositoryEnvironmentReviewer[] | undefined {
  if (!hasReviewers(env)) return undefined;
  return [
    {
      ...(env.requiredReviewerUserIds !== undefined
        ? { users: [...env.requiredReviewerUserIds] }
        : {}),
      ...(env.requiredReviewerTeamIds !== undefined
        ? { teams: [...env.requiredReviewerTeamIds] }
        : {}),
    },
  ];
}

export class DeploymentRepositoryFoundation
  extends pulumi.ComponentResource
  implements DeploymentRepositoryFoundationOutputs
{
  public readonly repoFullName: pulumi.Output<string>;
  public readonly environmentNames: pulumi.Output<string[]>;
  public readonly secretReferences: pulumi.Output<Record<string, string[]>>;
  public readonly provenanceEnabled: pulumi.Output<boolean>;

  constructor(
    name: string,
    args: DeploymentRepositoryFoundationArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super(DEPLOYMENT_REPOSITORY_FOUNDATION_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    assertValidTier(args.tier);

    const environments = args.environments ?? [];
    for (const env of environments) validateEnvironment(env);

    const secureRepository = new hulumiGithub.SecureRepository(
      args.name,
      {
        tier: args.tier,
        visibility: args.visibility ?? "private",
        description: `Deployment repository managed by Hulumi for ${args.owner}`,
      },
      { parent: this },
    );

    const secretReferences: Record<string, string[]> = {};
    for (const env of environments) {
      const envReviewers = reviewers(env);
      const envArgs: github.RepositoryEnvironmentArgs = {
        repository: secureRepository.repository.name,
        environment: env.name,
        deploymentBranchPolicy: {
          protectedBranches: env.protectedBranches,
          customBranchPolicies: env.customBranchPolicies,
        },
        ...(hasReviewers(env) ? { preventSelfReview: true } : {}),
        ...(envReviewers !== undefined ? { reviewers: envReviewers } : {}),
      };
      const repositoryEnvironment = new github.RepositoryEnvironment(
        `${name}-${env.name}-environment`,
        envArgs,
        { parent: this },
      );

      for (const [variableName, value] of Object.entries(env.variables ?? {})) {
        new github.ActionsEnvironmentVariable(
          `${name}-${env.name}-${variableName.toLowerCase().replace(/_/g, "-")}`,
          {
            repository: secureRepository.repository.name,
            environment: repositoryEnvironment.environment,
            variableName,
            value,
          },
          { parent: this },
        );
      }
      if ((env.secretReferences ?? []).length > 0) {
        secretReferences[env.name] = [...(env.secretReferences ?? [])];
      }
    }

    this.repoFullName = secureRepository.repoFullName;
    this.environmentNames = pulumi.output(environments.map((env) => env.name));
    this.secretReferences = pulumi.output(secretReferences);
    this.provenanceEnabled = pulumi.output(args.provenance ?? false);

    this.registerOutputs({
      repoFullName: this.repoFullName,
      environmentNames: this.environmentNames,
      secretReferences: this.secretReferences,
      provenanceEnabled: this.provenanceEnabled,
    });
  }
}
