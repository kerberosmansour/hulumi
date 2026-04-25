// generate-threat-model — compose a scenario-specific AWS threat-model
// markdown, citing framework IDs only (no verbatim prose).
//
// Dual mode:
//   - CLI:     `node generate-threat-model.mjs <scenario> [--mappings-dir X] [--output-dir Y]`
//   - Library: `import { generateThreatModel } from "./generate-threat-model.mjs"`
//              then call `generateThreatModel({ scenario, scenariosDir, mappingsDir, templatesDir, outputDir, nowIso? })`.
//
// Hard rules (from M1 contract):
//   - IDs only. No verbatim framework prose. The template and the data have been
//     authored accordingly; the license-boundary lint enforces this on CI.
//   - No eval, no exec, no shell interpolation. Scenario IDs pass through an
//     allowlist derived from the scenarios/ directory contents; downstream
//     code only reads files and writes one output.
//   - Graceful degradation: if a mappings file is unreadable, warn on stderr,
//     fall back to a bundled stub, and still write a valid output file.

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join, dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = resolvePath(SCRIPT_DIR, "..");
const REPO_ROOT = resolvePath(SKILL_DIR, "../..");

// ---- Known mapping files -------------------------------------------------
//
// Each entry: filename in mappings dir → array of framework prefixes that
// entry file covers. (The NIST SSDF file carries both NIST-800-218 and
// NIST-800-218A prefixes.)

const MAPPING_FILES = [
  { file: "ccm-v4.1.md", frameworks: ["CCM"] },
  { file: "cis-aws-v5.0.md", frameworks: ["CIS-AWS-v5.0.0"] },
  { file: "nist-800-53-r5.md", frameworks: ["NIST-800-53-r5"] },
  { file: "nist-800-218a.md", frameworks: ["NIST-800-218", "NIST-800-218A"] },
  { file: "atlas-v5.1.md", frameworks: ["ATLAS"] },
];

// ---- Bundled fallback stubs ---------------------------------------------
//
// Used when a mapping file is unreadable. Keep minimal — just enough to
// ensure output remains valid (every citation has a non-empty URL) when
// fallback fires. The full mappings live in docs/mappings/*.md.

/** @type {Record<string, { defaultUrl: string, ids: Record<string, { url: string, title: string }> }>} */
const BUNDLED_STUBS = {
  CCM: {
    defaultUrl: "https://cloudsecurityalliance.org/artifacts/cloud-controls-matrix-v4-1",
    ids: {},
  },
  "CIS-AWS-v5.0.0": {
    defaultUrl: "https://www.cisecurity.org/benchmark/amazon_web_services",
    ids: {},
  },
  "NIST-800-53-r5": {
    defaultUrl: "https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final",
    ids: {},
  },
  "NIST-800-218": {
    defaultUrl: "https://csrc.nist.gov/pubs/sp/800/218/final",
    ids: {},
  },
  "NIST-800-218A": {
    defaultUrl: "https://csrc.nist.gov/projects/ssdf",
    ids: {},
  },
  ATLAS: {
    defaultUrl: "https://atlas.mitre.org/",
    ids: {},
  },
};

// ---- Types (JSDoc) -------------------------------------------------------

/**
 * @typedef {Object} Scenario
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {string[]} requiredFrameworks
 * @property {string[]} actors
 * @property {string[]} assets
 * @property {Array<{type: string, name: string, description: string, controls: string[]}>} stride
 * @property {Array<{name: string, availability: string, rationale: string}>} recommendedComponents
 */

/**
 * @typedef {Object} Citation
 * @property {string} framework
 * @property {string} id
 * @property {string} url
 * @property {string} title
 */

/**
 * @typedef {Object} GenerateOptions
 * @property {string} scenario         - scenario ID (must match a file in scenariosDir)
 * @property {string} scenariosDir
 * @property {string} mappingsDir
 * @property {string} templatesDir
 * @property {string} outputDir        - base dir; the file lands at outputDir/docs/threat-model-<id>-<YYYYMMDD>.md
 * @property {string} [nowIso]         - override ISO8601 timestamp (tests)
 */

/**
 * @typedef {Object} GenerateResult
 * @property {string} path
 * @property {string} content
 */

// ---- Mapping loading -----------------------------------------------------

/**
 * Parse a mapping markdown file. Returns a map keyed by framework name of
 * id → { url, title } entries. Extracts rows from any markdown table whose
 * header row contains `id | paraphrased title | url` (in that order).
 *
 * @param {string} content
 * @param {string[]} frameworks - which frameworks this file covers
 * @returns {Record<string, Record<string, { url: string, title: string }>>}
 */
function parseMappingMarkdown(content, frameworks) {
  /** @type {Record<string, Record<string, { url: string, title: string }>>} */
  const out = {};
  for (const fw of frameworks) out[fw] = {};

  const lines = content.split("\n");
  let inTable = false;
  for (const line of lines) {
    // Header row detection: "| id | paraphrased title | url |"
    if (/^\|\s*id\s*\|\s*paraphrased title\s*\|\s*url\s*\|/i.test(line)) {
      inTable = true;
      continue;
    }
    if (inTable && /^\|[\s:-]+\|[\s:-]+\|[\s:-]+\|/.test(line)) {
      // separator row
      continue;
    }
    if (inTable && /^\|/.test(line)) {
      // data row
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
      if (cells.length < 3) continue;
      const [id, title, url] = cells;
      if (!id || !url) continue;
      // Match the framework prefix (before the colon) to decide which bucket.
      const colonIdx = id.indexOf(":");
      if (colonIdx === -1) continue;
      const prefix = id.slice(0, colonIdx);
      if (frameworks.includes(prefix) && out[prefix]) {
        out[prefix][id] = { url, title };
      }
    } else if (inTable && line.trim() === "") {
      // blank line ends the table
      inTable = false;
    }
  }
  return out;
}

/**
 * Load all mapping tables from disk. For each file that fails to read, warn
 * on stderr (matching the BDD "warning/fallback/bundled" pattern) and fall
 * back to the bundled stubs for the frameworks it would have covered.
 *
 * @param {string} mappingsDir
 * @returns {Record<string, Record<string, { url: string, title: string }>>}
 */
function loadMappings(mappingsDir) {
  /** @type {Record<string, Record<string, { url: string, title: string }>>} */
  const merged = {};
  for (const fw of Object.keys(BUNDLED_STUBS)) merged[fw] = {};

  for (const entry of MAPPING_FILES) {
    const path = join(mappingsDir, entry.file);
    let raw;
    try {
      raw = readFileSync(path, "utf8");
    } catch (err) {
      console.warn(
        `[hulumi-threat-model] warning: could not read ${entry.file}; falling back to bundled stubs. (${describeError(err)})`,
      );
      // Fall back to bundled stubs for this file's frameworks.
      for (const fw of entry.frameworks) {
        for (const [id, meta] of Object.entries(BUNDLED_STUBS[fw].ids)) {
          merged[fw][id] = /** @type {{ url: string, title: string }} */ (meta);
        }
      }
      continue;
    }
    const parsed = parseMappingMarkdown(raw, entry.frameworks);
    for (const fw of entry.frameworks) {
      Object.assign(merged[fw], parsed[fw] ?? {});
    }
  }

  return merged;
}

/**
 * @param {unknown} err
 * @returns {string}
 */
function describeError(err) {
  if (err && typeof err === "object" && "code" in err) {
    const code = /** @type {{ code?: string }} */ (err).code ?? "";
    const msg = /** @type {{ message?: string }} */ (err).message ?? "";
    return `${code}: ${msg}`;
  }
  return String(err);
}

// ---- Scenario loading ----------------------------------------------------

/**
 * @param {string} scenariosDir
 * @returns {string[]}
 */
function listScenarioIds(scenariosDir) {
  if (!existsSync(scenariosDir)) return [];
  return readdirSync(scenariosDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -".json".length))
    .sort();
}

/**
 * @param {string} scenariosDir
 * @param {string} id
 * @returns {Scenario}
 */
function loadScenario(scenariosDir, id) {
  const path = join(scenariosDir, `${id}.json`);
  const raw = readFileSync(path, "utf8");
  /** @type {Scenario} */
  const parsed = JSON.parse(raw);
  if (parsed.id !== id) {
    throw new Error(
      `scenario JSON id (${parsed.id}) does not match filename (${id}); treating as corrupt.`,
    );
  }
  return parsed;
}

// ---- Citation resolution -------------------------------------------------

/**
 * @param {Scenario} scenario
 * @param {Record<string, Record<string, { url: string, title: string }>>} mappings
 * @returns {{ citations: Citation[], unresolved: string[] }}
 */
function resolveCitations(scenario, mappings) {
  /** @type {Citation[]} */
  const citations = [];
  /** @type {string[]} */
  const unresolved = [];
  const seen = new Set();
  for (const row of scenario.stride) {
    for (const ctrl of row.controls) {
      if (seen.has(ctrl)) continue;
      seen.add(ctrl);
      const colonIdx = ctrl.indexOf(":");
      if (colonIdx === -1) {
        unresolved.push(ctrl);
        continue;
      }
      const framework = ctrl.slice(0, colonIdx);
      const entry = mappings[framework]?.[ctrl];
      if (entry) {
        citations.push({ framework, id: ctrl, url: entry.url, title: entry.title });
      } else {
        // Try a framework-default URL so the citation has a non-empty URL.
        const stub = BUNDLED_STUBS[framework];
        if (stub) {
          citations.push({
            framework,
            id: ctrl,
            url: stub.defaultUrl,
            title: "(not yet mapped in framework table)",
          });
        } else {
          unresolved.push(ctrl);
        }
      }
    }
  }
  return { citations, unresolved };
}

/**
 * For each required framework, check whether we resolved at least one
 * citation. Frameworks with zero resolved citations feed the "Open Questions"
 * section as "Requires further research on <FRAMEWORK>".
 *
 * @param {string[]} requiredFrameworks
 * @param {Citation[]} citations
 * @returns {string[]}
 */
function detectEmptyFrameworks(requiredFrameworks, citations) {
  /** @type {string[]} */
  const empty = [];
  for (const fw of requiredFrameworks) {
    const any = citations.some((c) => c.framework === fw);
    if (!any) empty.push(fw);
  }
  return empty;
}

// ---- Template filling ----------------------------------------------------

/**
 * @param {string} template
 * @param {Record<string, string>} subs
 */
function fillTemplate(template, subs) {
  let out = template;
  for (const [key, val] of Object.entries(subs)) {
    out = out.split(`{{${key}}}`).join(val);
  }
  return out;
}

/**
 * @param {Citation[]} citations
 */
function renderCitationsYaml(citations) {
  if (citations.length === 0) return "  []";
  return citations
    .map((c) => `  - framework: ${c.framework}\n    id: ${c.id}\n    url: ${c.url}`)
    .join("\n");
}

/**
 * @param {Citation[]} citations
 */
function renderCitationRows(citations) {
  return citations.map((c) => `| ${c.framework} | ${c.id} | ${c.url} |`).join("\n");
}

/**
 * @param {Scenario["stride"]} stride
 */
function renderStrideRows(stride) {
  return stride
    .map((r) => {
      const controls = r.controls.length > 0 ? r.controls.join(", ") : "(none enumerated)";
      return `| ${r.type} | ${r.name} | ${escapePipes(r.description)} | ${controls} |`;
    })
    .join("\n");
}

/**
 * @param {string} s
 */
function escapePipes(s) {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/**
 * @param {string[]} items
 */
function renderBulletList(items) {
  return items.map((it) => `- ${it}`).join("\n");
}

/**
 * @param {Scenario["recommendedComponents"]} components
 */
function renderComponents(components) {
  if (!Array.isArray(components) || components.length === 0) {
    return "- _(No Hulumi components recommended for this scenario yet. See the roadmap in the README for v1.1+ components.)_";
  }
  return components.map((c) => `- \`${c.name}\` — ${c.availability}. ${c.rationale}`).join("\n");
}

/**
 * @param {string[]} emptyFrameworks
 * @param {string[]} unresolved
 */
function renderOpenQuestions(emptyFrameworks, unresolved) {
  const lines = [];
  if (emptyFrameworks.length > 0) {
    lines.push(
      ...emptyFrameworks.map(
        (fw) =>
          `- **${fw}** — the mapping table returned zero citations for this scenario. Requires further research or a mapping-table expansion before this framework can be cited here.`,
      ),
    );
  }
  if (unresolved.length > 0) {
    lines.push(
      ...unresolved.map(
        (id) =>
          `- Unresolved control ID: \`${id}\` — no mapping found in the known framework tables.`,
      ),
    );
  }
  if (lines.length === 0) {
    lines.push(
      "- No unresolved questions recorded at generation time. Inspect the STRIDE rows for scenario-specific open concerns.",
    );
  }
  return lines.join("\n");
}

// ---- Date helpers --------------------------------------------------------

/**
 * @param {string} iso
 */
function yyyymmdd(iso) {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

// ---- Main entry (library) ------------------------------------------------

/**
 * @param {GenerateOptions} opts
 * @returns {Promise<GenerateResult>}
 */
export async function generateThreatModel(opts) {
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const available = listScenarioIds(opts.scenariosDir);
  if (!available.includes(opts.scenario)) {
    throw new Error(
      `unknown scenario "${opts.scenario}"; valid scenarios in ${opts.scenariosDir}: ${available.join(", ") || "(none)"}`,
    );
  }

  const scenario = loadScenario(opts.scenariosDir, opts.scenario);
  const mappings = loadMappings(opts.mappingsDir);
  const { citations, unresolved } = resolveCitations(scenario, mappings);
  const emptyFrameworks = detectEmptyFrameworks(scenario.requiredFrameworks, citations);

  const templatePath = join(opts.templatesDir, "threat-model.template.md");
  const template = readFileSync(templatePath, "utf8");

  const content = fillTemplate(template, {
    SCENARIO_ID: scenario.id,
    SCENARIO_TITLE: scenario.title,
    SCENARIO_DESCRIPTION: scenario.description,
    GENERATED_AT: nowIso,
    CITATIONS: renderCitationsYaml(citations),
    ACTORS: renderBulletList(scenario.actors),
    ASSETS: renderBulletList(scenario.assets),
    STRIDE_ROWS: renderStrideRows(scenario.stride),
    CITATION_ROWS: renderCitationRows(citations),
    COMPONENTS: renderComponents(scenario.recommendedComponents),
    OPEN_QUESTIONS: renderOpenQuestions(emptyFrameworks, unresolved),
  });

  const outDocsDir = join(opts.outputDir, "docs");
  mkdirSync(outDocsDir, { recursive: true });
  const outPath = join(outDocsDir, `threat-model-${scenario.id}-${yyyymmdd(nowIso)}.md`);
  writeFileSync(outPath, content, "utf8");
  return { path: outPath, content };
}

// ---- CLI entrypoint ------------------------------------------------------

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  /** @type {{ scenario?: string, mappingsDir?: string, outputDir?: string, scenariosDir?: string, templatesDir?: string }} */
  const out = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    /**
     * @param {string} flag
     */
    const expectValue = (flag) => {
      const v = argv[++i];
      if (v === undefined) {
        console.error(`[hulumi-threat-model] flag ${flag} requires a value`);
        process.exit(1);
      }
      return v;
    };
    if (a === "--mappings-dir") out.mappingsDir = expectValue(a);
    else if (a === "--output-dir") out.outputDir = expectValue(a);
    else if (a === "--scenarios-dir") out.scenariosDir = expectValue(a);
    else if (a === "--templates-dir") out.templatesDir = expectValue(a);
    else if (a.startsWith("--")) {
      // unknown flag — ignore
    } else positional.push(a);
  }
  out.scenario = positional[0];
  return out;
}

/** @returns {never} */
function printUsageAndExit() {
  const scenarios = listScenarioIds(join(SKILL_DIR, "scenarios"));
  const msg = [
    "Usage: node generate-threat-model.mjs <scenario> [--mappings-dir DIR] [--output-dir DIR]",
    "",
    "Prebuilt scenarios:",
    ...scenarios.map((s) => `  - ${s}`),
    "",
    "Defaults:",
    `  --mappings-dir     ${join(REPO_ROOT, "docs/mappings")}`,
    `  --output-dir       <current working directory>`,
    `  --scenarios-dir    ${join(SKILL_DIR, "scenarios")}`,
    `  --templates-dir    ${join(SKILL_DIR, "templates")}`,
  ].join("\n");
  // Write to stdout AND stderr so whichever stream the caller inspects, it
  // finds the scenario list. The BDD tests read the combined stream.
  console.log(msg);
  console.error(msg);
  process.exit(1);
}

const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  (typeof process.argv[1] === "string" && process.argv[1].endsWith("generate-threat-model.mjs"));
if (isMainModule) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.scenario) {
    printUsageAndExit();
  }
  const scenariosDir = args.scenariosDir ?? join(SKILL_DIR, "scenarios");
  const available = listScenarioIds(scenariosDir);
  if (!available.includes(args.scenario)) {
    console.error(
      `[hulumi-threat-model] unknown scenario "${args.scenario}"; valid scenarios: ${available.join(", ") || "(none)"}`,
    );
    console.error(
      "Run with no arguments to see usage; run `node list-scenarios.mjs` to see the allowlist.",
    );
    process.exit(1);
  }
  const mappingsDir = args.mappingsDir ?? join(REPO_ROOT, "docs/mappings");
  const outputDir = args.outputDir ?? process.cwd();
  const templatesDir = args.templatesDir ?? join(SKILL_DIR, "templates");
  generateThreatModel({
    scenario: args.scenario,
    scenariosDir,
    mappingsDir,
    outputDir,
    templatesDir,
  })
    .then((res) => {
      console.log(`[hulumi-threat-model] wrote ${res.path}`);
    })
    .catch((err) => {
      console.error(`[hulumi-threat-model] error: ${describeError(err)}`);
      process.exit(2);
    });
}
