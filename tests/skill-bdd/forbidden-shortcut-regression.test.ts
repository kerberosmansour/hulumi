import { expect, it } from "vitest";
import { stripSourceComments } from "../_utils/forbidden-shortcut";

it.each([
  'const url = "https://example.com"; setTimeout(() => {}, 1); // explanation',
  "const url = `https://example.com`; setTimeout(() => {}, 1); // explanation",
  "const pattern = /https:\\/\\/example/; setTimeout(() => {}, 1); // explanation",
])("retains forbidden executable code after literals: %s", (source) => {
  const stripped = stripSourceComments(source);
  expect(stripped).toContain("setTimeout");
  expect(stripped).not.toContain("explanation");
});
