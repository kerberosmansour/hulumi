# Lessons — GitHub App token scope integrity M1

Date: 2026-10-15

1. A configuration validated by an IaC component is not enforced unless every runtime helper is bound to the same value. The IaC-owned digest tag makes that relationship explicit and independently checkable.
2. An API omission can be an authority expansion. GitHub gives omitted `repositories` or `permissions` the installation or App defaults, so both fields belong in every successful request.
3. A wildcard allowlist should change target eligibility without changing token breadth. Selecting one repository and sending its name keeps each token narrowly scoped.
4. Canonicalization is a protocol. TypeScript and `jq` need the same property order, ASCII-safe input alphabet, sorted repositories, sorted permission keys, compact encoding, and byte limits.
5. Failure order matters. Scope and target checks before PEM materialization and signing turn negative tests into evidence that rejected requests do not touch key material.
6. Secret-safe shell code must consider process arguments as well as logs. `jq --rawfile` avoids copying the PEM into an argv value during payload construction.
7. Security migrations sometimes need a deliberate compatibility break. Preserving the three-argument population default would preserve wildcard repositories and empty permissions.
8. Workspace build scripts that delete output directories must not run concurrently with tests that resolve those outputs. Run broad build and test gates sequentially even when package-local checks can run in parallel.

## M2 — private-key isolation

1. Helper validation cannot constrain a principal that can read the underlying signing key. Authority becomes unavoidable only when the key moves behind a service that performs the policy check itself.
2. A broker needs a narrower credential boundary on both sides: callers receive exact invocation only, while the broker receives exact secret, exact KMS context, and exact log-stream permissions.
3. Pulumi `CallbackFunction` must receive an explicit execution role. Its convenience role path can add broad managed policies that defeat a least-privilege repair.
4. Provider responses are part of the authorization protocol. A narrow request is insufficient unless the broker also verifies returned repository selection, repository identity, permission map, and expiry before releasing the bearer.
5. Failure ordering remains evidence. Target validation before secret retrieval, scope validation before signing, and response validation before returning the token make each negative test prove which sensitive operation did not occur.
6. A useful compatibility alias can preserve the output shape while withdrawing dangerous semantics. `iamReadPolicyArn` now names the invoke-only policy and is explicitly deprecated.
7. Lambda closure serialization is a deployment constraint. Runtime `require` plus an exact `extraIncludePackages` declaration keeps native SDK constructors out of Pulumi's closure walk without adding a dependency.
8. A security boundary should expose a pure injected handler seam. It permits exact failure-order and provider-response tests while the component tests still serialize the real callback artifact.
