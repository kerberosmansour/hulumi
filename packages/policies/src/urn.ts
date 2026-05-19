// Anchored Pulumi-URN parsing used by policy packs to decide whether a
// resource is a child of a given component type. Substring/`includes`
// matching is unsafe because Pulumi URNs include the operator-controlled
// logical resource name after the final `::`, so a raw resource can be
// declared with a logical name that embeds a parent-component type string
// and bypass any policy that keys on `urn.includes("<type>$")`. This module
// parses the URN into stack / project / type-chain / logical-name and
// matches only against the type-chain ancestors, never the logical name.
//
// Pulumi URN shape (see pulumi/pulumi `pkg/resource/urn.go`):
//   urn:pulumi:<stack>::<project>::<typeChain>::<logicalName>
// where <typeChain> is a `$`-joined chain of types ending in the resource's
// own type, e.g. `hulumi:baseline:aws:SecureBucket$aws:s3/bucketV2:BucketV2`.
// Mirrors the safer slicing already used by isSecureBucketManagedBucketUrn
// in aws/hulumi-hardening-pack.ts and federatedIsGithubOidc in
// github/github-oidc-issuer.ts — kept in one place so every pack is anchored.

const URN_PREFIX = "urn:pulumi:";

export interface ParsedUrn {
  readonly stack: string;
  readonly project: string;
  /** Type-chain ancestors in order; the LAST entry is the resource's own type. */
  readonly typeChain: readonly string[];
  readonly logicalName: string;
}

/**
 * Parse a Pulumi URN. Returns `undefined` for any URN that does not match
 * the expected `urn:pulumi:<stack>::<project>::<typeChain>::<logicalName>`
 * shape — callers should fail closed and treat that as a non-child.
 */
export function parseUrn(urn: string): ParsedUrn | undefined {
  if (typeof urn !== "string" || !urn.startsWith(URN_PREFIX)) return undefined;
  const parts = urn.split("::");
  if (parts.length < 4) return undefined;
  // The first segment is `urn:pulumi:<stack>` — split off the stack.
  const stack = parts[0].slice(URN_PREFIX.length);
  if (stack === "") return undefined;
  const project = parts[1];
  // The logical name is everything after the final `::`. The type chain is
  // the segment immediately before it. Anything between project and type
  // chain (e.g. provider segments) is preserved by joining; the leaf two
  // segments are the part we trust.
  const logicalName = parts[parts.length - 1];
  const typeChainRaw = parts[parts.length - 2];
  if (project === "" || typeChainRaw === "" || logicalName === "") return undefined;
  const typeChain = typeChainRaw.split("$").filter((t) => t !== "");
  if (typeChain.length === 0) return undefined;
  return { stack, project, typeChain, logicalName };
}

/**
 * True iff `componentType` appears as a NON-LEAF entry in the URN's type
 * chain — i.e. the resource is strictly inside a parent component of that
 * type. The leaf entry is the resource's own type and is deliberately
 * excluded so that a top-level resource OF the component type does not
 * count as "its own child".
 *
 * Safe against the forged-logical-name spoof: a raw resource declared
 * with logical name `hulumi:platform:DeploymentRepositoryFoundation$x`
 * has that string in `logicalName`, NOT in `typeChain`, and is rejected.
 */
export function isUrnChildOfComponent(urn: string, componentType: string): boolean {
  if (typeof componentType !== "string" || componentType === "") return false;
  const parsed = parseUrn(urn);
  if (parsed === undefined) return false;
  // All ancestors except the resource's own (leaf) type.
  const ancestors = parsed.typeChain.slice(0, -1);
  return ancestors.includes(componentType);
}

/**
 * Two resources share the same parent component instance iff their URNs
 * share the same (stack, project, typeChain ancestors, and the component
 * instance has the same logical name). Pulumi does not encode the parent's
 * logical name into a child URN, so the strongest invariant we can assert
 * from URN parsing alone is "same type-chain ancestry" — which is what
 * sibling-style policy checks need (combined with a value-binding check
 * on a property of the sibling that names the target resource).
 */
export function urnsShareParentComponent(a: string, b: string): boolean {
  const pa = parseUrn(a);
  const pb = parseUrn(b);
  if (pa === undefined || pb === undefined) return false;
  if (pa.stack !== pb.stack || pa.project !== pb.project) return false;
  const ancestorsA = pa.typeChain.slice(0, -1);
  const ancestorsB = pb.typeChain.slice(0, -1);
  if (ancestorsA.length === 0 || ancestorsA.length !== ancestorsB.length) return false;
  for (let i = 0; i < ancestorsA.length; i++) {
    if (ancestorsA[i] !== ancestorsB[i]) return false;
  }
  return true;
}
