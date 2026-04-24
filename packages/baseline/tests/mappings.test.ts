// mappings.test.ts — asserts the TS-programmatic framework-ID tables in
// packages/baseline/src/mappings/* are a subset of the markdown mapping
// tables in docs/mappings/*. This guards against drift: if a TS mapping
// claims an ID the docs don't know about, the skill would fabricate a
// citation. Fail hard on any mismatch.

import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { ccm } from "../src/mappings/ccm";
import { cisAws } from "../src/mappings/cis-aws";
import { nist80053r5 } from "../src/mappings/nist-800-53-r5";
import { atlas } from "../src/mappings/atlas";

const DOCS_MAPPINGS_DIR = resolve(__dirname, "../../../docs/mappings");

async function loadIdsFromDocMapping(filename: string, prefix: string): Promise<Set<string>> {
  const raw = await readFile(resolve(DOCS_MAPPINGS_DIR, filename), "utf8");
  const ids = new Set<string>();
  const lines = raw.split("\n");
  let inTable = false;
  for (const line of lines) {
    if (/^\|\s*id\s*\|\s*paraphrased title\s*\|\s*url\s*\|/i.test(line)) {
      inTable = true;
      continue;
    }
    if (inTable && /^\|[\s:-]+\|[\s:-]+\|[\s:-]+\|/.test(line)) continue;
    if (inTable && /^\|/.test(line)) {
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
      if (cells.length < 3) continue;
      const [id, , url] = cells;
      if (id.startsWith(prefix) && url.length > 0) ids.add(id);
    } else if (inTable && line.trim() === "") {
      inTable = false;
    }
  }
  return ids;
}

describe("Mappings — TS tables are a subset of docs/mappings/*.md", () => {
  it("every ccm.secureBucket id exists in docs/mappings/ccm-v4.1.md with a URL", async () => {
    const docsIds = await loadIdsFromDocMapping("ccm-v4.1.md", "CCM:");
    for (const id of ccm.secureBucket) expect(docsIds).toContain(id);
  });

  it("every cisAws.secureBucket id exists in docs/mappings/cis-aws-v5.0.md with a URL", async () => {
    const docsIds = await loadIdsFromDocMapping("cis-aws-v5.0.md", "CIS-AWS-v5.0.0:");
    for (const id of cisAws.secureBucket) expect(docsIds).toContain(id);
  });

  it("every nist80053r5.secureBucket id exists in docs/mappings/nist-800-53-r5.md with a URL", async () => {
    const docsIds = await loadIdsFromDocMapping("nist-800-53-r5.md", "NIST-800-53-r5:");
    for (const id of nist80053r5.secureBucket) expect(docsIds).toContain(id);
  });

  it("every atlas.secureBucket id exists in docs/mappings/atlas-v5.1.md with a URL", async () => {
    const docsIds = await loadIdsFromDocMapping("atlas-v5.1.md", "ATLAS:");
    for (const id of atlas.secureBucket) expect(docsIds).toContain(id);
  });
});
