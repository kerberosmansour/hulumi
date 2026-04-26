import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

import type {
  AlbMeshedHttpEntrypointArgs,
  AlbMeshedHttpEntrypointAuthZ,
  AlbMeshedHttpEntrypointAlb,
} from "./alb-meshed-http-entrypoint.args";
import type { AlbMeshedHttpEntrypointOutputs } from "./alb-meshed-http-entrypoint.outputs";

export const ALB_MESHED_HTTP_ENTRYPOINT_COMPONENT_TYPE = "hulumi:k8s:AlbMeshedHttpEntrypoint";

const FQDN_REGEX = /^(?=.{1,253}$)([a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

function validateArgs(name: string, args: AlbMeshedHttpEntrypointArgs): void {
  if (args.mesh === undefined) {
    throw new Error("AlbMeshedHttpEntrypoint: mesh is required");
  }
  if (args.host === undefined || typeof args.host !== "string" || args.host.trim() === "") {
    throw new Error("AlbMeshedHttpEntrypoint: host is required and must be non-empty");
  }
  if (!FQDN_REGEX.test(args.host)) {
    throw new Error(
      `AlbMeshedHttpEntrypoint: host "${args.host}" must be a valid FQDN (no wildcards, no leading dots, must include a TLD)`,
    );
  }
  if (args.serviceRef === undefined) {
    throw new Error("AlbMeshedHttpEntrypoint: serviceRef is required");
  }
  const sr = args.serviceRef;
  if (sr.namespace === undefined || sr.namespace.trim() === "") {
    throw new Error("AlbMeshedHttpEntrypoint: serviceRef.namespace must be non-empty");
  }
  if (sr.name === undefined || sr.name.trim() === "") {
    throw new Error("AlbMeshedHttpEntrypoint: serviceRef.name must be non-empty");
  }
  if (typeof sr.port !== "number" || sr.port < 1 || sr.port > 65535) {
    throw new Error(
      `AlbMeshedHttpEntrypoint: serviceRef.port must be a number between 1 and 65535 (got ${sr.port})`,
    );
  }
  if (args.scheme !== undefined && args.scheme !== "internal" && args.scheme !== "internet-facing") {
    throw new Error(
      `AlbMeshedHttpEntrypoint: scheme must be one of "internal" | "internet-facing" (got "${String(args.scheme)}")`,
    );
  }
  if (args.mTLS !== undefined && args.mTLS !== "STRICT" && args.mTLS !== "PERMISSIVE") {
    throw new Error(
      `AlbMeshedHttpEntrypoint: mTLS must be one of "STRICT" | "PERMISSIVE" (got "${String(args.mTLS)}")`,
    );
  }
  const authz: AlbMeshedHttpEntrypointAuthZ = args.authorizationPolicy ?? {};
  if (authz.allowFromGateway === false) {
    if (
      authz.acknowledgeNoAuthZ !== true ||
      authz.extraPrincipals === undefined ||
      authz.extraPrincipals.length === 0
    ) {
      throw new Error(
        `AlbMeshedHttpEntrypoint: allowFromGateway: false requires acknowledgeNoAuthZ: true and a non-empty extraPrincipals list (component "${name}")`,
      );
    }
  }
}

function spiffePrincipalForGateway(saName: string, namespace: string): string {
  return `cluster.local/ns/${namespace}/sa/${saName}`;
}

export class AlbMeshedHttpEntrypoint
  extends pulumi.ComponentResource
  implements AlbMeshedHttpEntrypointOutputs
{
  public readonly ingressName: pulumi.Output<string>;
  public readonly ingressNamespace: pulumi.Output<string>;
  public readonly gatewayName: pulumi.Output<string>;
  public readonly gatewayNamespace: pulumi.Output<string>;
  public readonly virtualServiceName: pulumi.Output<string>;
  public readonly virtualServiceNamespace: pulumi.Output<string>;
  public readonly authorizationPolicyName: pulumi.Output<string>;
  public readonly authorizationPolicyNamespace: pulumi.Output<string>;
  public readonly albAddress: pulumi.Output<string>;

  constructor(
    name: string,
    args: AlbMeshedHttpEntrypointArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super(ALB_MESHED_HTTP_ENTRYPOINT_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    validateArgs(name, args);

    const scheme = args.scheme ?? "internal";
    const mTLSMode = args.mTLS ?? "STRICT";
    const authz: AlbMeshedHttpEntrypointAuthZ = args.authorizationPolicy ?? {};
    const allowFromGateway = authz.allowFromGateway !== false; // default true
    const extraPrincipals = authz.extraPrincipals ?? [];
    const albCfg: AlbMeshedHttpEntrypointAlb = args.alb ?? {};
    const healthcheckPath = albCfg.healthcheckPath ?? "/healthz/ready";
    const healthcheckPort = albCfg.healthcheckPort ?? 15021;
    const groupName = albCfg.groupName ?? "default";

    if (!allowFromGateway) {
      pulumi.log.warn(
        `AlbMeshedHttpEntrypoint "${name}": allowFromGateway: false — the AuthorizationPolicy does NOT include the gateway principal. The entrypoint accepts only the explicit extraPrincipals list. Confirm this matches the intended trust posture.`,
      );
    }

    const parent = { parent: this } as const;

    const ingressNamespace = args.serviceRef.namespace;
    const workloadNamespace = args.serviceRef.namespace;

    // Ingress backend points at the istio-ingressgateway Service in mesh.ingressGatewayNamespace.
    // We compute the ingress in the workload's namespace per the load-balancer-controller
    // group.name convention (one ingress can route to a gateway service via ExternalName-like ref).
    // Simpler / more common pattern: ingress lives in istio-ingress namespace; we adopt that here
    // because the gateway service is there and ALB Controller binds at the same namespace.
    const ingressNs = args.mesh.ingressGatewayNamespace.apply(
      (ns: string | undefined) => ns ?? ingressNamespace,
    );
    const gatewayServiceName = args.mesh.ingressGatewayServiceAccountName.apply(
      (sa: string | undefined) => sa ?? "istio-ingressgateway",
    );

    const annotations: Record<string, pulumi.Input<string>> = {
      "alb.ingress.kubernetes.io/target-type": "ip",
      "alb.ingress.kubernetes.io/scheme": scheme,
      "alb.ingress.kubernetes.io/healthcheck-port": String(healthcheckPort),
      "alb.ingress.kubernetes.io/healthcheck-path": healthcheckPath,
      "alb.ingress.kubernetes.io/group.name": groupName,
    };
    if (albCfg.certificateArn !== undefined) {
      annotations["alb.ingress.kubernetes.io/certificate-arn"] = albCfg.certificateArn;
      annotations["alb.ingress.kubernetes.io/listen-ports"] =
        '[{"HTTP":80},{"HTTPS":443}]';
      annotations["alb.ingress.kubernetes.io/ssl-redirect"] = "443";
      if (albCfg.sslPolicy !== undefined) {
        annotations["alb.ingress.kubernetes.io/ssl-policy"] = albCfg.sslPolicy;
      }
    }

    const ingress = new k8s.networking.v1.Ingress(
      `${name}-ingress`,
      {
        metadata: {
          name: `${name}-ingress`,
          namespace: ingressNs,
          annotations,
        },
        spec: {
          ingressClassName: "alb",
          rules: [
            {
              host: args.host,
              http: {
                paths: [
                  {
                    path: "/",
                    pathType: "Prefix",
                    backend: {
                      service: {
                        name: gatewayServiceName,
                        port: { number: 80 },
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      parent,
    );

    const gatewayName = `${name}-gateway`;
    new k8s.apiextensions.CustomResource(
      gatewayName,
      {
        apiVersion: "networking.istio.io/v1beta1",
        kind: "Gateway",
        metadata: { name: gatewayName, namespace: ingressNs },
        spec: {
          selector: { istio: "ingressgateway" },
          servers: [
            {
              port: { number: 80, name: "http", protocol: "HTTP" },
              hosts: [args.host],
            },
          ],
        },
      },
      parent,
    );

    const vsName = `${name}-vs`;
    const gatewayCrossNsRef = pulumi
      .output(ingressNs)
      .apply((ns: string) => `${ns}/${gatewayName}`);
    new k8s.apiextensions.CustomResource(
      vsName,
      {
        apiVersion: "networking.istio.io/v1beta1",
        kind: "VirtualService",
        metadata: { name: vsName, namespace: workloadNamespace },
        spec: {
          hosts: [args.host],
          gateways: [gatewayCrossNsRef],
          http: [
            {
              route: [
                {
                  destination: {
                    host: `${args.serviceRef.name}.${args.serviceRef.namespace}.svc.cluster.local`,
                    port: { number: args.serviceRef.port },
                  },
                },
              ],
            },
          ],
        },
      },
      parent,
    );

    const apName = `${name}-authz`;
    const principals = pulumi.all([gatewayServiceName, ingressNs]).apply(
      ([sa, ns]: [string, string]) => {
        const out: string[] = [];
        if (allowFromGateway) {
          out.push(spiffePrincipalForGateway(sa, ns));
        }
        out.push(...extraPrincipals);
        return out;
      },
    );
    new k8s.apiextensions.CustomResource(
      apName,
      {
        apiVersion: "security.istio.io/v1beta1",
        kind: "AuthorizationPolicy",
        metadata: { name: apName, namespace: workloadNamespace },
        spec: {
          selector: { matchLabels: { app: args.serviceRef.name } },
          action: "ALLOW",
          rules: [
            {
              from: [{ source: { principals } }],
            },
          ],
        },
      },
      parent,
    );

    if (mTLSMode === "STRICT") {
      new k8s.apiextensions.CustomResource(
        `${name}-peer`,
        {
          apiVersion: "security.istio.io/v1beta1",
          kind: "PeerAuthentication",
          metadata: { name: `${name}-peer`, namespace: workloadNamespace },
          spec: { mtls: { mode: "STRICT" } },
        },
        parent,
      );
    }

    this.ingressName = pulumi.output(`${name}-ingress`);
    this.ingressNamespace = pulumi.output(ingressNs) as pulumi.Output<string>;
    this.gatewayName = pulumi.output(gatewayName);
    this.gatewayNamespace = pulumi.output(ingressNs) as pulumi.Output<string>;
    this.virtualServiceName = pulumi.output(vsName);
    this.virtualServiceNamespace = pulumi.output(workloadNamespace);
    this.authorizationPolicyName = pulumi.output(apName);
    this.authorizationPolicyNamespace = pulumi.output(workloadNamespace);
    this.albAddress = ingress.status.apply((s) => s?.loadBalancer?.ingress?.[0]?.hostname ?? "");

    this.registerOutputs({
      ingressName: this.ingressName,
      ingressNamespace: this.ingressNamespace,
      gatewayName: this.gatewayName,
      gatewayNamespace: this.gatewayNamespace,
      virtualServiceName: this.virtualServiceName,
      virtualServiceNamespace: this.virtualServiceNamespace,
      authorizationPolicyName: this.authorizationPolicyName,
      authorizationPolicyNamespace: this.authorizationPolicyNamespace,
      albAddress: this.albAddress,
    });
  }
}
