// Entry point for HulumiGithubHardeningPack. Importing this module
// constructs a PolicyPack and starts @pulumi/policy's gRPC server (one
// pack per process per @pulumi/policy contract). A Pulumi project's
// PulumiPolicy.yaml points at this file's compiled JS:
//   main: dist/github/packs/hulumi-hardening.js

import { PolicyPack } from "@pulumi/policy";

import {
  h1NoRawGithubRepository,
  h2NoWildcardOidcTemplate,
  h3NoWildcardTrustPolicy,
  hulumiHardeningPackGithubMetadata,
} from "../hulumi-hardening-pack.rules";

export const HulumiGithubHardeningPack = new PolicyPack(
  hulumiHardeningPackGithubMetadata.id,
  {
    policies: [
      h1NoRawGithubRepository,
      h2NoWildcardOidcTemplate,
      h3NoWildcardTrustPolicy,
    ],
  },
);
