import { PolicyPack } from "@pulumi/policy";

import {
  hulumiEksClusterPackMetadata,
  eksCl1NoBroadPublicEndpoint,
  eksCl2AuditLoggingRequired,
  eksFnd1AuditLoggingRequired,
  eksFnd2LaunchTemplateImdsV2Required,
} from "../eks-cluster-pack";

export const HulumiEksClusterPack = new PolicyPack(hulumiEksClusterPackMetadata.id, {
  policies: [
    eksCl1NoBroadPublicEndpoint,
    eksCl2AuditLoggingRequired,
    eksFnd1AuditLoggingRequired,
    eksFnd2LaunchTemplateImdsV2Required,
  ],
});
