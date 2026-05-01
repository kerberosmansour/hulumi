import { beforeEach, describe, expect, it } from "vitest";
import type { ResourceValidationArgs } from "@pulumi/policy";

import {
  k8sRbac1NoWildcardVerbs,
  k8sRbac2NoSecretListWatch,
  k8sRbac3NoClusterAdminBinding,
} from "../../src";

function makeArgs(partial: Partial<ResourceValidationArgs>): ResourceValidationArgs {
  return {
    type: "",
    props: {},
    urn: "",
    name: "",
    opts: {} as ResourceValidationArgs["opts"],
    isType: (() => false) as ResourceValidationArgs["isType"],
    asType: ((): undefined => undefined) as ResourceValidationArgs["asType"],
    getConfig: (() => ({})) as ResourceValidationArgs["getConfig"],
    ...partial,
  } as ResourceValidationArgs;
}

let violations: string[];
const report = (msg: string): void => {
  violations.push(msg);
};
beforeEach(() => {
  violations = [];
});

describe("Scenario: RBAC wildcard rejected (HULUMI-K8S-RBAC-1)", () => {
  it("reports verbs:[*] in a ClusterRole", () => {
    const args = makeArgs({
      type: "kubernetes:rbac.authorization.k8s.io/v1:ClusterRole",
      urn: "urn:p::p::kubernetes:rbac.authorization.k8s.io/v1:ClusterRole::wildcard",
      name: "wildcard",
      props: { rules: [{ apiGroups: ["*"], resources: ["*"], verbs: ["*"] }] },
    });
    (
      k8sRbac1NoWildcardVerbs.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/verbs:\["\*"\]/);
  });

  it("does not fire when verbs are explicit", () => {
    const args = makeArgs({
      type: "kubernetes:rbac.authorization.k8s.io/v1:Role",
      urn: "urn:p::p::kubernetes:rbac.authorization.k8s.io/v1:Role::ok",
      name: "ok",
      props: { rules: [{ apiGroups: [""], resources: ["pods"], verbs: ["get", "list"] }] },
    });
    (
      k8sRbac1NoWildcardVerbs.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(0);
  });
});

describe("Scenario: Secret list/watch rejected (HULUMI-K8S-RBAC-2)", () => {
  it("rejects list on secrets (core API group)", () => {
    const args = makeArgs({
      type: "kubernetes:rbac.authorization.k8s.io/v1:Role",
      urn: "urn:p::p::kubernetes:rbac.authorization.k8s.io/v1:Role::secret-lister",
      name: "secret-lister",
      props: {
        rules: [{ apiGroups: [""], resources: ["secrets"], verbs: ["get", "list"] }],
      },
    });
    (
      k8sRbac2NoSecretListWatch.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/list/);
  });

  it("rejects watch on secrets", () => {
    const args = makeArgs({
      type: "kubernetes:rbac.authorization.k8s.io/v1:ClusterRole",
      urn: "urn:p::p::kubernetes:rbac.authorization.k8s.io/v1:ClusterRole::watcher",
      name: "watcher",
      props: {
        rules: [{ apiGroups: [""], resources: ["secrets"], verbs: ["watch"] }],
      },
    });
    (
      k8sRbac2NoSecretListWatch.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
  });

  it("allows get with explicit resourceNames", () => {
    const args = makeArgs({
      type: "kubernetes:rbac.authorization.k8s.io/v1:Role",
      urn: "urn:p::p::kubernetes:rbac.authorization.k8s.io/v1:Role::specific-get",
      name: "specific-get",
      props: {
        rules: [
          {
            apiGroups: [""],
            resources: ["secrets"],
            verbs: ["get"],
            resourceNames: ["my-app-creds"],
          },
        ],
      },
    });
    (
      k8sRbac2NoSecretListWatch.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(0);
  });

  it("suppression with reason silences for the external-secrets operator", () => {
    const args = makeArgs({
      type: "kubernetes:rbac.authorization.k8s.io/v1:ClusterRole",
      urn: "urn:p::p::kubernetes:rbac.authorization.k8s.io/v1:ClusterRole::external-secrets",
      name: "external-secrets",
      props: {
        rules: [{ apiGroups: [""], resources: ["secrets"], verbs: ["list", "watch"] }],
      },
      getConfig: (() => ({
        suppressions: [
          {
            ruleId: "HULUMI-K8S-RBAC-2",
            urnScope:
              "urn:p::p::kubernetes:rbac.authorization.k8s.io/v1:ClusterRole::external-secrets",
            reason: "external-secrets operator needs cluster-wide secret list/watch.",
          },
        ],
      })) as ResourceValidationArgs["getConfig"],
    });
    (
      k8sRbac2NoSecretListWatch.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(0);
  });
});

describe("Scenario: cluster-admin binding rejected (HULUMI-K8S-RBAC-3)", () => {
  it("rejects ClusterRoleBinding to cluster-admin", () => {
    const args = makeArgs({
      type: "kubernetes:rbac.authorization.k8s.io/v1:ClusterRoleBinding",
      urn: "urn:p::p::kubernetes:rbac.authorization.k8s.io/v1:ClusterRoleBinding::admin-binding",
      name: "admin-binding",
      props: {
        roleRef: {
          kind: "ClusterRole",
          name: "cluster-admin",
          apiGroup: "rbac.authorization.k8s.io",
        },
        subjects: [{ kind: "User", name: "alice" }],
      },
    });
    (
      k8sRbac3NoClusterAdminBinding.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/cluster-admin/);
  });

  it("ignores bindings to other ClusterRoles", () => {
    const args = makeArgs({
      type: "kubernetes:rbac.authorization.k8s.io/v1:ClusterRoleBinding",
      urn: "urn:p::p::kubernetes:rbac.authorization.k8s.io/v1:ClusterRoleBinding::view-binding",
      name: "view-binding",
      props: {
        roleRef: { kind: "ClusterRole", name: "view" },
      },
    });
    (
      k8sRbac3NoClusterAdminBinding.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(0);
  });
});
