import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import type {
  EksSubnetTaggerArgs,
  SubnetOwnership,
} from "./eks-subnet-tagger.args";
import type { AppliedTag, EksSubnetTaggerOutputs } from "./eks-subnet-tagger.outputs";

export const EKS_SUBNET_TAGGER_COMPONENT_TYPE = "hulumi:k8s:EksSubnetTagger";

const ROLE_ELB_KEY = "kubernetes.io/role/elb";
const ROLE_INTERNAL_ELB_KEY = "kubernetes.io/role/internal-elb";

function clusterTagKey(clusterName: string): string {
  return `kubernetes.io/cluster/${clusterName}`;
}

function validateArgs(name: string, args: EksSubnetTaggerArgs): void {
  if (args.clusterName === undefined || args.clusterName.trim() === "") {
    throw new Error(
      `EksSubnetTagger: clusterName is required and must be non-empty (got empty for component "${name}")`,
    );
  }
  if (args.ownership !== "shared" && args.ownership !== "owned") {
    throw new Error(
      `EksSubnetTagger: ownership must be one of "shared" | "owned" (got "${String(args.ownership)}")`,
    );
  }
  if (args.publicSubnetIds === undefined && args.privateSubnetIds === undefined) {
    throw new Error(
      `EksSubnetTagger: at least one of publicSubnetIds or privateSubnetIds must be provided (component "${name}")`,
    );
  }
}

export class EksSubnetTagger extends pulumi.ComponentResource implements EksSubnetTaggerOutputs {
  public readonly tagsApplied: pulumi.Output<AppliedTag[]>;

  constructor(name: string, args: EksSubnetTaggerArgs, opts?: pulumi.ComponentResourceOptions) {
    super(EKS_SUBNET_TAGGER_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    validateArgs(name, args);

    const ownership: SubnetOwnership = args.ownership;
    const clusterTag = clusterTagKey(args.clusterName);
    const parent = { parent: this } as const;

    const publicSubnets = pulumi.output(args.publicSubnetIds ?? []);
    const privateSubnets = pulumi.output(args.privateSubnetIds ?? []);

    const publicTags: pulumi.Output<AppliedTag[]> = publicSubnets.apply((ids: string[]) => {
      const out: AppliedTag[] = [];
      ids.forEach((subnetId, idx) => {
        new aws.ec2.Tag(
          `${name}-public-${idx}-elb`,
          { resourceId: subnetId, key: ROLE_ELB_KEY, value: "1" },
          parent,
        );
        new aws.ec2.Tag(
          `${name}-public-${idx}-cluster`,
          { resourceId: subnetId, key: clusterTag, value: ownership },
          parent,
        );
        out.push(
          { subnetId, key: ROLE_ELB_KEY, value: "1" },
          { subnetId, key: clusterTag, value: ownership },
        );
      });
      return out;
    });

    const privateTags: pulumi.Output<AppliedTag[]> = privateSubnets.apply((ids: string[]) => {
      const out: AppliedTag[] = [];
      ids.forEach((subnetId, idx) => {
        new aws.ec2.Tag(
          `${name}-private-${idx}-elb`,
          { resourceId: subnetId, key: ROLE_INTERNAL_ELB_KEY, value: "1" },
          parent,
        );
        new aws.ec2.Tag(
          `${name}-private-${idx}-cluster`,
          { resourceId: subnetId, key: clusterTag, value: ownership },
          parent,
        );
        out.push(
          { subnetId, key: ROLE_INTERNAL_ELB_KEY, value: "1" },
          { subnetId, key: clusterTag, value: ownership },
        );
      });
      return out;
    });

    this.tagsApplied = pulumi
      .all([publicTags, privateTags])
      .apply(([pub, priv]: [AppliedTag[], AppliedTag[]]) => {
        if (pub.length === 0 && priv.length === 0) {
          pulumi.log.warn(
            `EksSubnetTagger "${name}": no tags written — both publicSubnetIds and privateSubnetIds resolved to empty arrays. ALB Controller auto-discovery will not find any subnets for this cluster until at least one list is populated.`,
          );
        }
        return [...pub, ...priv];
      });

    this.registerOutputs({ tagsApplied: this.tagsApplied });
  }
}
