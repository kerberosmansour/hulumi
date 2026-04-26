import type * as pulumi from "@pulumi/pulumi";

export interface AppliedTag {
  subnetId: string;
  key: string;
  value: string;
}

export interface EksSubnetTaggerOutputs {
  /** Every tag this component wrote, flattened across all subnets. */
  tagsApplied: pulumi.Output<AppliedTag[]>;
}
