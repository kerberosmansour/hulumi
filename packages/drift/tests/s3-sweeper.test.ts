import {
  DeleteObjectsCommand,
  ListMultipartUploadsCommand,
  ListObjectVersionsCommand,
} from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";

import { S3SweeperExecutor } from "../src/adapters/s3-sweeper";
import type { ReconcilePlanAction } from "../src/reconciler";

class FakeS3Client {
  readonly commands: unknown[] = [];

  async send(command: unknown): Promise<Record<string, unknown>> {
    this.commands.push(command);
    if (command instanceof ListObjectVersionsCommand) {
      const versions = Array.from({ length: 1001 }, (_, i) => ({
        Key: `secret-key-${i}`,
        VersionId: `v${i}`,
      }));
      return { Versions: versions };
    }
    if (command instanceof ListMultipartUploadsCommand) {
      return { Uploads: [{ Key: "secret-upload-key", UploadId: "upload-1" }] };
    }
    return {};
  }
}

function action(bucket = "af-e2e-abc123-logs"): ReconcilePlanAction {
  return {
    id: "action-0000",
    type: "drainS3BucketVersions",
    resource: {
      provider: "aws",
      type: "aws:s3/bucketV2:BucketV2",
      physicalId: bucket,
      region: "us-east-1",
    },
    recommendedAction: "deleteCloudResource",
    allowedActions: ["deleteCloudResource"],
    blockedActions: [],
    why: [],
    evidence: [],
    risk: "high",
    requiresApproval: true,
    stateMutation: false,
    cloudMutation: true,
    sensitiveFieldsRedacted: true,
    dependsOn: [],
    executable: true,
  };
}

describe("S3SweeperExecutor", () => {
  it("batches version deletes into chunks of 1000 and reports counts only", async () => {
    const client = new FakeS3Client();
    const result = await new S3SweeperExecutor({
      client: client as never,
      expectedPrefix: "af-e2e-abc123",
    }).execute(action());

    const deletes = client.commands.filter((command) => command instanceof DeleteObjectsCommand);
    expect(deletes).toHaveLength(2);
    expect(result).toEqual({
      actionId: "action-0000",
      status: "succeeded",
      counts: { deletedVersions: 1001, abortedUploads: 1, deletedBuckets: 0 },
    });
    expect(JSON.stringify(result)).not.toContain("secret-key");
    expect(JSON.stringify(result)).not.toContain("secret-upload-key");
  });

  it("refuses buckets outside the expected prefix", async () => {
    const result = await new S3SweeperExecutor({
      client: new FakeS3Client() as never,
      expectedPrefix: "af-e2e-abc123",
    }).execute(action("other-prefix-logs"));

    expect(result.status).toBe("blocked");
  });
});
