// list-scenarios — enumerate the prebuilt scenario IDs the skill supports.
//
// Used by:
//   - the SKILL.md instructions: the agent runs this to validate a scenario
//     argument before calling generate-threat-model.mjs.
//   - the BDD suite: asserts the exported listScenarios() returns exactly
//     the prebuilt IDs in the declared order. As of v1.1 M1 (Hulumi-for-GitHub
//     2026-04-26): 5 AWS scenarios + 4 GitHub scenarios = 9 total.

/**
 * @returns {string[]} the prebuilt scenario IDs in declared order.
 */
export function listScenarios() {
  // Order is a stability contract — the skill's BDD tests assert this exact
  // sequence. New scenarios append at the end in future milestones.
  // The 4 GitHub scenarios were added in v1.1 M1 (Hulumi-for-GitHub runbook,
  // 2026-04-26) addressing the highest demand-minus-supply scenarios from
  // research synthesis: (d) OIDC trust to cloud, (c) Actions supply-chain,
  // (f) GitHub App / installation-token exposure, (e) self-hosted runners.
  return [
    "aws-multi-account-baseline",
    "s3-public-bucket-hardening",
    "iam-least-privilege",
    "rds-encryption-at-rest",
    "lambda-secrets-access",
    "github-oidc-trust-cloud-account",
    "github-actions-supply-chain",
    "github-app-token-exposure",
    "github-self-hosted-runner",
    // K8s/EKS scenarios added in runbook hulumi-operations-k8s-security M6.
    "eks-cluster-baseline",
    "eks-runtime-and-backup",
    // Operations scenarios added in runbook hulumi-operations-k8s-security M11.
    "operations-patch-compliance-lapse",
    "operations-detective-services-disabled",
    "operations-audit-pipeline-broken",
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
