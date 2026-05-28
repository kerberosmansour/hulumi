import { SecurityDetectionFoundation } from "@hulumi/baseline/aws";

export const detection = new SecurityDetectionFoundation("security-detection-smoke", {
  tier: "startup-hardened",
  trailLogGroupName: "/aws/cloudtrail/hulumi-smoke",
  criticalTopicArn: "arn:aws:sns:us-east-1:111122223333:hulumi-alerts-critical",
  highTopicArn: "arn:aws:sns:us-east-1:111122223333:hulumi-alerts-high",
  mediumTopicArn: "arn:aws:sns:us-east-1:111122223333:hulumi-alerts-medium",
});

export const enabledFamilies = detection.enabledFamilies;
export const validatorChecks = detection.validatorChecks;
