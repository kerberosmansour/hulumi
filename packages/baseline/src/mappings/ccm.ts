// CCM v4.1 control-ID map scoped to the set of controls a SecureBucket claims
// to address. IDs ONLY — no verbatim CCM text in source. The
// mappings.test.ts BDD row asserts every ID here has a matching row in
// docs/mappings/ccm-v4.1.md.

export const ccm = {
  secureBucket: ["CCM:DSP-01", "CCM:CEK-04", "CCM:CEK-01", "CCM:DSP-17", "CCM:LOG-01"],
} as const;

export type CcmId = (typeof ccm.secureBucket)[number];
