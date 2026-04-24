// list-scenarios — enumerate the prebuilt scenario IDs the skill supports.
//
// Used by:
//   - the SKILL.md instructions: the agent runs this to validate a scenario
//     argument before calling generate-threat-model.mjs.
//   - the BDD suite: asserts the exported listScenarios() returns exactly
//     the 5 prebuilt IDs in the declared order.

/**
 * @returns {string[]} the prebuilt scenario IDs in declared order.
 */
export function listScenarios() {
  // Order is a stability contract — the skill's BDD tests assert this exact
  // sequence. New scenarios append at the end in future milestones.
  return [
    "aws-multi-account-baseline",
    "s3-public-bucket-hardening",
    "iam-least-privilege",
    "rds-encryption-at-rest",
    "lambda-secrets-access",
  ];
}

// CLI entrypoint: `node list-scenarios.mjs` prints one scenario per line.
// Used by SKILL.md instructions to validate user input.
const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  (typeof process.argv[1] === "string" && process.argv[1].endsWith("list-scenarios.mjs"));
if (isMainModule) {
  for (const id of listScenarios()) console.log(id);
}
