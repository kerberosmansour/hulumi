// Unit scenarios for the shared GitHub OIDC issuer matcher (#165).
// Single source of truth used by G_OIDC_1 and G_OIDC_2.

import { describe, it, expect } from "vitest";

import { federatedIsGithubOidc, GITHUB_OIDC_ISSUER_HOST } from "../../src/github";

describe("federatedIsGithubOidc — anchored host match", () => {
  it("matches a real IAM OIDC-provider ARN and a raw issuer URL", () => {
    expect(
      federatedIsGithubOidc(
        "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com",
      ),
    ).toBe(true);
    expect(federatedIsGithubOidc(`https://${GITHUB_OIDC_ISSUER_HOST}`)).toBe(true);
    expect(federatedIsGithubOidc(GITHUB_OIDC_ISSUER_HOST)).toBe(true);
  });

  it("rejects crafted look-alike hosts (incomplete-substring class)", () => {
    expect(
      federatedIsGithubOidc(
        "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com.evil.com",
      ),
    ).toBe(false);
    expect(
      federatedIsGithubOidc(
        "arn:aws:iam::123456789012:oidc-provider/evil.com/token.actions.githubusercontent.com",
      ),
    ).toBe(false);
    expect(federatedIsGithubOidc("https://token.actions.githubusercontent.com.evil.com")).toBe(
      false,
    );
  });

  it("rejects unrelated federated principals", () => {
    expect(
      federatedIsGithubOidc("arn:aws:iam::123456789012:oidc-provider/accounts.google.com"),
    ).toBe(false);
    expect(federatedIsGithubOidc("")).toBe(false);
  });
});

describe("federatedIsGithubOidc — array Principal.Federated", () => {
  it("matches when the GitHub provider is one element among others", () => {
    expect(
      federatedIsGithubOidc([
        "arn:aws:iam::123456789012:oidc-provider/accounts.google.com",
        "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com",
      ]),
    ).toBe(true);
  });

  it("rejects an array of only non-GitHub providers", () => {
    expect(
      federatedIsGithubOidc([
        "arn:aws:iam::123456789012:oidc-provider/accounts.google.com",
        "cognito-identity.amazonaws.com",
      ]),
    ).toBe(false);
  });

  it("rejects an array whose only GitHub-ish element is a crafted look-alike", () => {
    expect(
      federatedIsGithubOidc([
        "arn:aws:iam::123456789012:oidc-provider/accounts.google.com",
        "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com.evil.com",
      ]),
    ).toBe(false);
  });

  it("rejects non-string / empty inputs", () => {
    expect(federatedIsGithubOidc(undefined)).toBe(false);
    expect(federatedIsGithubOidc(null)).toBe(false);
    expect(federatedIsGithubOidc([])).toBe(false);
    expect(federatedIsGithubOidc([123, { a: 1 }])).toBe(false);
  });
});
