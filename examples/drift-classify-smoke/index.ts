// Minimal DriftClassifier smoke. Two scenarios:
//   1. Console drift — CloudTrail surfaces an event from a non-Hulumi
//      principal touching the bucket; verdict ConsoleBreakGlass / high.
//   2. Provider drift — pinned @pulumi/aws < latest; classifier yields
//      ProviderApiChurn / medium (never high — TLA+ ceiling).
//
// Both adapters are stubbed; the example does not call AWS or git.

import {
  DriftClassifier,
  AutomationApiAdapter,
  CloudTrailAdapter,
  ProviderVersionAdapter,
  GitLogAdapter,
} from "@hulumi/drift";

import type { CloudTrailEvent } from "@hulumi/drift";

const STACK = "urn:pulumi:dev::demo::stack";
const RESOURCE = "urn:pulumi:dev::demo::aws:s3/bucketV2:BucketV2::demo-bucket";

function makeAutomationApi(): AutomationApiAdapter {
  return new AutomationApiAdapter({
    preview: async () => ({
      changeSummary: { update: 1 },
      detailedDiff: { [RESOURCE]: { tags: { kind: "update" } } },
    }),
  });
}

function makeGitLog(): GitLogAdapter {
  return new GitLogAdapter({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    git: { checkIsRepo: async () => false } as any,
    paths: ["pulumi/**/*.ts"],
  });
}

const consoleEvent: CloudTrailEvent = {
  EventTime: new Date(),
  EventName: "PutBucketTagging",
  Username: "console-user",
  principalTags: { "iac-role": "true" /* bare — not Hulumi-namespaced */ },
};

export async function runSmoke(): Promise<{
  consoleVerdict: { source: string; confidence: string };
  providerVerdict: { source: string; confidence: string };
}> {
  // Scenario 1: CloudTrail surfaces a console event; provider stable.
  const consoleClassifier = new DriftClassifier({
    adapters: {
      automationApi: makeAutomationApi(),
      cloudTrail: new CloudTrailAdapter({ lookup: async () => [consoleEvent] }),
      providerVersion: new ProviderVersionAdapter({
        fetcher: { pinned: async () => "7.27.0", latest: async () => "7.27.0" },
      }),
      gitLog: makeGitLog(),
    },
    probe: async () => ({ delivered: false, inTransit: false }),
  });
  const consoleVerdict = await consoleClassifier.classify(STACK, RESOURCE, {
    cacheDir: "/tmp/.hulumi-drift-smoke-console",
    cacheTtlSeconds: 0,
  });

  // Scenario 2: no console events; pinned < latest.
  const providerClassifier = new DriftClassifier({
    adapters: {
      automationApi: makeAutomationApi(),
      cloudTrail: new CloudTrailAdapter({ lookup: async () => [] }),
      providerVersion: new ProviderVersionAdapter({
        fetcher: { pinned: async () => "7.27.0", latest: async () => "7.28.1" },
      }),
      gitLog: makeGitLog(),
    },
    probe: async () => ({ delivered: false, inTransit: false }),
  });
  const providerVerdict = await providerClassifier.classify(STACK, RESOURCE, {
    cacheDir: "/tmp/.hulumi-drift-smoke-provider",
    cacheTtlSeconds: 0,
  });

  return {
    consoleVerdict: { source: consoleVerdict.source, confidence: consoleVerdict.confidence },
    providerVerdict: { source: providerVerdict.source, confidence: providerVerdict.confidence },
  };
}

if (require.main === module) {
  runSmoke()
    .then((r) => {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(r, null, 2));
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(err);
      process.exit(1);
    });
}
