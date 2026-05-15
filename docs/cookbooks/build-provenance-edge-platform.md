# Build Provenance For Edge Platform Deployments

Use `BuildProvenanceFoundation` to keep the workflow snippet and caveats close
to the deployment repository.

```ts
import { BuildProvenanceFoundation } from "@hulumi/platform-patterns";

new BuildProvenanceFoundation("edge-provenance", {
  tier: "startup-hardened",
  artifactName: "dist/**",
  privateRepository: true,
});
```

Battle-test notes:

- Verify the workflow has `id-token: write` and `attestations: write`.
- Private repositories may have visibility or plan caveats for attestation
  discovery; record those caveats explicitly.
- Keep release artifacts and provenance subjects deterministic.
