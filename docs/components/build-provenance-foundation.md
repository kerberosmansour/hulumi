# BuildProvenanceFoundation

`BuildProvenanceFoundation` emits the permissions and reusable workflow snippet needed to add build provenance to a repository.

It is intentionally optional. Deployment repository creation does not depend on provenance because private-repository attestation availability and visibility can be plan-dependent.

```ts
import { BuildProvenanceFoundation } from "@hulumi/platform-patterns";

new BuildProvenanceFoundation("provenance", {
  tier: "startup-hardened",
  artifactName: "dist/**",
  privateRepository: true,
});
```

Required permissions include `id-token: write` and `attestations: write`. Replace the action placeholder with a full-length pinned commit SHA before use.
