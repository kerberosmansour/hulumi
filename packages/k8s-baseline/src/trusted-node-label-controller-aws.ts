import {
  AutoScalingClient,
  DescribeAutoScalingGroupsCommand,
  type DescribeAutoScalingGroupsCommandOutput,
} from "@aws-sdk/client-auto-scaling";
import {
  CloudWatchClient,
  PutMetricDataCommand,
  type PutMetricDataInput,
} from "@aws-sdk/client-cloudwatch";
import {
  DescribeInstancesCommand,
  EC2Client,
  type DescribeInstancesCommandOutput,
} from "@aws-sdk/client-ec2";
import {
  DescribeNodegroupCommand,
  EKSClient,
  type DescribeNodegroupCommandOutput,
} from "@aws-sdk/client-eks";

import type {
  AutoScalingGroupAttestation,
  Ec2InstanceAttestation,
  EksNodeGroupAttestation,
} from "./trusted-node-label-reconciler-core";

const INSTANCE_ID = /^i-[0-9a-f]{8}(?:[0-9a-f]{9})?$/u;
const MAX_ASGS = 8;
const MAX_ASG_INSTANCES = 2_048;

export type AwsEvidenceErrorCode =
  | "eks_describe_failed"
  | "eks_response_invalid"
  | "asg_describe_failed"
  | "asg_response_incomplete"
  | "ec2_describe_failed"
  | "ec2_response_invalid"
  | "metric_publish_failed";

export class AwsEvidenceError extends Error {
  readonly code: AwsEvidenceErrorCode;

  constructor(code: AwsEvidenceErrorCode, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "AwsEvidenceError";
    this.code = code;
  }
}

interface CommandSender {
  send(command: unknown): Promise<unknown>;
}

export interface TrustedNodeLabelAwsClients {
  readonly eks: CommandSender;
  readonly autoScaling: CommandSender;
  readonly ec2: CommandSender;
  readonly cloudWatch: CommandSender;
}

export interface TrustedNodeLabelAwsConfig {
  readonly clusterName: string;
  readonly nodeGroupName: string;
  readonly awsRegion: string;
  readonly metricNamespace: string;
}

export interface ControllerMetricSample {
  readonly decisions: number;
  readonly failures: number;
  readonly missingTrustedLabels: number;
  readonly timestamp: Date;
}

export interface TrustedNodeLabelAwsAdapter {
  describeNodeGroup(): Promise<EksNodeGroupAttestation>;
  describeAutoScalingGroups(names: readonly string[]): Promise<AutoScalingGroupAttestation[]>;
  describeEc2Instance(instanceId: string): Promise<Ec2InstanceAttestation>;
  publishMetrics(sample: ControllerMetricSample): Promise<void>;
}

function defaultClients(region: string): TrustedNodeLabelAwsClients {
  return {
    eks: new EKSClient({ region }) as unknown as CommandSender,
    autoScaling: new AutoScalingClient({ region }) as unknown as CommandSender,
    ec2: new EC2Client({ region }) as unknown as CommandSender,
    cloudWatch: new CloudWatchClient({ region }) as unknown as CommandSender,
  };
}

function exactUniqueNames(values: readonly string[]): boolean {
  return (
    values.length > 0 &&
    values.length <= MAX_ASGS &&
    values.every((value) => /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,99}$/u.test(value)) &&
    new Set(values).size === values.length
  );
}

export function createTrustedNodeLabelAwsAdapter(
  config: TrustedNodeLabelAwsConfig,
  clients: TrustedNodeLabelAwsClients = defaultClients(config.awsRegion),
  now: () => number = Date.now,
): TrustedNodeLabelAwsAdapter {
  return {
    async describeNodeGroup(): Promise<EksNodeGroupAttestation> {
      let output: DescribeNodegroupCommandOutput;
      try {
        output = (await clients.eks.send(
          new DescribeNodegroupCommand({
            clusterName: config.clusterName,
            nodegroupName: config.nodeGroupName,
          }),
        )) as DescribeNodegroupCommandOutput;
      } catch (error) {
        throw new AwsEvidenceError("eks_describe_failed", error);
      }
      const nodeGroup = output.nodegroup;
      const names = (nodeGroup?.resources?.autoScalingGroups ?? []).map((group) => group.name);
      const scaling = nodeGroup?.scalingConfig;
      if (
        nodeGroup?.clusterName !== config.clusterName ||
        nodeGroup.nodegroupName !== config.nodeGroupName ||
        typeof nodeGroup.status !== "string" ||
        !exactUniqueNames(names.filter((name): name is string => typeof name === "string")) ||
        names.some((name) => typeof name !== "string") ||
        !Number.isSafeInteger(scaling?.minSize) ||
        !Number.isSafeInteger(scaling?.desiredSize) ||
        !Number.isSafeInteger(scaling?.maxSize)
      ) {
        throw new AwsEvidenceError("eks_response_invalid");
      }
      return {
        clusterName: nodeGroup.clusterName,
        nodeGroupName: nodeGroup.nodegroupName,
        status: nodeGroup.status,
        autoScalingGroupNames: names as string[],
        scalingConfig: {
          minSize: scaling!.minSize!,
          desiredSize: scaling!.desiredSize!,
          maxSize: scaling!.maxSize!,
        },
        capturedAtEpochMs: now(),
      };
    },

    async describeAutoScalingGroups(
      names: readonly string[],
    ): Promise<AutoScalingGroupAttestation[]> {
      if (!exactUniqueNames(names)) {
        throw new AwsEvidenceError("asg_response_incomplete");
      }
      let output: DescribeAutoScalingGroupsCommandOutput;
      try {
        output = (await clients.autoScaling.send(
          new DescribeAutoScalingGroupsCommand({ AutoScalingGroupNames: [...names] }),
        )) as DescribeAutoScalingGroupsCommandOutput;
      } catch (error) {
        throw new AwsEvidenceError("asg_describe_failed", error);
      }
      if (output.NextToken !== undefined) {
        throw new AwsEvidenceError("asg_response_incomplete");
      }
      const groups = output.AutoScalingGroups ?? [];
      const expected = new Set(names);
      const seen = new Set<string>();
      const capturedAtEpochMs = now();
      const result: AutoScalingGroupAttestation[] = [];
      for (const group of groups) {
        const groupName = group.AutoScalingGroupName;
        const instances = group.Instances ?? [];
        if (
          typeof groupName !== "string" ||
          !expected.has(groupName) ||
          seen.has(groupName) ||
          instances.length > MAX_ASG_INSTANCES
        ) {
          throw new AwsEvidenceError("asg_response_incomplete");
        }
        seen.add(groupName);
        result.push({
          name: groupName,
          instances: instances.map((instance) => {
            if (
              typeof instance.InstanceId !== "string" ||
              !INSTANCE_ID.test(instance.InstanceId) ||
              typeof instance.LifecycleState !== "string" ||
              typeof instance.HealthStatus !== "string"
            ) {
              throw new AwsEvidenceError("asg_response_incomplete");
            }
            return {
              instanceId: instance.InstanceId,
              lifecycleState: instance.LifecycleState,
              healthStatus: instance.HealthStatus,
            };
          }),
          capturedAtEpochMs,
        });
      }
      if (seen.size !== expected.size) {
        throw new AwsEvidenceError("asg_response_incomplete");
      }
      return result;
    },

    async describeEc2Instance(instanceId: string): Promise<Ec2InstanceAttestation> {
      if (!INSTANCE_ID.test(instanceId)) {
        throw new AwsEvidenceError("ec2_response_invalid");
      }
      let output: DescribeInstancesCommandOutput;
      try {
        output = (await clients.ec2.send(
          new DescribeInstancesCommand({ InstanceIds: [instanceId] }),
        )) as DescribeInstancesCommandOutput;
      } catch (error) {
        throw new AwsEvidenceError("ec2_describe_failed", error);
      }
      if (output.NextToken !== undefined) {
        throw new AwsEvidenceError("ec2_response_invalid");
      }
      const reservations = output.Reservations ?? [];
      if (reservations.length !== 1 || (reservations[0].Instances ?? []).length !== 1) {
        throw new AwsEvidenceError("ec2_response_invalid");
      }
      const reservation = reservations[0];
      const instance = reservation.Instances![0];
      if (
        instance.InstanceId !== instanceId ||
        typeof reservation.OwnerId !== "string" ||
        typeof instance.Placement?.AvailabilityZone !== "string" ||
        typeof instance.InstanceType !== "string" ||
        typeof instance.State?.Name !== "string"
      ) {
        throw new AwsEvidenceError("ec2_response_invalid");
      }
      return {
        instanceId,
        accountId: reservation.OwnerId,
        region: config.awsRegion,
        availabilityZone: instance.Placement.AvailabilityZone,
        instanceType: instance.InstanceType,
        state: instance.State.Name,
        capturedAtEpochMs: now(),
      };
    },

    async publishMetrics(sample: ControllerMetricSample): Promise<void> {
      const dimensions = [
        { Name: "ClusterName", Value: config.clusterName },
        { Name: "NodeGroupName", Value: config.nodeGroupName },
      ];
      const input: PutMetricDataInput = {
        Namespace: config.metricNamespace,
        MetricData: [
          {
            MetricName: "ReconcileDecisions",
            Dimensions: dimensions,
            Unit: "Count",
            Value: sample.decisions,
            Timestamp: sample.timestamp,
          },
          {
            MetricName: "ReconcileFailures",
            Dimensions: dimensions,
            Unit: "Count",
            Value: sample.failures,
            Timestamp: sample.timestamp,
          },
          {
            MetricName: "MissingTrustedLabel",
            Dimensions: dimensions,
            Unit: "Count",
            Value: sample.missingTrustedLabels,
            Timestamp: sample.timestamp,
          },
        ],
      };
      try {
        await clients.cloudWatch.send(new PutMetricDataCommand(input));
      } catch (error) {
        throw new AwsEvidenceError("metric_publish_failed", error);
      }
    },
  };
}
