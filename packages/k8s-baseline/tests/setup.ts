// Vitest setupFile: Pulumi mock-runtime for @hulumi/k8s-baseline.

import * as pulumi from "@pulumi/pulumi";

export interface Registration {
  type: string;
  name: string;
  inputs: Record<string, unknown>;
  provider?: string;
}

export const registrations: Registration[] = [];

pulumi.runtime.setMocks({
  newResource: (args: pulumi.runtime.MockResourceArgs) => {
    registrations.push({
      type: args.type,
      name: args.name,
      inputs: { ...(args.inputs as Record<string, unknown>) },
      ...(args.provider !== undefined ? { provider: args.provider } : {}),
    });
    const baseState: Record<string, unknown> = { ...(args.inputs as Record<string, unknown>) };
    if (args.type === "kubernetes:helm.sh/v3:Release") {
      const inputs = args.inputs as { name?: string; namespace?: string };
      baseState.name = baseState.name ?? inputs.name ?? args.name;
      baseState.namespace = baseState.namespace ?? inputs.namespace ?? "default";
      baseState.status = baseState.status ?? {
        name: inputs.name ?? args.name,
        namespace: inputs.namespace ?? "default",
        version: 1,
        status: "deployed",
      };
    } else if (args.type === "aws:ec2/tag:Tag") {
      baseState.id = `${args.name}-mock-id`;
    } else if (args.type === "kubernetes:core/v1:Namespace") {
      baseState.id = `${args.name}-mock-id`;
    } else if (args.type === "kubernetes:apiextensions.k8s.io:CustomResource") {
      baseState.id = `${args.name}-mock-id`;
    } else if (args.type === "kubernetes:networking.k8s.io/v1:Ingress") {
      baseState.id = `${args.name}-mock-id`;
      baseState.status = baseState.status ?? {
        loadBalancer: { ingress: [{ hostname: `${args.name}.alb.mock` }] },
      };
    } else if (args.type === "kubernetes:core/v1:Secret") {
      baseState.id = `${args.name}-mock-id`;
    } else if (args.type === "aws:secretsmanager/secret:Secret") {
      baseState.arn =
        baseState.arn ?? `arn:aws:secretsmanager:us-east-1:111:secret:${args.name}-mock`;
      baseState.id = baseState.arn;
    } else if (args.type === "aws:iam/policy:Policy") {
      baseState.arn = baseState.arn ?? `arn:aws:iam::111:policy/${args.name}-mock`;
      baseState.id = baseState.arn;
    } else if (args.type === "aws:iam/rolePolicyAttachment:RolePolicyAttachment") {
      baseState.id = `${args.name}-mock-id`;
    } else if (args.type.startsWith("kubernetes:")) {
      baseState.id = `${args.name}-mock-id`;
    } else {
      baseState.arn = baseState.arn ?? `arn:aws:mock:${args.type}:${args.name}`;
    }
    return {
      id: `${args.name}_id`,
      state: baseState,
    };
  },
  call: (args: pulumi.runtime.MockCallArgs) => {
    return args.inputs;
  },
});

export function resetRegistrations(): void {
  registrations.length = 0;
}

export function valueOf<T>(output: pulumi.Output<T>): Promise<T> {
  return new Promise((resolve) => {
    output.apply((value: T) => {
      resolve(value);
      return value;
    });
  });
}

export async function settlePulumi(): Promise<void> {
  // 200 iterations because the IstioFoundation dependsOn chain
  // (cni → istiod → ingressGateway → PeerAuthentication) plus child
  // ComponentResource registration takes more microtask cycles than the
  // simpler M1 components. Rule of thumb: bump if a test's assertions
  // see fewer registrations than expected.
  for (let i = 0; i < 200; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}
