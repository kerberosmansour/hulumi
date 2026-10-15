# Lessons Learned — eks-trusted-node-label-reconciler Milestone 2

## What changed

- Added an exported Pulumi component with dedicated EKS Pod Identity, read-only
  AWS evidence access, minimal Node RBAC, exact-mutation admission, a restricted
  one-replica Deployment and two CloudWatch alarms.
- Added bounded production AWS and Kubernetes adapters, environment parsing, a
  controller loop that can invoke only the M1 kernel patch, structured redacted
  audit output and metric publication.
- Added TLA+ stale-plan models, 16 focused M2 tests, operator documentation and
  dependency/image admission evidence.

## Results vs thesis

- The local outcome materialised: one production adapter-to-kernel-to-TLS-patch
  journey completed with no broader authority. The live recovery-time and alarm
  thesis has no observation window in M2 and remains an M3 qualification gate.

## Outcome vs promise

- The promised component and runnable boundary exist. Pass 0 proved the highest
  applicable local chain with real TLS and file-backed projected credentials.
- M1 forged-evidence, conflict, stale-plan, rolling-membership and zero-capacity
  outcomes remained green in the 248-test package regression suite.

## Design decisions and why

- M2 consumes a caller-supplied digest image and publishes no recipe because all
  three candidate bases carried known vulnerabilities.
- The runnable entry point creates its own AWS/Kubernetes clients. Test-only
  dependency injection remains in internal modules so callers cannot substitute
  snapshots around the M1 decision boundary.
- The Kubernetes adapter uses built-in HTTPS, a projected short-lived token and
  cluster CA instead of adding a broad client dependency for four operations.
- Admission supplements RBAC and permits the exact ServiceAccount to add only an
  absent configured value while preserving every other Node field.
- EC2 and Auto Scaling adapters require exact complete responses; extra records
  are invalid rather than ignored.

## Mistakes made

- A raw root `pnpm test` was run before the workspace build and exposed the
  repository's known build-order prerequisite for `@hulumi/baseline`. The
  canonical build-before-test sequence was then used for all final evidence.
- The first adapter implementation filtered an EC2 response down to the requested
  instance instead of rejecting an unexpected extra record.
- The first admission expression listed the highest-risk metadata fields but did
  not explicitly bind all schema-exposed ObjectMeta fields.

## Root causes

- The workspace has tests that import generated package output, so the supported
  repository sequence is build then test.
- Provider response handling initially optimized for extracting the needed value;
  an authorization adapter instead needs proof that the entire returned evidence
  set is exactly the set requested.
- RBAC policy reviews tend to focus on spec, status, taints, annotations and owner
  references; exact-mutation admission needs a complete schema inventory.

## What was harder than expected

- A usable image would have made runtime packaging straightforward, but accepting
  a base with known fixed or unfixed vulnerabilities would have violated the
  dependency-admission objective. Separating image consumption from publication
  preserved the security boundary without fabricating a clean supply-chain claim.
- Kubernetes admission must allow normal Node updates by other actors while
  preventing any protected-key transition, and simultaneously restrict a
  compromised controller token to one exact addition.

## Naming conventions established

- Runtime audit events use stable snake-case names and reasons.
- Provider failures are typed as `AwsEvidenceError` or `KubernetesAdapterError`.
- Configuration uses the `HULUMI_*` prefix; metrics use the three fixed names
  `ReconcileDecisions`, `ReconcileFailures` and `MissingTrustedLabel`.

## Test patterns that worked well

- Use a local TLS server with an ephemeral certificate and real token/CA files to
  cross the production HTTPS boundary without a cloud mutation.
- Inspect actual AWS SDK command classes while returning controlled response
  objects, then feed their typed output through the unchanged M1 kernel.
- Make exact-evidence tests add one extra record, not merely omit the requested
  record; filtering attacks and completeness failures are different variants.
- Render admission policy under Pulumi mocks and assert its identity, label,
  whole-object and ObjectMeta constraints as one policy contract.

## Missing tests that should exist now

- M3 must compile and enforce the admission policy on the target EKS version,
  including other-user, controller-piggyback and conflict requests.
- M3 must verify Pod Identity credential delivery with IMDS disabled and inspect
  CloudTrail for only the four intended API actions.
- M3 must qualify real rolling replacement, deliberate zero capacity,
  scale-from-zero, structured logs, metrics and alarm delivery.
- M3 must build a digest-pinned image from an admitted zero-known-vulnerability
  base, scan the final filesystem and publish provenance/SBOM evidence.

## Rules for the next milestone

- Do not publish or deploy an image until its base and final filesystem pass the
  pinned admission scans with zero known vulnerability or malicious-package rows.
- Treat live EKS admission compilation as a blocking result; local expression
  inspection is not a substitute.
- Preserve the exact M1 kernel and internal adapter interfaces. M3 packages and
  qualifies them; it must not add a second decision path.
- Use a disposable isolated node group and reversible label policy for live tests,
  with explicit zero-capacity cleanup and CloudWatch evidence capture.
- Re-run OSV and provenance review before any M3 dependency or toolchain change.

## Template improvements suggested

- `/slo-plan` should require an explicit admission-schema inventory when a
  ValidatingAdmissionPolicy claims that only one object field may change.
- `/slo-verify` should distinguish an authorization provider's exact-response
  completeness from ordinary clients that may safely ignore extra fields.

## Issue-filing disposition

- No new issue candidate was filed. Parent issue #305 already owns the M3 live
  qualification, official image and Local Zone/Wavelength follow-ups; duplicating
  them would split ownership. The two implementation gaps were fixed inside M2.
