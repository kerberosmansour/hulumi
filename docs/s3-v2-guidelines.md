# S3 Split-Resource Guidelines

The filename uses the project's migration shorthand because V2 token compatibility is still part of the migration story. The current approved implementation target is the non-V2 `@pulumi/aws` S3 class family, with V2 appearing only as legacy Pulumi state aliases.

Approved hardened pattern for new Hulumi S3 components:

1. `aws.s3.Bucket`
2. `aws.s3.BucketPublicAccessBlock` (all booleans `true`)
3. `aws.s3.BucketOwnershipControls` (`BucketOwnerEnforced`)
4. `aws.s3.BucketVersioning` (`Enabled`)
5. `aws.s3.BucketServerSideEncryptionConfiguration` (`aws:kms`, `bucketKeyEnabled: true`)
6. TLS-only `BucketPolicy`

## Forbidden patterns

- New production usage of raw buckets without hardened sibling resources.
- Reintroducing deprecated S3 `*V2` classes as the current implementation target.
- Inline ACL-based hardening logic.
- Unscoped permissive public access settings.

## Migration safety

When modernizing existing components, keep Pulumi aliases for prior type tokens so previews adopt existing resources instead of replacing them. For SecureBucket, new children use the non-V2 tokens while aliases preserve adoption of legacy V2 state.
