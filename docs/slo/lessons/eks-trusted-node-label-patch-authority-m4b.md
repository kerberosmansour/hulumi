---
filed_issues: []
---

# Lessons Learned — EKS trusted-node label patch authority M4b

## What changed

- Kubernetes read and mutation authority are now separate. The projected
  ServiceAccount token can only get/list Nodes; one EKS IAM identity can patch.
- The Pod Identity role is mapped through one STANDARD AccessEntry to an exact
  group and username prefix, and admission requires both before applying the
  existing exact add/remove/no-piggyback rules.
- The runtime signs a fresh 60-second regional STS GetCallerIdentity token per
  PATCH with temporary credentials obtained only through the exact EKS Pod
  Identity endpoint and token-file contract.
- Two already-transitive AWS/Smithy packages became protected direct imports
  after the script-disabled OSV/provenance/integrity admission gate passed.

## Results vs thesis

- N/A — M4b is a security correction to an existing capability, not a new
  value-bearing milestone.
- The proposed authority split was implementable without changing public
  component inputs/outputs, the patch format, package versions, release
  workflows or the resolved package graph.

## Outcome vs promise

- N/A — no new product outcome was promised.
- The security promise is proven locally: focused production-path tests show the
  old ServiceAccount token absent from PATCH, a deterministic EKS IAM token on
  PATCH, and exact group plus username admission. The full workspace regression
  preserves adjacent components.

## Design decisions and why

- Use an EKS AccessEntry and Kubernetes group binding instead of `aws-auth` or a
  broad EKS access policy — it gives one exact IAM role only the required Node
  `patch` verb and has a first-class Pulumi resource lifecycle.
- Keep the projected token for reads — this removes mutation authority from the
  reusable bearer while preserving the standard in-cluster read path.
- Import `fromHttp` and `SignatureV4` directly — the default credential chain
  would admit static environment, profile, IMDS or web-identity identities that
  are outside the component contract.
- Require exact Pod Identity environment values and pass empty relative URI and
  inline-token options — this closes the provider's documented ambient fallback
  paths and any attacker-controlled credential host.
- Re-sign per PATCH and reject tokens over 4 KiB — no long-lived IAM bearer is
  cached and malformed provider output never reaches transport.
- Retain the same-ServiceAccount Pod case as an explicit operator residual — a
  component cannot prevent a separately authorized Kubernetes actor from
  creating a Pod with that identity.

## Mistakes made

- The first implementation used a control-character regular expression that
  violated the repository lint policy and relied on the URL global in a Node
  test. The first lint run caught both; a code-point check and explicit
  `node:url` import fixed them before verification.
- The canonical runbook edit initially failed repository formatting. Prettier
  corrected the one allow-listed file, and the repository-wide format gate was
  rerun successfully.

## Root causes

- The security bounds were correct, but the first expression did not account for
  the repository's `no-control-regex` rule.
- Vitest provides Node globals at runtime, while ESLint intentionally requires
  explicit imports for globals outside its configured set.
- Markdown table columns were hand-edited before the final formatting pass.

## What was harder than expected

- A safe use of `@aws-sdk/credential-provider-http` required reading its fallback
  precedence, not merely supplying the desired full URI. The implementation had
  to validate the injected environment and explicitly neutralize relative URI
  and inline authorization-token inputs.
- The token vector needed an independent canonical-query/signature calculation
  so a test could catch a self-consistent but incompatible signer setup.
- The authority boundary spans IAM trust, EKS authentication, Kubernetes RBAC,
  CEL admission and the HTTP adapter; no single-layer assertion was sufficient.

## Naming conventions established

- `patchTokenProvider` identifies the per-request IAM authentication boundary.
- `hulumi:trusted-node-label:<component>` is the exact AccessEntry group.
- `hulumi:trusted-node-label:<component>:` is the immutable username prefix,
  followed by `{{SessionName}}` for audit correlation.
- `kubernetes_iam_auth_unavailable` is the stable redacted signer/provider
  failure code.

## Test patterns that worked well

- Write Pulumi mock assertions for trust policy, AccessEntry, both RBAC subjects
  and admission in one cross-resource test.
- Use a fixed independent SigV4 golden URL and signature to prove regional STS,
  cluster-header signing, query keys and expiry.
- Observe Authorization headers at a real local TLS receiver so the test proves
  projected-token reads and IAM-token PATCH across the transport boundary.
- Inject missing, foreign and ambient credential-provider inputs and assert the
  provider and transport are never called.

## Missing tests that should exist now

- No additional local test is required for M4b. Live AccessEntry propagation,
  Pod Identity Agent injection and denial of another Pod using the same
  ServiceAccount require the isolated M3 EKS environment and operator controls.

## Rules for the next milestone

- Treat the controller image and Pulumi component revision as one release unit;
  verify their source digest relationship before live qualification.
- Verify cluster authentication mode and Pod Identity Agent readiness before
  creating M3 resources; do not add an `aws-auth` fallback.
- Prove with Kubernetes impersonation or audit evidence that the ServiceAccount
  cannot patch and the mapped IAM identity can perform only the exact mutation.
- Exercise the AccessEntry propagation window, rolling replacement, revocation
  and scale-from-zero journeys before any operational/publication claim.
- Retain script-disabled candidate resolution plus pinned OSV/MAL and provenance
  review for every image or dependency admitted by M3.

## Template improvements suggested

- Cloud identity milestones should include an explicit provider-fallback matrix
  in the secure-construction preflight. Supplying an exact endpoint is not proof
  that a credential provider cannot consult its other environment inputs.
- Cross-cloud authentication milestones benefit from a required independent
  protocol vector row alongside runtime mocks.
