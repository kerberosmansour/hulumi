import { PolicyPack } from "@pulumi/policy";

import {
  hulumiK8sRbacPackMetadata,
  k8sRbac1NoWildcardVerbs,
  k8sRbac2NoSecretListWatch,
  k8sRbac3NoClusterAdminBinding,
} from "../rbac-pack";

export const HulumiK8sRbacPack = new PolicyPack(hulumiK8sRbacPackMetadata.id, {
  policies: [k8sRbac1NoWildcardVerbs, k8sRbac2NoSecretListWatch, k8sRbac3NoClusterAdminBinding],
});
