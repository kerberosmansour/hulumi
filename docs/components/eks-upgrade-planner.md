---
title: planUpgrade (EksUpgradePlanner)
description: Pure side-effect-free library that produces an EKS upgrade-safety report. One cluster per call.
---

# `planUpgrade` / `reportToMarkdown`

`@hulumi/k8s-baseline.planUpgrade` — a pure function that consumes an `EksUpgradeInventory` (current/target version, support status, add-on inventory, backup evidence) and returns an `UpgradeReport` with a verdict (`safe | degraded | unsafe`), reasons, warnings, and per-add-on notes.

Does NOT make network calls. Does NOT mutate state. Does NOT perform upgrades. Consumers wire in real `aws eks describe-*` data.

## Verdict gates

| Gate | Action |
|---|---|
| `targetSupportStatus === "unsupported"` | `unsafe` |
| `currentSupportStatus === "unsupported"` | `unsafe` |
| `targetSupportStatus === "unknown"` | `degraded` (warning) |
| `currentSupportStatus === "extended"` | `safe` (warning, elevated priority) |
| Skipping minor versions (e.g. 1.28 → 1.31) | `unsafe` |
| Downgrade | `unsafe` |
| `backupEvidence.recent === false` | `unsafe` |
| Any add-on `targetCompatibleWithK8sTarget === false` | `unsafe` |

## Bounds

- `MAX_UPGRADE_PLANNER_ADDONS = 32` (one cluster per call).

```ts
import { planUpgrade, reportToMarkdown } from "@hulumi/k8s-baseline";

const report = planUpgrade({
  clusterName: "prod-eks",
  currentK8sVersion: "1.30",
  targetK8sVersion: "1.31",
  currentSupportStatus: "standard",
  targetSupportStatus: "standard",
  addons: [
    {
      name: "vpc-cni",
      currentVersion: "v1.19.0",
      targetVersion: "v1.20.0",
      targetCompatibleWithK8sTarget: true,
    },
  ],
  backupEvidence: { recent: true },
});

if (report.verdict !== "safe") {
  console.error(reportToMarkdown(report));
  process.exit(1);
}
```

Source: [packages/k8s-baseline/src/eks-upgrade-planner.ts](../../packages/k8s-baseline/src/eks-upgrade-planner.ts).
