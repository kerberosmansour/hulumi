# `@hulumi/k8s-baseline`

Hardened-by-default Pulumi component resources for Kubernetes / EKS /
Istio / RDS / Secrets-Manager. Drop-in replacements for raw Helm releases,
EKS subnet tagging, Istio installation, and ALB-meshed entrypoints with
PSA-baseline-clean defaults wired up correctly out of the box.

Part of the [Hulumi](https://github.com/kerberosmansour/hulumi) toolkit.
Apache-2.0. SLSA Build L3 attestation on every published tarball.

## Install

```bash
pnpm add @hulumi/k8s-baseline @pulumi/kubernetes@4.30.0 \
         @pulumi/aws@7.27.0 @pulumi/pulumi@3.232.0
```

The exact `@pulumi/*` versions match `peerDependencies`.

## Components

| Component                               | Purpose                                                                                        |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `HardenedHelmRelease`                   | Helm release with PSA-baseline labels, SHA-pinned chart digest, default release-name stability |
| `EksSubnetTagger`                       | Auto-tag EKS-bound subnets with `kubernetes.io/role/{,internal-}elb`                           |
| `IstioFoundation`                       | Bundled hardened Istio install (`istiod` + `istio-cni` + `ingressgateway`, PSA-baseline-clean) |
| `AlbMeshedHttpEntrypoint`               | ALB Ingress + Istio `Gateway` + `VirtualService` + `AuthorizationPolicy` for one workload      |
| `KubernetesSecretFromAwsSecretsManager` | K8s `Secret` from an AWS Secrets Manager value, fail-closed on JSON-shape violations           |
| `RdsCredentialSecret`                   | Extract RDS auto-managed master credential into a K8s `Secret` with fail-closed semantics      |
| `GitHubAppCredential`                   | Secrets Manager container + JWT-mint helper bundle for GitHub App credential rotation          |

## Quick-start — `IstioFoundation`

```ts
import { IstioFoundation } from "@hulumi/k8s-baseline";

const istio = new IstioFoundation("istio", {
  k8sProvider: cluster.provider,
  meshId: "my-mesh",
  network: "primary",
});
```

## Quick-start — `KubernetesSecretFromAwsSecretsManager`

```ts
import { KubernetesSecretFromAwsSecretsManager } from "@hulumi/k8s-baseline";

const apiKey = new KubernetesSecretFromAwsSecretsManager("api-key", {
  k8sProvider: cluster.provider,
  namespace: "production",
  secretName: "third-party-api-key",
  awsSecretArn: "arn:aws:secretsmanager:us-east-1:123456789012:secret:prod/api-key-XYZ",
  failureMode: "fail", // or "degrade"
});
```

`failureMode: "fail"` (the default) refuses to apply the K8s `Secret` if
the AWS source value is not a JSON object — preventing accidental
plaintext leakage. See
[docs/components/kubernetes-secret-from-asm.md](https://github.com/kerberosmansour/hulumi/blob/main/docs/components/kubernetes-secret-from-asm.md).

## Compatibility

Tested chart and Pulumi-provider version matrix lives in
[`COMPATIBILITY.md`](./COMPATIBILITY.md). Bumps to chart pins go through
the same supply-chain discipline as `@pulumi/*` exact pins.

## Verifying SLSA attestations

Every published tarball ships with `actions/attest-build-provenance` v2
provenance. Verify before installing:

```bash
pnpm pack @hulumi/k8s-baseline@1.3.2 --pack-destination .
gh attestation verify ./hulumi-k8s-baseline-1.3.2.tgz \
  --repo kerberosmansour/hulumi
```

## Documentation

- [Component reference](https://github.com/kerberosmansour/hulumi/tree/main/docs/components)
- [Cookbooks](https://github.com/kerberosmansour/hulumi/tree/main/docs/cookbooks) — including `psa-baseline-istio-sidecar.md`
- [Architecture](https://github.com/kerberosmansour/hulumi/blob/main/docs/ARCHITECTURE.md)

## License

Apache-2.0 — see [LICENSE](./LICENSE) and the project-level
[NOTICE](https://github.com/kerberosmansour/hulumi/blob/main/NOTICE).
