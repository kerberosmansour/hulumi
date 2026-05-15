import { afterEach, describe, expect, it } from "vitest";

import { BuildProvenanceFoundation } from "../src";
import { registrations, resetRegistrations, valueOf } from "./setup";

describe("BuildProvenanceFoundation", () => {
  afterEach(() => {
    resetRegistrations();
  });

  it("emits optional provenance permissions and workflow snippet without creating repository resources", async () => {
    const provenance = new BuildProvenanceFoundation("provenance", {
      tier: "startup-hardened",
      artifactName: "dist/**",
      privateRepository: true,
    });

    await expect(valueOf(provenance.requiredPermissions)).resolves.toMatchObject({
      attestations: "write",
      idToken: "write",
    });
    await expect(valueOf(provenance.reusableWorkflowSnippet)).resolves.toContain(
      "actions/attest-build-provenance",
    );
    await expect(valueOf(provenance.caveats)).resolves.toContain(
      "Private repository attestation visibility can be plan-dependent.",
    );
    expect(registrations.filter((r) => r.type.startsWith("github:"))).toHaveLength(0);
  });
});
