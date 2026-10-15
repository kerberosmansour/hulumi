import { readFile } from "node:fs/promises";
import * as https from "node:https";
import { isIP } from "node:net";
import { URLSearchParams } from "node:url";

import type {
  JsonPatchOperation,
  KubernetesTaint,
  NodeSnapshot,
} from "./trusted-node-label-reconciler-core";

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_PAGES = 12;
const PAGE_SIZE = 100;
const NODE_NAME = /^[a-z0-9](?:[-a-z0-9.]{0,251}[a-z0-9])?$/u;
const LABEL_SELECTOR_KEY =
  /^(?=.{3,317}$)[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,251}[A-Za-z0-9])?\/[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,61}[A-Za-z0-9])?$/u;
const LABEL_SELECTOR_VALUE = /^(?=.{1,63}$)[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?$/u;

export type KubernetesAdapterErrorCode =
  | "kubernetes_transport_failed"
  | "kubernetes_unauthorized"
  | "kubernetes_response_invalid"
  | "kubernetes_response_too_large"
  | "kubernetes_pagination_invalid"
  | "kubernetes_node_bound_exceeded"
  | "kubernetes_patch_rejected";

export class KubernetesAdapterError extends Error {
  readonly code: KubernetesAdapterErrorCode;
  readonly statusCode: number | undefined;

  constructor(code: KubernetesAdapterErrorCode, statusCode?: number, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "KubernetesAdapterError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface KubernetesTransportRequest {
  readonly hostname: string;
  readonly port: number;
  readonly method: "GET" | "PATCH";
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly ca: Buffer;
  readonly body?: string;
}

export interface KubernetesTransportResponse {
  readonly statusCode: number;
  readonly body: string;
}

export type KubernetesTransport = (
  request: KubernetesTransportRequest,
) => Promise<KubernetesTransportResponse>;

export interface TrustedNodeLabelKubernetesConfig {
  readonly hostname: string;
  readonly port: number;
  readonly tokenPath: string;
  readonly caPath: string;
  readonly nodeGroupName: string;
  readonly maxNodesPerCycle: number;
}

export interface TrustedNodeLabelKubernetesAdapter {
  listCandidateNodes(
    protectedLabelKey: string,
    protectedLabelValue: string,
  ): Promise<NodeSnapshot[]>;
  getNode(nodeName: string): Promise<NodeSnapshot>;
  patchNode(
    nodeName: string,
    patch: readonly JsonPatchOperation[],
    protectedLabelKey: string,
    protectedLabelValue: string,
  ): Promise<void>;
}

async function defaultTransport(
  request: KubernetesTransportRequest,
): Promise<KubernetesTransportResponse> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: request.hostname,
        port: request.port,
        method: request.method,
        path: request.path,
        headers: request.headers,
        ca: request.ca,
        rejectUnauthorized: true,
        ...(isIP(request.hostname) === 0 ? { servername: request.hostname } : {}),
      },
      (response) => {
        let body = "";
        let bodyBytes = 0;
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          bodyBytes += Buffer.byteLength(chunk, "utf8");
          if (bodyBytes > MAX_RESPONSE_BYTES) {
            req.destroy(new KubernetesAdapterError("kubernetes_response_too_large"));
            return;
          }
          body += chunk;
        });
        response.on("end", () => resolve({ statusCode: response.statusCode ?? 0, body }));
      },
    );
    req.setTimeout(10_000, () => {
      req.destroy(new KubernetesAdapterError("kubernetes_transport_failed"));
    });
    req.on("error", reject);
    if (request.body !== undefined) req.write(request.body);
    req.end();
  });
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function parseStringMap(value: unknown): Record<string, string> | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  const entries = Object.entries(record);
  if (entries.length > 256 || entries.some(([, entry]) => typeof entry !== "string")) {
    return undefined;
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

function parseTaints(value: unknown): KubernetesTaint[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 64) return undefined;
  const result: KubernetesTaint[] = [];
  for (const item of value) {
    const taint = asRecord(item);
    if (
      taint === undefined ||
      typeof taint.key !== "string" ||
      typeof taint.value !== "string" ||
      (taint.effect !== "NoSchedule" &&
        taint.effect !== "PreferNoSchedule" &&
        taint.effect !== "NoExecute")
    ) {
      return undefined;
    }
    result.push({ key: taint.key, value: taint.value, effect: taint.effect });
  }
  return result;
}

function parseNode(value: unknown): NodeSnapshot {
  const node = asRecord(value);
  const metadata = asRecord(node?.metadata);
  const spec = asRecord(node?.spec);
  const labels = parseStringMap(metadata?.labels);
  const taints = parseTaints(spec?.taints);
  if (
    node?.apiVersion !== "v1" ||
    node.kind !== "Node" ||
    typeof metadata?.name !== "string" ||
    !NODE_NAME.test(metadata.name) ||
    typeof metadata.uid !== "string" ||
    typeof metadata.resourceVersion !== "string" ||
    typeof spec?.providerID !== "string" ||
    labels === undefined ||
    taints === undefined
  ) {
    throw new KubernetesAdapterError("kubernetes_response_invalid");
  }
  return {
    name: metadata.name,
    uid: metadata.uid,
    resourceVersion: metadata.resourceVersion,
    providerId: spec.providerID,
    labels,
    taints,
  };
}

function parseJson(body: string): unknown {
  if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) {
    throw new KubernetesAdapterError("kubernetes_response_too_large");
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new KubernetesAdapterError("kubernetes_response_invalid");
  }
}

function sameNodeSnapshot(left: NodeSnapshot, right: NodeSnapshot): boolean {
  return (
    left.name === right.name &&
    left.uid === right.uid &&
    left.resourceVersion === right.resourceVersion &&
    left.providerId === right.providerId &&
    JSON.stringify(left.labels) === JSON.stringify(right.labels) &&
    JSON.stringify(left.taints) === JSON.stringify(right.taints)
  );
}

function isExactPatch(
  patch: readonly JsonPatchOperation[],
  protectedLabelKey: string,
  protectedLabelValue: string,
): boolean {
  if (
    !LABEL_SELECTOR_KEY.test(protectedLabelKey) ||
    !LABEL_SELECTOR_VALUE.test(protectedLabelValue)
  ) {
    return false;
  }
  if (patch.length !== 4 && patch.length !== 5) return false;
  const [uid, resourceVersion, providerId] = patch;
  if (
    uid?.op !== "test" ||
    uid.path !== "/metadata/uid" ||
    uid.value.length < 1 ||
    uid.value.length > 128 ||
    resourceVersion?.op !== "test" ||
    resourceVersion.path !== "/metadata/resourceVersion" ||
    resourceVersion.value.length < 1 ||
    resourceVersion.value.length > 128 ||
    providerId?.op !== "test" ||
    providerId.path !== "/spec/providerID" ||
    providerId.value.length < 1 ||
    providerId.value.length > 256
  ) {
    return false;
  }

  const labelPath = `/metadata/labels/${protectedLabelKey.replaceAll("~", "~0").replaceAll("/", "~1")}`;
  if (patch.length === 4) {
    const add = patch[3];
    return add.op === "add" && add.path === labelPath && add.value === protectedLabelValue;
  }
  const labelTest = patch[3];
  const remove = patch[4];
  return (
    labelTest.op === "test" &&
    labelTest.path === labelPath &&
    labelTest.value === protectedLabelValue &&
    remove.op === "remove" &&
    remove.path === labelTest.path
  );
}

export function createTrustedNodeLabelKubernetesAdapter(
  config: TrustedNodeLabelKubernetesConfig,
  transport: KubernetesTransport = defaultTransport,
  loadFile: (path: string) => Promise<Buffer> = readFile,
): TrustedNodeLabelKubernetesAdapter {
  async function request(
    method: "GET" | "PATCH",
    path: string,
    body?: string,
  ): Promise<KubernetesTransportResponse> {
    let token: Buffer;
    let ca: Buffer;
    try {
      [token, ca] = await Promise.all([loadFile(config.tokenPath), loadFile(config.caPath)]);
    } catch (error) {
      throw new KubernetesAdapterError("kubernetes_transport_failed", undefined, error);
    }
    const trimmedToken = token.toString("utf8").trim();
    if (trimmedToken.length < 16 || trimmedToken.length > 16 * 1024 || ca.length === 0) {
      throw new KubernetesAdapterError("kubernetes_unauthorized");
    }
    try {
      return await transport({
        hostname: config.hostname,
        port: config.port,
        method,
        path,
        ca,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${trimmedToken}`,
          ...(body === undefined
            ? {}
            : {
                "Content-Type": "application/json-patch+json",
                "Content-Length": String(Buffer.byteLength(body, "utf8")),
              }),
        },
        ...(body === undefined ? {} : { body }),
      });
    } catch (error) {
      if (error instanceof KubernetesAdapterError) throw error;
      throw new KubernetesAdapterError("kubernetes_transport_failed", undefined, error);
    }
  }

  return {
    async listCandidateNodes(
      protectedLabelKey: string,
      protectedLabelValue: string,
    ): Promise<NodeSnapshot[]> {
      if (
        !LABEL_SELECTOR_KEY.test(protectedLabelKey) ||
        !LABEL_SELECTOR_VALUE.test(protectedLabelValue) ||
        !LABEL_SELECTOR_VALUE.test(config.nodeGroupName)
      ) {
        throw new KubernetesAdapterError("kubernetes_response_invalid");
      }
      const nodesByUid = new Map<string, NodeSnapshot>();
      const uidByName = new Map<string, string>();

      async function collect(labelSelector: string): Promise<void> {
        const seenContinuations = new Set<string>();
        let continuation: string | undefined;
        for (let page = 0; page < MAX_PAGES; page += 1) {
          const query = new URLSearchParams({
            limit: String(Math.min(PAGE_SIZE, config.maxNodesPerCycle)),
            labelSelector,
          });
          if (continuation !== undefined) query.set("continue", continuation);
          const response = await request("GET", `/api/v1/nodes?${query.toString()}`);
          if (response.statusCode === 401 || response.statusCode === 403) {
            throw new KubernetesAdapterError("kubernetes_unauthorized", response.statusCode);
          }
          if (response.statusCode !== 200) {
            throw new KubernetesAdapterError("kubernetes_transport_failed", response.statusCode);
          }
          const pageBody = asRecord(parseJson(response.body));
          const metadata = asRecord(pageBody?.metadata);
          const items = pageBody?.items;
          if (
            pageBody?.apiVersion !== "v1" ||
            pageBody.kind !== "NodeList" ||
            !Array.isArray(items)
          ) {
            throw new KubernetesAdapterError("kubernetes_response_invalid");
          }
          for (const item of items) {
            const node = parseNode(item);
            const existingUid = uidByName.get(node.name);
            const existingNode = nodesByUid.get(node.uid);
            if (
              (existingUid !== undefined && existingUid !== node.uid) ||
              (existingNode !== undefined && !sameNodeSnapshot(existingNode, node))
            ) {
              throw new KubernetesAdapterError("kubernetes_response_invalid");
            }
            if (existingNode === undefined) {
              uidByName.set(node.name, node.uid);
              nodesByUid.set(node.uid, node);
              if (nodesByUid.size > config.maxNodesPerCycle) {
                throw new KubernetesAdapterError("kubernetes_node_bound_exceeded");
              }
            }
          }
          const next = metadata?.continue;
          if (next === undefined || next === "") return;
          if (typeof next !== "string" || next.length > 1_024 || seenContinuations.has(next)) {
            throw new KubernetesAdapterError("kubernetes_pagination_invalid");
          }
          seenContinuations.add(next);
          continuation = next;
        }
        throw new KubernetesAdapterError("kubernetes_pagination_invalid");
      }

      await collect(`eks.amazonaws.com/nodegroup=${config.nodeGroupName}`);
      await collect(`${protectedLabelKey}=${protectedLabelValue}`);
      return [...nodesByUid.values()];
    },

    async getNode(nodeName: string): Promise<NodeSnapshot> {
      if (!NODE_NAME.test(nodeName)) {
        throw new KubernetesAdapterError("kubernetes_response_invalid");
      }
      const response = await request("GET", `/api/v1/nodes/${encodeURIComponent(nodeName)}`);
      if (response.statusCode === 401 || response.statusCode === 403) {
        throw new KubernetesAdapterError("kubernetes_unauthorized", response.statusCode);
      }
      if (response.statusCode !== 200) {
        throw new KubernetesAdapterError("kubernetes_transport_failed", response.statusCode);
      }
      return parseNode(parseJson(response.body));
    },

    async patchNode(
      nodeName: string,
      patch: readonly JsonPatchOperation[],
      protectedLabelKey: string,
      protectedLabelValue: string,
    ): Promise<void> {
      if (
        !NODE_NAME.test(nodeName) ||
        !isExactPatch(patch, protectedLabelKey, protectedLabelValue)
      ) {
        throw new KubernetesAdapterError("kubernetes_response_invalid");
      }
      const body = JSON.stringify(patch);
      const response = await request(
        "PATCH",
        `/api/v1/nodes/${encodeURIComponent(nodeName)}`,
        body,
      );
      if (response.statusCode !== 200) {
        throw new KubernetesAdapterError("kubernetes_patch_rejected", response.statusCode);
      }
    },
  };
}
