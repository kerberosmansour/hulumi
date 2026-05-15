import * as pulumi from "@pulumi/pulumi";

import type { BuildProvenanceFoundationArgs } from "./build-provenance-foundation.args";
import type { BuildProvenanceFoundationOutputs } from "./build-provenance-foundation.outputs";
import { assertValidTier } from "./tier";

export const BUILD_PROVENANCE_FOUNDATION_COMPONENT_TYPE =
  "hulumi:platform:BuildProvenanceFoundation";

export class BuildProvenanceFoundation
  extends pulumi.ComponentResource
  implements BuildProvenanceFoundationOutputs
{
  public readonly requiredPermissions: pulumi.Output<Record<string, string>>;
  public readonly reusableWorkflowSnippet: pulumi.Output<string>;
  public readonly caveats: pulumi.Output<string[]>;

  constructor(
    name: string,
    args: BuildProvenanceFoundationArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super(BUILD_PROVENANCE_FOUNDATION_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    assertValidTier(args.tier);

    const requiredPermissions: Record<string, string> = {
      contents: "read",
      idToken: "write",
      attestations: "write",
    };
    this.requiredPermissions = pulumi.output(requiredPermissions);
    this.reusableWorkflowSnippet = pulumi.output(`permissions:
  contents: read
  id-token: write
  attestations: write
steps:
  - uses: actions/attest-build-provenance@<FULL_LENGTH_SHA_PIN>
    with:
      subject-path: ${args.artifactName}`);
    this.caveats = pulumi.output([
      ...(args.privateRepository === true
        ? ["Private repository attestation visibility can be plan-dependent."]
        : []),
    ]);

    this.registerOutputs({
      requiredPermissions: this.requiredPermissions,
      reusableWorkflowSnippet: this.reusableWorkflowSnippet,
      caveats: this.caveats,
    });
  }
}
