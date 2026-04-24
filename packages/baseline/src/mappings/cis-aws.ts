// CIS AWS Foundations Benchmark v5.0.0 IDs addressed by SecureBucket.
// IDs ONLY — no verbatim CIS Benchmark text.

export const cisAws = {
  secureBucket: [
    "CIS-AWS-v5.0.0:2.1.1",
    "CIS-AWS-v5.0.0:2.1.2",
    "CIS-AWS-v5.0.0:2.1.4",
    "CIS-AWS-v5.0.0:2.1.5",
    "CIS-AWS-v5.0.0:2.1.6",
  ],
} as const;

export type CisAwsId = (typeof cisAws.secureBucket)[number];
