# Workload Capability Issuer Boundary

`WorkloadCapabilityIssuerBoundary` supplies the infrastructure half of a
private workload-to-capability issuer. It is designed for a process that
validates a projected workload JWT, resolves an exact server-owned authority
record, and signs a short-lived capability with an asymmetric KMS key.

The component creates:

- one exact IRSA role and Kubernetes ServiceAccount for the issuer;
- one dedicated security group and EKS `SecurityGroupPolicy`;
- exact security-group paths to regional STS, KMS, DynamoDB, and Secrets
  Manager interface endpoints, plus exact caller ingress and Route 53 Resolver
  DNS;
- one namespace-scoped `NetworkPolicy` with the same caller, endpoint, and DNS
  boundaries;
- one digest-pinned, restricted, single-container Deployment held at zero
  replicas;
- one private `ClusterIP` Service; and
- a fail-closed `ValidatingAdmissionPolicy` and binding for the protected
  ServiceAccount and labels.

The issuer role has only these application permissions:

- `kms:Sign` and `kms:GetPublicKey` on one exact asymmetric signing key;
- `dynamodb:GetItem` and `dynamodb:DescribeTable` on one exact authority table,
  conditioned on one exact DynamoDB interface VPC endpoint;
- `secretsmanager:GetSecretValue` on `AWSCURRENT` and
  `secretsmanager:DescribeSecret` for one exact transport-TLS identity secret;
  and
- `kms:Decrypt` on the TLS secret's exact KMS key, conditioned on both the
  Secrets Manager regional service and the exact
  `kms:EncryptionContext:SecretARN`.

There is no `PutItem`, table scan, database, application-credential, master
secret, `sts:AssumeRole`, or `iam:PassRole` authority.

The regional STS interface endpoint is a network path only: it is required for
the projected IRSA token exchange and does not grant role-chaining authority.

## Static workload JWKS

`workloadIdentity.jwksJson` is an inline public RSA/RS256 JWKS. Hulumi rejects
private or symmetric fields, mutable or missing key identifiers, weak RSA
moduli, non-65537 exponents, more than eight keys, and documents larger than
16 KiB. The canonical document is placed in `WORKLOAD_JWKS_JSON`.

No `WORKLOAD_JWKS_URL`, public JWKS route, NAT path, or general internet egress
is created. Key rollover is therefore an explicit IaC update and workload
rollout.

## Native TLS without secret transit

The Deployment receives only `TLS_IDENTITY_SECRET_ARN` and
`GPIL_TLS_MODE=native`. The TLS value remains in Secrets Manager and is read by
the issuer at runtime through its exact interface-endpoint path. Hulumi creates
no `SecretVersion`, Kubernetes `Secret`, secret volume, `secretKeyRef`,
`envFrom`, init container, or sidecar.

The same rule applies to every authority-bearing input: Pulumi receives only
ARNs, names, public JWKS, and value-free connection metadata.

All signing-key, authority-table, TLS-secret, and TLS-key inputs are resolved
and validated as exact ARNs in the same partition, region, and account as the
IRSA provider before they can enter IAM or the workload environment. Wildcards,
wrong AWS services, and wrong resource types fail before provisioning.

The projected IRSA token uses the EKS webhook-compatible `aws-iam-token`
directory mount at `/var/run/secrets/eks.amazonaws.com/serviceaccount`, without
`subPath`, so kubelet rotation remains visible. Mode `0444` permits the single
non-root container to read the token; admission pins the mode, mount,
900-second audience-bound projection, and `64Mi` scratch volume.
`AWS_REGION`, `AWS_DEFAULT_REGION`, and
`AWS_STS_REGIONAL_ENDPOINTS=regional` are exact, and the ServiceAccount carries
the matching regional-STS annotation. The admission deny binding is created
before the protected ServiceAccount and inert Deployment.

## Inert rollout and admission

The Deployment always has `replicas: 0`. Supplying configuration never
activates it. An external deployment owner must run live IAM simulation,
endpoint-route, projected-token, authority lookup, native-TLS, KMS signing,
admission near-match, and caller-to-Service tests before increasing replicas.

The admission policy fails closed and binds the exact ServiceAccount, labels,
image digest, command, arguments, environment ordering and values, listener
port, projected token, volumes, resources, RuntimeClass, protected node
placement, scheduler, priority class, and restricted security context. It
rejects sidecars, init or ephemeral containers, secret sources, probes,
lifecycle hooks, host namespaces, added capabilities, and environment
indirection.

## What the component does not claim

The component does not implement workload-JWT verification, authority schema
or records, tenant/operation authorization, capability claims, KMS signing
logic, native TLS loading, key rotation, or activation. Pulumi mocks prove
rendered structure only; they are not live AWS, Kubernetes, TLS, or
authorization evidence.
