# Brokered Aurora PostgreSQL Boundary

`BrokeredAuroraPostgresBoundary` is the infrastructure half of the reviewed
broker-mediated SQL architecture in [issue #255](https://github.com/kerberosmansour/hulumi/issues/255).
It is intentionally narrower than a database authorization system.

The component creates:

- four distinct exact IRSA roles and Kubernetes ServiceAccounts: `runtime`,
  `broker`, `migrator`, and `rotation`;
- two value-free `SecureSecret` containers for alternating broker logins;
- separate security groups, SecurityGroupPolicy bindings, and Kubernetes
  NetworkPolicies;
- digest-pinned restricted Deployment, Job, and CronJob envelopes;
- exact disjoint runtime versus broker/migrator/rotation placement using
  NodeRestriction-protected node-pool labels, required node affinity, exact
  taints/tolerations, RuntimeClasses, schedulers, and priority classes;
- a fail-closed ValidatingAdmissionPolicy and binding for the protected
  ServiceAccounts;
- a KMS-encrypted DynamoDB replay table with an enabled `expiresAt` TTL; and
- value-free identity, ordering, network, and rotation-posture outputs.

Every rollout phase is inert: both Deployments have zero replicas, the migrator
Job is suspended, and the rotation CronJob is suspended. Self-attested
`verifiedGates` strings are rejected. A requested non-infrastructure handoff
must instead name a content-addressed external evidence bundle as an immutable
OCI reference and the same SHA-256 digest. The component validates and records
that metadata, but deliberately does not observe the evidence or use it to
activate a workload. Runtime and rotation handoff metadata also requires a
caller-supplied ClusterIP Service name, namespace/Pod selector, and caller
security group; no public or wildcard runtime ingress is inferred.

The runtime role has no inline policy. Its only application egress is to the
broker security group and broker Pod selector, plus exact DNS resolver paths.
The broker can read only the `AWSCURRENT` stage of the two application-secret
containers and must explicitly request that version stage. It cannot read the
master secret. Migrator and rotation authority is separately named and never
assumable by the runtime role. Rotation can read and describe the
`AWSCURRENT` master secret, but `PutSecretValue` and
`UpdateSecretVersionStage` are scoped only to the two application slots.
`kms:GenerateDataKey` is separately scoped to the boundary KMS key and only
those two application-secret encryption contexts; it never includes the master
secret. Both the `SecureSecret` components and their Secrets Manager children,
plus replay-table SSE, are bound to that same exact boundary key.

Capability verification is configured with an inline, public asymmetric JWKS.
The component accepts only RSA/RS256, P-256/ES256, or Ed25519/EdDSA signing
keys and rejects private or symmetric fields. The document is capped at eight
keys and 16 KiB to bound the generated workload configuration. It deliberately
creates no JWKS network-fetch path. Key rollover therefore requires a reviewed
IaC update and workload rollout.

Only the broker can call `dynamodb:PutItem`, `dynamodb:GetItem`, and
`dynamodb:DescribeTable` on the exact replay table. That authority is
conditioned on the declared DynamoDB interface VPC endpoint. The broker gets
the endpoint-specific URL through the AWS SDK-standard
`AWS_ENDPOINT_URL_DYNAMODB` variable, while its security group has only the
matching endpoint-SG path on TCP 443. `endpointCidrs` must include the
Kubernetes-to-interface-endpoint path. The component does not implement replay
semantics: the consumer-supplied broker must use a conditional `PutItem` to
claim each `jti` before executing the capability and must treat an existing
item or failed condition as denial. TTL is cleanup, not the single-use
decision.

## What the component does not claim

The component does not implement the broker, migrator, or rotation
executables. It does not create PostgreSQL roles, set tenant context, validate
capabilities, perform the conditional replay claim, perform alternating-user
rotation, inspect PostgreSQL catalogs, or prove live effective authorization.
The emitted rotation posture is therefore `infrastructure-only-unconfigured`,
never a Boolean-derived claim that rotation works.

Pulumi mocks and the companion policy pack are structural evidence only.
Release still requires live IAM/KMS/endpoint evaluation, actual Kubernetes
identity and admission tests, PostgreSQL 16 actual-login authority scans,
cross-tenant DML negatives, lock/sequence/notification tests, replay tests,
rotation retirement, and value-free receipts. See the
[reviewed threat model](../threat-model-iam-least-privilege-20260728.md).
Cluster RBAC must separately deny unauthorized Pod exec, attach, port-forward,
and debug access; the generated admission policy denies lifecycle/probe
injection and covers both `pods` and `pods/ephemeralcontainers`, but it is not
an RBAC replacement.

The current implementation renders IRSA. EKS Pod Identity is an explicit
limit: consumers using it need a separately reviewed association adapter and
live cache/session-retirement evidence.

The content-addressed rollout input is custody metadata, not observed proof.
The runtime package or deployment orchestrator must verify the referenced
receipt, execute each live gate, and own activation outside this inert
component. Merely supplying a digest cannot start broker, migrator, runtime, or
rotation.

## Secret boundary

Only secret containers are created. No `SecretVersion`, Kubernetes `Secret`,
or secret value is accepted or emitted. In particular, this pattern must not
be combined with `RdsCredentialSecret`: that component reads a value during
Pulumi evaluation and writes it into a Kubernetes Secret, which is the
opposite of this value-free contract.

## Required rollout order

1. Deploy the inert infrastructure.
2. Supply independently reviewed, digest-pinned broker, migrator, and rotation
   executables.
3. Run the migration/bootstrap Job and prove its PostgreSQL postconditions.
4. Populate both application-secret containers through a separately reviewed,
   value-free runtime/operator path and prove that the broker can read an
   `AWSCURRENT` version. Hulumi deliberately does not put initial secret values
   through Pulumi or grant bootstrap write authority.
5. Produce a content-addressed external receipt that binds the completed
   postconditions, secret ARNs/stages, identities, and executable digests.
   Supplying its immutable reference to Hulumi records the requested handoff
   but leaves every executable workload inert.
6. In a separately reviewed runtime/deployment orchestrator, verify the
   receipt, run the companion policy pack and live effective-authorization
   gates, then start the broker and application runtime in order.
7. Keep deployment blocked until rotation and stale-session retirement are
   proven under the live topology.

Use the mandatory policy pack at
`@hulumi/policies/platform/packs/brokered-postgres-boundary`.
