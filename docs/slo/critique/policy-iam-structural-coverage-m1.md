# Adversarial critique — IAM policy structural coverage M1

Date: 2026-10-15. Review order: CEO, engineering lead, security officer,
design. The operator's standing authorization confirms this bounded defensive
milestone.

| id | persona | category | finding | scenario | resolution |
| --- | --- | --- | --- | --- | --- |
| M1-C1 | CEO | scope | The three findings share IAM normalization and authority correlation, while broader effective-permission analysis would turn the patch into a product redesign. | A narrow security repair stalls behind an attempt to model every AWS permission boundary. | Cover exact full-administrator grants through the Pulumi resources visible in the current stack and document the boundary. Applied. |
| M1-C2 | engineering lead | consistency | CIS 1.16 and `G_OIDC_2` currently interpret the same policy document independently. | One rule fixes singleton statements while the other remains bypassable. | Introduce one internal singleton/array normalizer and exact full-admin predicate used by both rules. Applied to the contract. |
| M1-C3 | engineering lead | compatibility | Pulumi exposes role permissions through role properties and several attachment resources with scalar, array and dependency-edge values. | A test-only representation passes while a real provider representation remains invisible. | Test every supported Pulumi AWS 7.50 shape from local provider declarations, with dependency and exact-value correlation. Applied. |
| M1-C4 | security | fail-closed trust | A mandatory OIDC trust rule that skips malformed or incomplete GitHub statements creates a policy-bypass oracle. | Removing `Condition`, changing its operator, using a non-string value, or serializing one statement suppresses enforcement. | Once the anchored GitHub issuer is present, require exactly one supported equality restriction with only nonempty non-wildcard strings; report every uninspectable policy shape. Applied. |
| M1-C5 | security | false positives | Reporting every malformed non-GitHub trust statement would widen `G_OIDC_1` beyond its documented purpose. | A normal EC2 role is blocked because its unrelated preview value is incomplete. | Fail closed on an unparseable IAM role policy because its issuer cannot be established; for parsed policies, apply claim rules only to statements with the exact anchored GitHub issuer. Document this behavior. Applied. |
| M1-C6 | security | graph identity | Name-only linkage can collide across resources or providers; dependency-only linkage can be absent in test harnesses and serialized previews. | An unrelated role is flagged, or a real direct attachment is missed. | Prefer exact Pulumi dependency URNs and accept only exact role `arn`, `name`, or `id` fallback values; never use substring matching. Applied. |
| M1-C7 | security | customer policy | Recognizing only AWS's managed AdministratorAccess ARN misses a byte-for-byte customer equivalent. | An attacker attaches an in-stack policy with exact `Allow`, `Action: "*"`, `Resource: "*"`. | Parse in-stack policy documents, map their exact ARN/dependency identity, and follow supported attachment edges. Applied. |
| M1-C8 | design | diagnostics | Security violations need to identify the source resource and role without dumping the whole policy. | Operators cannot remediate, or sensitive policy context is copied into logs. | Emit source URN, role URN and authority class only; keep policy JSON out of messages. Applied. |

## Verdict

Proceed with BDD-first implementation. The milestone is defensive, introduces
no dependency, performs no cloud mutation, and stays within the exact
allow-list. Publication remains gated on full verification and merged-main
Codex Security evidence.
