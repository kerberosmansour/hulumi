import { PolicyPack } from "@pulumi/policy";

import {
  hulumiOperationsHardeningPackMetadata,
  oPatch1RestrictPatchGroupTag,
  oAudit1CloudTrailPosture,
  oAudit2CloudTrailLogGroupEncrypted,
  oInspector1FullCoverage,
} from "../operations-hardening-pack";

export const HulumiOperationsHardeningPack = new PolicyPack(
  hulumiOperationsHardeningPackMetadata.id,
  {
    policies: [
      oPatch1RestrictPatchGroupTag,
      oAudit1CloudTrailPosture,
      oAudit2CloudTrailLogGroupEncrypted,
      oInspector1FullCoverage,
    ],
  },
);
