---
title: Kubernetes RBAC policy pack
description: Bound Kubernetes RBAC escalation verbs, Secret reads, and cluster-admin bindings during Pulumi preview.
---

# Kubernetes RBAC policy pack

`@hulumi/policies/k8s/packs/hulumi-k8s-rbac` evaluates Kubernetes RBAC resources
during Pulumi preview. The pack applies mandatory controls to `Role`,
`ClusterRole`, `RoleBinding`, and `ClusterRoleBinding` resources without reading
Secret values or contacting a live cluster.

## Rules

| Rule                | Rejected authority                                                                                               | Accepted alternative                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `HULUMI-K8S-RBAC-1` | A rule containing `*`, `bind`, `escalate`, or `impersonate` in `verbs`                                           | Enumerate the ordinary workload verbs the subject needs. |
| `HULUMI-K8S-RBAC-2` | `list`, `watch`, or `*` on core Secrets; `get` on core Secrets without a nonempty array of exact `resourceNames` | Grant `get` and name each required Secret exactly.       |
| `HULUMI-K8S-RBAC-3` | A binding to the built-in `cluster-admin` ClusterRole                                                            | Bind a least-privilege Role or ClusterRole.              |

RBAC-1 reports one violation per policy rule even when the rule contains several
authority verbs. RBAC-2 also reports at most one violation per policy rule. Its
diagnostic identifies the authority class but never copies Secret names or the
rest of the rule into preview output.

An RBAC-2 `resourceNames` bound is valid only when it is an array containing at
least one nonempty exact name. Blank values, surrounding whitespace, `*`, a
scalar value, a missing field, and an empty array are rejected. The bound limits
`get`; Kubernetes does not use `resourceNames` to make `list` or `watch` safe.

## Example

This rule grants one workload access to one Secret:

```ts
{
  apiGroups: [""],
  resources: ["secrets"],
  verbs: ["get"],
  resourceNames: ["payments-runtime"],
}
```

Avoid granting RBAC management authority to application workloads. Kubernetes
uses `bind` and `escalate` to authorize creation or update of roles and bindings
that the caller could not otherwise grant, while `impersonate` lets a caller act
as another subject. Hulumi treats an explicit occurrence of any of these verbs
as a mandatory violation, not only a wildcard that implies them.

## Reviewed exceptions

Some controllers must observe Secrets across a namespace or cluster. Use the
existing typed suppression only after reviewing the controller's source,
service account, namespace, and deployment boundary:

```yaml
suppressions:
  - ruleId: HULUMI-K8S-RBAC-2
    urnScope: "urn:pulumi:prod::platform::kubernetes:rbac.authorization.k8s.io/v1:ClusterRole::external-secrets"
    reason: "External Secrets controller reconciles Secret objects; owner: platform-security; review: 2027-01-15."
    expiresAt: "2027-01-15"
```

A suppression needs a nonempty reason, an explicit exact or non-global
trailing-prefix URN scope, and a canonical future expiry. Keep the exception
narrow and record an owner and review reference in the reason.

## Rollout checks

Run the pack in a read-only preview first. Confirm that ordinary Pod reads and
exact named-Secret reads remain clean, then investigate every authority finding
before making the pack deployment-blocking. See the
[policy-pack rollout cookbook](../cookbooks/policy-pack-rollout.md) for loading
multiple packs and documenting suppressions.
