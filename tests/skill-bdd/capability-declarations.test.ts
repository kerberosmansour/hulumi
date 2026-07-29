import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface CapabilityProperty {
  name: string;
  value: string;
}

interface DeclarationTarget {
  "bom-ref": string;
  version: string;
  properties?: CapabilityProperty[];
}

interface DeclarationClaim {
  "bom-ref": string;
  target: string;
  predicate: string;
  reasoning: string;
}

interface CapabilityBom {
  metadata: { component: { version: string } };
  declarations: {
    targets: { components: DeclarationTarget[] };
    claims: DeclarationClaim[];
  };
}

const DECLARATION = resolve(__dirname, "../../declarations/cyclonedx-1.6-capabilities.json");

describe("CycloneDX capability declaration for the brokered PostgreSQL boundary", () => {
  it("uses current package versions and stable component bom-refs", async () => {
    const bom = JSON.parse(await readFile(DECLARATION, "utf8")) as CapabilityBom;
    expect(bom.metadata.component.version).toBe("1.5.4");
    const refs = bom.declarations.targets.components.map((component) => component["bom-ref"]);
    expect(refs).toContain("component:@hulumi/platform-patterns");
    expect(refs).toContain("component:@hulumi/policies");
    for (const component of bom.declarations.targets.components) {
      expect(component.version).toBe("1.5.4");
    }
  });

  it("advertises the IaC and policy capabilities with explicit non-runtime limits", async () => {
    const bom = JSON.parse(await readFile(DECLARATION, "utf8")) as CapabilityBom;
    const platform = bom.declarations.targets.components.find(
      (component) => component["bom-ref"] === "component:@hulumi/platform-patterns",
    )!;
    const policies = bom.declarations.targets.components.find(
      (component) => component["bom-ref"] === "component:@hulumi/policies",
    )!;

    expect(platform.properties).toContainEqual({
      name: "cdx:sunlit:capability",
      value: "brokered-aurora-postgres-boundary-iac",
    });
    expect(policies.properties).toContainEqual({
      name: "cdx:sunlit:capability",
      value: "brokered-postgres-boundary-policy",
    });
    expect(platform.properties?.filter((property) => property.name === "cdx:sunlit:limit")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: expect.stringMatching(/does not implement.*broker/i) }),
        expect.objectContaining({ value: expect.stringMatching(/live.*evidence/i) }),
        expect.objectContaining({
          value: expect.stringMatching(/public.*JWKS.*no.*network fetch/i),
        }),
        expect.objectContaining({
          value: expect.stringMatching(/conditional.*PutItem.*replay/i),
        }),
        expect.objectContaining({
          value: expect.stringMatching(/application-credentials-prepopulated/i),
        }),
        expect.objectContaining({
          value: expect.stringMatching(/DynamoDB interface endpoint/i),
        }),
      ]),
    );
  });

  it("binds stable claims to the exact components without overstating runtime completion", async () => {
    const bom = JSON.parse(await readFile(DECLARATION, "utf8")) as CapabilityBom;
    const iacClaim = bom.declarations.claims.find(
      (claim) => claim["bom-ref"] === "claim:hulumi:brokered-aurora-postgres-boundary-iac",
    );
    const policyClaim = bom.declarations.claims.find(
      (claim) => claim["bom-ref"] === "claim:hulumi:brokered-postgres-boundary-policy",
    );

    expect(iacClaim?.target).toBe("component:@hulumi/platform-patterns");
    expect(policyClaim?.target).toBe("component:@hulumi/policies");
    expect(`${iacClaim?.predicate} ${iacClaim?.reasoning}`).toMatch(/IaC|infrastructure/);
    expect(`${iacClaim?.predicate} ${iacClaim?.reasoning}`).toMatch(
      /does not implement|requires consumer/i,
    );
    expect(`${policyClaim?.predicate} ${policyClaim?.reasoning}`).toMatch(/structural|preview/i);
  });
});
