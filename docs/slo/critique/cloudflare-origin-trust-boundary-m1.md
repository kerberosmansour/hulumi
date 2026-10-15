# Critique — Cloudflare origin trust boundary M1

Date: 2026-10-15
Runbook: `docs/RUNBOOK-cloudflare-origin-trust-boundary.md`
Verdict: approved for bounded execution after the revisions captured below.

## CEO pass

- A mandatory origin control must represent an active enforcement path. Component labels and certificate reference strings create compliance confidence without changing who can reach the origin.
- The change is intentionally limited to the existing two modes and uses already admitted Pulumi providers. Publication and broader API migration remain outside this milestone.
- Revision accepted: document the breaking allowlist+AOP input migration in the component and cookbook, while keeping tunnel callers source-compatible.

## Engineering lead pass

- The component can build a complete ALB listener only when it owns the server certificate ARN, target group ARN, load-balancer ARN, and versioned CA bundle location. Taking an existing listener ARN would leave the component unable to configure or prove mTLS.
- Cloudflare's provider resource models hostname AOP directly. The former `aopMode` switch allowed a weaker, ambiguous zone shape and is removed from this bounded path.
- Revision accepted: create the trust store before the listener, bind the listener's `trustStoreArn` through the resource output, and keep the strong TLS policy fixed in the component.

## Security pass

- A caller-controlled component token can be forged. CF_ORIGIN_1 must inspect direct child resources and correlate their exact properties, parents, and dependency edges.
- A shape-valid CIDR is not Cloudflare evidence. A pinned allow-list of Cloudflare's definitive current IPv4 ranges fails closed when ranges change and prevents broad or unrelated sources.
- Literal credentials are common in examples. Omitting the tunnel secret from parent inputs and forcing `pulumi.secret` at the child gives safe behavior independent of caller discipline.
- Revision accepted: add decoys for missing/wrong parents, disabled AOP, other hostnames/zones/certificates, unbound listeners, passthrough/off mTLS, ignored expiry, wrong targets/certificates/ports, incomplete or wider SG rules, TLS-disabled tunnel routes, and missing terminal fallback.

## Design pass

- The public component surface should name what the resources use: `originServerCertificateArn`, `originTargetGroupArn`, `loadBalancerArn`, and the three CA-bundle S3 fields. The old `originCertificateReference` was unverifiable metadata.
- Requiring an S3 object version makes CA changes reviewable and reproducible. Operators rotate by publishing a new object version and reviewing the resulting listener/trust-store update.
- Revision accepted: export the immutable current Cloudflare IPv4 range list for callers, accept any non-empty unique subset of that list, and document that package updates are required when Cloudflare publishes range changes.

## Final constraints

- Exact, direct child resource evidence for both supported modes.
- ALB mutual-TLS verify mode with a pinned trust-store object, certificate-expiry enforcement, concrete server certificate, exact target forwarding, and strong TLS policy.
- No secret-bearing parent input and no reliance on callers to mark the tunnel child secret.
- No dependency, manifest, lockfile, version, publication, live provider call, suppression, or unrelated policy change.
- RED evidence must reproduce all four reported weaknesses before implementation.
