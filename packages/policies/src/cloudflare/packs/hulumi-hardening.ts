import { PolicyPack } from "@pulumi/policy";

import {
  cfDns1NoDnsOnlyPublicAppRecord,
  cfDnssec1RequirePublicZoneDnssec,
  cfOrigin1RequireSecureOriginMode,
  hulumiCloudflareHardeningPackMetadata,
} from "../hulumi-hardening-pack";

export const HulumiCloudflareHardeningPack = new PolicyPack(
  hulumiCloudflareHardeningPackMetadata.id,
  {
    policies: [
      cfDns1NoDnsOnlyPublicAppRecord,
      cfDnssec1RequirePublicZoneDnssec,
      cfOrigin1RequireSecureOriginMode,
    ],
  },
);
