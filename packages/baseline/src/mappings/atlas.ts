// MITRE ATLAS v5.1 technique IDs relevant to SecureBucket.

export const atlas = {
  secureBucket: ["ATLAS:AML.T0001"],
} as const;

export type AtlasId = (typeof atlas.secureBucket)[number];
