import type * as pulumi from "@pulumi/pulumi";
import type * as aws from "@pulumi/aws";

export interface SecureBucketOutputs {
  bucket: aws.s3.BucketV2;
  bucketPolicy: aws.s3.BucketPolicy;
  arn: pulumi.Output<string>;
  bucketDomainName: pulumi.Output<string>;
  logBucketArn: pulumi.Output<string | undefined>;
  kmsKeyArn: pulumi.Output<string | undefined>;
}
