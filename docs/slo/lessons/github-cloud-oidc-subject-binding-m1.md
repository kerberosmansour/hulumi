# Lessons — Azure and GCP GitHub OIDC subject binding M1

Date: 2026-10-15

1. Finding a required claim name in text is not authorization proof. A disjunction or constant suffix can make a condition true while retaining every expected substring. A narrow parser made the accepted logic auditable.
2. Provider claim names differ. Customized GitHub subjects use the `repo` key, while GCP's direct token assertion is `assertion.repository`. The first positive parser test exposed this distinction before review or release.
3. Fail-closed policy inputs need bounded diagnostics. One structural reason per resource gives operators a repair path without echoing the complete untrusted expression.
4. Safe extensibility can remain narrow. Azure extra key/value pairs and GCP extra direct exact equalities support immutable numeric identity claims without accepting functions, disjunctions, or arbitrary CEL.
5. Toolchain reuse is compatible with dependency admission only when every manifest and lockfile matches the already scanned graph exactly and no install or lifecycle hook runs.
