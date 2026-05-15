# Origin IP Rotation After Cloudflare Onboarding

Cloudflare proxying, tunnels, and AOP protect the active path. They do not erase
historical DNS records, logs, screenshots, or third-party caches that may have
exposed an old origin address.

Recommended sequence:

1. Deploy `PublicHostname` with proxied mode.
2. Deploy either `CloudflareOriginIngress` tunnel mode or allowlist+AOP mode.
3. Rotate the origin IP or load-balancer target after Cloudflare is serving.
4. Remove the old origin address from allowlists and monitoring probes.
5. Record the rotation date and residual exposure window in the battle-test
   checklist.

If rotation is not possible, document the residual risk and keep `X_ORIGIN_1`
advisory until the deployment has compensating evidence.
