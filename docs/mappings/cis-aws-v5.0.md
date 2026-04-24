# CIS AWS Foundations Benchmark v5.0.0 — recommendation IDs (no verbatim prose)

Source of truth: [CIS Amazon Web Services Benchmarks — benchmark landing](https://www.cisecurity.org/benchmark/amazon_web_services) and [AWS Security Hub CSPM CIS v5.0 announcement (2025-10)](https://aws.amazon.com/about-aws/whats-new/2025/10/aws-security-hub-cspm-cis-foundations-benchmark-v5/). License posture: see [`licensing.md`](./licensing.md). This table cites recommendation numbers and paraphrased short titles; it does not reproduce CIS recommendation text.

| id                   | paraphrased title                  | url                                                      |
| -------------------- | ---------------------------------- | -------------------------------------------------------- |
| CIS-AWS-v5.0.0:1.4   | root account access key absence    | https://www.cisecurity.org/benchmark/amazon_web_services |
| CIS-AWS-v5.0.0:1.5   | MFA on root account                | https://www.cisecurity.org/benchmark/amazon_web_services |
| CIS-AWS-v5.0.0:1.8   | IAM password policy                | https://www.cisecurity.org/benchmark/amazon_web_services |
| CIS-AWS-v5.0.0:1.12  | IAM credentials rotation           | https://www.cisecurity.org/benchmark/amazon_web_services |
| CIS-AWS-v5.0.0:1.15  | IAM user MFA                       | https://www.cisecurity.org/benchmark/amazon_web_services |
| CIS-AWS-v5.0.0:1.22  | IAM policy wildcard scoping        | https://www.cisecurity.org/benchmark/amazon_web_services |
| CIS-AWS-v5.0.0:2.1.1 | S3 SSE at rest                     | https://www.cisecurity.org/benchmark/amazon_web_services |
| CIS-AWS-v5.0.0:2.1.2 | S3 public-access-block at account  | https://www.cisecurity.org/benchmark/amazon_web_services |
| CIS-AWS-v5.0.0:2.1.4 | S3 bucket-owner-enforced ownership | https://www.cisecurity.org/benchmark/amazon_web_services |
| CIS-AWS-v5.0.0:2.1.5 | S3 TLS-only bucket policy          | https://www.cisecurity.org/benchmark/amazon_web_services |
| CIS-AWS-v5.0.0:2.1.6 | S3 versioning on sensitive buckets | https://www.cisecurity.org/benchmark/amazon_web_services |
| CIS-AWS-v5.0.0:2.3.1 | RDS encryption at rest             | https://www.cisecurity.org/benchmark/amazon_web_services |
| CIS-AWS-v5.0.0:3.1   | CloudTrail in all regions          | https://www.cisecurity.org/benchmark/amazon_web_services |
| CIS-AWS-v5.0.0:3.2   | CloudTrail log-file validation     | https://www.cisecurity.org/benchmark/amazon_web_services |
| CIS-AWS-v5.0.0:3.7   | CMKs for encrypted CloudTrail logs | https://www.cisecurity.org/benchmark/amazon_web_services |
| CIS-AWS-v5.0.0:3.8   | KMS CMK rotation                   | https://www.cisecurity.org/benchmark/amazon_web_services |
