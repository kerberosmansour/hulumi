// Vitest setupFile: configures Pulumi's testing mocks before any @hulumi/*
// module imports the @pulumi/pulumi runtime. The mock's newResource hook
// captures every sub-resource registration so tier-matrix + tag tests can
// assert the exact set of resources emitted by a given SecureBucket
// instantiation.

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
    if (args.type.startsWith("aws:s3/bucketV2") || args.type.startsWith("aws:s3/bucket")) {
      baseState.arn = baseState.arn ?? `arn:aws:s3:::${args.name}-mock`;
      baseState.bucketDomainName =
        baseState.bucketDomainName ?? `${args.name}-mock.s3.amazonaws.com`;
    } else if (args.type.startsWith("aws:cloudtrail/eventDataStore")) {
      baseState.arn = baseState.arn ?? `arn:aws:cloudtrail:mock:eds/${args.name}`;
    } else {
      baseState.arn = baseState.arn ?? `arn:aws:mock:${args.type}:${args.name}`;
    }
    return {
      id: `${args.name}_id`,
      state: baseState,
    };
  },
  call: (args: pulumi.runtime.MockCallArgs) => args.inputs,
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

// Drain the microtask queue so every deferred Pulumi resource registration
// has a chance to call through the mock newResource hook. Needed because the
// SDK schedules sibling sub-resource RPCs via Promise.then chains; the first
// output to resolve is not a barrier for the whole component.
export async function settlePulumi(): Promise<void> {
  for (let i = 0; i < 40; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}
