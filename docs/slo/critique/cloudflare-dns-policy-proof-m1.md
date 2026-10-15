# SLO critique: Cloudflare DNS-only policy proof M1

Decision: **READY**. The user's standing autonomous instruction confirms this bounded milestone.

## CEO pass

The current mandatory rule advertises a boundary it does not enforce. Correcting the evidence model before further Cloudflare features or publication protects users from a silent origin-exposure bypass.

## Engineering lead pass

Convert CF_DNS_1 from resource validation to stack validation so it can inspect the concrete parent resource and its inputs. Keep the exported rule name and stable ID unchanged. Reuse existing hostname normalization and suppression handling. Avoid changing the `PublicHostname` package because its constructor already requires acknowledgement and justification.

## Security pass

URN ancestry is discovery context, not authorization evidence. Acceptance requires a concrete parent in `args.resources`, exact parent type, exact parent relationship, normalized hostname equality, `purpose: "public-app"`, `proxied: false`, acknowledgement set to literal `true`, and a non-empty string justification. Tests must include absent/unlisted parent, wrong type, hostname mismatch, and whitespace-only justification.

## Operations pass

This changes preview-time policy evaluation only. Properly constructed `PublicHostname` DNS-only records continue to pass. Hand-built or partially reconstructed component graphs can start failing and must migrate to the component or use the existing documented suppression process.

## Required adjustments incorporated

- The runbook names every accepted evidence field.
- The allow-list excludes the Cloudflare component implementation.
- Dependency and package version changes are prohibited.
- Exact-head CI and merged-main Codex Security validation remain exit gates.
