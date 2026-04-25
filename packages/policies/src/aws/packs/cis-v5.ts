// Entrypoint for CisV5Pack (M2 bucket stub). Only one PolicyPack
// constructor may run per process; a Pulumi project's PulumiPolicy.yaml
// points at either this file OR the hulumi-hardening one — never both in
// the same preview.

import { PolicyPack } from "@pulumi/policy";

import {
  cisV5PackMetadata,
  cisV5Section1Iam,
  cisV5Section2Storage,
  cisV5Section3Logging,
  cisV5Section4StubAdvisory,
  cisV5Section5StubAdvisory,
} from "../cis-v5-pack";

export const CisV5Pack = new PolicyPack(cisV5PackMetadata.id, {
  policies: [
    ...cisV5Section1Iam,
    ...cisV5Section2Storage,
    ...cisV5Section3Logging,
    cisV5Section4StubAdvisory,
    cisV5Section5StubAdvisory,
  ],
});
