// Reviewed dependency identities shared by exact-pin and cooling-off policy.
// Keep this file declarative: `exact-pin-guard.mjs --write` updates only the
// version and integrity fields after an independent registry/OSV review.

import { isScalar, parseDocument, visit } from "yaml";

/** @type {ReadonlyArray<Readonly<{ name: string, version: string, integrity: string }>>} */
export const PROTECTED_DEPENDENCIES = Object.freeze([
  {
    name: "@pulumi/pulumi",
    version: "3.268.0",
    integrity:
      "sha512-VtTIr44eC78BX4cAeh2MEqJqVFu5/UfrmsxjLdH73YIPr5igPEo9JB4g5yqncTHcXNxbkxJXndMOEm1CkpJA5Q==",
  },
  {
    name: "@pulumi/aws",
    version: "7.50.0",
    integrity:
      "sha512-YqnrUfFd5c3mFE8cZeGq5dFM8puX6c+IPBjxUD7ByZUJ1De7z6n4rL3moevkqU8IA4Tn89cEa2H+jUcZ2DzH0w==",
  },
  {
    name: "@pulumi/policy",
    version: "1.21.0",
    integrity:
      "sha512-tLczMS7S2UUpc1qO9xvGY54GumUShTNxm/BY/T1fb0Hp/ILScxXzrmLpkbt4KUGZAcX/EdGLVuMGHyhreqbfvg==",
  },
  {
    name: "@pulumi/github",
    version: "6.15.0",
    integrity:
      "sha512-U8ZxPQQcOrcTn8y8EZsWmXzMtbw0JnwWCVGmqxBZ/i2SpUlEGMYT9B+EFC/qTALZXkDf7cMiq6fZ3Gy1G23nyQ==",
  },
  {
    name: "@pulumi/cloudflare",
    version: "6.22.0",
    integrity:
      "sha512-ljJpS3vhIaTNzTvoNURkUfXnzDlBS0gx2nxvg84JmH6kuYoCmsLiQ1afOdhXly4+G/JIgYqjdxo2QNliVUWYDw==",
  },
  {
    name: "@pulumi/kubernetes",
    version: "4.34.2",
    integrity:
      "sha512-OcIe8OUwivkEngmjinrmke54INbJ0L6u/CWm8mLh6F7pmIDXyHGTM8PzcZsg5QbSm24HnNUHLl2tEUoOBxDo3w==",
  },
  {
    name: "@aws-sdk/client-secrets-manager",
    version: "3.1149.0",
    integrity:
      "sha512-HzMpERTdEuAoKn042iwbkSs4hqW4u3ryLd5LLU/QDcgKZl4hIfZk2hQRrrcQ/P4isWfMDAi+LV/W2JZidiyB5w==",
  },
  {
    name: "@aws-sdk/client-cloudtrail",
    version: "3.1149.0",
    integrity:
      "sha512-loUAEGtLNxIBFnEGrITM5QrUsEPf54mQ3BSfxl0XUcqg/vtBU7Je3dgL70b6e/Pb+IPQrBATYeptXIDLxdQctA==",
  },
  {
    name: "@aws-sdk/client-cloudwatch-logs",
    version: "3.1149.0",
    integrity:
      "sha512-14jbCV0VgGisTQWr7jgtYrJRMTm8i/MiNF90yTuva+LHRbpUcKrlcDESxeLdMqW+4+fHjZXnnqmR40/+02vXbA==",
  },
  {
    name: "@aws-sdk/client-sts",
    version: "3.1149.0",
    integrity:
      "sha512-0In5ROb7LuUKsixQIe5YeKrHTScOxpmDhSUBRgZY+wgsd2OotS6IwJfPHhT8IqeNoZtW/qPpX13xUX7YfoUJDA==",
  },
  {
    name: "@aws-sdk/credential-providers",
    version: "3.1149.0",
    integrity:
      "sha512-OiABL+ZjZJ9yBjyCG07wKzN81axkVokZOpS+VZeDZx8AiYPgqu1MNDbmtX0c4z+SYxcSOtrxH6rU+Lwqz2Sjaw==",
  },
  {
    name: "p-timeout",
    version: "7.0.2",
    integrity:
      "sha512-prbX4Z3YszrFNgH+MW5Zoeq3baXrMtP/MQnFeET90UB/GtGcGDQ5Usg9OCy6ETjTTntOw1SL2z9fMPUppN3Guw==",
  },
  {
    name: "simple-git",
    version: "4.0.2",
    integrity:
      "sha512-l0sIsv9VrPwovKELFDBOj/lhmIcbMvxBk2B+hRhsMM4/VL3gKtuZvYnBNixVo+N/0HnqQx2cBdLvxnAbygHpqA==",
  },
  {
    name: "yaml",
    version: "2.9.1",
    integrity:
      "sha512-3NxN8+78OdzbT7C/WjGsyfPAtJaN3FNDsWxv7Y7mcDsT/oOmgW8BpyQQFFBnvZE3j9Y2Sdz1ULFLezL7Eb2yFw==",
  },
]);

export const PULUMI_PACKAGE_NAMES = Object.freeze(
  PROTECTED_DEPENDENCIES.filter(({ name }) => name.startsWith("@pulumi/")).map(({ name }) => name),
);

export function isPlainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Parse an untrusted YAML document without aliases, merges, duplicate keys or
 * recoverable parser warnings. Callers still validate their application shape.
 */
export function parseStrictYaml(source, label = "YAML input") {
  let document;
  try {
    document = parseDocument(source, {
      version: "1.2",
      strict: true,
      uniqueKeys: true,
      merge: false,
      stringKeys: true,
      logLevel: "error",
    });
  } catch (error) {
    throw new Error(`${label}: YAML parse failed: ${describeError(error)}`);
  }

  const problems = [...document.errors, ...document.warnings];
  if (problems.length > 0) {
    throw new Error(
      `${label}: YAML parse failed: ${problems.map((problem) => problem.message).join("; ")}`,
    );
  }

  let forbidden;
  visit(document, {
    Alias() {
      forbidden ??= "aliases are forbidden";
      return visit.BREAK;
    },
    Pair(_key, pair) {
      if (isScalar(pair.key) && pair.key.value === "<<") {
        forbidden ??= "merge keys are forbidden";
        return visit.BREAK;
      }
      return undefined;
    },
  });
  if (forbidden) throw new Error(`${label}: ${forbidden}`);

  try {
    return document.toJS({ maxAliasCount: 0 });
  } catch (error) {
    throw new Error(`${label}: YAML conversion failed: ${describeError(error)}`);
  }
}

function describeError(error) {
  return error instanceof Error ? error.message : String(error);
}
