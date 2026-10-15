import { PolicyPack } from "@pulumi/policy";
import {
  codeBuildRunnerPrivileged,
  codeBuildRunnerRoleBoundary,
  codeBuildRunnerNetwork,
  hulumiCodeBuildRunnerPackMetadata,
} from "../codebuild-runner-pack";
export const HulumiCodeBuildRunnerPack = new PolicyPack(hulumiCodeBuildRunnerPackMetadata.id, {
  policies: [codeBuildRunnerPrivileged, codeBuildRunnerRoleBoundary, codeBuildRunnerNetwork],
});
