---
title: Settle a disagreement
description: "Workflow agents that disagree argue in a child channel anchored where the disagreement started; a clerk tracks missing answers, the arbiter rules exactly once, and the outcome returns to the parent."
---

Two workflow agents in a cyber-truss mission disagree on whether a change is a patch or a
minor release. They argue it out in a separate channel that branches from the entry where
the disagreement was raised. A clerk tracks who still owes an answer. When the vote
splits, the Council rules, once.

## Stories

- **As a workflow agent,** I want to argue a disagreement in its own place, linked to
  where it started, so that the main conversation stays readable.
- **As a clerk,** I want to know whose answer is still missing, so that I can chase it or
  escalate.
- **As an arbiter,** I want my ruling to land once, even if I submit it twice, so that
  there is never a second, conflicting ruling.
- **As a member of the mission,** I want the outcome back in the mission's channel, so
  that I don't have to read the argument to learn the result.

## Use case

| | |
| --- | --- |
| Actors | Workflow agents (the electors); a clerk service; an arbiter, here a person |
| Goal | A disagreement ends in one recorded outcome, linked to where it started |
| Preconditions | The parties are members of the mission's channel |
| Result | A closed child channel holds the argument and the ruling; the parent holds the outcome as a reply to the entry that raised it |

**Main flow**

1. An agent raises the disagreement as an entry in the mission's channel.
2. The clerk creates a child channel anchored at that entry, with the electors as members.
3. The clerk opens a `pending-answers` state record listing who still owes an answer.
4. Each elector appends a typed answer; the clerk updates the record after each one.
5. The vote splits, so the clerk escalates: a `needs-input` record on the parent, for the
   arbiter.
6. The arbiter rules with a conditional append, which writes only if no ruling exists yet.
7. The clerk replies to the original entry in the parent with the outcome, resolves the
   escalation, and closes the child channel.

**Alternatives**

- **4a. Every elector agrees.** The clerk writes the outcome back at once; there is no
  escalation.
- **6a. The ruling is submitted twice,** by a retry or by two arbiters at once. The second
  call finds the first ruling and writes nothing. This needs the library: the CLI has no
  conditional append.
- **2a. The child channel is created twice.** Its id is derived from the anchor entry, so
  the second create returns the same channel.

## Scenario: a split vote, ruled once

**Given** the mission channel, and the disagreement raised in it:

```console
$ cynapse --as conductor channel create truss-pagination --type truss.mission \
    --title "Fix pagination rounding" --member conductor:conductor \
    --member wf-docs:workflow --member wf-release:workflow --member council:arbiter
created truss-pagination  truss.mission  active  5 entries  Fix pagination rounding

$ cynapse --as wf-docs entry append truss-pagination --type truss.arbitration-needed \
    --body "Docs and release disagree: patch or minor?"
appended truss-pagination#6  01a11494-21c5-7007-be6c-cb7950ab2324
```

**When** the clerk branches an arbitration from that entry and tracks the answers:

```console
$ cynapse --as truss-ledger channel create truss-pagination-arb --anchor truss-pagination#6 \
    --type truss.arbitration --title "Patch or minor" \
    --member wf-docs:elector --member wf-release:elector --member truss-ledger:clerk
created truss-pagination-arb  truss.arbitration  active  4 entries  (child)  Patch or minor

$ cynapse --as truss-ledger state set truss-pagination-arb answers --kind pending-answers \
    --status open --value '{"waiting":["wf-docs","wf-release"]}'
truss-pagination-arb  answers  pending-answers  open  {"waiting":["wf-docs","wf-release"]}
```

**And** the electors answer, and the vote splits:

```console
$ cynapse --as wf-docs entry append truss-pagination-arb --type truss.answer.agree \
    --body "Minor: the indicator is a visible change."
appended truss-pagination-arb#6  01a11494-25c6-7037-8d10-54099321fbd4

$ cynapse --as truss-ledger state set truss-pagination-arb answers --kind pending-answers \
    --status open --value '{"waiting":["wf-release"]}'
truss-pagination-arb  answers  pending-answers  open  {"waiting":["wf-release"]}

$ cynapse --as wf-release entry append truss-pagination-arb --type truss.answer.disagree \
    --body "Patch: no API changed."
appended truss-pagination-arb#8  01a11494-2862-708f-9d52-9b731260a1db

$ cynapse --as truss-ledger state set truss-pagination-arb answers --kind pending-answers \
    --status resolved --value '{"waiting":[],"split":true}'
truss-pagination-arb  answers  pending-answers  resolved  {"waiting":[],"split":true}

$ cynapse --as truss-ledger state set truss-pagination escalation --kind needs-input \
    --status open --subject council --entry truss-pagination#6
truss-pagination  escalation  needs-input  open → council
```

**When** the Council's ruling is submitted twice, through the library:

```js
import { openStore } from 'cynapse'

const store = openStore({ path: process.argv[2] })

const rule = (body) =>
  store.appendUnless(
    'truss-pagination-arb',
    { author: 'council', type: 'truss.ruling', body },
    { types: ['truss.ruling'] },
  )

const first = rule('Minor: the indicator is visible to users.')
const second = rule('Patch.')
console.log(first.appended, `${first.entry.channel}#${first.entry.seq}`)
console.log(second.appended, `${second.existing.channel}#${second.existing.seq}`, second.existing.body)

store.close()
```

**Then** only the first ruling lands, and the second call returns it:

```console
$ node ruling.mjs "$CYNAPSE_HOME/cynapse.db"
true truss-pagination-arb#10
false truss-pagination-arb#10 Minor: the indicator is visible to users.
```

**When** the clerk writes the outcome back and closes the arbitration:

```console
$ cynapse --as truss-ledger entry append truss-pagination --type truss.arbitration-outcome \
    --parent truss-pagination#6 --ref truss-pagination-arb#10 --body "Ruled: minor."
appended truss-pagination#8  01a11494-2ed7-7072-a55c-e261c08c4fd8

$ cynapse --as truss-ledger state set truss-pagination escalation --kind needs-input \
    --status resolved --subject council
truss-pagination  escalation  needs-input  resolved → council

$ cynapse --as truss-ledger state lifecycle truss-pagination-arb closed
truss-pagination-arb is now closed
```

**Then** the mission's channel shows the disagreement and its outcome as one thread:

```console
$ cynapse entry list truss-pagination --root truss-pagination#6 --exclude-type 'cynapse.*'
truss-pagination#6  2026-10-07T04:16:54.725Z  wf-docs  truss.arbitration-needed  Docs and release disagree: patch or minor?
truss-pagination#8  2026-10-07T04:16:58.071Z  truss-ledger  truss.arbitration-outcome  ↳truss-pagination#6  Ruled: minor.
```

## Related

- [Channels](/cynapse/concepts/channels/#child-channels-and-anchors): anchors and child
  channels.
- [Store: `appendUnless`](/cynapse/api/store/#appendunlessref-input-unless): the
  conditional append.
