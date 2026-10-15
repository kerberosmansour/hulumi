# Lessons Learned — security admission integrity M1

## What changed

- Replaced a bounded raw-text pnpm lookup with strict YAML 1.2 parsing of the
  exact `packages` record and one reviewed integrity-only resolution.
- Replaced line-oriented GitHub workflow interpretation with a parsed object
  graph while retaining existing rule IDs, environment settings checks and
  runner approval behavior.
- Moved 14 critical dependencies into one reviewed inventory consumed by both
  exact-pin and Pulumi cooling-off gates.
- Added contained, no-follow threat-model output checks and exclusive
  same-directory atomic writes.

## Findings from execution

- The parser candidate also satisfies Vite's existing optional YAML peer. pnpm
  therefore changed several peer-context snapshot keys even though only one
  package identity entered the graph.
- A security parser must reject parser warnings, duplicate keys, aliases and
  merge keys explicitly. Selecting YAML 1.2 alone is insufficient.
- CODEOWNERS coverage is a path-plus-owner statement. Recognizing the path while
  ignoring an empty owner list created a real governance bypass.
- Keeping the protected package list in two scripts made omissions predictable;
  deriving the Pulumi subset from one inventory removes that class.

## Mistakes and corrections

- The first candidate OSV invocation ran against a Git archive without a Git
  index. The repository gate failed closed at `git ls-files`; a disposable
  local index was created and the unchanged pinned gate then passed.
- The first full typecheck found missing JSDoc parameter types in new `.mjs`
  helpers. The types were added before final verification.
- The first Semgrep pass found two dynamic-regex audit findings in the
  inventory refresh/test. Both were removed in favor of bounded string markers;
  the repeat scan returned zero findings.
- OSV evidence initially sat under the checkout's `work/` directory and was
  picked up by Prettier. The report, receipt and stderr were retained in the
  task security-evidence directory outside the checkout.

## Patterns to retain

- Admit the parser that protects an admission boundary under that same boundary,
  in an isolated scripts-disabled candidate graph.
- Parse once and let every policy read the same typed structure. Do not
  canonicalize YAML back to text and reapply security regexes.
- Test comments, duplicates, aliases, quoted keys, alternate maps and authority
  fields separately; they exercise different ambiguity classes.
- Keep generated security evidence outside the source checkout and record
  hashes in the verification report.

## Follow-ups

- Exact-head CI and Codex Security must pass before merge.
- The remaining Hulumi Codex findings belong to later bounded remediation
  milestones; this milestone deliberately changes no product component,
  package version or release artifact.
