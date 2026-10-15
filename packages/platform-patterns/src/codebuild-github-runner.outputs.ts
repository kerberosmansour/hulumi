import type * as pulumi from "@pulumi/pulumi";
/** Noncredential outputs; label templates do not enforce AWS label-override limits. */
export interface CodeBuildGitHubRunnerOutputs {
  readonly projectName: pulumi.Output<string>;
  readonly projectArn: pulumi.Output<string>;
  readonly roleArn: pulumi.Output<string>;
  readonly logGroupName: pulumi.Output<string>;
  readonly runnerLabelTemplate: pulumi.Output<string>;
  readonly recommendedLabels: pulumi.Output<string[]>;
}
