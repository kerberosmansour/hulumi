// Entrypoint for HulumiHardeningPack. Importing this module constructs a
// PolicyPack and starts @pulumi/policy's gRPC server — only one such
// import may occur per process. This is the file a Pulumi project's
// PulumiPolicy.yaml points at (main: dist/aws/packs/hulumi-hardening.js).

import { PolicyPack } from "@pulumi/policy";

import {
  hulumiHardeningPackMetadata,
  h1BlocksRawBucket,
  h2BlocksUnencryptedStateBackend,
  h3AdvisoryIacRoleTag,
  h4StartupHardenedRequiresLogging,
} from "../hulumi-hardening-pack";

export const HulumiHardeningPack = new PolicyPack(hulumiHardeningPackMetadata.id, {
  policies: [
    h1BlocksRawBucket,
    h2BlocksUnencryptedStateBackend,
    h3AdvisoryIacRoleTag,
    h4StartupHardenedRequiresLogging,
  ],
});
