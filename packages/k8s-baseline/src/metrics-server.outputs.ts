import type * as pulumi from "@pulumi/pulumi";
import type * as k8s from "@pulumi/kubernetes";

export interface MetricsServerOutputs {
  releaseName: pulumi.Output<string>;
  namespace: pulumi.Output<string>;
  chartVersion: pulumi.Output<string>;
  apiServiceName: pulumi.Output<"v1beta1.metrics.k8s.io">;
  insecureKubeletTlsReason: pulumi.Output<string | undefined>;
  insecureApiServiceTlsReason: pulumi.Output<string | undefined>;
  status: pulumi.Output<k8s.types.output.helm.v3.ReleaseStatus>;
}
