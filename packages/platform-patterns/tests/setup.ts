import * as pulumi from "@pulumi/pulumi";

export interface Registration {
  type: string;
  name: string;
  inputs: Record<string, unknown>;
  id?: string;
}

export const registrations: Registration[] = [];

pulumi.runtime.setMocks({
  newResource: (args: pulumi.runtime.MockResourceArgs) => {
    const inputs = { ...(args.inputs as Record<string, unknown>) };
    registrations.push({
      type: args.type,
      name: args.name,
      inputs,
      id: args.id !== undefined && args.id.length > 0 ? args.id : `${args.name}_id`,
    });
    return {
      id: args.id !== undefined && args.id.length > 0 ? args.id : `${args.name}_id`,
      state: {
        ...inputs,
        arn: `arn:mock:${args.type}:${args.name}`,
        name: inputs.name ?? args.name,
        id: args.id !== undefined && args.id.length > 0 ? args.id : `${args.name}_id`,
      },
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

export async function settlePulumi(): Promise<void> {
  for (let i = 0; i < 40; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}
