import {
  AbortMultipartUploadCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  GetBucketRequestPaymentCommand,
  GetObjectLockConfigurationCommand,
  ListMultipartUploadsCommand,
  ListObjectVersionsCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";

import type {
  ReconcileActionExecutor,
  ReconcileActionResult,
  ReconcilePlanAction,
} from "../reconciler";

export const S3_DELETE_BATCH_SIZE = 1000;

export interface S3SweeperExecutorArgs {
  client?: S3Client;
  clientConfig?: S3ClientConfig;
  expectedPrefix: string;
  deleteBucket?: boolean;
}

interface VersionRef {
  Key: string;
  VersionId: string;
}

export class S3SweeperExecutor implements ReconcileActionExecutor {
  private readonly client: S3Client;
  private readonly expectedPrefix: string;
  private readonly deleteBucket: boolean;

  constructor(args: S3SweeperExecutorArgs) {
    if (args.expectedPrefix.trim().length < 6 || /[*?]/.test(args.expectedPrefix)) {
      throw new Error("Refusing broad S3 sweeper prefix.");
    }
    this.client = args.client ?? new S3Client(args.clientConfig ?? {});
    this.expectedPrefix = args.expectedPrefix;
    this.deleteBucket = args.deleteBucket ?? false;
  }

  async execute(action: ReconcilePlanAction): Promise<ReconcileActionResult> {
    const bucket = action.resource.physicalId;
    if (bucket === undefined || !bucket.startsWith(this.expectedPrefix)) {
      return {
        actionId: action.id,
        status: "blocked",
        message: "bucket name missing or outside expected prefix",
      };
    }
    if (action.recommendedAction !== "deleteCloudResource") {
      return { actionId: action.id, status: "blocked", message: "action is not a cloud delete" };
    }

    try {
      await this.assertBucketMutable(bucket);
      const deletedVersions = await this.drainVersions(bucket);
      const abortedUploads = await this.abortMultipartUploads(bucket);
      if (this.deleteBucket) {
        await this.client.send(new DeleteBucketCommand({ Bucket: bucket }));
      }
      return {
        actionId: action.id,
        status: "succeeded",
        counts: { deletedVersions, abortedUploads, deletedBuckets: this.deleteBucket ? 1 : 0 },
      };
    } catch (err) {
      if (isAwsNotFound(err)) {
        return {
          actionId: action.id,
          status: "succeeded",
          counts: { deletedVersions: 0, abortedUploads: 0, deletedBuckets: 0, alreadyAbsent: 1 },
        };
      }
      throw err;
    }
  }

  private async assertBucketMutable(bucket: string): Promise<void> {
    try {
      const payment = await this.client.send(
        new GetBucketRequestPaymentCommand({ Bucket: bucket }),
      );
      if (payment.Payer === "Requester") {
        throw new Error("Refusing requester-pays S3 bucket cleanup.");
      }
    } catch (err) {
      if (!isAwsNotFound(err) && !isAwsUnsupported(err)) throw err;
    }

    try {
      const lock = await this.client.send(
        new GetObjectLockConfigurationCommand({ Bucket: bucket }),
      );
      if (lock.ObjectLockConfiguration?.ObjectLockEnabled === "Enabled") {
        throw new Error("Refusing object-lock-enabled S3 bucket cleanup.");
      }
    } catch (err) {
      if (!isAwsNotFound(err) && !isAwsUnsupported(err)) throw err;
    }
  }

  private async drainVersions(bucket: string): Promise<number> {
    let count = 0;
    let keyMarker: string | undefined;
    let versionMarker: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectVersionsCommand({
          Bucket: bucket,
          KeyMarker: keyMarker,
          VersionIdMarker: versionMarker,
        }),
      );
      const refs = [
        ...(page.Versions ?? []).map((entry) => ({ Key: entry.Key, VersionId: entry.VersionId })),
        ...(page.DeleteMarkers ?? []).map((entry) => ({
          Key: entry.Key,
          VersionId: entry.VersionId,
        })),
      ].filter(
        (entry): entry is VersionRef => entry.Key !== undefined && entry.VersionId !== undefined,
      );

      for (const group of chunk(refs, S3_DELETE_BATCH_SIZE)) {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: group, Quiet: true },
          }),
        );
        count += group.length;
      }
      keyMarker = page.NextKeyMarker;
      versionMarker = page.NextVersionIdMarker;
    } while (keyMarker !== undefined);
    return count;
  }

  private async abortMultipartUploads(bucket: string): Promise<number> {
    let count = 0;
    let keyMarker: string | undefined;
    let uploadIdMarker: string | undefined;
    do {
      const page = await this.client.send(
        new ListMultipartUploadsCommand({
          Bucket: bucket,
          KeyMarker: keyMarker,
          UploadIdMarker: uploadIdMarker,
        }),
      );
      for (const upload of page.Uploads ?? []) {
        if (upload.Key === undefined || upload.UploadId === undefined) continue;
        await this.client.send(
          new AbortMultipartUploadCommand({
            Bucket: bucket,
            Key: upload.Key,
            UploadId: upload.UploadId,
          }),
        );
        count += 1;
      }
      keyMarker = page.NextKeyMarker;
      uploadIdMarker = page.NextUploadIdMarker;
    } while (keyMarker !== undefined);
    return count;
  }
}

function chunk<T>(values: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

function isAwsNotFound(err: unknown): boolean {
  return err instanceof Error && /NoSuchBucket|NotFound|404/i.test(err.name + err.message);
}

function isAwsUnsupported(err: unknown): boolean {
  return (
    err instanceof Error &&
    /NotImplemented|NoSuchBucketPolicy|ObjectLockConfigurationNotFound/i.test(
      err.name + err.message,
    )
  );
}
