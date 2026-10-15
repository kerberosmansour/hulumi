import { execFile } from "node:child_process";
import { createServer } from "node:https";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, test, vi } from "vitest";

import { runTrustedNodeLabelControllerFromEnvironment } from "../src";
import {
  AwsEvidenceError,
  createTrustedNodeLabelAwsAdapter,
  type TrustedNodeLabelAwsClients,
} from "../src/trusted-node-label-controller-aws";
import {
  createTrustedNodeLabelKubernetesAdapter,
  KubernetesAdapterError,
  type KubernetesTransportRequest,
} from "../src/trusted-node-label-controller-kubernetes";
import { trustedNodeLabelConfigurationFromEnvironment } from "../src/trusted-node-label-controller-main";
import { runTrustedNodeLabelControllerCycle } from "../src/trusted-node-label-controller";

const NOW = 1_800_000_000_000;
const execFileAsync = promisify(execFile);

function nodeObject(resourceVersion = "100") {
  return {
    apiVersion: "v1",
    kind: "Node",
    metadata: {
      name: "ip-10-0-0-10.eu-west-2.compute.internal",
      uid: "uid-1",
      resourceVersion,
      labels: {
        "eks.amazonaws.com/nodegroup": "trusted-workers",
        "topology.kubernetes.io/zone": "eu-west-2a",
        "node.kubernetes.io/instance-type": "m7i.large",
      },
    },
    spec: {
      providerID: "aws:///eu-west-2a/i-0123456789abcdef0",
      taints: [{ key: "dedicated", value: "trusted", effect: "NoSchedule" }],
    },
  };
}

function validEnvironment(): Record<string, string | undefined> {
  return {
    HULUMI_CLUSTER_NAME: "prod-eks",
    HULUMI_NODE_GROUP_NAME: "trusted-workers",
    HULUMI_AWS_ACCOUNT_ID: "111122223333",
    HULUMI_AWS_REGION: "eu-west-2",
    HULUMI_PROTECTED_LABEL_KEY: "identity.node-restriction.kubernetes.io/workload",
    HULUMI_PROTECTED_LABEL_VALUE: "trusted",
    HULUMI_ALLOWED_INSTANCE_TYPES_JSON: '["m7i.large"]',
    HULUMI_EXPECTED_TAINTS_JSON: '[{"key":"dedicated","value":"trusted","effect":"NoSchedule"}]',
    HULUMI_RECONCILE_INTERVAL_SECONDS: "60",
    HULUMI_MAX_EVIDENCE_AGE_SECONDS: "120",
    HULUMI_MAX_EVIDENCE_SKEW_SECONDS: "15",
    HULUMI_MAX_NODES_PER_CYCLE: "200",
    HULUMI_METRIC_NAMESPACE: "Hulumi/EksTrustedNodeLabelReconciler",
    HULUMI_KUBERNETES_TOKEN_PATH: "/token",
    HULUMI_KUBERNETES_CA_PATH: "/ca",
    KUBERNETES_SERVICE_HOST: "kubernetes.default.svc",
    KUBERNETES_SERVICE_PORT_HTTPS: "443",
  };
}

describe("AWS evidence adapter", () => {
  test("BDD-M2-1: constructs exact provider commands and returns complete bounded attestations", async () => {
    const seen: string[] = [];
    const sender = {
      send: vi.fn(async (command: unknown) => {
        const name = (command as { constructor: { name: string } }).constructor.name;
        seen.push(name);
        if (name === "DescribeNodegroupCommand") {
          return {
            nodegroup: {
              clusterName: "prod-eks",
              nodegroupName: "trusted-workers",
              status: "ACTIVE",
              resources: { autoScalingGroups: [{ name: "asg-exact" }] },
              scalingConfig: { minSize: 1, desiredSize: 1, maxSize: 3 },
            },
          };
        }
        if (name === "DescribeAutoScalingGroupsCommand") {
          return {
            AutoScalingGroups: [
              {
                AutoScalingGroupName: "asg-exact",
                Instances: [
                  {
                    InstanceId: "i-0123456789abcdef0",
                    LifecycleState: "InService",
                    HealthStatus: "Healthy",
                  },
                ],
              },
            ],
          };
        }
        if (name === "DescribeInstancesCommand") {
          return {
            Reservations: [
              {
                OwnerId: "111122223333",
                Instances: [
                  {
                    InstanceId: "i-0123456789abcdef0",
                    Placement: { AvailabilityZone: "eu-west-2a" },
                    InstanceType: "m7i.large",
                    State: { Name: "running" },
                  },
                ],
              },
            ],
          };
        }
        return {};
      }),
    };
    const clients: TrustedNodeLabelAwsClients = {
      eks: sender,
      autoScaling: sender,
      ec2: sender,
      cloudWatch: sender,
    };
    const adapter = createTrustedNodeLabelAwsAdapter(
      {
        clusterName: "prod-eks",
        nodeGroupName: "trusted-workers",
        awsRegion: "eu-west-2",
        metricNamespace: "Hulumi/EksTrustedNodeLabelReconciler",
      },
      clients,
      () => NOW,
    );
    const group = await adapter.describeNodeGroup();
    const asgs = await adapter.describeAutoScalingGroups(group.autoScalingGroupNames);
    const instance = await adapter.describeEc2Instance("i-0123456789abcdef0");
    await adapter.publishMetrics({
      decisions: 1,
      failures: 0,
      missingTrustedLabels: 0,
      timestamp: new Date(NOW),
    });

    expect(group.autoScalingGroupNames).toEqual(["asg-exact"]);
    expect(asgs[0].instances[0]).toMatchObject({
      instanceId: "i-0123456789abcdef0",
      lifecycleState: "InService",
      healthStatus: "Healthy",
    });
    expect(instance).toMatchObject({
      accountId: "111122223333",
      availabilityZone: "eu-west-2a",
      instanceType: "m7i.large",
    });
    expect(seen).toEqual([
      "DescribeNodegroupCommand",
      "DescribeAutoScalingGroupsCommand",
      "DescribeInstancesCommand",
      "PutMetricDataCommand",
    ]);
  });

  test("BDD-M2-2: partial or paginated ASG evidence fails closed", async () => {
    const clients: TrustedNodeLabelAwsClients = {
      eks: { send: vi.fn() },
      autoScaling: {
        send: vi.fn(async () => ({ NextToken: "unexpected", AutoScalingGroups: [] })),
      },
      ec2: { send: vi.fn() },
      cloudWatch: { send: vi.fn() },
    };
    const adapter = createTrustedNodeLabelAwsAdapter(
      {
        clusterName: "prod-eks",
        nodeGroupName: "trusted-workers",
        awsRegion: "eu-west-2",
        metricNamespace: "Hulumi/EksTrustedNodeLabelReconciler",
      },
      clients,
      () => NOW,
    );
    await expect(adapter.describeAutoScalingGroups(["asg-exact"])).rejects.toMatchObject({
      code: "asg_response_incomplete",
    } satisfies Partial<AwsEvidenceError>);
  });

  test("BDD-M2-2: EC2 evidence containing an unrequested instance fails closed", async () => {
    const clients: TrustedNodeLabelAwsClients = {
      eks: { send: vi.fn() },
      autoScaling: { send: vi.fn() },
      ec2: {
        send: vi.fn(async () => ({
          Reservations: [
            {
              OwnerId: "111122223333",
              Instances: [
                {
                  InstanceId: "i-0123456789abcdef0",
                  Placement: { AvailabilityZone: "eu-west-2a" },
                  InstanceType: "m7i.large",
                  State: { Name: "running" },
                },
                {
                  InstanceId: "i-0fedcba9876543210",
                  Placement: { AvailabilityZone: "eu-west-2a" },
                  InstanceType: "m7i.large",
                  State: { Name: "running" },
                },
              ],
            },
          ],
        })),
      },
      cloudWatch: { send: vi.fn() },
    };
    const adapter = createTrustedNodeLabelAwsAdapter(
      {
        clusterName: "prod-eks",
        nodeGroupName: "trusted-workers",
        awsRegion: "eu-west-2",
        metricNamespace: "Hulumi/EksTrustedNodeLabelReconciler",
      },
      clients,
      () => NOW,
    );

    await expect(adapter.describeEc2Instance("i-0123456789abcdef0")).rejects.toMatchObject({
      code: "ec2_response_invalid",
    } satisfies Partial<AwsEvidenceError>);
  });
});

describe("Kubernetes API adapter", () => {
  test("BDD-M2-1: uses the projected token/CA, parses Nodes and sends only JSON Patch", async () => {
    const requests: KubernetesTransportRequest[] = [];
    const transport = vi.fn(async (request: KubernetesTransportRequest) => {
      requests.push(request);
      if (request.method === "PATCH") return { statusCode: 200, body: "{}" };
      if (request.path.includes("?")) {
        return {
          statusCode: 200,
          body: JSON.stringify({
            apiVersion: "v1",
            kind: "NodeList",
            metadata: {},
            items: [nodeObject()],
          }),
        };
      }
      return { statusCode: 200, body: JSON.stringify(nodeObject()) };
    });
    const adapter = createTrustedNodeLabelKubernetesAdapter(
      {
        hostname: "kubernetes.default.svc",
        port: 443,
        tokenPath: "/token",
        caPath: "/ca",
        nodeGroupName: "trusted-workers",
        maxNodesPerCycle: 10,
      },
      transport,
      async (path) => Buffer.from(path === "/token" ? "token-value-123456789" : "test-ca"),
    );
    const nodes = await adapter.listCandidateNodes(
      "identity.node-restriction.kubernetes.io/workload",
      "trusted",
    );
    expect(nodes).toHaveLength(1);
    expect(await adapter.getNode(nodes[0].name)).toMatchObject({ resourceVersion: "100" });
    const patch = [
      { op: "test" as const, path: "/metadata/uid", value: "uid-1" },
      { op: "test" as const, path: "/metadata/resourceVersion", value: "100" },
      {
        op: "test" as const,
        path: "/spec/providerID",
        value: "aws:///eu-west-2a/i-0123456789abcdef0",
      },
      {
        op: "add" as const,
        path: "/metadata/labels/identity.node-restriction.kubernetes.io~1workload",
        value: "trusted",
      },
    ];
    await adapter.patchNode(
      nodes[0].name,
      patch,
      "identity.node-restriction.kubernetes.io/workload",
      "trusted",
    );
    expect(requests).toHaveLength(4);
    expect(requests[0].path).toContain(
      "labelSelector=eks.amazonaws.com%2Fnodegroup%3Dtrusted-workers",
    );
    expect(requests[1].path).toContain(
      "labelSelector=identity.node-restriction.kubernetes.io%2Fworkload%3Dtrusted",
    );
    expect(
      requests.every((request) => request.headers.Authorization === "Bearer token-value-123456789"),
    ).toBe(true);
    expect(requests[3]).toMatchObject({
      method: "PATCH",
      headers: { "Content-Type": "application/json-patch+json" },
      body: JSON.stringify(patch),
    });
  });

  test("BDD-M4a-6: accepts only an exact value-tested remove patch", async () => {
    const requests: KubernetesTransportRequest[] = [];
    const adapter = createTrustedNodeLabelKubernetesAdapter(
      {
        hostname: "kubernetes.default.svc",
        port: 443,
        tokenPath: "/token",
        caPath: "/ca",
        nodeGroupName: "trusted-workers",
        maxNodesPerCycle: 10,
      },
      vi.fn(async (request: KubernetesTransportRequest) => {
        requests.push(request);
        return { statusCode: 200, body: "{}" };
      }),
      async (path) => Buffer.from(path === "/token" ? "token-value-123456789" : "test-ca"),
    );
    const labelPath = "/metadata/labels/identity.node-restriction.kubernetes.io~1workload";
    const removePatch = [
      { op: "test" as const, path: "/metadata/uid", value: "uid-1" },
      { op: "test" as const, path: "/metadata/resourceVersion", value: "100" },
      {
        op: "test" as const,
        path: "/spec/providerID",
        value: "aws:///eu-west-2a/i-0123456789abcdef0",
      },
      { op: "test" as const, path: labelPath, value: "trusted" },
      { op: "remove" as const, path: labelPath },
    ];

    await adapter.patchNode(
      "ip-10-0-0-10.eu-west-2.compute.internal",
      removePatch,
      "identity.node-restriction.kubernetes.io/workload",
      "trusted",
    );
    expect(requests).toHaveLength(1);
    await expect(
      adapter.patchNode(
        "ip-10-0-0-10.eu-west-2.compute.internal",
        [...removePatch.slice(0, 3), removePatch[4]],
        "identity.node-restriction.kubernetes.io/workload",
        "trusted",
      ),
    ).rejects.toMatchObject({ code: "kubernetes_response_invalid" });
    await expect(
      adapter.patchNode(
        "ip-10-0-0-10.eu-west-2.compute.internal",
        [...removePatch.slice(0, 4), { op: "remove" as const, path: `${labelPath}-other` }],
        "identity.node-restriction.kubernetes.io/workload",
        "trusted",
      ),
    ).rejects.toMatchObject({ code: "kubernetes_response_invalid" });
    expect(requests).toHaveLength(1);
  });

  test("BDD-M4a-7: union discovery deduplicates by UID and enforces one global bound", async () => {
    const first = nodeObject();
    const second = {
      ...nodeObject(),
      metadata: {
        ...nodeObject().metadata,
        name: "ip-10-0-0-11.eu-west-2.compute.internal",
        uid: "uid-2",
      },
    };
    let query = 0;
    const adapter = createTrustedNodeLabelKubernetesAdapter(
      {
        hostname: "kubernetes.default.svc",
        port: 443,
        tokenPath: "/token",
        caPath: "/ca",
        nodeGroupName: "trusted-workers",
        maxNodesPerCycle: 1,
      },
      vi.fn(async () => {
        query += 1;
        return {
          statusCode: 200,
          body: JSON.stringify({
            apiVersion: "v1",
            kind: "NodeList",
            metadata: {},
            items: query === 1 ? [first] : [first, second],
          }),
        };
      }),
      async (path) => Buffer.from(path === "/token" ? "token-value-123456789" : "test-ca"),
    );
    await expect(
      adapter.listCandidateNodes("identity.node-restriction.kubernetes.io/workload", "trusted"),
    ).rejects.toMatchObject({ code: "kubernetes_node_bound_exceeded" });
  });

  test("BDD-M4a-7: a trusted Node remains a candidate after its node-group label disappears", async () => {
    const stale = nodeObject();
    stale.metadata.labels["eks.amazonaws.com/nodegroup"] = "other-workers";
    const staleLabels: Record<string, string> = stale.metadata.labels;
    staleLabels["identity.node-restriction.kubernetes.io/workload"] = "trusted";
    const selectors: string[] = [];
    const adapter = createTrustedNodeLabelKubernetesAdapter(
      {
        hostname: "kubernetes.default.svc",
        port: 443,
        tokenPath: "/token",
        caPath: "/ca",
        nodeGroupName: "trusted-workers",
        maxNodesPerCycle: 10,
      },
      vi.fn(async (request: KubernetesTransportRequest) => {
        selectors.push(request.path);
        return {
          statusCode: 200,
          body: JSON.stringify({
            apiVersion: "v1",
            kind: "NodeList",
            metadata: {},
            items: request.path.includes("nodegroup") ? [] : [stale],
          }),
        };
      }),
      async (path) => Buffer.from(path === "/token" ? "token-value-123456789" : "test-ca"),
    );

    const candidates = await adapter.listCandidateNodes(
      "identity.node-restriction.kubernetes.io/workload",
      "trusted",
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      uid: "uid-1",
      labels: { "eks.amazonaws.com/nodegroup": "other-workers" },
    });
    expect(selectors).toHaveLength(2);
  });

  test("Pass 0 / critical journey: real TLS + file-token adapter, AWS commands, kernel and patch receiver form one cross-layer path", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hulumi-node-label-"));
    const keyPath = join(directory, "server.key");
    const certPath = join(directory, "server.crt");
    const tokenPath = join(directory, "token");
    try {
      await execFileAsync("openssl", [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        keyPath,
        "-out",
        certPath,
        "-subj",
        "/CN=127.0.0.1",
        "-addext",
        "subjectAltName=IP:127.0.0.1",
        "-days",
        "1",
      ]);
      await writeFile(tokenPath, "projected-token-value-123456789", { mode: 0o600 });
      const [key, cert] = await Promise.all([readFile(keyPath), readFile(certPath)]);
      const observedPatches: string[] = [];
      const server = createServer({ key, cert }, (request, response) => {
        const chunks: Buffer[] = [];
        request.on("data", (chunk: Buffer) => chunks.push(chunk));
        request.on("end", () => {
          if (request.method === "PATCH") {
            observedPatches.push(Buffer.concat(chunks).toString("utf8"));
            response.writeHead(200, { "Content-Type": "application/json" });
            response.end("{}");
            return;
          }
          response.writeHead(200, { "Content-Type": "application/json" });
          response.end(
            JSON.stringify(
              request.url?.includes("?")
                ? {
                    apiVersion: "v1",
                    kind: "NodeList",
                    metadata: {},
                    items: [nodeObject()],
                  }
                : nodeObject(),
            ),
          );
        });
      });
      await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
      try {
        const address = server.address();
        if (address === null || typeof address === "string") throw new Error("missing test port");
        const kubernetes = createTrustedNodeLabelKubernetesAdapter({
          hostname: "127.0.0.1",
          port: address.port,
          tokenPath,
          caPath: certPath,
          nodeGroupName: "trusted-workers",
          maxNodesPerCycle: 10,
        });
        const sender = {
          send: vi.fn(async (command: unknown) => {
            const name = (command as { constructor: { name: string } }).constructor.name;
            if (name === "DescribeNodegroupCommand") {
              return {
                nodegroup: {
                  clusterName: "prod-eks",
                  nodegroupName: "trusted-workers",
                  status: "ACTIVE",
                  resources: { autoScalingGroups: [{ name: "asg-exact" }] },
                  scalingConfig: { minSize: 1, desiredSize: 1, maxSize: 3 },
                },
              };
            }
            if (name === "DescribeAutoScalingGroupsCommand") {
              return {
                AutoScalingGroups: [
                  {
                    AutoScalingGroupName: "asg-exact",
                    Instances: [
                      {
                        InstanceId: "i-0123456789abcdef0",
                        LifecycleState: "InService",
                        HealthStatus: "Healthy",
                      },
                    ],
                  },
                ],
              };
            }
            if (name === "DescribeInstancesCommand") {
              return {
                Reservations: [
                  {
                    OwnerId: "111122223333",
                    Instances: [
                      {
                        InstanceId: "i-0123456789abcdef0",
                        Placement: { AvailabilityZone: "eu-west-2a" },
                        InstanceType: "m7i.large",
                        State: { Name: "running" },
                      },
                    ],
                  },
                ],
              };
            }
            return {};
          }),
        };
        const aws = createTrustedNodeLabelAwsAdapter(
          {
            clusterName: "prod-eks",
            nodeGroupName: "trusted-workers",
            awsRegion: "eu-west-2",
            metricNamespace: "Hulumi/EksTrustedNodeLabelReconciler",
          },
          { eks: sender, autoScaling: sender, ec2: sender, cloudWatch: sender },
          () => NOW,
        );
        const result = await runTrustedNodeLabelControllerCycle(
          {
            reconcileIntervalMs: 60_000,
            policy: {
              clusterName: "prod-eks",
              nodeGroupName: "trusted-workers",
              awsAccountId: "111122223333",
              region: "eu-west-2",
              protectedLabelKey: "identity.node-restriction.kubernetes.io/workload",
              protectedLabelValue: "trusted",
              allowedInstanceTypes: ["m7i.large"],
              expectedTaints: [{ key: "dedicated", value: "trusted", effect: "NoSchedule" }],
              maxEvidenceAgeMs: 120_000,
              maxEvidenceSkewMs: 15_000,
            },
          },
          { aws, kubernetes, audit: () => undefined, now: () => NOW },
        );
        expect(result).toMatchObject({ failures: 0, patched: 1 });
        expect(observedPatches).toHaveLength(1);
        expect(JSON.parse(observedPatches[0])).toEqual(
          expect.arrayContaining([
            { op: "test", path: "/metadata/resourceVersion", value: "100" },
            {
              op: "add",
              path: "/metadata/labels/identity.node-restriction.kubernetes.io~1workload",
              value: "trusted",
            },
          ]),
        );
      } finally {
        await new Promise<void>((resolveClose, rejectClose) =>
          server.close((error) => (error === undefined ? resolveClose() : rejectClose(error))),
        );
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("BDD-M2-2: repeated continuation tokens are rejected before an unbounded loop", async () => {
    const adapter = createTrustedNodeLabelKubernetesAdapter(
      {
        hostname: "kubernetes.default.svc",
        port: 443,
        tokenPath: "/token",
        caPath: "/ca",
        nodeGroupName: "trusted-workers",
        maxNodesPerCycle: 10,
      },
      async () => ({
        statusCode: 200,
        body: JSON.stringify({
          apiVersion: "v1",
          kind: "NodeList",
          metadata: { continue: "same-token" },
          items: [],
        }),
      }),
      async (path) => Buffer.from(path === "/token" ? "token-value-123456789" : "test-ca"),
    );
    await expect(
      adapter.listCandidateNodes("identity.node-restriction.kubernetes.io/workload", "trusted"),
    ).rejects.toMatchObject({
      code: "kubernetes_pagination_invalid",
    } satisfies Partial<KubernetesAdapterError>);
  });
});

describe("runtime configuration and finite-state alignment", () => {
  test("BDD-M2-4: environment parsing is exact and bounded", () => {
    const parsed = trustedNodeLabelConfigurationFromEnvironment(validEnvironment());
    expect(parsed.controller.reconcileIntervalMs).toBe(60_000);
    expect(parsed.controller.policy.allowedInstanceTypes).toEqual(["m7i.large"]);
    expect(parsed.kubernetes).toMatchObject({
      hostname: "kubernetes.default.svc",
      port: 443,
      maxNodesPerCycle: 200,
    });
    expect(() =>
      trustedNodeLabelConfigurationFromEnvironment({
        ...validEnvironment(),
        HULUMI_MAX_NODES_PER_CYCLE: "501",
      }),
    ).toThrow(/HULUMI_MAX_NODES_PER_CYCLE/);
    expect(() =>
      trustedNodeLabelConfigurationFromEnvironment({
        ...validEnvironment(),
        HULUMI_EXPECTED_TAINTS_JSON: "not-json",
      }),
    ).toThrow(/HULUMI_EXPECTED_TAINTS_JSON/);
    expect(runTrustedNodeLabelControllerFromEnvironment).toBeTypeOf("function");
  });

  test("BDD-M2-8: code and TLA both require current identity and fresh evidence before apply", async () => {
    const repository = resolve(__dirname, "../../..");
    const [spec, controller] = await Promise.all([
      readFile(resolve(repository, "specs/EksTrustedNodeLabelReconciler.tla"), "utf8"),
      readFile(resolve(__dirname, "../src/trusted-node-label-controller.ts"), "utf8"),
    ]);
    expect(spec).toContain("/\\ evidenceFresh");
    expect(spec).toMatch(/planEpoch\s*=\s*nodeEpoch/);
    expect(spec).toMatch(/label\s*=\s*"Absent"/);
    expect(controller).toContain("validateReconciliationPlan(decision.plan, currentNode)");
    expect(
      controller.indexOf("validateReconciliationPlan(decision.plan, currentNode)"),
    ).toBeLessThan(controller.indexOf("await dependencies.kubernetes.patchNode("));
  });
});
