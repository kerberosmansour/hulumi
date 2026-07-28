# Verified design — Hulumi Aurora identity boundary

Formal-verification receipt for `specs/HulumiAuroraIdentityBoundary.tla`.

**This document records an AUTHORITATIVE run performed on the pinned
toolchain. It is not a transcription of the spec author's own drafting
figures** — see *Provenance* for why that distinction is load-bearing here.

## Verdict

| Configuration | Expected | Result |
|---|---|---|
| `HulumiAuroraIdentityBoundaryNaive.cfg` | **must FAIL** | ✅ exit 12 — `IdentitiesNonInterchangeable` violated |
| `HulumiAuroraIdentityBoundary.cfg` | **must PASS** | ✅ exit 0 — no error found |

Both outcomes are required. A spec that only ever passes proves nothing about
its power to discriminate the design under review from the design it replaces,
so the naive counterexample is evidence, not a debugging leftover.

## Toolchain — pinned and matched

```
jar        ~/.sldo/tla/tla2tools.jar
sha256     d5d07d5dab38ddb840c91ec48fa02f28b37a608d5af9a73570018591dbc8ef7f
           == skills/slo-tla/tools.toml [tlc] pin (declared 1.8.0)
manifest   Build-TimeStamp 2026-04-22T17:27:29.398Z
           X-Git-Revision  6320a09cb8bdbc130e535bfb4e4d38d0954b400a
TLC prints 2026.04.22.172729 rev 6320a09
java       openjdk 25.0.2
clone      isolated, clean; `git diff --check` exit 0
```

## Subject — the receipt binds to exact bytes

```
commit  88d501ffc96107944001e86014bb04f29317ec34
tla          17edfdb4799380ab238c80de99f8e1d185db1acc10b93753b7a98fa2e20293e2
hardened cfg 70a441203966233eb269967b04f7081e6d8a7f2247431d6b0b3c4fa6f594401f
naive cfg    72e4923e59ba2c7bb1c07cbe933234a2f05ab2f00408f1a2ea4ae92022726d7e
```

All three digests were re-computed from the committed tree by the spec owner
before this document was written, and match. **The receipt is about these
files, not about a copy that happened to be lying around.**

## Naive run — the discriminating RED

```
exit 12
IdentitiesNonInterchangeable violated at State 2, by AttemptAssume(Runtime, Migrator)
7 states generated / 7 distinct / 5 left on queue, depth 2
stdout sha256 87a4a8452591b6a5fa9bf94c87918a61e81f7d8e190fa25608b2220810f8f836
```

The counterexample is **two states deep**, and that shallowness is the point:
an unprivileged identity reaching a privileged one is not an exotic
interleaving, it is the second thing that can happen.

## Hardened run — the PASS

```
exit 0   "Model checking completed. No error has been found."
201 generated / 68 distinct / 0 left on queue
complete graph depth 8, average outdegree 1 (min 0, max 6, p95 4)
stdout sha256 ff9e0b7fd12185a6799e22308a1db6c547c0ec5b7fbcfa8483a0d27bb2f402b2
stderr empty (e3b0c442…) on both runs
```

`0 states left on queue` is the load-bearing number: the state space was
**exhausted** at these bounds, not sampled.

Invariants proved: `TypeOK`, `RuntimeNeverHoldsCredential`,
`IdentitiesNonInterchangeable`, `NoServingBeforeValidated`.

## Bounds and what is *not* claimed

Fixed: 4 identities (Runtime, Migrator, Broker, Deployer), 2 of them
privileged, 4 validation elements, Boolean serving. Exhaustive BFS.

**No liveness or fairness claim is made, deliberately.** A bootstrap that
never starts serving is a *safe* outcome for this boundary; progress belongs
to the milestone owning deployment wiring. Asserting weak fairness here would
be a false claim wearing the costume of a stronger one.

`CHECK_DEADLOCK FALSE` is explicit, not incidental: this safety-only model has
a natural terminal state, and a stuttering action added to silence TLC's
deadlock report would mask genuine deadlocks in any later revision.

## Provenance — why this document exists separately

The spec author's own drafting run produced numerically identical results
(hardened 201/68/0; naive violating the same invariant in 7 states) on an
**unpinned** jar, and those figures were explicitly recorded as **not
admissible**. They agree with the authoritative run, which is corroboration
that the model is deterministic — but agreement after the fact is not what
makes evidence admissible, and this file was left unwritten until the pinned
run existed rather than being backfilled from them.

The unpinned situation is itself worth recording for whoever maintains the
toolchain: at the time of authoring, the `tools.toml` pin matched **neither**
the local cache (`237332bd…`, build 2026-05-26) **nor** what the pinned
release URL served that day (`cc4803dc…`, build 2026-07-18). The
authoritative jar above is a **third** build (2026-04-22) and is the one the
pin names. Three builds have therefore appeared under a single release tag.

Run performed by `mac-agent` on the pinned toolchain; hashes re-verified
against the committed tree by the spec owner before transcription.
