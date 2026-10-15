# Lessons — SecureBucket TLS policy binding M1

Date: 2026-10-15
Runbook: `docs/RUNBOOK-secure-bucket-tls-policy-binding.md`

## What changed our understanding

- IAM policy evidence must be evaluated as a complete bounded statement. The
  simultaneous presence of `Deny`, a SecureTransport condition, and target ARNs
  says nothing about which principals or actions are actually denied.
- Complement operators deserve explicit fail-closed treatment. A statement can
  retain every expected positive field while `NotPrincipal`, `NotAction`, or
  `NotResource` changes the effective request set.
- Additional condition keys narrow a Deny just as effectively as a specific
  principal or action. Exact condition shape is part of the security proof.
- Unknown statement keys are safer to reject in this bounded component policy
  than to approximate general IAM semantics. `Sid` remains accepted because it
  is descriptive and does not change authorization.
- Diagnostic redaction can be proven with a sensitive-looking marker in an
  invalid policy resource while preserving the existing bounded remediation.

## Reusable rules

- Validate the complete security-relevant shape when a policy exemption treats
  one statement as proof of a control.
- Prefer a small exact allow-list to a blacklist for bounded policy statements.
- Include both a production-shaped positive control and every supported benign
  normalization, such as the singleton action array.
- Exercise complement fields, extra condition operators, extra condition keys,
  and unknown fields independently so one guard cannot mask another.
- Keep local policy proof distinct from general IAM equivalence and live AWS
  enforcement claims.

## Follow-ups

- The exact merged-main xhigh scan must confirm that the H5 finding and equivalent
  principal/action/resource/condition narrowing bypasses are absent.
- The completed pre-fix scan also reported separate secret-policy, SCA, cache,
  workflow, Helm, rotation, GitHub control, OIDC, EKS, and filesystem findings.
  They remain separate bounded work and were not folded into H5.
- No retrospective GitHub issue is required for H5: the Codex Security finding
  is the tracked defect and no matching open issue existed when M1 began.
