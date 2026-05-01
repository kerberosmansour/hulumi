// Entry point for CisGithubV1Pack. Importing this module constructs a
// PolicyPack and starts @pulumi/policy's gRPC server. Pulumi project
// PulumiPolicy.yaml points at this file's compiled JS:
//   main: dist/github/packs/cis-v1.js
//
// Currently ships a single placeholder advisory rule until WorkBench
// access secures real CIS GitHub Benchmark v1.2.0 section IDs (v1.1 D4).

import { PolicyPack } from "@pulumi/policy";

import { cisGithubPlaceholder, cisGithubV1PackMetadata } from "../cis-v1-pack.rules";

export const CisGithubV1Pack = new PolicyPack(cisGithubV1PackMetadata.id, {
  policies: [cisGithubPlaceholder],
});
