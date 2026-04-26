import type * as pulumi from "@pulumi/pulumi";
import type * as k8s from "@pulumi/kubernetes";

export interface HardenedHelmReleaseOutputs {
  releaseName: pulumi.Output<string>;
  namespace: pulumi.Output<string>;
  status: pulumi.Output<k8s.types.output.helm.v3.ReleaseStatus>;
  /** Echo of the input version — useful for `dependsOn` chains and version-skew assertions. */
  chartVersion: pulumi.Output<string>;
}
