import type * as pulumi from "@pulumi/pulumi";
import type * as aws from "@pulumi/aws";

import type { PulumiStateBackendDrPosture } from "./pulumi-state-backend-foundation.args";

export interface PulumiStateBackendFoundationOutputs {
  readonly bucket: aws.s3.Bucket;
  readonly kmsKey: aws.kms.Key;
  readonly kmsAlias: aws.kms.Alias;
  readonly leaseTable?: aws.dynamodb.Table;
  readonly bucketName: pulumi.Output<string>;
  readonly bucketArn: pulumi.Output<string>;
  readonly kmsKeyArn: pulumi.Output<string>;
  readonly kmsAliasName: pulumi.Output<string>;
  readonly backendUrl: pulumi.Output<string>;
  readonly secretsProviderHint: pulumi.Output<string>;
  readonly leaseTableName: pulumi.Output<string | undefined>;
  readonly drPosture: pulumi.Output<PulumiStateBackendDrPosture>;
  readonly caveats: pulumi.Output<readonly string[]>;
}
