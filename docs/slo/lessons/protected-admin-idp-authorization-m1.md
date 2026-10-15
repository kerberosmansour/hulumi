# Lessons — Protected admin IdP authorization integrity M1

Date: 2026-10-15

1. Authentication routing is not authorization. An approved identity provider says where a user authenticated, not whether that user belongs to the approved population.
2. Policy collection semantics decide authority. Adding a seemingly restrictive selector to an OR-combined Include array can broaden access instead of narrowing it.
3. Provider-native routing fields should carry routing intent. Cloudflare application `allowedIdps` already limits login choices, so duplicating provider IDs in policy Includes was both redundant and unsafe.
4. Security evidence outputs must describe the effective authorization boundary. Removing identity-provider labels from `requiredIdentitySelectors` prevents downstream reviews from treating routing as membership proof.
5. Necessary compatibility breaks should fail early and explain the migration. IdP-only declarations now require an email, domain, or Access group before provider resources are registered.
6. Both resource representations need the same proof. Recursive tests over inline and reusable policies prevent a repair in one form from leaving the other exposed.
