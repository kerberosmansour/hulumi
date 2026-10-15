# Lessons — Drift evidence-window contract M1

Date: 2026-10-15

1. Temporal parameter names need one explicit contract. Git's existing `after → --since` and `before → --until` mapping supplied a non-vacuous control that proved the defect was in default construction.
2. Capture the clock once for a compound interval. This makes the exact duration deterministic and prevents two boundary values from describing different observations of time.
3. Validation belongs before caches and evidence sources. Otherwise an invalid request can be hidden by a cache hit or translated into a clean-looking empty provider result.
4. Adapter failure shapes are part of the public contract. The classifier can reject invalid caller input, while direct adapters preserve their established `{ detected: false, ok: false }` degradation behavior.
5. Compatibility did not require accepting ambiguity. Keeping the public `before` and `after` names while documenting, centralizing, and testing their polarity repaired the defect without forcing a breaking API migration.
6. Toolchain reuse is compatible with dependency admission only when every manifest and lockfile matches the already scanned graph exactly and no install or lifecycle hook runs.
