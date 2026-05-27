# Provider Boundary Testing

Regression strategy for provider-boundary contract enforcement.

## Required test coverage

- Unit tests for boundary adapters and casing normalization.
- Invariant tests for IAM JSON casing (`Version`/`Statement` preserved).
- Component tests asserting hardened sibling resources for SecureBucket.
- Policy-pack tests rejecting non-compliant resource graphs.

## Suggested command sequence

1. `pnpm run lint`
2. `pnpm run typecheck`
3. `pnpm run test`
4. `pulumi preview` for representative migration stacks

## Anti-regression checks

- Reject `snake_case` in Pulumi TypeScript resource input objects.
- Reject lowercase IAM policy root keys (`version`, `statement`).
- Reject raw or unhardened S3 patterns via policy-pack checks unless explicitly grandfathered in migration tests.
