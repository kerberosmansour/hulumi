import type * as pulumi from "@pulumi/pulumi";

import type {
  SecurityDetectionAlarmFamily,
  SecurityDetectionFamilyPosture,
} from "./security-detection-foundation.args";

export interface SecurityDetectionFoundationOutputs {
  readonly enabledFamilies: pulumi.Output<SecurityDetectionAlarmFamily[]>;
  readonly disabledAdvisoryFamilies: pulumi.Output<SecurityDetectionAlarmFamily[]>;
  readonly familyPosture: pulumi.Output<
    Record<SecurityDetectionAlarmFamily, SecurityDetectionFamilyPosture>
  >;
  readonly identityAlarmArns: pulumi.Output<string[]>;
  readonly eventRuleArns: pulumi.Output<string[]>;
  readonly validatorChecks: pulumi.Output<string[]>;
  readonly sampleEventFixtureCount: pulumi.Output<number>;
}
