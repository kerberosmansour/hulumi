import { PolicyPack } from "@pulumi/policy";

import {
  hulumiEksClusterPackMetadata,
  eksCl1NoBroadPublicEndpoint,
  eksCl2AuditLoggingRequired,
} from "../eks-cluster-pack";

export const HulumiEksClusterPack = new PolicyPack(hulumiEksClusterPackMetadata.id, {
  policies: [eksCl1NoBroadPublicEndpoint, eksCl2AuditLoggingRequired],
});
