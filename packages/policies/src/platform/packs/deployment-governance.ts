import { PolicyPack } from "@pulumi/policy";

import {
  deployGov1RequireProtectedEnvironment,
  deployGov2NoLongLivedAwsSecrets,
  hulumiDeploymentGovernancePackMetadata,
} from "../deployment-governance-pack";

export const HulumiDeploymentGovernancePack = new PolicyPack(
  hulumiDeploymentGovernancePackMetadata.id,
  {
    policies: [deployGov1RequireProtectedEnvironment, deployGov2NoLongLivedAwsSecrets],
  },
);
