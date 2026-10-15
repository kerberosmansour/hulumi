# Lessons — Cloudflare origin trust boundary M1

Date: 2026-10-15

1. A component token is a declaration, not proof of origin enforcement. The policy has to inspect the tunnel/config or AOP/listener/trust-store/security-group children and correlate them to the reviewed hostname.
2. Certificate reference strings cannot prove TLS enforcement. A complete ALB contract needs the server certificate, client CA trust store, mutual-TLS listener mode, target group, and expiry behavior.
3. Cloudflare AOP becomes meaningful only when the origin verifies the presented client certificate. Enabling the Cloudflare-side association alone leaves the direct origin path unprotected.
4. Deployment order is part of the security contract. Making AOP depend on the listener and security-group controls prevents the edge association from becoming active before origin enforcement exists.
5. CIDR syntax validation proves only shape. Security claims about Cloudflare sources require membership in Cloudflare's published address set, canonical ranges, uniqueness, and a fail-closed update process.
6. Secret handling must be enforced inside a library. Documentation that asks callers to use `pulumi.secret` is useful, but omitting the value from parent inputs and forcing the child wrapper protects callers who pass a literal.
7. Versioned CA-bundle objects make trust-store changes reproducible and reviewable. An unversioned S3 key can change authority without a corresponding infrastructure diff.
8. Build and test are not independent in this workspace because builds remove and recreate `dist`. Repository verification must run build before tests rather than concurrently.
9. Breaking ownership changes need explicit migration text. Existing ALB listeners and trust stores must be imported or deliberately replaced before the hardened component takes ownership.
