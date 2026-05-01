import type { IstioFoundation } from "./istio-foundation";

export type AlbScheme = "internal" | "internet-facing";
export type EntrypointMTLSMode = "STRICT" | "PERMISSIVE";

/** Hard cap on workloadSelector match-labels (max 32). */
export const MAX_WORKLOAD_SELECTOR_LABELS = 32;
/** Hard cap on extraPrincipals SPIFFE ID list (max 64). */
export const MAX_EXTRA_PRINCIPALS = 64;
/** Minimum length of `alb.publicJustification` when `scheme: "internet-facing"`. */
export const MIN_PUBLIC_JUSTIFICATION_LENGTH = 8;

export interface AlbMeshedHttpEntrypointServiceRef {
  namespace: string;
  name: string;
  port: number;
}

/**
 * Explicit selector labels for the AuthorizationPolicy `selector.matchLabels`.
 * Required by M2's contract — the legacy inferred selector (`{ app: serviceRef.name }`)
 * is still available via `acknowledgeInferredSelector: true`, but is no longer the
 * silent default.
 */
export interface AlbMeshedHttpEntrypointWorkloadSelector {
  matchLabels: Record<string, string>;
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
   * `true`. Bounded at {@link MAX_EXTRA_PRINCIPALS}.
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
  /**
   * Required when `scheme: "internet-facing"`. A plain-language reason
   * (>= {@link MIN_PUBLIC_JUSTIFICATION_LENGTH} chars) recorded as the
   * `hulumi.dev/public-justification` annotation on the emitted Ingress
   * for audit.
   */
  publicJustification?: string;
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
  /**
   * Explicit selector labels for the AuthorizationPolicy. Mutually
   * exclusive with `acknowledgeInferredSelector`. Bounded at
   * {@link MAX_WORKLOAD_SELECTOR_LABELS}.
   */
  workloadSelector?: AlbMeshedHttpEntrypointWorkloadSelector;
  /**
   * When `true`, the AuthorizationPolicy uses the legacy inferred
   * `{ app: serviceRef.name }` selector and the construction emits a
   * warn. M2 contract: at least one of `workloadSelector` or
   * `acknowledgeInferredSelector` must be set.
   */
  acknowledgeInferredSelector?: boolean;
}
