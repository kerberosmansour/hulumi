# Runbook: Cloudflare origin trust boundary

Status: confirmed by the user's standing instruction to continue autonomously with the SLO skills on defensive cybersecurity work.
Runbook ID: `cloudflare-origin-trust-boundary`
Findings:

- `csf_d8bcb3b6fce71904a27d2444` — CF_ORIGIN_1 trusts forgeable component evidence.
- `csf_3d548f23d5c03ffed2ea34f1` — allowlist+AOP records certificate metadata without configuring origin-side verification.
- `csf_d301d5fdd6abfad96c0b7455` — literal tunnel secrets can enter plain parent-component inputs.
- `csf_b76328f43c9acbfaa1709206` — shape-only CIDR validation accepts Internet-wide source ranges.

Base: `2d28d71143e6b4995c1ac9e14e01bfb4a21aca93`
Data classification: hostnames, resource identifiers, CA-bundle object locations, Cloudflare certificate identifiers, and Pulumi dependency edges are internal configuration. Tunnel secret values and private keys are credentials and must remain secret or external references.

## 1. Architecture and provider evidence

Cloudflare's AWS AOP integration configures a per-hostname client certificate, an ALB trust store containing the issuing CA, and an HTTPS listener using mutual TLS verification. AWS documents that verify mode authenticates the client certificate at the ALB and requires a trust store associated with the listener. Cloudflare publishes the definitive current proxy address ranges; admitting arbitrary syntactically valid CIDRs would turn the source restriction into an operator-controlled bypass.

The component will therefore create and correlate these resources for `allowlistAop` mode:

1. per-hostname Cloudflare Authenticated Origin Pulls using the supplied client-certificate id;
2. a version-pinned `aws.lb.TrustStore` backed by an S3 CA bundle;
3. an HTTPS `aws.lb.Listener` with a concrete server certificate, exact target-group forwarding, `mutualAuthentication.mode: "verify"`, and client-certificate expiry enforcement;
4. one load-balancer security-group ingress rule for each admitted Cloudflare IPv4 range and one target rule from the exact load-balancer security group.

Tunnel mode will keep its concrete tunnel and config children, including TLS verification and a terminal 404 ingress. The parent component will omit `tunnelSecret`; the tunnel child will receive `pulumi.secret(args.tunnelSecret)` even when a caller supplied a literal.

Provider references:

- <https://developers.cloudflare.com/ssl/origin-configuration/authenticated-origin-pull/aws-alb-integration/>
- <https://docs.aws.amazon.com/elasticloadbalancing/latest/application/mutual-authentication.html>
- <https://docs.aws.amazon.com/elasticloadbalancing/latest/application/configuring-mtls-with-elb.html>
- <https://www.cloudflare.com/ips/>
- <https://www.cloudflare.com/ips-v4>
- <https://www.pulumi.com/registry/packages/aws/api-docs/lb/listener/>

## 2. Security contract

| Contract item       | Decision                                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal                | Make Cloudflare-to-origin evidence concrete, secret-safe, and correlated to the reviewed hostname.                                                                                          |
| Tunnel evidence     | Require a direct child tunnel and tunnel config with the same account, an ingress for the exact hostname, TLS verification enabled, and a terminal 404 fallback.                            |
| Tunnel secret       | Omit the value from parent inputs and force the child resource input to a Pulumi secret.                                                                                                    |
| AOP evidence        | Require enabled per-hostname AOP with the exact zone, hostname, and certificate id.                                                                                                         |
| Origin verification | Create a version-pinned ALB trust store and an HTTPS listener in mutual-TLS verify mode with certificate-expiry checks enabled, a concrete server certificate, and exact target forwarding. |
| Source restriction  | Accept only canonical entries from Cloudflare's published IPv4 list; reject Internet-wide, malformed, non-canonical, duplicate, IPv6, and unrelated ranges.                                 |
| Policy evidence     | CF_ORIGIN_1 inspects direct children, exact parent relationships, exact properties, property dependencies where resource ids are outputs, and complete source/target security-group rules.  |
| Failure behavior    | Unknown, malformed, missing, unrelated, wider, unbound, or decoy evidence yields one bounded mandatory violation without throwing.                                                          |
| Dependency contract | No dependency, manifest, lockfile, version, publication, or live Cloudflare/AWS change.                                                                                                     |

## 3. M1 — enforce concrete Cloudflare origin controls

Started: 2026-10-15
Refactor budget: one component and its input type, one policy implementation, two focused test files, four operator documents, and SLO evidence.

### Allowed files

- `docs/RUNBOOK-cloudflare-origin-trust-boundary.md`
- `docs/slo/critique/cloudflare-origin-trust-boundary-m1.md`
- `docs/slo/verify/cloudflare-origin-trust-boundary-m1.md`
- `docs/slo/lessons/cloudflare-origin-trust-boundary-m1.md`
- `docs/slo/completion/cloudflare-origin-trust-boundary-m1.md`
- `packages/platform-patterns/src/cloudflare-origin-ingress.ts`
- `packages/platform-patterns/src/cloudflare-origin-ingress.args.ts`
- `packages/platform-patterns/tests/cloudflare-origin-ingress.test.ts`
- `packages/policies/src/cloudflare/hulumi-hardening-pack.ts`
- `packages/policies/tests/cloudflare/hulumi-cloudflare-hardening-pack.test.ts`
- `docs/components/cloudflare-origin-ingress.md`
- `docs/components/cloudflare-policy-packs.md`
- `docs/cookbooks/cloudflare-aop-alb-origin.md`
- `docs/cookbooks/cloudflare-tunnel-eks-service.md`

### BDD acceptance

| ID       | Given/when                                                                                                                                 | Then                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| BDD-M1-1 | tunnel mode receives a literal tunnel secret                                                                                               | parent inputs omit it and the tunnel child's input is secret                                       |
| BDD-M1-2 | tunnel children have the exact account, hostname route, verified TLS, and terminal 404 fallback                                            | CF_ORIGIN_1 accepts the hostname                                                                   |
| BDD-M1-3 | a component token is present without exact tunnel children, or with TLS disabled, another hostname/account, or no terminal fallback        | CF_ORIGIN_1 emits one violation                                                                    |
| BDD-M1-4 | allowlist+AOP mode receives the concrete ALB, server certificate, target group, versioned CA bundle, certificate id, and Cloudflare ranges | it registers per-hostname AOP, trust store, mutual-TLS listener, source rules, and the target rule |
| BDD-M1-5 | a CIDR is Internet-wide, malformed, non-canonical, duplicate, IPv6, or absent from Cloudflare's published IPv4 list                        | construction fails before provider resources are registered                                        |
| BDD-M1-6 | the AOP, listener, trust store, or security-group tuple is absent, unrelated, widened, expired-cert-tolerant, passthrough, or unbound      | CF_ORIGIN_1 emits one violation without throwing                                                   |
| BDD-M1-7 | CF_DNS_1, CF_DNSSEC_1, existing safe tunnel inputs, and unrelated policy resources run                                                     | their behavior remains unchanged                                                                   |
| BDD-M1-8 | package/workspace/security gates run                                                                                                       | all pass with no dependency graph or out-of-scope diff                                             |

### Execution sequence

1. Run the official pinned OSV gate and focused component/policy baselines.
2. Add secret, CIDR, listener/trust-store, exact-child, decoy, unbound, malformed, and widened-evidence scenarios; preserve intended RED failures.
3. Implement secret-safe parent inputs, strict Cloudflare ranges, concrete ALB mTLS resources, and exact CF_ORIGIN_1 correlation.
4. Update component, policy, and both mode cookbooks with the breaking input migration and operating checks.
5. Run focused and package tests, build, typecheck, lint, formatting, workspace regressions, OSV, Semgrep, secret review, allow-list, and diff hygiene.
6. Sign and DCO-stamp the exact source commit, pass exact-head CI, merge only the pinned head under standing authorization, and run xhigh Codex Security on the exact merged-main commit.

### Forbidden shortcuts

- No component-presence, logical-name, description-marker, substring, wildcard, or hostname-only exemption.
- No metadata-only origin-certificate reference, ALB passthrough mode, ignored client-certificate expiry, unversioned CA bundle, arbitrary CIDR, or `0.0.0.0/0`.
- No raw tunnel secret in parent inputs or unforced child input.
- No suppression, severity downgrade, dependency addition, version/publication change, live provider mutation, or fabricated evidence.

### Definition of done

All BDDs and existing regressions pass; the exact-head PR is green and merged; and an exact merged-main scan no longer reports component-only origin evidence, absent origin-side certificate verification, plain parent tunnel secrets, Internet-wide Cloudflare source ranges, or equivalent occurrences.
