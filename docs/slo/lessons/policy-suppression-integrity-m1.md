# Lessons — Policy suppression integrity M1

Date: 2026-10-15
Milestone: M1

## What worked

- Enforcing the full exception record in the shared matcher fixed every policy
  family without duplicating validation in individual rules.
- Exact round-trip date validation separated canonical evidence from values
  JavaScript would otherwise normalize permissively, including invalid calendar
  dates, offsets, lowercase UTC markers, and excess precision.
- Naming `stack` as an explicit scope preserved legitimate stack policies while
  removing the implicit global behavior created by an omitted scope.
- Migrating fixtures and docs in the same milestone exposed stale public rule
  IDs and an obsolete README shape before they reached users.

## What to retain

- Test security predicates as complete record partitions, including the clock
  and boundary instant, rather than only the originally reported examples.
- Keep exception contracts at the narrow shared choke point and leave policy
  semantics unchanged.
- State what exception evidence is returned without claiming an audit sink the
  package does not implement.

## Follow-ups

- No additional code follow-up is required for M1.
- Exact-head CI and the exact merged-main xhigh scan remain external closeout
  gates and must inspect global scope, missing scope/expiry, invalid dates,
  explicit stack scope, and equivalent fail-open behavior.
