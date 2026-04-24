// NIST SP 800-53 Rev 5 control IDs addressed by SecureBucket.

export const nist80053r5 = {
  secureBucket: [
    "NIST-800-53-r5:AC-3",
    "NIST-800-53-r5:SC-8",
    "NIST-800-53-r5:SC-12",
    "NIST-800-53-r5:SC-13",
    "NIST-800-53-r5:SC-28",
    "NIST-800-53-r5:AU-2",
    "NIST-800-53-r5:AU-12",
    "NIST-800-53-r5:CP-9",
  ],
} as const;

export type Nist80053r5Id = (typeof nist80053r5.secureBucket)[number];
