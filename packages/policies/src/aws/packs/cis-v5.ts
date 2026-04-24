// Entrypoint for CisV5Pack (M2 bucket stub). Only one PolicyPack
// constructor may run per process; a Pulumi project's PulumiPolicy.yaml
// points at either this file OR the hulumi-hardening one — never both in
// the same preview.

import { PolicyPack } from "@pulumi/policy";

import { cisV5PackMetadata, cisAwsV5_2_1_1_ssePresent } from "../cis-v5-bucket";

export const CisV5Pack = new PolicyPack(cisV5PackMetadata.id, {
  policies: [cisAwsV5_2_1_1_ssePresent],
});
