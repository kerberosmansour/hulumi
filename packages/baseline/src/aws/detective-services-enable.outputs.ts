import type * as pulumi from "@pulumi/pulumi";

export interface DetectiveServicesEnableOutputs {
  /** Names of the AWS detective services actually enabled. */
  servicesEnabled: pulumi.Output<string[]>;
  /** ARNs of emitted EventBridge rules (in declared order). */
  eventBridgeRuleArns: pulumi.Output<string[]>;
  /** True when KEV findings have a dedicated routing topic distinct from the primary topic. */
  kevDualRoutingActive: pulumi.Output<boolean>;
}
