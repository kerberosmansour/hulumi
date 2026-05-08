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

if (process.env.HULUMI_INTEGRATION !== "1") {
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
      } else if (args.type === "github:index/repository:Repository") {
        // Mock state for SecureRepository's child resources. Populated so the
        // component outputs (`repoFullName`, `repoNodeId`, `defaultBranch`)
        // resolve under the vitest mock runtime.
        const repoName = (args.inputs as { name?: string }).name ?? args.name;
        baseState.fullName = baseState.fullName ?? `mock-org/${repoName}`;
        baseState.nodeId = baseState.nodeId ?? `MDEwOlJlcG9zaXRvcnk${args.name}`;
        baseState.defaultBranch = baseState.defaultBranch ?? "main";
      } else if (args.type === "github:index/repositoryRuleset:RepositoryRuleset") {
        // Ruleset has no extra populated state beyond the id below.
      } else if (args.type === "github:index/organizationRuleset:OrganizationRuleset") {
        // Org ruleset — id is the only output the SecureRepository tests read.
      } else if (
        args.type === "github:index/actionsOrganizationPermissions:ActionsOrganizationPermissions"
      ) {
        // Actions org perms — id only.
      } else if (
        args.type ===
        "github:index/actionsOrganizationOidcSubjectClaimCustomizationTemplate:ActionsOrganizationOidcSubjectClaimCustomizationTemplate"
      ) {
        // OIDC template — id only.
      } else if (args.type === "github:index/organizationSettings:OrganizationSettings") {
        // Org settings — id only.
      } else if (args.type === "hulumi:baseline:github:CodeSecurityConfiguration") {
        // Hulumi-internal dynamic resource for the CSC backend. Echo the id.
        const orgInput = (args.inputs as { organization?: string }).organization;
        const id = `csc-${orgInput ?? "mock"}-mock`;
        baseState.configurationId = baseState.configurationId ?? id;
        baseState.appliedFlags =
          baseState.appliedFlags ?? (args.inputs as { flags?: unknown }).flags ?? {};
      } else {
        baseState.arn = baseState.arn ?? `arn:aws:mock:${args.type}:${args.name}`;
      }
      return {
        id: `${args.name}_id`,
        state: baseState,
      };
    },
    call: (args: pulumi.runtime.MockCallArgs) => {
      if (args.token === "aws:index/getCallerIdentity:getCallerIdentity") {
        return {
          accountId: "111122223333",
          arn: "arn:aws:iam::111122223333:user/mock",
          userId: "MOCKID",
        };
      }
      if (args.token === "aws:index/getRegion:getRegion") {
        return {
          name: "us-east-1",
          description: "US East (N. Virginia)",
          endpoint: "ec2.us-east-1.amazonaws.com",
        };
      }
      return args.inputs;
    },
  });
}

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
