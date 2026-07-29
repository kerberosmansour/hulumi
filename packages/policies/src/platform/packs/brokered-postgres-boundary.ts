import { PolicyPack } from "@pulumi/policy";

import {
  brokeredPg1ClosedAuthorityBoundary,
  hulumiBrokeredPostgresBoundaryPackMetadata,
} from "../brokered-postgres-boundary-pack";

export const HulumiBrokeredPostgresBoundaryPack = new PolicyPack(
  hulumiBrokeredPostgresBoundaryPackMetadata.id,
  {
    policies: [brokeredPg1ClosedAuthorityBoundary],
  },
);
