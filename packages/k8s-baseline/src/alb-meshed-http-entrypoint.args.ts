import type { IstioFoundation } from "./istio-foundation";

export type AlbScheme = "internal" | "internet-facing";
export type EntrypointMTLSMode = "STRICT" | "PERMISSIVE";

export interface AlbMeshedHttpEntrypointServiceRef {
  namespace: string;
  name: string;
  port: number;
}

export interface AlbMeshedHttpEntrypointAuthZ {
  /**
   * Default `true`. When `false`, the AuthorizationPolicy's `from.principals`
   * does NOT include the gateway SA — the entrypoint is open to any caller
   * matching the workload service. Refused unless `acknowledgeNoAuthZ: true`
   * AND `extraPrincipals` is non-empty (i.e., the consumer explicitly
   * narrows authorization elsewhere).
   */
  allowFromGateway?: boolean;
  /**
   * Additional SPIFFE IDs to allow in (e.g., a sister service). Always
   * appended; gateway principal is non-overridable when allowFromGateway is
   * `true`.
   */
  extraPrincipals?: string[];
  /**
   * Required when `allowFromGateway: false`. Without this flag, the
   * "no AuthZ" posture refuses construction.
   */
  acknowledgeNoAuthZ?: boolean;
}

export interface AlbMeshedHttpEntrypointAlb {
  healthcheckPath?: string;
  healthcheckPort?: number;
  groupName?: string;
  certificateArn?: string;
  sslPolicy?: string;
}

export interface AlbMeshedHttpEntrypointArgs {
  /** The mesh foundation that owns the ingress gateway. */
  mesh: IstioFoundation;
  /** Workload host (FQDN). Refused if not a basic FQDN. */
  host: string;
  /** Workload service to route to. */
  serviceRef: AlbMeshedHttpEntrypointServiceRef;
  /** Default `"internal"`. */
  scheme?: AlbScheme;
  /** Default falls back to mesh.defaultMTLS at construction time. */
  mTLS?: EntrypointMTLSMode;
  /** Default `{ allowFromGateway: true, extraPrincipals: [] }`. */
  authorizationPolicy?: AlbMeshedHttpEntrypointAuthZ;
  /** Default: `/healthz/ready`, `15021`, `"default"`. */
  alb?: AlbMeshedHttpEntrypointAlb;
}
