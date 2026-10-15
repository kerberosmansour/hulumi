import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const root = resolve(__dirname, "../../..");
const read = (path: string): string => readFileSync(resolve(root, path), "utf8");

describe("trusted node-label controller artifact and workflow boundary", () => {
  test("BDD-M3-2: the recipe uses only the admitted digest and a numeric nonroot runtime", () => {
    const dockerfile = read("containers/trusted-node-label-reconciler/Dockerfile");
    expect(dockerfile).toContain(
      "FROM mcr.microsoft.com/azurelinux/base/nodejs@sha256:b4f6866da0977e1bbf9ad4c5cdf265cb841bca03dcc2ea55cfa6a71ab655860b",
    );
    expect(dockerfile).toContain("USER 65532:65532");
    expect(dockerfile).toContain(
      'ENTRYPOINT ["node", "/app/dist/trusted-node-label-controller-main.js"]',
    );
    expect(dockerfile).toMatch(/COPY --chown=65532:65532 \. \/app/u);
    expect(dockerfile).not.toMatch(/^RUN\s/gmu);
    expect(dockerfile).not.toMatch(/(?:curl|wget|npm\s+install|pnpm\s+install|dnf|tdnf)/iu);
  });

  test("BDD-M3-3: registry publication and AWS qualification have separate authority", () => {
    const image = read(".github/workflows/trusted-node-label-image.yml");
    const qualification = read(".github/workflows/eks-trusted-node-label-qualification.yml");
    expect(image).toMatch(/^on:\n {2}workflow_dispatch:/mu);
    expect(image).not.toMatch(/^\s+(?:pull_request|pull_request_target|schedule):/gmu);
    expect(image).toContain("packages: write");
    expect(image).toContain("attestations: write");
    expect(image).not.toContain("configure-aws-credentials");
    expect(image).toContain("uses: ./.github/workflows/osv-dependency-gate.yml");
    expect(image).toContain("python3 scripts/osv-image-gate.py");
    expect(image).toContain("linux/amd64");
    expect(image).toContain("linux/arm64");
    expect(image).toContain('gh api "/user/packages/container/${PACKAGE}" --jq .visibility');
    expect(image).toContain('if [ "$visibility" != "public" ]');
    expect(image).not.toContain("--method PATCH");

    expect(qualification).toMatch(/^on:\n {2}workflow_dispatch:/mu);
    expect(qualification).toContain("id-token: write");
    expect(qualification).not.toContain("packages: write");
    expect(qualification).toContain("readiness:");
    expect(qualification).toMatch(/provision:\n\s+needs: \[dependency-admission, readiness\]/u);
    expect(qualification).toContain("github.ref == 'refs/heads/main'");
    expect(qualification).toContain("@sha256:");
    expect(qualification).not.toMatch(/^\s+(?:pull_request|pull_request_target|schedule):/gmu);
    expect(qualification).toContain("iam simulate-principal-policy");
    expect(qualification).toContain("verify-cleanup:");
  });

  test("BDD-M3-4 and BDD-M3-12: cloud mutation needs readiness and always verifies cleanup", () => {
    const qualification = read(".github/workflows/eks-trusted-node-label-qualification.yml");
    const readiness = qualification.indexOf("readiness:");
    const provision = qualification.indexOf("provision:");
    expect(readiness).toBeGreaterThan(0);
    expect(provision).toBeGreaterThan(readiness);
    expect(qualification).toContain("aws sts get-caller-identity");
    expect(qualification).toContain("aws eks list-clusters");
    expect(qualification).toContain("aws ec2 describe-vpcs");
    expect(qualification).toContain("aws iam list-roles");
    expect(qualification).toContain("if: always()");
    expect(qualification).toContain('HULUMI_TEARDOWN_ONLY: "1"');
    expect(qualification).toContain('HULUMI_VERIFY_TEARDOWN: "1"');
  });

  test("BDD-M3-3: real-AWS integration cannot accumulate scheduled environment approvals", () => {
    const weekly = read(".github/workflows/weekly-integration.yml");
    expect(weekly).not.toMatch(/^\s+schedule:/gmu);
    expect(weekly).toMatch(/^\s+workflow_dispatch:/gmu);
  });

  test("BDD-M3-1: the live toolchain is exact, checksummed, and never runs a remote installer", () => {
    const installer = read("examples/eks-trusted-node-label-reconciler-live/install-pulumi-cli.sh");
    expect(installer).toContain('version="3.268.0"');
    expect(installer).toContain(
      'expected_sha256="903cafeaa9f6327e4bf53a8b7b99ae660f26198acfa804a2f982bf5de3f1de0b"',
    );
    expect(installer).toContain("sha256sum --check --strict");
    expect(installer).not.toMatch(/install\.(?:sh|ps1)/iu);
    expect(installer).not.toMatch(/curl[^\n]*\|\s*(?:sh|bash)/iu);
  });
});
