import type * as pulumi from "@pulumi/pulumi";
import type {
  EksClusterEndpointMode,
  EksClusterValidationExpectations,
} from "./eks-cluster-foundation.args";

export interface EksClusterFoundationOutputs {
  readonly clusterName: pulumi.Output<string>;
  readonly ownedClusterResources: pulumi.Output<boolean>;
  readonly endpointMode: pulumi.Output<EksClusterEndpointMode>;
  readonly validationExpectations: pulumi.Output<EksClusterValidationExpectations>;
  readonly addonNames: pulumi.Output<string[]>;
  readonly nodePoolNames: pulumi.Output<string[]>;
}
