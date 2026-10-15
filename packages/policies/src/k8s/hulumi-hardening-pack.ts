// HulumiK8sHardeningPack — workload, service, and ingress rule handlers
// for K8s/EKS-bound Pulumi programs. Inspects raw `kubernetes.*` resources;
// does NOT require consumers to adopt Hulumi components.
//
// Scope (M3 BDD):
//   K8S-WL-1  privileged pod (`securityContext.privileged: true`)
//   K8S-WL-2  host namespace (`hostNetwork: true`) — opt-out via suppression
//   K8S-WL-3  image reference without a canonical SHA-256 digest
//   K8S-WL-4  missing resources / limits — tier-dependent
//   K8S-SVC-1 public LoadBalancer Service without `hulumi.dev/public-justification`
//
// The actual PolicyPack instance lives in src/k8s/packs/hulumi-k8s-hardening.ts
// because @pulumi/policy's PolicyPack constructor starts a gRPC server at
// module-load time (only one pack per process).

import type { ResourceValidationPolicy } from "@pulumi/policy";

import type { PackMetadata, EnforcementLevel } from "../metadata";
import { matchSuppression, type Suppression } from "../aws/suppressions";

const DOCS_BASE = "https://github.com/kerberosmansour/hulumi/blob/main/docs/components/README.md";
const PUBLIC_JUSTIFICATION_ANNOTATION = "hulumi.dev/public-justification";

/**
 * K8s "workload" types whose pod template we inspect (Pod + the controllers
 * that wrap a PodSpec). Bounded list — adding a new controller type is a
 * deliberate change, not a glob.
 */
const POD_OWNING_TYPES = new Set([
  "kubernetes:core/v1:Pod",
  "kubernetes:apps/v1:Deployment",
  "kubernetes:apps/v1:StatefulSet",
  "kubernetes:apps/v1:DaemonSet",
  "kubernetes:apps/v1:ReplicaSet",
  "kubernetes:batch/v1:Job",
  "kubernetes:batch/v1:CronJob",
]);

const SERVICE_TYPE = "kubernetes:core/v1:Service";
const CRONJOB_TYPE = "kubernetes:batch/v1:CronJob";

interface PodSpecish {
  hostNetwork?: boolean;
  hostPID?: boolean;
  hostIPC?: boolean;
  containers?: Array<ContainerSpec>;
  initContainers?: Array<ContainerSpec>;
}

interface ContainerSpec {
  name?: string;
  image?: string;
  securityContext?: { privileged?: boolean };
  resources?: { requests?: Record<string, unknown>; limits?: Record<string, unknown> };
}

/**
 * Read the authoritative PodSpec path for each supported resource shape. Pod
 * has it at `props.spec`, CronJob at
 * `props.spec.jobTemplate.spec.template.spec`, and the remaining controllers
 * at `props.spec.template.spec`. Returns undefined for resources that don't
 * carry a PodSpec (Service, ConfigMap, etc.).
 */
function extractPodSpec(type: string, props: Record<string, unknown>): PodSpecish | undefined {
  if (type === "kubernetes:core/v1:Pod") {
    const spec = (props.spec ?? {}) as PodSpecish;
    return spec;
  }
  if (type === CRONJOB_TYPE) {
    const cronJobSpec = props.spec as
      { jobTemplate?: { spec?: { template?: { spec?: PodSpecish } } } } | undefined;
    return cronJobSpec?.jobTemplate?.spec?.template?.spec;
  }
  // Controllers wrap PodSpec at spec.template.spec.
  const ctrlSpec = props.spec as { template?: { spec?: PodSpecish } } | undefined;
  return ctrlSpec?.template?.spec;
}

function readSuppressions(config: Record<string, unknown> | undefined): readonly Suppression[] {
  const raw = config?.suppressions;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is Suppression => {
    if (x === null || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    // M3 invariant: a suppression without a non-empty `reason` is ignored.
    return (
      typeof o.ruleId === "string" && typeof o.reason === "string" && o.reason.trim().length > 0
    );
  });
}

function isPodOwningType(type: string): boolean {
  return POD_OWNING_TYPES.has(type);
}

export const k8sWl1NoPrivilegedContainer: ResourceValidationPolicy = {
  name: "HULUMI-K8S-WL-1-no-privileged-container",
  description:
    "Containers with `securityContext.privileged: true` bypass kernel-level isolation and are equivalent to root on the node. Mandatory violation; suppressible only with a reason.",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (!isPodOwningType(args.type)) return;
    const spec = extractPodSpec(args.type, args.props);
    if (spec === undefined) return;
    const suppressions = readSuppressions(
      (args.getConfig ? args.getConfig() : undefined) as Record<string, unknown> | undefined,
    );
    if (matchSuppression("HULUMI-K8S-WL-1", args.urn, suppressions).suppressed) return;
    const all = [...(spec.containers ?? []), ...(spec.initContainers ?? [])];
    for (const c of all) {
      if (c.securityContext?.privileged === true) {
        reportViolation(
          `HULUMI-K8S-WL-1: container "${c.name ?? "<unnamed>"}" in ${args.urn} has securityContext.privileged: true. Privileged containers are root on the node. Docs: ${DOCS_BASE}`,
        );
      }
    }
  },
};

export const k8sWl2NoHostNamespace: ResourceValidationPolicy = {
  name: "HULUMI-K8S-WL-2-no-host-namespace",
  description:
    "Pods with `hostNetwork: true`, `hostPID: true`, or `hostIPC: true` share the node's network/process/IPC namespaces and bypass NetworkPolicy enforcement. Mandatory violation; suppressible with a reason for legitimate node-agent workloads.",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (!isPodOwningType(args.type)) return;
    const spec = extractPodSpec(args.type, args.props);
    if (spec === undefined) return;
    const suppressions = readSuppressions(
      (args.getConfig ? args.getConfig() : undefined) as Record<string, unknown> | undefined,
    );
    if (matchSuppression("HULUMI-K8S-WL-2", args.urn, suppressions).suppressed) return;
    if (spec.hostNetwork === true) {
      reportViolation(
        `HULUMI-K8S-WL-2: ${args.urn} sets hostNetwork: true. Bypasses NetworkPolicy and exposes the node's network namespace. Docs: ${DOCS_BASE}`,
      );
    }
    if (spec.hostPID === true) {
      reportViolation(
        `HULUMI-K8S-WL-2: ${args.urn} sets hostPID: true. Exposes the node's process namespace. Docs: ${DOCS_BASE}`,
      );
    }
    if (spec.hostIPC === true) {
      reportViolation(
        `HULUMI-K8S-WL-2: ${args.urn} sets hostIPC: true. Exposes the node's IPC namespace. Docs: ${DOCS_BASE}`,
      );
    }
  },
};

function imageHasCanonicalSha256Digest(image: unknown): image is string {
  return typeof image === "string" && /^[^@\s]+@sha256:[a-f0-9]{64}$/.test(image);
}

export const k8sWl3NoLatestImage: ResourceValidationPolicy = {
  name: "HULUMI-K8S-WL-3-no-mutable-image-tag",
  description:
    "Container images must use a canonical SHA-256 digest. Registry tags, including semantic-version tags, can be repointed and are not content-integrity evidence.",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (!isPodOwningType(args.type)) return;
    const spec = extractPodSpec(args.type, args.props);
    if (spec === undefined) return;
    const suppressions = readSuppressions(
      (args.getConfig ? args.getConfig() : undefined) as Record<string, unknown> | undefined,
    );
    if (matchSuppression("HULUMI-K8S-WL-3", args.urn, suppressions).suppressed) return;
    const all = [...(spec.containers ?? []), ...(spec.initContainers ?? [])];
    for (const c of all) {
      if (!imageHasCanonicalSha256Digest(c.image)) {
        reportViolation(
          `HULUMI-K8S-WL-3: container "${c.name ?? "<unnamed>"}" in ${args.urn} is not pinned to one canonical SHA-256 digest. Use an image reference ending in @sha256:<64 lowercase hex digits>. Docs: ${DOCS_BASE}`,
        );
      }
    }
  },
};

export const k8sWl4ResourcesRequired: ResourceValidationPolicy = {
  name: "HULUMI-K8S-WL-4-resources-required",
  description:
    "Containers must declare both `resources.requests` and `resources.limits`. Without them, scheduler decisions and noisy-neighbor protection break down. Advisory by default; tier-aware consumers can promote to mandatory via the `enforcement` config knob.",
  enforcementLevel: "advisory",
  validateResource: (args, reportViolation) => {
    if (!isPodOwningType(args.type)) return;
    const spec = extractPodSpec(args.type, args.props);
    if (spec === undefined) return;
    const suppressions = readSuppressions(
      (args.getConfig ? args.getConfig() : undefined) as Record<string, unknown> | undefined,
    );
    if (matchSuppression("HULUMI-K8S-WL-4", args.urn, suppressions).suppressed) return;
    const all = [...(spec.containers ?? []), ...(spec.initContainers ?? [])];
    for (const c of all) {
      const req = c.resources?.requests;
      const lim = c.resources?.limits;
      if (req === undefined || Object.keys(req).length === 0) {
        reportViolation(
          `HULUMI-K8S-WL-4: container "${c.name ?? "<unnamed>"}" in ${args.urn} declares no resources.requests. Docs: ${DOCS_BASE}`,
        );
      }
      if (lim === undefined || Object.keys(lim).length === 0) {
        reportViolation(
          `HULUMI-K8S-WL-4: container "${c.name ?? "<unnamed>"}" in ${args.urn} declares no resources.limits. Docs: ${DOCS_BASE}`,
        );
      }
    }
  },
};

export const k8sSvc1PublicLoadBalancerNeedsJustification: ResourceValidationPolicy = {
  name: "HULUMI-K8S-SVC-1-public-loadbalancer-justification",
  description:
    "A K8s Service of `type: LoadBalancer` provisions a cloud-managed public load balancer. Hulumi requires the Service to carry a `hulumi.dev/public-justification` annotation explaining why this is on the public internet — same posture as `AlbMeshedHttpEntrypoint`'s internet-facing gate.",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (args.type !== SERVICE_TYPE) return;
    const spec = (args.props.spec ?? {}) as { type?: string };
    if (spec.type !== "LoadBalancer") return;
    const suppressions = readSuppressions(
      (args.getConfig ? args.getConfig() : undefined) as Record<string, unknown> | undefined,
    );
    if (matchSuppression("HULUMI-K8S-SVC-1", args.urn, suppressions).suppressed) return;
    const meta = (args.props.metadata ?? {}) as { annotations?: Record<string, string> };
    const justification = meta.annotations?.[PUBLIC_JUSTIFICATION_ANNOTATION];
    if (justification === undefined || justification.trim().length === 0) {
      reportViolation(
        `HULUMI-K8S-SVC-1: Service ${args.urn} is type=LoadBalancer but lacks the ${PUBLIC_JUSTIFICATION_ANNOTATION} annotation. Add a plain-language reason explaining why this workload faces the public internet. Docs: ${DOCS_BASE}`,
      );
    }
  },
};

export const HULUMI_K8S_HARDENING_PACK_ENFORCEMENT_LEVELS = {
  WL1: "mandatory",
  WL2: "mandatory",
  WL3: "mandatory",
  WL4: "advisory",
  SVC1: "mandatory",
} as const satisfies Record<string, EnforcementLevel>;

export const hulumiK8sHardeningPackMetadata: PackMetadata = {
  id: "hulumi-k8s-hardening-pack",
  title: "Hulumi K8s Hardening Pack",
  framework: "hulumi-k8s",
  frameworkVersion: "0.1.0",
  severity: "high",
  rules: [
    {
      id: "HULUMI-K8S-WL-1",
      title: "No privileged containers",
      description: k8sWl1NoPrivilegedContainer.description!,
      severity: "critical",
      enforcement: "mandatory",
      frameworkIds: ["CCM:UEM-09", "NIST-800-53-r5:AC-6", "CIS-K8S:5.2.1"],
      docsUrl: DOCS_BASE,
    },
    {
      id: "HULUMI-K8S-WL-2",
      title: "No host namespace sharing",
      description: k8sWl2NoHostNamespace.description!,
      severity: "critical",
      enforcement: "mandatory",
      frameworkIds: ["CCM:UEM-09", "CIS-K8S:5.2.4"],
      docsUrl: DOCS_BASE,
    },
    {
      id: "HULUMI-K8S-WL-3",
      title: "Canonical SHA-256 image digest required",
      description: k8sWl3NoLatestImage.description!,
      severity: "high",
      enforcement: "mandatory",
      frameworkIds: ["CCM:CCC-04", "NIST-800-53-r5:CM-2"],
      docsUrl: DOCS_BASE,
    },
    {
      id: "HULUMI-K8S-WL-4",
      title: "Container resources required",
      description: k8sWl4ResourcesRequired.description!,
      severity: "medium",
      enforcement: "advisory",
      frameworkIds: ["CCM:CEK-08"],
      docsUrl: DOCS_BASE,
    },
    {
      id: "HULUMI-K8S-SVC-1",
      title: "Public LoadBalancer requires justification",
      description: k8sSvc1PublicLoadBalancerNeedsJustification.description!,
      severity: "high",
      enforcement: "mandatory",
      frameworkIds: ["CCM:DSP-04", "NIST-800-53-r5:SC-7"],
      docsUrl: DOCS_BASE,
    },
  ],
};
