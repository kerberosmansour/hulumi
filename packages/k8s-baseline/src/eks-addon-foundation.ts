import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import type { EksAddonFoundationArgs, EksAddonSpec } from "./eks-addon-foundation.args";
import { MAX_EKS_ADDONS } from "./eks-addon-foundation.args";
import type { EksAddonFoundationOutputs } from "./eks-addon-foundation.outputs";

export const EKS_ADDON_FOUNDATION_COMPONENT_TYPE = "hulumi:k8s:EksAddonFoundation";

const EXACT_VERSION_REGEX = /^v?\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?(\+[A-Za-z0-9.-]+)?$/;

function validateAddon(name: string, addon: EksAddonSpec): void {
  if (typeof addon.name !== "string" || addon.name.trim() === "") {
    throw new Error(`EksAddonFoundation: add-on name is required (component "${name}")`);
  }
  if (typeof addon.version !== "string" || addon.version.trim() === "") {
    throw new Error(
      `EksAddonFoundation: add-on "${addon.name}" version is required and must be exact (component "${name}")`,
    );
  }
  if (addon.version === "latest") {
    throw new Error(
      `EksAddonFoundation: add-on "${addon.name}" version cannot be "latest" — pin to an exact version (component "${name}")`,
    );
  }
  if (!EXACT_VERSION_REGEX.test(addon.version)) {
    throw new Error(
      `EksAddonFoundation: add-on "${addon.name}" version "${addon.version}" must match exact-version regex (e.g. "1.2.3", "v1.20.0-eksbuild.1") (component "${name}")`,
    );
  }
}

export class EksAddonFoundation
  extends pulumi.ComponentResource
  implements EksAddonFoundationOutputs
{
  public readonly addonNames: pulumi.Output<string[]>;
  public readonly pinnedVersions: pulumi.Output<Record<string, string>>;

  constructor(
    name: string,
    args: EksAddonFoundationArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super(EKS_ADDON_FOUNDATION_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    if (args.addons === undefined || args.addons.length === 0) {
      throw new Error(
        `EksAddonFoundation: addons must be non-empty (component "${name}")`,
      );
    }
    if (args.addons.length > MAX_EKS_ADDONS) {
      throw new Error(
        `EksAddonFoundation: addons has ${args.addons.length} entries; max ${MAX_EKS_ADDONS} (component "${name}")`,
      );
    }
    for (const addon of args.addons) {
      validateAddon(name, addon);
    }

    const parent = { parent: this } as const;
    const names: string[] = [];
    const versions: Record<string, string> = {};

    for (const addon of args.addons) {
      const addonArgs: aws.eks.AddonArgs = {
        clusterName: args.clusterName,
        addonName: addon.name,
        addonVersion: addon.version,
        resolveConflictsOnCreate: addon.resolveConflicts ?? "OVERWRITE",
        resolveConflictsOnUpdate: addon.resolveConflicts ?? "OVERWRITE",
      };
      if (addon.serviceAccountRoleArn !== undefined) {
        addonArgs.serviceAccountRoleArn = addon.serviceAccountRoleArn;
      }
      if (addon.configurationValues !== undefined) {
        addonArgs.configurationValues = addon.configurationValues;
      }
      if (args.tags !== undefined) {
        addonArgs.tags = args.tags;
      }

      new aws.eks.Addon(`${name}-${addon.name}`, addonArgs, parent);
      names.push(addon.name);
      versions[addon.name] = addon.version;
    }

    this.addonNames = pulumi.output(names);
    this.pinnedVersions = pulumi.output(versions);
    this.registerOutputs({
      addonNames: this.addonNames,
      pinnedVersions: this.pinnedVersions,
    });
  }
}
