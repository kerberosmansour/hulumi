import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

import type {
  AlbMeshedHttpEntrypointArgs,
  AlbMeshedHttpEntrypointAuthZ,
  AlbMeshedHttpEntrypointAlb,
  AlbMeshedHttpEntrypointWorkloadSelector,
} from "./alb-meshed-http-entrypoint.args";
import {
  MAX_EXTRA_PRINCIPALS,
  MAX_WORKLOAD_SELECTOR_LABELS,
  MIN_PUBLIC_JUSTIFICATION_LENGTH,
} from "./alb-meshed-http-entrypoint.args";
import type { AlbMeshedHttpEntrypointOutputs } from "./alb-meshed-http-entrypoint.outputs";

export const ALB_MESHED_HTTP_ENTRYPOINT_COMPONENT_TYPE = "hulumi:k8s:AlbMeshedHttpEntrypoint";

const FQDN_REGEX = /^(?=.{1,253}$)([a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const PUBLIC_JUSTIFICATION_ANNOTATION = "hulumi.dev/public-justification";

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
  if (
    args.scheme !== undefined &&
    args.scheme !== "internal" &&
    args.scheme !== "internet-facing"
  ) {
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
  if (authz.extraPrincipals !== undefined && authz.extraPrincipals.length > MAX_EXTRA_PRINCIPALS) {
    throw new Error(
      `AlbMeshedHttpEntrypoint: extraPrincipals has ${authz.extraPrincipals.length} entries; max ${MAX_EXTRA_PRINCIPALS} (component "${name}")`,
    );
  }

  // M2 contract: explicit selector OR explicit acknowledgement.
  const ws = args.workloadSelector;
  if (ws === undefined && args.acknowledgeInferredSelector !== true) {
    throw new Error(
      `AlbMeshedHttpEntrypoint: pass workloadSelector (preferred) or acknowledgeInferredSelector: true to opt into the legacy inferred { app: serviceRef.name } selector (component "${name}")`,
    );
  }
  if (ws !== undefined) {
    if (ws.matchLabels === undefined || Object.keys(ws.matchLabels).length === 0) {
      throw new Error(
        `AlbMeshedHttpEntrypoint: workloadSelector.matchLabels must be non-empty (component "${name}")`,
      );
    }
    const labelCount = Object.keys(ws.matchLabels).length;
    if (labelCount > MAX_WORKLOAD_SELECTOR_LABELS) {
      throw new Error(
        `AlbMeshedHttpEntrypoint: workloadSelector.matchLabels has ${labelCount} entries; max ${MAX_WORKLOAD_SELECTOR_LABELS} labels (component "${name}")`,
      );
    }
  }

  // M2 contract: internet-facing requires both certificateArn and a public justification.
  if (args.scheme === "internet-facing") {
    const albCfg = args.alb ?? {};
    if (albCfg.certificateArn === undefined || albCfg.certificateArn === "") {
      throw new Error(
        `AlbMeshedHttpEntrypoint: scheme "internet-facing" requires alb.certificateArn (component "${name}")`,
      );
    }
    if (albCfg.publicJustification === undefined || albCfg.publicJustification === "") {
      throw new Error(
        `AlbMeshedHttpEntrypoint: scheme "internet-facing" requires alb.publicJustification (component "${name}")`,
      );
    }
    if (albCfg.publicJustification.length < MIN_PUBLIC_JUSTIFICATION_LENGTH) {
      throw new Error(
        `AlbMeshedHttpEntrypoint: alb.publicJustification must be at least ${MIN_PUBLIC_JUSTIFICATION_LENGTH} chars long (got ${albCfg.publicJustification.length}) (component "${name}")`,
      );
    }
  }
}

function spiffePrincipalForGateway(saName: string, namespace: string): string {
  return `cluster.local/ns/${namespace}/sa/${saName}`;
}

function resolveSelector(
  args: AlbMeshedHttpEntrypointArgs,
): AlbMeshedHttpEntrypointWorkloadSelector {
  if (args.workloadSelector !== undefined) {
    return args.workloadSelector;
  }
  return { matchLabels: { app: args.serviceRef.name } };
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
    const selector = resolveSelector(args);

    if (!allowFromGateway) {
      pulumi.log.warn(
        `AlbMeshedHttpEntrypoint "${name}": allowFromGateway: false — the AuthorizationPolicy does NOT include the gateway principal. The entrypoint accepts only the explicit extraPrincipals list. Confirm this matches the intended trust posture.`,
      );
    }
    if (args.workloadSelector === undefined && args.acknowledgeInferredSelector === true) {
      pulumi.log.warn(
        `AlbMeshedHttpEntrypoint "${name}": acknowledgeInferredSelector: true — using the legacy inferred selector { app: "${args.serviceRef.name}" } for the AuthorizationPolicy. Prefer passing workloadSelector explicitly so the AuthorizationPolicy's match cannot drift from the actual workload labels.`,
      );
    }

    const parent = { parent: this } as const;

    const ingressNamespace = args.serviceRef.namespace;
    const workloadNamespace = args.serviceRef.namespace;

    // Ingress backend points at the istio-ingressgateway Service in mesh.ingressGatewayNamespace.
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
      annotations["alb.ingress.kubernetes.io/listen-ports"] = '[{"HTTP":80},{"HTTPS":443}]';
      annotations["alb.ingress.kubernetes.io/ssl-redirect"] = "443";
      if (albCfg.sslPolicy !== undefined) {
        annotations["alb.ingress.kubernetes.io/ssl-policy"] = albCfg.sslPolicy;
      }
    }
    if (scheme === "internet-facing" && albCfg.publicJustification !== undefined) {
      annotations[PUBLIC_JUSTIFICATION_ANNOTATION] = albCfg.publicJustification;
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
    const principals = pulumi
      .all([gatewayServiceName, ingressNs])
      .apply(([sa, ns]: [string, string]) => {
        const out: string[] = [];
        if (allowFromGateway) {
          out.push(spiffePrincipalForGateway(sa, ns));
        }
        out.push(...extraPrincipals);
        return out;
      });
    new k8s.apiextensions.CustomResource(
      apName,
      {
        apiVersion: "security.istio.io/v1beta1",
        kind: "AuthorizationPolicy",
        metadata: { name: apName, namespace: workloadNamespace },
        spec: {
          selector: { matchLabels: selector.matchLabels },
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
