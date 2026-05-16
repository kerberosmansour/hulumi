// Shared GitHub Actions OIDC issuer identification for the policy pack.
// Single source of truth used by G_OIDC_1 and G_OIDC_2 so neither
// reintroduces the unanchored-substring shape CodeQL flags as
// js/incomplete-url-substring-sanitization.

export const GITHUB_OIDC_ISSUER_HOST = "token.actions.githubusercontent.com";

// Extract the OIDC-provider host from a trust-policy `Principal.Federated`
// value (an IAM OIDC-provider ARN
// `arn:aws:iam::<acct>:oidc-provider/<host>[/...]`, or a raw issuer URL)
// and compare it EXACTLY to the GitHub Actions issuer host. An unanchored
// `String(...).includes("token.actions.githubusercontent.com")` substring
// test would also match a crafted
// `.../oidc-provider/token.actions.githubusercontent.com.evil.com` or
// `.../oidc-provider/evil.com/token.actions.githubusercontent.com`.
export function federatedIsGithubOidc(federated: string): boolean {
  let host = federated;
  const marker = "oidc-provider/";
  const idx = host.indexOf(marker);
  if (idx !== -1) host = host.slice(idx + marker.length);
  host = host.replace(/^https?:\/\//, "");
  const slash = host.indexOf("/");
  if (slash !== -1) host = host.slice(0, slash);
  return host === GITHUB_OIDC_ISSUER_HOST;
}
