import { PolicyPack } from "@pulumi/policy";

import {
  hulumiAwsOrgHardeningPackMetadata,
  org1DelegatedAdminsRequired,
  org2RoleSeparationRequired,
  org3ApprovedScpSetRequired,
  org4AccountPublicAccessBlockRequired,
  org5AccountPublicAccessBlockPresent,
  org6SandboxScpAdvisory,
} from "../hulumi-aws-org-hardening-pack";

export const HulumiAwsOrgHardeningPack = new PolicyPack(hulumiAwsOrgHardeningPackMetadata.id, {
  policies: [
    org1DelegatedAdminsRequired,
    org2RoleSeparationRequired,
    org3ApprovedScpSetRequired,
    org4AccountPublicAccessBlockRequired,
    org5AccountPublicAccessBlockPresent,
    org6SandboxScpAdvisory,
  ],
});
