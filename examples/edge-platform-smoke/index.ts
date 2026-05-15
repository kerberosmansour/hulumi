import {
  EdgeWafBaseline,
  PublicHostname,
  ZoneFoundation,
  loginRateLimitRule,
} from "@hulumi/cloudflare-baseline";
import {
  BuildProvenanceFoundation,
  CloudflareOriginIngress,
  DeploymentRepositoryFoundation,
  GitHubAwsOidcDeploymentRole,
} from "@hulumi/platform-patterns";
import { cloudflare as cloudflarePolicies, platform as platformPolicies } from "@hulumi/policies";

const zone = new ZoneFoundation("edge-zone", {
  tier: "startup-hardened",
  zoneId: "zone_123",
  settings: {
    alwaysUseHttps: true,
    automaticHttpsRewrites: true,
    minTlsVersion: "1.2",
  },
});

const hostname = new PublicHostname("edge-app", {
  tier: "startup-hardened",
  zoneId: zone.zoneId,
  hostname: "app.example.com",
  recordType: "CNAME",
  target: "edge-tunnel.example.cfargotunnel.com",
  purpose: "public-app",
});

const waf = new EdgeWafBaseline("edge-waf", {
  tier: "startup-hardened",
  zoneId: zone.zoneId,
  plan: "business",
  enableManagedRulesets: true,
  rateLimitRules: [loginRateLimitRule({ pathPrefix: "/login" })],
});

const ingress = new CloudflareOriginIngress("edge-ingress", {
  tier: "startup-hardened",
  mode: "tunnel",
  cloudflareAccountId: "acct_123",
  hostname: "app.example.com",
  service: "http://app.default.svc.cluster.local:8080",
  tunnelSecret: "test-only-tunnel-secret-reference",
  runtime: { kind: "eks", automation: "managed-contract" },
});

const deploymentRole = new GitHubAwsOidcDeploymentRole("edge-deploy-role", {
  tier: "startup-hardened",
  owner: "example-org",
  repository: "edge-deployments",
  environment: "prod",
  reusableWorkflowRef: "example-org/edge-deployments/.github/workflows/deploy.yml@refs/heads/main",
  audience: "sts.amazonaws.com",
  roleName: "edge-prod-deploy",
  oidcProviderArn: "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com",
  policyArns: ["arn:aws:iam::123456789012:policy/edge-prod-deploy"],
});

const deploymentRepository = new DeploymentRepositoryFoundation("edge-deployments", {
  tier: "startup-hardened",
  owner: "example-org",
  name: "edge-deployments",
  environments: [
    {
      name: "prod",
      requiredReviewerTeamIds: [1234],
      protectedBranches: true,
      customBranchPolicies: false,
      variables: {
        AWS_REGION: "us-east-1",
      },
      secretReferences: ["PROD_DEPLOY_ROLE_ARN"],
    },
  ],
  provenance: true,
});

const provenance = new BuildProvenanceFoundation("edge-provenance", {
  tier: "startup-hardened",
  artifactName: "dist/**",
  privateRepository: true,
});

export const hostnameProtectionMode = hostname.protectionMode;
export const wafControls = waf.appliedControls;
export const ingressProtectionLayers = ingress.protectionLayers;
export const deploymentRoleUsage = deploymentRole.githubActionsUsageBlock;
export const deploymentRepositoryName = deploymentRepository.repoFullName;
export const provenanceSnippet = provenance.reusableWorkflowSnippet;
export const edgePolicyRuleIds = [
  cloudflarePolicies.CF_DNS_1_RULE_ID,
  cloudflarePolicies.CF_DNSSEC_1_RULE_ID,
  cloudflarePolicies.CF_ORIGIN_1_RULE_ID,
  platformPolicies.X_ORIGIN_1_RULE_ID,
  platformPolicies.DEPLOY_GOV_1_RULE_ID,
  platformPolicies.DEPLOY_GOV_2_RULE_ID,
];
