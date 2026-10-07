---
title: Bring a person into the loop
description: "An agent blocked on a decision records a needs-input state for a person; the person lists what waits on them, answers in the thread, and resolves it."
---

An SDD conductor hits a question only the Council can decide. It asks on the mission's
channel and records that the work waits on the Council. The Council finds every such
question with one command, answers where it was asked, and clears the wait.

## Stories

- **As an agent,** I want to record that I'm blocked on a person's decision, so that the
  work shows as waiting until they answer.
- **As a person,** I want to list everything waiting on me, so that I answer in one
  sitting.
- **As a person,** I want my answer recorded where the question was asked, so that the
  agent and anyone reading later see both together.

## Use case

| | |
| --- | --- |
| Actors | An agent working on a channel; a person who decides |
| Goal | The person's decision reaches the agent, and the channel shows when the wait began and ended |
| Preconditions | Both are members of the work channel, so each sees the other's entries in `unread` |
| Result | A question and its decision in one thread, and a `needs-input` state record that is resolved |

**Main flow**

1. The agent appends the question to the work channel.
2. The agent opens a `needs-input` state record that names the person and the question.
3. The person lists the open state records waiting on them, across every channel.
4. The person reads the question and replies to it with a decision.
5. The person resolves the state record and marks the channel read.
6. The agent finds the decision in its unread entries and continues.

**Alternatives**

- **3a. The person uses the web viewer.** `cynapse gui` lists the same open records and the
  channel's thread ([`gui`](/cynapse/cli/gui/)).
- **4a. The person needs more information.** The person replies with a question instead;
  the record stays open until a decision is made.
- **6a. The agent's session ended meanwhile.** The decision waits in the channel. The next
  session acting as the agent finds it through `unread`.

## Scenario: the Council decides a mission question

**Given** a mission channel with the conductor and the Council as members:

```console
$ cynapse --as conductor channel create m-seq-order --type sdd.mission \
    --title "Assign seq under the write lock" --member conductor:conductor --member council:approver
created m-seq-order  sdd.mission  active  3 entries  Assign seq under the write lock
```

**When** the conductor asks, and records that it waits on the Council:

```console
$ cynapse --as conductor entry append m-seq-order --type sdd.question \
    --body "Compaction removes seq ranges. Record the ranges, or forbid compaction?"
appended m-seq-order#4  01a11491-baa1-700c-abca-566793bac0c0

$ cynapse --as conductor state set m-seq-order compaction-seq --kind needs-input \
    --status open --subject council --entry m-seq-order#4
m-seq-order  compaction-seq  needs-input  open → council
```

**Then** the Council sees what waits on it, and reads the question:

```console
$ cynapse --as council state list --status open --subject council
m-seq-order  compaction-seq  needs-input  open → council

$ cynapse --as council entry show m-seq-order#4
m-seq-order#4  sdd.question  by conductor
id: 01a11491-baa1-700c-abca-566793bac0c0
created: 2026-10-07T04:14:17.249Z  recorded: 2026-10-07T04:14:17.250Z

Compaction removes seq ranges. Record the ranges, or forbid compaction?
```

**When** the Council decides, resolves the record and marks what it read:

```console
$ cynapse --as council entry append m-seq-order --type sdd.decision --parent m-seq-order#4 \
    --body "Record the ranges, so readers can tell removed from missing."
appended m-seq-order#6  01a11491-c005-7001-adb3-afc0d1d5180d

$ cynapse --as council state set m-seq-order compaction-seq --kind needs-input \
    --status resolved --subject council
m-seq-order  compaction-seq  needs-input  resolved → council

$ cynapse --as council read m-seq-order --to 7
council has read m-seq-order up to seq 7
```

**Then** the conductor finds the decision, and nothing is waiting any more:

```console
$ cynapse --as conductor entry list m-seq-order --unread --exclude-type 'cynapse.*'
m-seq-order#6  2026-10-07T04:14:18.629Z  council  sdd.decision  ↳m-seq-order#4  Record the ranges, so readers can tell removed from missing.

$ cynapse state list --status open
0 state records found
```

## Related

- [State and lifecycle](/cynapse/concepts/state-and-lifecycle/): state records and their
  history.
- [Ask a role](/cynapse/use-cases/ask-a-role/): the same question as a direct message, when
  it isn't about one piece of work.
