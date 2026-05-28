import { PolicyPack } from "@pulumi/policy";

import {
  deployGov1RequireProtectedEnvironment,
  deployGov2NoLongLivedAwsSecrets,
  deployGov3NoUnapprovedSelfHostedRunners,
  deployGov4PrivilegedWorkflowsRequireOidc,
  hulumiDeploymentGovernancePackMetadata,
} from "../deployment-governance-pack";

export const HulumiDeploymentGovernancePack = new PolicyPack(
  hulumiDeploymentGovernancePackMetadata.id,
  {
    policies: [
      deployGov1RequireProtectedEnvironment,
      deployGov2NoLongLivedAwsSecrets,
      deployGov3NoUnapprovedSelfHostedRunners,
      deployGov4PrivilegedWorkflowsRequireOidc,
    ],
  },
);
