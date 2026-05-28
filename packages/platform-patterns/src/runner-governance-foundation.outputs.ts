import type * as pulumi from "@pulumi/pulumi";

import type {
  RunnerGovernanceEnvironmentConfig,
  RunnerGovernancePrivilegedWorkflow,
} from "./runner-governance-foundation.args";

export interface RunnerGovernanceValidatorCheck {
  readonly id: string;
  readonly provider: "github";
  readonly resource: string;
  readonly message: string;
}

export interface RunnerGovernanceSelfHostedRunnerPolicy {
  readonly mode: "deny" | "allow-list";
  readonly approvedLabels: readonly string[];
  readonly runnerPageCap: number;
}

export interface RunnerGovernanceFoundationOutputs {
  readonly repoFullName: pulumi.Output<string>;
  readonly requiredEnvironmentNames: pulumi.Output<string[]>;
  readonly productionEnvironmentNames: pulumi.Output<string[]>;
  readonly approvedSelfHostedRunnerLabels: pulumi.Output<string[]>;
  readonly selfHostedRunnerPolicy: pulumi.Output<RunnerGovernanceSelfHostedRunnerPolicy>;
  readonly privilegedWorkflows: pulumi.Output<RunnerGovernancePrivilegedWorkflow[]>;
  readonly environmentContracts: pulumi.Output<RunnerGovernanceEnvironmentConfig[]>;
  readonly validatorChecks: pulumi.Output<RunnerGovernanceValidatorCheck[]>;
  readonly workflowGovernanceCliArgs: pulumi.Output<string[]>;
}
