import type * as pulumi from "@pulumi/pulumi";

export interface EksAddonFoundationOutputs {
  /** Add-on names actually deployed (in input order). */
  addonNames: pulumi.Output<string[]>;
  /** Map of add-on name → exact pinned version. */
  pinnedVersions: pulumi.Output<Record<string, string>>;
}
