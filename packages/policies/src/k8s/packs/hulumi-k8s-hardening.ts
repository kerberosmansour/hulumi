// Entrypoint for HulumiK8sHardeningPack. Importing this module constructs a
// PolicyPack and starts @pulumi/policy's gRPC server — only one such import
// may occur per process. This is the file a Pulumi project's
// PulumiPolicy.yaml points at (main: dist/k8s/packs/hulumi-k8s-hardening.js).

import { PolicyPack } from "@pulumi/policy";

import {
  hulumiK8sHardeningPackMetadata,
  k8sWl1NoPrivilegedContainer,
  k8sWl2NoHostNamespace,
  k8sWl3NoLatestImage,
  k8sWl4ResourcesRequired,
  k8sSvc1PublicLoadBalancerNeedsJustification,
} from "../hulumi-hardening-pack";

export const HulumiK8sHardeningPack = new PolicyPack(hulumiK8sHardeningPackMetadata.id, {
  policies: [
    k8sWl1NoPrivilegedContainer,
    k8sWl2NoHostNamespace,
    k8sWl3NoLatestImage,
    k8sWl4ResourcesRequired,
    k8sSvc1PublicLoadBalancerNeedsJustification,
  ],
});
