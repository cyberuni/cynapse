---
title: Ask a role and get an answer
description: "An agent asks a role a direct question by name, the role answers in the same thread, and the asker waits for the answer or picks it up later."
---

A builder agent needs a reviewer's opinion. It doesn't know which session is the reviewer
right now, and it shouldn't have to. It asks the role by name and gets the answer back in
the same thread.

## Stories

- **As an agent,** I want to ask a role a question by its name, so that I don't need to
  know which session plays it.
- **As an agent,** I want to wait for the answer, or come back for it later, so that I can
  keep working.
- **As a role,** I want to see what I was asked and haven't dealt with, so that nothing
  falls through between sessions.

## Use case

| | |
| --- | --- |
| Actors | An asking agent; the role being asked (an agent or a person); the runtime that runs them |
| Goal | The asker gets the role's answer, recorded with the question |
| Preconditions | The runtime registered the role and the asker ([Run agents](/cynapse/use-cases/run-agents/)) |
| Result | The question and its answer form one thread on the role's address channel; the question is marked handled |

**Main flow**

1. The asker sends the question to the role by name. cynapse resolves the name to one live
   participant and appends the question to its address channel.
2. The asker records that an answer is owed, as a `cynapse.awaiting-reply` state record,
   when the wait must outlive its own session.
3. The role lists the unread entries on its address channel.
4. The role replies, naming the question as the parent.
5. The role tags the question `cynapse.handled` and moves its cursor to the last entry it
   processed.
6. The asker's `entry wait` returns the reply. An asker that wasn't waiting sees the reply in
   its `unread`, because it follows every thread it wrote in.
7. The asker resolves the state record.

**Alternatives**

- **1a. The name matches several live participants.** The send fails with exit `4` and lists
  the candidates. The asker narrows by kind or sends to an id.
- **1b. The name matches nobody.** The send fails with exit `5`; nothing is created.
- **3a. A different session plays the role now.** It reads with the role's id, so it sees the
  same backlog and cursor as the session before it.
- **6a. No answer before the timeout.** `entry wait` exits `3`. The asker waits again later;
  a reply that arrived in between is found at once.

## Scenario: the reviewer answers a direct question

**Given** a runtime registered `reviewer` and `builder`, and `$REVIEWER` and `$BUILDER` hold
their ids ([Use the CLI](/cynapse/guides/cli/#1-register-the-participants) shows how).

**When** the builder asks, and records that an answer is owed:

```console
$ cynapse --as "$BUILDER" entry send reviewer --type demo.ask --body "Is the login fix safe to merge?"
sent reviewer#4  01a11491-948e-70d2-aec3-e21192b899a0

$ cynapse --as "$BUILDER" state set reviewer ask-merge --kind cynapse.awaiting-reply \
    --status open --subject "$REVIEWER" --entry reviewer#4
reviewer  ask-merge  cynapse.awaiting-reply  open → cd604701-2518-512b-b65e-7253e252004f
```

**Then** the question is unread on the reviewer's address channel:

```console
$ cynapse --as "$REVIEWER" entry list reviewer --unread --exclude-type 'cynapse.*'
reviewer#4  2026-10-07T04:14:07.502Z  67b14d3c-5255-5994-8da9-c8f40f6a1dd9  demo.ask  Is the login fix safe to merge?
```

**When** the reviewer answers, marks the question handled, and marks what it read:

```console
$ cynapse --as "$REVIEWER" entry append reviewer --type demo.answer --parent reviewer#4 \
    --body "Yes. Merge after CI."
appended reviewer#6  01a11491-9877-7097-987f-94b98ecff01e

$ cynapse --as "$REVIEWER" tag reviewer#4 cynapse.handled
reviewer#4 tags: cynapse.handled

$ cynapse --as "$REVIEWER" read reviewer --to 7
cd604701-2518-512b-b65e-7253e252004f has read reviewer up to seq 7
```

The state record and the tag were written as entries too (`#5` and `#7`), so the reply is
`#6`.

**Then** the builder sees the reply, gets it from `entry wait`, and closes the record:

```console
$ cynapse --as "$BUILDER" unread
builder  3 unread
reviewer  1 unread

$ cynapse --as "$BUILDER" entry wait reviewer#4 --timeout 30
reviewer#6  demo.answer  by cd604701-2518-512b-b65e-7253e252004f
id: 01a11491-9877-7097-987f-94b98ecff01e
created: 2026-10-07T04:14:08.503Z  recorded: 2026-10-07T04:14:08.503Z
parent: reviewer#4  root: reviewer#4

Yes. Merge after CI.

$ cynapse --as "$BUILDER" state set reviewer ask-merge --kind cynapse.awaiting-reply --status resolved
reviewer  ask-merge  cynapse.awaiting-reply  resolved
```

## Scenario: the name is ambiguous

**Given** the runtime also registered a person named `reviewer`.

**When** the builder sends to `reviewer`:

```console
$ cynapse --as "$BUILDER" entry send reviewer --type demo.ask --body "Who reviews docs?"
error: "reviewer" names 2 live participants; address one by its id:
  1ab640e6-4790-5942-a144-64b3b240e8c9  human  reviewer  registered by e9a77654-ebf5-59bc-a281-0903b941231e
  cd604701-2518-512b-b65e-7253e252004f  agent  reviewer  registered by e9a77654-ebf5-59bc-a281-0903b941231e
help: pass one of the candidates by id, or a more specific name
```

**Then** nothing is sent, the exit code is `4`, and the builder narrows the name by kind:

```console
$ cynapse participant resolve reviewer --kind agent
cd604701-2518-512b-b65e-7253e252004f  agent  reviewer  live  registered by e9a77654-ebf5-59bc-a281-0903b941231e  address reviewer
```

## Related

- [Messaging](/cynapse/concepts/messaging/): work and direct traffic, followed threads,
  seen and handled.
- [Use the CLI](/cynapse/guides/cli/): the same flow with setup.
