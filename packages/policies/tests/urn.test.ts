// Anchored URN parsing — regression tests for the cluster of "policy
// bypassed by an attacker-controlled logical resource name" findings.
// The unsafe pattern that was scattered across multiple packs:
//
//   urn.includes(`${componentType}$`)
//
// returns true whenever the substring appears ANYWHERE in the URN —
// including in the logical-name suffix that is operator-controlled. An
// attacker can declare a raw resource named e.g.
// `hulumi:platform:DeploymentRepositoryFoundation$x` and the substring
// check fires even though the resource is not actually parented under
// any DeploymentRepositoryFoundation component.
//
// The anchored helpers parse the URN into its type-chain (the part
// between project and logical-name segments) and match only against
// type-chain ancestors, never the logical name.

import { describe, it, expect } from "vitest";

import { parseUrn, isUrnChildOfComponent, urnsShareParentComponent } from "../src/urn";

// The four URNs we care about across this whole cluster:
//
//   GENUINE_CHILD       = a real child resource of a real parent component
//   FORGED_LOGICAL_NAME = a top-level resource whose LOGICAL NAME contains
//                         the parent type token (attacker's spoof)
//   GENUINE_TOP_LEVEL   = a top-level resource of the parent type itself
//                         (not a child of itself)
//   SIBLING_DIFF_PARENT = a resource under a DIFFERENT component instance
//
// Tests assert the anchored helper accepts only the first and rejects
// the rest — none of the substring-based checks did.

const STACK = "dev";
const PROJECT = "myproject";

function makeUrn(typeChain: string, logicalName: string): string {
  return `urn:pulumi:${STACK}::${PROJECT}::${typeChain}::${logicalName}`;
}

describe("parseUrn", () => {
  it("splits stack/project/typeChain/logicalName from a single-type URN", () => {
    const parsed = parseUrn(makeUrn("aws:s3/bucketV2:BucketV2", "scratch"));
    expect(parsed).toBeDefined();
    expect(parsed!.stack).toBe(STACK);
    expect(parsed!.project).toBe(PROJECT);
    expect(parsed!.typeChain).toEqual(["aws:s3/bucketV2:BucketV2"]);
    expect(parsed!.logicalName).toBe("scratch");
  });

  it("splits a `$`-joined parent-child type chain", () => {
    const urn = makeUrn(
      "hulumi:baseline:aws:SecureBucket$aws:s3/bucketV2:BucketV2",
      "scratch-bucket",
    );
    const parsed = parseUrn(urn);
    expect(parsed!.typeChain).toEqual([
      "hulumi:baseline:aws:SecureBucket",
      "aws:s3/bucketV2:BucketV2",
    ]);
    expect(parsed!.logicalName).toBe("scratch-bucket");
  });

  it("returns undefined for malformed URNs (fail closed)", () => {
    expect(parseUrn("")).toBeUndefined();
    expect(parseUrn("not-a-urn")).toBeUndefined();
    expect(parseUrn("urn:pulumi:::missing::::")).toBeUndefined();
    expect(parseUrn("urn:pulumi:dev::project")).toBeUndefined();
  });
});

describe("isUrnChildOfComponent — anchored against forged-logical-name spoof", () => {
  const PARENT_TYPE = "hulumi:platform:DeploymentRepositoryFoundation";

  it("returns true for a genuine child (parent type in non-leaf chain entry)", () => {
    const urn = makeUrn(`${PARENT_TYPE}$github:index/repository:Repository`, "my-repo");
    expect(isUrnChildOfComponent(urn, PARENT_TYPE)).toBe(true);
  });

  it("returns false when the parent type appears ONLY in the logical name (spoof)", () => {
    // Exploit vector from the DEPLOY_GOV_1 finding: raw `github.Repository`
    // declared with logical name containing the substring `<parentType>$`.
    // URN: ...::github:index/repository:Repository::hulumi:platform:DeploymentRepositoryFoundation$deploy-repo
    const urn = makeUrn("github:index/repository:Repository", `${PARENT_TYPE}$deploy-repo`);
    expect(isUrnChildOfComponent(urn, PARENT_TYPE)).toBe(false);
  });

  it("returns false for a top-level resource OF the parent type itself", () => {
    // The component instance is not its own child.
    const urn = makeUrn(PARENT_TYPE, "foundation-1");
    expect(isUrnChildOfComponent(urn, PARENT_TYPE)).toBe(false);
  });

  it("returns false for a resource under a different parent component", () => {
    const urn = makeUrn(
      "hulumi:platform:DeploymentRepositoryFoundation$github:index/repository:Repository",
      "my-repo",
    );
    expect(isUrnChildOfComponent(urn, "hulumi:cloudflare:PublicHostname")).toBe(false);
  });

  it("returns false for empty / nonsense component type", () => {
    const urn = makeUrn(`${PARENT_TYPE}$github:index/repository:Repository`, "my-repo");
    expect(isUrnChildOfComponent(urn, "")).toBe(false);
    expect(isUrnChildOfComponent(urn, "DeploymentRepositoryFoundation")).toBe(false); // partial type
  });
});

describe("urnsShareParentComponent — sibling matching anchored to parent component", () => {
  const PARENT = "hulumi:baseline:aws:SecureBucket";
  const BUCKET = "aws:s3/bucketV2:BucketV2";
  const POLICY = "aws:s3/bucketPolicy:BucketPolicy";

  it("returns true for two children of the same parent component type chain", () => {
    const a = makeUrn(`${PARENT}$${BUCKET}`, "scratch-bucket");
    const b = makeUrn(`${PARENT}$${POLICY}`, "scratch-policy");
    expect(urnsShareParentComponent(a, b)).toBe(true);
  });

  it("returns false when one resource is top-level (no parent component)", () => {
    const a = makeUrn(`${PARENT}$${BUCKET}`, "scratch-bucket");
    const b = makeUrn(POLICY, "raw-policy");
    expect(urnsShareParentComponent(a, b)).toBe(false);
  });

  it("returns false when parents are different component types", () => {
    const a = makeUrn(`${PARENT}$${BUCKET}`, "scratch-bucket");
    const b = makeUrn(`hulumi:platform:DeploymentRepositoryFoundation$${POLICY}`, "evil-policy");
    expect(urnsShareParentComponent(a, b)).toBe(false);
  });

  it("returns false across different stacks or projects", () => {
    const a = makeUrn(`${PARENT}$${BUCKET}`, "scratch-bucket");
    const b = `urn:pulumi:other-stack::${PROJECT}::${PARENT}$${POLICY}::scratch-policy`;
    expect(urnsShareParentComponent(a, b)).toBe(false);
  });
});
