# Reversibility — Hulumi Aurora identity boundary

Base commit `f2669f729e8006c71fbf483bc2cd14df10e6e640`.

## The hard-to-change decision: `hulumi:role-kind`

| Decision | Reversible? | Cost to reverse |
|---|---|---|
| Persisted `hulumi:role-kind` tag on IAM roles | Yes, in place | Tag update on existing roles; **stable URN, name and ARN — no replacement** |
| H3 narrowed to require the IaC tag only for `iac-deployment` | Yes | Policy-code revert plus its tests |
| Internal, non-exported component | Yes, trivially | Nothing consumes it — that is the point of keeping M1 internal |
| Closed capability union replacing `policyArns` | Yes, but | Reverting reopens the unbounded extension seam; it is a *security* reversal, not a mechanical one |
| `specs/` TLA+ spec and configs | Yes | Documentation only |

## This is a behaviour-changing release, and an earlier claim of mine was wrong

A previous draft stated the discriminator "defaults to current behaviour, so
an in-place upgrade is a no-op". That was self-contradictory and is withdrawn.
**Removing `hulumi:iac-role=true` from workload roles IS an in-place tag diff
on existing resources.** It cannot simultaneously be a behaviour change and a
no-op.

Corrected position:

- Existing stacks see a **tag update** on workload roles.
- **Resource identity is stable** — same URN, same role name, same ARN, no
  replacement, no recreate.
- The **semver call belongs in the stack-decision artifact**, not asserted
  here.

## Migration requirements

1. **Upgrade preview captured and diffed** — the expected diff is a tag change
   on workload roles and nothing else. Any resource *replacement* in the
   preview is a stop condition.
2. **Rollback preview captured and diffed** — reverting the discriminator
   restores the prior tag set with the same resource identity.
3. **Drift classifier must ATTRIBUTE the change**, not absorb it. A
   classification change that the drift tooling silently normalises away is
   indistinguishable from real drift later.
4. **CloudTrail classification test** — the role-kind change is visible in the
   audit trail rather than inferred from absence.

## Fail-closed direction

`hulumi:role-kind` is a **closed** set: `iac-deployment | workload`. H3 fails
closed on a **missing or unknown** value, as an explicit design decision
rather than an accident of implementation.

The failure direction matters: an unknown role-kind must **violate**, not pass.
The alternative — treating unknown as "probably a workload, skip the tag
requirement" — would let any new role opt out of H3 by writing a typo.

## What reversal does *not* undo

Reverting the code does not retroactively remove a credential that a runtime
pod already read during a window where the boundary was incomplete. That is
why the rollout barrier is structural rather than procedural, and why
`NoServingBeforeValidated` is stated over the complete aggregate: there is no
partial state in which serving is permitted and a later revert makes it safe.
