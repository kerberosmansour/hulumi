import * as pulumi from "@pulumi/pulumi";

export interface Registration {
  type: string;
  name: string;
  inputs: Record<string, unknown>;
  id?: string;
  provider?: string;
  outputs?: Record<string, unknown>;
}

export const registrations: Registration[] = [];

pulumi.runtime.setMocks({
  newResource: (args: pulumi.runtime.MockResourceArgs) => {
    const inputs = { ...(args.inputs as Record<string, unknown>) };
    const registration: Registration = {
      type: args.type,
      name: args.name,
      inputs,
      id: args.id !== undefined && args.id.length > 0 ? args.id : `${args.name}_id`,
    };
    if (args.provider !== undefined) registration.provider = args.provider;
    registrations.push(registration);
    const runner =
      inputs.tags !== null &&
      typeof inputs.tags === "object" &&
      (inputs.tags as Record<string, unknown>)["hulumi:component"] ===
        "hulumi:platform:CodeBuildGitHubRunner";
    const extra =
      args.type === "aws:codebuild/webhook:Webhook"
        ? {
            payloadUrl: "https://codebuild.eu-west-2.amazonaws.com/webhooks/synthetic",
            secret: "synthetic-webhook-secret",
          }
        : {};
    const runnerArn = !runner
      ? undefined
      : args.type === "aws:iam/role:Role"
        ? `arn:aws:iam::123456789012:role/${inputs.name}`
        : args.type === "aws:cloudwatch/logGroup:LogGroup"
          ? `arn:aws:logs:eu-west-2:123456789012:log-group:${inputs.name}`
          : `arn:aws:codebuild:eu-west-2:123456789012:project/${inputs.name}`;
    const result = {
      id:
        runner && args.type === "aws:iam/role:Role"
          ? String(inputs.name)
          : args.id !== undefined && args.id.length > 0
            ? args.id
            : `${args.name}_id`,
      state: {
        ...inputs,
        arn: runnerArn ?? `arn:mock:${args.type}:${args.name}`,
        ...extra,
        name: inputs.name ?? args.name,
        id: args.id !== undefined && args.id.length > 0 ? args.id : `${args.name}_id`,
      },
    };
    if (runner) registration.outputs = result.state;
    return result;
  },
  call: (args: pulumi.runtime.MockCallArgs) =>
    args.token === "aws:index/getCallerIdentity:getCallerIdentity"
      ? {
          accountId: "123456789012",
          arn: "arn:aws:sts::123456789012:assumed-role/synthetic/test",
          userId: "synthetic",
        }
      : args.token === "aws:index/getRegion:getRegion"
        ? { name: "eu-west-2", region: "eu-west-2" }
        : args.inputs,
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
