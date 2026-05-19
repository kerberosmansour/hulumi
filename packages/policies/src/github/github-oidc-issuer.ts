// Shared GitHub Actions OIDC issuer identification for the policy pack.
// Single source of truth used by G_OIDC_1 and G_OIDC_2 so neither
// reintroduces the unanchored-substring shape CodeQL flags as
// js/incomplete-url-substring-sanitization.

export const GITHUB_OIDC_ISSUER_HOST = "token.actions.githubusercontent.com";

// Extract the OIDC-provider host from a single trust-policy
// `Principal.Federated` entry (an IAM OIDC-provider ARN
// `arn:aws:iam::<acct>:oidc-provider/<host>[/...]`, or a raw issuer URL)
// and compare it EXACTLY to the GitHub Actions issuer host. An unanchored
// `String(...).includes("token.actions.githubusercontent.com")` substring
// test would also match a crafted
// `.../oidc-provider/token.actions.githubusercontent.com.evil.com` or
// `.../oidc-provider/evil.com/token.actions.githubusercontent.com`.
function federatedEntryIsGithubOidc(entry: string): boolean {
  let host = entry;
  const marker = "oidc-provider/";
  const idx = host.indexOf(marker);
  if (idx !== -1) host = host.slice(idx + marker.length);
  host = host.replace(/^https?:\/\//, "");
  const slash = host.indexOf("/");
  if (slash !== -1) host = host.slice(0, slash);
  return host === GITHUB_OIDC_ISSUER_HOST;
}

// AWS IAM `Principal.Federated` may be a single string OR an array of
// federated-provider strings. A trust policy listing the real GitHub OIDC
// provider ARN alongside another provider must still be treated as
// GitHub-OIDC-trusted; a lossy `String(...)` coercion comma-joins arrays
// and bypasses the anchored host match. Match if ANY array element is a
// string identifying the GitHub Actions issuer.
export function federatedIsGithubOidc(federated: unknown): boolean {
  if (Array.isArray(federated)) {
    return federated.some(
      (entry) => typeof entry === "string" && federatedEntryIsGithubOidc(entry),
    );
  }
  if (typeof federated === "string") return federatedEntryIsGithubOidc(federated);
  return false;
}
