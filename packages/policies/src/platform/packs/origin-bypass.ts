import { PolicyPack } from "@pulumi/policy";

import {
  hulumiOriginBypassPackMetadata,
  xOrigin1NoPublicAwsOriginBypass,
} from "../origin-bypass-pack";

export const HulumiOriginBypassPack = new PolicyPack(hulumiOriginBypassPackMetadata.id, {
  policies: [xOrigin1NoPublicAwsOriginBypass],
});
